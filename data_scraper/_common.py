#!/usr/bin/env python3
# spellchecker: ignore aarch riscv WRONLY

from __future__ import annotations

import logging
import os
import re
import shlex
import shutil
import signal
import subprocess as sub
import sys
import tempfile
import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from functools import total_ordering
from pathlib import Path
from typing import Callable, Literal

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

CHISEL_RELEASES_URL = os.environ.get("CHISEL_RELEASES_URL", "https://github.com/canonical/chisel-releases")


@contextmanager
def timing_context() -> Iterator[Callable[[], float]]:
    t1 = t2 = time.perf_counter()
    yield lambda: t2 - t1
    t2 = time.perf_counter()


def print_pipe_friendly(output: str) -> None:
    """Print to stdout. Make sure we work with pipes.
    https://docs.python.org/3/library/signal.html#note-on-sigpipe
    """
    try:
        print(output)
        sys.stdout.flush()
    except BrokenPipeError:
        # Gracefully handle broken pipe when e.g. piping to head
        devnull = os.open(os.devnull, os.O_WRONLY)
        os.dup2(devnull, sys.stdout.fileno())
        sys.exit(1)


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
