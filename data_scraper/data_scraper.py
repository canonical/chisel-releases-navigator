#!/usr/bin/env python3
# spellchecker: ignore worktree Referer

from __future__ import annotations

import argparse
import gzip
import io
import json
import logging
import os
import re
import shlex
import shutil
import signal
import sqlite3
import subprocess as sub
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from functools import partial, total_ordering
from itertools import product
from pathlib import Path
from typing import Callable, Iterator, Literal, no_type_check

import requests
import yaml
from filelock import FileLock

# spellchecker: ignore Marcin Konowalczyk lczyk
__VERSION__ = "0.2.0"
__AUTHOR___ = "Marcin Konowalczyk @lczyk"

CHISEL_RELEASES_URL = os.environ.get("CHISEL_RELEASES_URL", "https://github.com/canonical/chisel-releases")

Component = Literal["main", "restricted", "universe", "multiverse"]
Repo = Literal["", "security", "updates", "backports"]

COMPONENTS: set[Component] = {"main", "restricted", "universe", "multiverse"}
REPOS: set[Repo] = {"", "security", "updates", "backports"}

ArchSignature = Literal["arm", "amd64", "x86", "aarch", "i386", "riscv", "ppc64", "s390x"]

ARCHITECTURE_SIGNATURES: set[ArchSignature] = {
    "arm",
    "amd64",
    "x86",
    "aarch",
    "i386",
    "riscv",
    "ppc64",
    "s390x",
}

PackageName = str
SliceDefinitionText = str
SliceDefinitionJson = dict[str, object]

## DISTRO INFO #################################################################


@total_ordering
@dataclass(frozen=True, order=False)
class UbuntuRelease:
    version: str
    codename: str

    def __str__(self) -> str:
        return f"ubuntu-{self.version} ({self.codename})"

    @property
    def version_tuple(self) -> tuple[int, int]:
        year, month = self.version.split(".")
        return int(year), int(month)

    def __lt__(self, other: object) -> bool:
        if not isinstance(other, UbuntuRelease):
            return NotImplemented
        return self.version_tuple < other.version_tuple

    @classmethod
    def from_distro_info_line(cls, line: str) -> UbuntuRelease:
        match = re.match(r"Ubuntu (\d{1,2}\.\d{2})( LTS)? \"([A-Za-z ]+)\"", line)
        if not match:
            raise ValueError(f"Invalid distro-info line: '{line}'")
        return cls(version=match.group(1), codename=match.group(3))

    @classmethod
    def from_branch_name(cls, branch: str) -> UbuntuRelease:
        assert branch.startswith("ubuntu-"), "Branch name must start with 'ubuntu-'"
        version = branch.split("-", 1)[1]
        codename = _VERSION_TO_CODENAME.get(version)
        if codename is None:
            raise ValueError(f"Unknown Ubuntu version '{version}' for branch '{branch}'")
        return cls(version=version, codename=codename)

    @property
    def branch_name(self) -> str:
        return f"ubuntu-{self.version}"

    @property
    def short_codename(self) -> str:
        """Return the first word of the codename in lowercase. E.g. 'focal' from 'Focal Fossa'."""
        return self.codename.split()[0].lower()

    @classmethod
    def from_dict(cls, data: dict) -> UbuntuRelease:
        return cls(
            version=data["version"],
            codename=data["codename"],
        )


_ALL_RELEASES: set[UbuntuRelease] = set()
_VERSION_TO_CODENAME: dict[str, str] = {}
SUPPORTED_RELEASES: set[UbuntuRelease] = set()
_DEVEL_RELEASE: UbuntuRelease | None = None


def init_distro_info() -> None:
    all_output = sub.getoutput("distro-info --all --fullname").strip()
    supported_output = sub.getoutput("distro-info --supported --fullname").strip()
    devel_output = sub.getoutput("distro-info --devel --fullname").strip()

    global _ALL_RELEASES, _VERSION_TO_CODENAME, SUPPORTED_RELEASES, _DEVEL_RELEASE

    _ALL_RELEASES = set(UbuntuRelease.from_distro_info_line(line) for line in all_output.splitlines())
    _VERSION_TO_CODENAME = {release.version: release.codename for release in _ALL_RELEASES}

    SUPPORTED_RELEASES = set(UbuntuRelease.from_distro_info_line(line) for line in supported_output.splitlines())
    assert SUPPORTED_RELEASES.issubset(_ALL_RELEASES), "Supported releases must be a subset of all releases."

    _DEVEL_RELEASE = UbuntuRelease.from_distro_info_line(devel_output) if devel_output else None
    assert _DEVEL_RELEASE is None or _DEVEL_RELEASE in _ALL_RELEASES, "Devel release must be in all releases."


################################################################################


@contextmanager
def timing_context() -> Iterator[Callable[[], float]]:
    t1 = t2 = time.perf_counter()
    yield lambda: t2 - t1
    t2 = time.perf_counter()


def check_github_token() -> None:
    token = os.getenv("GITHUB_TOKEN", None)
    if token is not None:
        logging.debug("GITHUB_TOKEN is set.")
        if not token.strip():
            logging.warning("GITHUB_TOKEN is empty.")
    else:
        logging.debug("GITHUB_TOKEN is not set.")


## GIT UTILS ##################################################################

GIT_PATH = os.environ.get("GIT_PATH", "git")


class GitError(Exception):
    """Custom exception for git errors."""

    pass


def git(
    *command: str,
    cwd: "str | Path | None" = None,
) -> "tuple[str | None, str | None]":
    """Run a git command and return the output."""
    stderr = sub.PIPE  # cap stderr and log on errors
    cwd = Path.cwd() if cwd is None else Path(cwd)
    logging.debug("Running git command: %s in %s", shlex.join([GIT_PATH, *command]), cwd)
    env = os.environ.copy()
    try:
        out = sub.check_output(
            [GIT_PATH, *command],
            cwd=str(cwd),
            stderr=stderr,
            env=env,
        )
        return out.decode("utf-8").strip(), None
    except sub.CalledProcessError as e:
        if e.returncode == -signal.SIGINT:
            raise KeyboardInterrupt("Interrupted during git command") from None
        stderr_str = e.stderr.decode("utf-8").strip() if e.stderr else ""
        return None, stderr_str


def git_panic(
    *command: str,
    cwd: "str | Path | None" = None,
) -> str:
    """Run a git command and exit on error."""
    out, err = git(*command, cwd=cwd)
    if err:
        logging.critical("Git command which must succeed failed.")
        logging.critical("Git command: %s", shlex.join([GIT_PATH, *command]))
        logging.critical("Error: %s", err)
        raise GitError(err)
    assert out is not None
    return out


@contextmanager
def TempClone(
    repo_url: str,
    *args: str,  # additional git clone args
    verbose: bool = True,
    cleanup: bool = True,  # whether to clean up the temp dir afterwards. Useful for debugging.
) -> Iterator[Path]:
    """Context manager to clone a git repo to a temp dir and clean up afterwards"""

    try:
        temp_dir = Path(tempfile.mkdtemp())
        git_panic("clone", *args, repo_url, str(temp_dir))

        yield temp_dir
    except GitError as e:
        logging.critical("Failed to clone repository %s: %s", repo_url, e)
        raise
    finally:
        if cleanup:
            shutil.rmtree(temp_dir, ignore_errors=True)


## CHISEL RELEASES CLONE #######################################################

_CHISEL_RELEASES_CLONE_PATH: Path | None = None
_CHISEL_RELEASES_CLONE_PATH_LOCK: FileLock | None = None


def init_chisel_releases_clone() -> None:
    tmpdir = tempfile.mkdtemp(prefix="chisel-releases-clone-")
    global _CHISEL_RELEASES_CLONE_PATH, _CHISEL_RELEASES_CLONE_PATH_LOCK
    _CHISEL_RELEASES_CLONE_PATH = Path(tmpdir)
    git_panic(
        "clone",
        CHISEL_RELEASES_URL,
        str(_CHISEL_RELEASES_CLONE_PATH),
        "--depth=1",
        "--no-single-branch",
    )

    _CHISEL_RELEASES_CLONE_PATH_LOCK = FileLock(str(_CHISEL_RELEASES_CLONE_PATH / ".lock"))

    logging.debug(
        "Cloned chisel-releases into temporary directory '%s'.",
        _CHISEL_RELEASES_CLONE_PATH,
    )


def cleanup_chisel_releases_clone() -> None:
    global _CHISEL_RELEASES_CLONE_PATH, _CHISEL_RELEASES_CLONE_PATH_LOCK
    if _CHISEL_RELEASES_CLONE_PATH is not None:
        shutil.rmtree(_CHISEL_RELEASES_CLONE_PATH)
        logging.debug(
            "Cleaned up temporary directory '%s'.",
            _CHISEL_RELEASES_CLONE_PATH,
        )

    _CHISEL_RELEASES_CLONE_PATH = None
    _CHISEL_RELEASES_CLONE_PATH_LOCK = None


def _ubuntu_branches_in_chisel_releases() -> set[UbuntuRelease]:
    assert _CHISEL_RELEASES_CLONE_PATH is not None, "Chisel releases clone path is not initialized."

    _branches = git_panic(
        "branch",
        "--remote",
        "--format='%(refname:short)'",
        cwd=_CHISEL_RELEASES_CLONE_PATH,
    ).splitlines()
    _branches = [b.strip().strip("'") for b in _branches]
    branches = [b.removeprefix("origin/") for b in _branches if b.startswith("origin/ubuntu-")]
    return {UbuntuRelease.from_branch_name(branch) for branch in branches}


################################################################################


def _get_slices(
    release: UbuntuRelease,
    *,
    cleanup: bool = True,
) -> dict[PackageName, SliceDefinitionText]:
    """Use the common git clone of chisel-releases to read the slice YAML files for the given release. Return a mapping
    of package name to slice definition contents.

    This function can be called in parallel for different releases, but it is not safe to call it in parallel for the
    same release. It will grab a lock on the clone directory, setup a worktree for the given release in a different
    temp directory and drop the lock.

    """
    assert _CHISEL_RELEASES_CLONE_PATH is not None, "Chisel releases clone path is not initialized."

    assert _CHISEL_RELEASES_CLONE_PATH_LOCK is not None, "Chisel releases clone path lock is not initialized."

    results: dict[PackageName, SliceDefinitionText] = {}

    with tempfile.TemporaryDirectory(
        prefix=f"chisel-releases-{release.short_codename}-",
        delete=cleanup,
    ) as worktree_dir:
        with _CHISEL_RELEASES_CLONE_PATH_LOCK:
            git_panic(
                "worktree",
                "add",
                "--detach",
                worktree_dir,
                f"origin/{release.branch_name}",
                cwd=_CHISEL_RELEASES_CLONE_PATH,
            )

        logging.debug(
            "Set up git worktree for release %s in temporary directory '%s'.",
            release,
            worktree_dir,
        )

        slices_dir = Path(worktree_dir) / "slices"
        if not slices_dir.is_dir():
            logging.warning(
                "Release %s does not have a 'slices/' directory. Skipping.",
                release,
            )
            return results

        for slice_file in slices_dir.glob("*.yaml"):
            package_name = slice_file.stem
            contents = slice_file.read_text(encoding="utf-8")
            results[package_name] = contents

    return results


def _get_slices_by_release(
    releases: set[UbuntuRelease],
    *,
    jobs: int | None = 1,
    cleanup: bool = True,
) -> dict[UbuntuRelease, dict[PackageName, SliceDefinitionText]]:
    """For each release get the mapping of slice names to their corresponding YAML content."""
    logging.info("Fetching slices for %d releases...", len(releases))
    slices_by_release: dict[UbuntuRelease, dict[PackageName, SliceDefinitionText]] = {}

    fn = partial(_get_slices, cleanup=cleanup)

    with timing_context() as elapsed:
        if jobs == 1:
            for release in releases:
                slices_by_release[release] = fn(release)

        else:
            with ThreadPoolExecutor(max_workers=jobs) as executor:
                logging.debug(
                    "Using a thread pool of size %d.",
                    getattr(executor, "_max_workers", -1),
                )
                results = list(executor.map(fn, releases))
            slices_by_release = {release: slices for release, slices in zip(releases, results, strict=True)}

    logging.info("Fetched slices for %d releases in %.2f seconds.", len(releases), elapsed())

    return slices_by_release


def _get_packages_by_release(
    releases: set[UbuntuRelease],
    jobs: int | None = 1,
) -> dict[UbuntuRelease, set[PackageName]]:
    logging.info("Fetching packages for %d releases...", len(releases))
    package_listings: dict[tuple[UbuntuRelease, Component, Repo], set[PackageName]] = {}

    _components = sorted(COMPONENTS)
    _repos = sorted(REPOS)
    _product = list(product(releases, _components, _repos))

    with timing_context() as elapsed:
        if jobs == 1:
            for release, component, repo in _product:
                package_listings[(release, component, repo)] = _get_package_list(release, component, repo)

        else:
            with ThreadPoolExecutor(max_workers=jobs) as executor:
                logging.debug(
                    "Using a thread pool of size %d.",
                    getattr(executor, "_max_workers", -1),
                )
                results = list(executor.map(lambda args: _get_package_list(*args), _product))
            package_listings = {args: pkgs for args, pkgs in zip(_product, results, strict=True)}

    logging.info("Fetched packages for %d releases in %.2f seconds.", len(releases), elapsed())

    # Union all components and repos
    packages_by_release: dict[UbuntuRelease, set[PackageName]] = {r: set() for r in releases}
    for (release, _component, _repo), packages in package_listings.items():
        packages_by_release[release].update(packages)

    return packages_by_release


_PACKAGE_RE = re.compile(r"^Package:\s*(\S+)", re.MULTILINE)


def _get_package_list(
    release: UbuntuRelease,
    component: Component,
    repo: Repo,
) -> set[PackageName]:
    name = f"{release.short_codename}-{repo}" if repo else release.short_codename

    package_url = f"https://archive.ubuntu.com/ubuntu/dists/{name}/{component}/binary-amd64/Packages.gz"
    headers = {
        "User-Agent": f"{sys.argv[0]}/{__VERSION__}",
        "Referer": f"https://archive.ubuntu.com/ubuntu/dists/{name}/{component}/binary-amd64",
    }
    response = requests.get(package_url, headers=headers)

    if response.status_code != 200:
        # retry with old-releases if not found in archive
        package_url = f"https://old-releases.ubuntu.com/ubuntu/dists/{name}/{component}/binary-amd64/Packages.gz"
        headers["Referer"] = f"https://old-releases.ubuntu.com/ubuntu/dists/{name}/{component}/binary-amd64"
        response = requests.get(package_url, headers=headers)

    if response.status_code != 200:
        raise Exception(
            f"Failed to download package list from '{package_url}'. HTTP status code: {response.status_code}"
        )

    with gzip.GzipFile(fileobj=io.BytesIO(response.content)) as f:
        content = f.read().decode("utf-8")

    return set(m.group(1) for m in _PACKAGE_RE.finditer(content))


## STATIC ANALYSIS #############################################################

Note = dict[str, str | int]


def create_note(
    note: str,
    text: str | None = None,
    line: int | None = None,
) -> Note:
    note_dict: dict[str, str | int] = {"note": note}

    if text is not None:
        note_dict["text"] = text

    if line is not None:
        note_dict["line"] = line

    return note_dict


@no_type_check
def check_missing_copyright(
    data: SliceDefinitionJson,
) -> Note | None:
    if "copyright" not in data["slices"]:
        return create_note("missing copyright")
    return None


def check_double_glob(
    text: SliceDefinitionText,
) -> Note | None:
    if "**" in text:
        return create_note("double glob")
    return None


def check_excess_blank_lines(text: SliceDefinitionText) -> Note | None:
    blanks = 0
    for line in text.splitlines():
        if line.strip() == "":
            blanks += 1
        else:
            blanks = 0
        if blanks > 2:
            return create_note("excess blank lines")
    return None


def check_architecture_comments(text: SliceDefinitionText) -> Note | None:
    for line in text.splitlines():
        if "#" in line:
            comments_content = line.split("#", 1)[1]
            if any(arch in comments_content for arch in ARCHITECTURE_SIGNATURES):
                return create_note("architecture comments")
    return None


@no_type_check
def check_unsorted_contents(data_json: dict[str, object]) -> list[Note]:
    notes = []
    for _name, content in data_json["slices"].items():
        contents_keys = list(content.get("contents", {}).keys())
        essentials = content.get("essential", [])

        for names in [contents_keys, essentials]:
            if names != sorted(names):
                notes.append(create_note("unsorted content"))
                break
    return notes


def check_sdf(data_json: dict[str, object], text: str) -> list[Note]:
    notes: list[Note] = []
    _note = check_missing_copyright(data_json)
    if _note:
        notes.append(_note)
    _note = check_double_glob(text)
    if _note:
        notes.append(_note)
    _note = check_excess_blank_lines(text)
    if _note:
        notes.append(_note)
    _note = check_architecture_comments(text)
    if _note:
        notes.append(_note)
    notes.extend(check_unsorted_contents(data_json))
    return notes


# TODO: parallelize _get_notes_by_release


def _get_notes_by_release(
    slices_by_release: dict[UbuntuRelease, dict[PackageName, SliceDefinitionText]],
) -> dict[UbuntuRelease, dict[PackageName, list[Note]]]:
    notes_by_release: dict[UbuntuRelease, dict[PackageName, list[Note]]] = {}

    logging.info("Static analysis of slice definitions...")

    with timing_context() as elapsed:
        for release, slices in slices_by_release.items():
            notes_by_package: dict[PackageName, list[Note]] = {}
            for package_name, slice_text in slices.items():
                try:
                    slice_json: SliceDefinitionJson = yaml.safe_load(slice_text)
                except Exception as e:
                    notes_by_package[package_name] = [create_note("invalid YAML", text=str(e))]
                    continue

                notes = check_sdf(slice_json, slice_text)
                if notes:
                    notes_by_package[package_name] = notes

            if notes_by_package:
                notes_by_release[release] = notes_by_package

    logging.info(
        "Completed static analysis of slice definitions in %.2f seconds.",
        elapsed(),
    )

    return notes_by_release


## DATABASE ####################################################################


def init_db(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE slice (
            branch TEXT NOT NULL,
            package TEXT NOT NULL,
            definition TEXT NOT NULL,
            notes TEXT DEFAULT '[]'
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE meta (
            key TEXT NOT NULL UNIQUE,
            value TEXT
        )
        """
    )


def insert_into_slice(
    conn: sqlite3.Connection,
    branch: str,
    package: str,
    definition: str,
    notes: str,
) -> None:
    conn.execute(
        """
        INSERT INTO slice (branch, package, definition, notes)
        VALUES (?, ?, ?, ?)
        """,
        (
            branch,
            package,
            definition,
            notes,
        ),
    )


def insert_into_meta(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        "INSERT INTO meta (key, value) VALUES (?, ?)",
        ("last_update", datetime.now().isoformat()),
    )


@contextmanager
def db_connection(db_path: Path, *, transaction: bool = True) -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(db_path)
    if transaction:
        conn.execute("BEGIN")
    try:
        yield conn
    finally:
        if transaction:
            conn.commit()
        conn.close()


def brotli_compress_file(input_path: Path, output_path: Path) -> None:
    found = False
    try:
        import brotli

        found = True
    except ImportError:
        pass

    if found:
        with open(input_path, "rb") as input_file:
            data = input_file.read()

        compressed_data = brotli.compress(data)

        with open(output_path, "wb") as output_file:
            output_file.write(compressed_data)
        return

    # fallback to brotli command line tool if the brotli Python library is not available
    import subprocess

    if shutil.which("brotli") is None:
        raise ImportError(
            "Brotli compression is required but neither the brotli Python library "
            "nor the brotli command line tool is available."
        )
    subprocess.run(
        ["brotli", "--best", "--input", str(input_path), "--output", str(output_path)],
        check=True,
    )


def _write_db(
    db_path: Path,
    slices_by_release: dict[UbuntuRelease, dict[PackageName, SliceDefinitionText]],
    notes_by_release: dict[UbuntuRelease, dict[PackageName, list[Note]]],
) -> None:
    logging.info("Writing data to database...")

    with timing_context() as elapsed:
        db_path.unlink(missing_ok=True)
        with db_connection(db_path) as conn:
            init_db(conn)
            for release, slices in slices_by_release.items():
                notes_for_release = notes_by_release.get(release, {})
                for package_name, slice_text in slices.items():
                    slice_json = yaml.safe_load(slice_text)
                    slice_json_str = json.dumps(slice_json)
                    notes_json_str = json.dumps(notes_for_release.get(package_name, []))

                    insert_into_slice(
                        conn,
                        release.branch_name,
                        package_name,
                        slice_json_str,
                        notes_json_str,
                    )

            insert_into_meta(conn, "last_update", datetime.now().isoformat())

    logging.info(
        "Finished writing data to database in %.2f seconds.",
        elapsed(),
    )


def _compress_db(db_path: Path, compressed_db_path: Path) -> None:
    logging.info("Compressing database file...")
    with timing_context() as elapsed:
        brotli_compress_file(db_path, compressed_db_path)
    logging.info(
        "Finished compressing database file in %.2f seconds.",
        elapsed(),
    )


def _log_db_info(db_path: Path, compressed_db_path: Path | None = None) -> None:
    db_size = db_path.stat().st_size

    # get some info about the db contents while we're at it
    n_rows = -1
    n_releases = -1
    n_unique_packages = -1
    with db_connection(db_path, transaction=False) as conn:
        n_rows = conn.execute("SELECT COUNT(*) FROM slice").fetchone()[0]
        n_releases = conn.execute("SELECT COUNT(DISTINCT branch) FROM slice").fetchone()[0]
        n_unique_packages = conn.execute("SELECT COUNT(DISTINCT package) FROM slice").fetchone()[0]

    logging.info(
        "Database contains %d rows, %d unique releases, and %d unique packages.",
        n_rows,
        n_releases,
        n_unique_packages,
    )

    logging.info("Database file '%s' size: %.2f MB", db_path, db_size / (1024 * 1024))

    if compressed_db_path and compressed_db_path.exists():
        compressed_db_size = compressed_db_path.stat().st_size
        logging.info(
            "Compressed database file '%s' size: %.2f MB",
            compressed_db_path,
            compressed_db_size / (1024 * 1024),
        )
        if db_size > 0:
            compression_ratio = compressed_db_size / db_size
            logging.info(
                "Compression ratio: %.2f%%",
                compression_ratio * 100,
            )


## MAIN ########################################################################


def main(args: argparse.Namespace) -> None:

    # Get all the data up front
    releases = _ubuntu_branches_in_chisel_releases()

    # TODO: parse versions for each package for each release and add that to the db
    _packages_by_release = _get_packages_by_release(releases, args.jobs)

    slices_by_release = _get_slices_by_release(releases, jobs=args.jobs, cleanup=not args.debug)

    # Run the static analysis
    notes_by_release = _get_notes_by_release(slices_by_release)

    # Write the data to the db
    _write_db(args.db_path, slices_by_release, notes_by_release)

    if args.compress:
        _compress_db(args.db_path, args.compressed_db_path)

    _log_db_info(args.db_path, args.compressed_db_path if args.compress else None)


## BOILERPLATE #################################################################


def setup_logging(log_level: str) -> None:
    _logger = logging.getLogger()
    handler = logging.StreamHandler()
    base_fmt = "%(asctime)s %(levelname)s %(message)s"
    tty_fmt = base_fmt
    datefmt = "%Y-%m-%dT%H:%M:%S"
    formatter: type[logging.Formatter] = logging.Formatter
    # Try to use colorlog for colored output
    try:
        import colorlog

        tty_fmt = tty_fmt.replace("%(levelname)s", "%(log_color)s%(levelname)s%(reset)s")
        formatter = colorlog.ColoredFormatter
    except ImportError:
        pass

    handler.setFormatter(formatter(tty_fmt, datefmt))
    _logger.addHandler(handler)

    log_level = "critical" if log_level.lower() == "fatal" else log_level
    _logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch data about open PRs in chisel-releases and write it to a JSON file.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--version",
        action="version",
        version=f"%(prog)s {__VERSION__}",
    )
    parser.add_argument(
        "db_path",
        type=Path,
        help="Path to the output database file.",
    )
    parser.add_argument(
        "-f",
        "--force",
        action="store_true",
        help="Whether to overwrite the output file if it already exists.",
    )
    parser.add_argument(
        "--compress",
        action="store_true",
        help="Whether to Brotli-compress the output database file.",
    )
    parser.add_argument(
        "--jobs",
        "-j",
        type=int,
        default=1,  # -1 = as many as possible, 1 = no parallelism
        help="Number of parallel jobs to use when fetching PR details.",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Debug logging + don't clean up temp clones.",
    )

    args = parser.parse_args()
    if args.jobs == 0 or args.jobs < -1:
        parser.error("--jobs must be a positive integer or -1 for unlimited.")
    args.jobs = None if args.jobs == -1 else args.jobs  # None = as many as possible

    # patch on the compressed db path for convenience
    args.compressed_db_path = args.db_path.with_suffix(args.db_path.suffix + ".br")

    return args


def check_db_files_existence(
    db_path: Path,
    compressed_db_path: Path,
    *,
    force: bool,
    compress: bool,
) -> None:
    if db_path.exists():
        if not force:
            raise FileExistsError(f"Output file '{db_path}' already exists. Use --force to overwrite.")
        logging.warning("Overwriting existing file '%s'.", db_path)

    if compress:
        if compressed_db_path.exists():
            if not force:
                raise FileExistsError(
                    f"Compressed output file '{compressed_db_path}' already exists. Use --force to overwrite."
                )
            logging.warning("Overwriting existing file '%s'.", compressed_db_path)

    # NOTE: we don't actually unlink the files yet. only when we're about to write to them


if __name__ == "__main__":
    args = parse_args()
    setup_logging("info" if not args.debug else "debug")
    # even in debug mode the filelock logs are too verbose, so we set it to info
    logging.getLogger("filelock").setLevel(logging.INFO)

    logging.debug("Parsed args: %s", args)

    try:
        # preamble
        check_db_files_existence(
            args.db_path,
            args.compressed_db_path,
            force=args.force,
            compress=args.compress,
        )
        init_distro_info()
        init_chisel_releases_clone()
        check_github_token()

        # actual work
        main(args)

    except NotImplementedError as e:
        lineno = str(e.__traceback__.tb_lineno) if e.__traceback__ else "unknown"
        logging.error("NotImplementedError at line %s: %s", lineno, str(e))
    except FileExistsError as e:
        # Log with no traceback
        logging.error(str(e))
    except Exception:
        raise
    finally:
        if not args.debug:
            cleanup_chisel_releases_clone()
