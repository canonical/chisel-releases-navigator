#!/usr/bin/env python3
import re

import argparse
import logging
from pathlib import Path
import json
from peewee import Model, SqliteDatabase, TextField
from datetime import datetime
import subprocess
import brotli
import yaml
import tempfile


REPO_URL = "https://github.com/canonical/chisel-releases.git"
ARCH_SIGS = ["arm", "amd64", "x86", "aarch", "i386", "riscv", "ppc64", "s390x"]


def get_remote_branches(repo_path: Path) -> list:
    """
    Returns a list of remote branch names (without the 'origin/' prefix)
    by parsing the output of `git branch -r`.
    """
    result = subprocess.run(
        ["git", "branch", "-r"],
        cwd=str(repo_path),
        capture_output=True,
        text=True,
        check=True,
    )
    branches = []
    for line in result.stdout.strip().splitlines():
        # Each line might be formatted like "  origin/feature-xyz"
        branch_full = line.strip()
        if branch_full.startswith("origin/"):
            branch_name = branch_full[len("origin/") :]
        else:
            branch_name = branch_full

        branches.append(branch_name)
    return branches


def checkout_branch(repo_path: Path, branch: str):
    """
    Checks out the given branch. If a local branch doesn't exist,
    it creates one tracking the remote branch.
    """
    try:
        # Try to check out the branch (if it exists locally)
        subprocess.run(["git", "checkout", branch], cwd=str(repo_path), check=True)
    except subprocess.CalledProcessError:
        # If checkout fails, create a new local branch tracking origin/branch
        subprocess.run(
            ["git", "checkout", "-t", f"origin/{branch}"],
            cwd=str(repo_path),
            check=True,
        )


def initialize_database(output: Path) -> tuple[SqliteDatabase, type, type]:
    db = SqliteDatabase(output)

    class BaseModel(Model):
        class Meta:
            database = db

    class Slice(BaseModel):
        branch = TextField()
        package = TextField()
        definition = TextField()
        warnings = TextField(default="[]")

    class Meta(BaseModel):
        key = TextField()
        value = TextField(default="")

    db.connect()
    db.create_tables([Slice, Meta])
    return db, Slice, Meta


def process_slice(Slice, branch: str, sdf_path: Path):
    sdf_text = sdf_path.read_text()
    data = yaml.safe_load(sdf_text)
    data_json = json.dumps(data)
    warnings = json.dumps(check_sdf(data, sdf_text))

    Slice.create(
        branch=branch,
        package=sdf_path.stem,
        definition=data_json,
        warnings=warnings,
    )

def process_slice_new(branch: str, sdf_path: Path) -> dict[str, object]:
    sdf_text = sdf_path.read_text()
    data = yaml.safe_load(sdf_text)
    data_json = json.dumps(data)
    warnings = check_sdf(data, sdf_text)

    return {
        "package": sdf_path.stem,
        "definition": data_json,
        "warnings": warnings,
    }


def create_warning(
    warning: str,
    text: str | None = None,
    line: int | None = None,
) -> dict[str, str | int]:
    warning_dict: dict[str, str | int] = {"warning": warning}

    if text is not None:
        warning_dict["text"] = text

    if line is not None:
        warning_dict["line"] = line

    return warning_dict


def check_missing_copyright(data_json):
    """
    Checks if the 'copyright' field is missing in the JSON data.
    """
    warnings = []
    if "copyright" not in data_json["slices"]:
        warnings.append(create_warning("missing copyright"))
    return warnings


def check_double_glob(data_json, sdf_text):
    """
    Checks for double glob patterns in the JSON data and SDF text.
    """
    warnings = []
    if "**" in sdf_text:
        warnings.append(create_warning("double glob"))

    for _name, content in data_json["slices"].items():
        contents_keys = list(content.get("contents", {}).keys())
        for path in contents_keys:
            if "**" in path:
                warnings.append(create_warning("double glob"))
    return warnings


def check_excess_blank_lines(sdf_text):
    """
    Checks for excessive blank lines in the SDF text.
    """
    warnings = []
    blanks = 0
    for line in sdf_text.splitlines():
        if line.strip() == "":
            blanks += 1
        else:
            blanks = 0
        if blanks > 2:
            warnings.append(create_warning("excess blank lines"))
            break
    return warnings


def check_architecture_comments(sdf_text):
    """
    Checks for architecture-related comments in the SDF text.
    """
    warnings = []
    for line in sdf_text.splitlines():
        if "#" in line:
            comments_content = line.split("#", 1)[1]
            if any(arch in comments_content for arch in ARCH_SIGS):
                warnings.append(create_warning("architecture comments"))
                break
    return warnings


def check_unsorted_contents(data_json):
    """
    Checks if contents and essentials in the JSON data are unsorted.
    """
    warnings = []
    for _name, content in data_json["slices"].items():
        contents_keys = list(content.get("contents", {}).keys())
        essentials = content.get("essential", [])

        for names in [contents_keys, essentials]:
            if names != sorted(names):
                warnings.append(create_warning("unsorted content"))
                break
    return warnings


def check_sdf(data_json, sdf_text):
    """
    Runs all checks on the JSON data and SDF text.
    """
    warnings = []
    warnings.extend(check_missing_copyright(data_json))
    warnings.extend(check_double_glob(data_json, sdf_text))
    warnings.extend(check_excess_blank_lines(sdf_text))
    warnings.extend(check_architecture_comments(sdf_text))
    warnings.extend(check_unsorted_contents(data_json))
    return warnings


def main(args: argparse.Namespace) -> None:
    with tempfile.TemporaryDirectory() as tmpdirname:
        tmpdir = Path(tmpdirname)

        subprocess.run(["git", "clone", REPO_URL, str(tmpdir)], check=True)
        subprocess.run(["git", "fetch", "--all"], cwd=str(tmpdir), check=True)

        args.db.unlink(missing_ok=True)


        origin_branches = [
            branch
            for branch in get_remote_branches(tmpdir)
            if branch.startswith("ubuntu-")
        ]

        results: dict[str, list[dict[str, object]]] = {}
        for branch in origin_branches:
            results[branch] = []
            checkout_branch(tmpdir, branch)
            for sdf_path in tmpdir.glob("slices/*"):
                # process_slice(Slice, branch, sdf_path)
                result = process_slice_new(branch, sdf_path)
                results[branch].append(result)

        db, Slice, Meta = initialize_database(args.db)
        for branch, slices in results.items():
            for slice in slices:
                Slice.create(  # type: ignore
                    branch=branch,
                    package=slice["package"],
                    definition=slice["definition"],
                    warnings=slice["warnings"],
                )
        Meta.create(key="last_update", value=datetime.now().isoformat())  # type: ignore
        db.close()

    # Compress the database using Brotli
    compressed = brotli.compress(args.db.read_bytes())
    compressed_path = Path(f"{args.db}.br")
    compressed_path.write_bytes(compressed)


## BOILERPLATE ##############################


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Chisel Releases Data Manager")

    parser.add_argument(
        "--log-level",
        type=str,
        default="info",
        help="Set the log level.",
    )

    parser.add_argument(
        "--db",
        type=Path,
        default="index.db",
        help="Path to the output database file.",
    )

    return parser.parse_args()


def setup_logging(log_level: str, logfile: str | None = None) -> None:
    _logger = logging.getLogger()
    handler = logging.StreamHandler()
    base_fmt = "%(asctime)s %(levelname)s %(message)s"
    tty_fmt = base_fmt
    datefmt = "%Y-%m-%dT%H:%M:%S"
    formatter: type[logging.Formatter] = logging.Formatter
    # Try to use colorlog for colored output
    try:
        import colorlog  # type: ignore

        tty_fmt = tty_fmt.replace(
            "%(levelname)s", "%(log_color)s%(levelname)s%(reset)s"
        )
        formatter = colorlog.ColoredFormatter  # type: ignore
    except ImportError:
        pass

    handler.setFormatter(formatter(tty_fmt, datefmt))  # type: ignore
    _logger.addHandler(handler)

    if logfile:
        file_handler = logging.FileHandler(logfile)
        file_handler.setFormatter(logging.Formatter(base_fmt, datefmt))
        _logger.addHandler(file_handler)
    log_level = "critical" if log_level.lower() == "fatal" else log_level
    _logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))


if __name__ == "__main__":
    args = parse_args()
    setup_logging(args.log_level)
    main(args)
