#!/usr/bin/env python3
import re

import argparse
from datetime import datetime
import json
import logging
from pathlib import Path
import sqlite3
import subprocess
import tempfile

import brotli
import yaml

REPO_URL = "https://github.com/canonical/chisel-releases.git"

ARCH_SIGS = {"arm", "amd64", "x86", "aarch", "i386", "riscv", "ppc64", "s390x"}


def get_remote_branches(repo_path: Path) -> list:
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


def initialize_database(output: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(output)
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
    return conn


def process_slice(sdf_path: Path) -> dict[str, str]:
    sdf_text = sdf_path.read_text()
    data = yaml.safe_load(sdf_text)
    data_json = json.dumps(data)
    notes_json = json.dumps(check_sdf(data, sdf_text))

    return {
        "package": sdf_path.stem,
        "definition": data_json,
        "notes": notes_json,
    }


def create_note(
    note: str,
    text: str | None = None,
    line: int | None = None,
) -> dict[str, str | int]:
    note_dict: dict[str, str | int] = {"note": note}

    if text is not None:
        note_dict["text"] = text

    if line is not None:
        note_dict["line"] = line

    return note_dict


def check_missing_copyright(data_json):
    notes = []
    if "copyright" not in data_json["slices"]:
        notes.append(create_note("missing copyright"))
    return notes


def check_double_glob(data_json, sdf_text):
    notes = []
    if "**" in sdf_text:
        notes.append(create_note("double glob"))

    for _name, content in data_json["slices"].items():
        contents_keys = list(content.get("contents", {}).keys())
        for path in contents_keys:
            if "**" in path:
                notes.append(create_note("double glob"))
    return notes


def check_excess_blank_lines(sdf_text):
    notes = []
    blanks = 0
    for line in sdf_text.splitlines():
        if line.strip() == "":
            blanks += 1
        else:
            blanks = 0
        if blanks > 2:
            notes.append(create_note("excess blank lines"))
            break
    return notes


def check_architecture_comments(sdf_text):
    notes = []
    for line in sdf_text.splitlines():
        if "#" in line:
            comments_content = line.split("#", 1)[1]
            if any(arch in comments_content for arch in ARCH_SIGS):
                notes.append(create_note("architecture comments"))
                break
    return notes


def check_unsorted_contents(data_json):
    notes = []
    for _name, content in data_json["slices"].items():
        contents_keys = list(content.get("contents", {}).keys())
        essentials = content.get("essential", [])

        for names in [contents_keys, essentials]:
            if names != sorted(names):
                notes.append(create_note("unsorted content"))
                break
    return notes


def check_sdf(data_json, sdf_text):
    notes = []
    notes.extend(check_missing_copyright(data_json))
    notes.extend(check_double_glob(data_json, sdf_text))
    notes.extend(check_excess_blank_lines(sdf_text))
    notes.extend(check_architecture_comments(sdf_text))
    notes.extend(check_unsorted_contents(data_json))
    return notes


def main(args: argparse.Namespace) -> None:

    # Clone the repo and process the slices in each ubuntu-* branch
    results: dict[str, list[dict[str, str]]] = {}
    with tempfile.TemporaryDirectory() as tmpdirname:
        tmpdir = Path(tmpdirname)

        subprocess.run(["git", "clone", REPO_URL, str(tmpdir)], check=True)
        subprocess.run(["git", "fetch", "--all"], cwd=str(tmpdir), check=True)


        origin_branches = [
            branch
            for branch in get_remote_branches(tmpdir)
            if branch.startswith("ubuntu-")
        ]

        for branch in origin_branches:
            checkout_branch(tmpdir, branch)
            for sdf_path in tmpdir.glob("slices/*"):
                result = process_slice(sdf_path)
                results.setdefault(branch, []).append(result)

    # save the results to the database
    args.db.unlink(missing_ok=True)
    conn = initialize_database(args.db)

    for branch, branch_results in results.items():
        for result in branch_results:
            conn.execute(
                "INSERT INTO slice (branch, package, definition, notes) VALUES (?, ?, ?, ?)",
                (branch, result["package"], result["definition"], result["notes"]),
            )
    conn.execute(
        "INSERT INTO meta (key, value) VALUES (?, ?)",
        ("last_update", datetime.now().isoformat()),
    )
    conn.commit()
    conn.close()

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
