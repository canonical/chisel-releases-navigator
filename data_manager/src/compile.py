import json
from pathlib import Path
from peewee import Model, SqliteDatabase, TextField
from datetime import datetime
import subprocess
import brotli
import yaml
from .sdf_checker import check_sdf


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


def compile_data(output: Path, data_path: Path) -> None:
    db, Slice, Meta = initialize_database(output)
    add_meta_data(db, Meta)

    origin_branches = get_release_branches(data_path)
    process_branches(db, Slice, origin_branches, data_path)

    db.close()
    compress_database(output)


def initialize_database(output: Path) -> tuple[SqliteDatabase, type, type]:
    db = SqliteDatabase(output)

    class BaseModel(Model):
        class Meta:
            database = db

    class Slice(BaseModel):
        branch = TextField()
        package = TextField()
        branch_type = TextField()
        definition = TextField()
        raw_definition = TextField()
        warnings = TextField(default="[]")

    class Meta(BaseModel):
        key = TextField()
        value = TextField(default="")

    db.connect()
    db.create_tables([Slice, Meta])
    return db, Slice, Meta


def add_meta_data(db, Meta):
    Meta.create(key="last_update", value=datetime.now().isoformat())


def get_release_branches(data_path: Path):
    return [
        branch
        for branch in get_remote_branches(data_path)
        if branch.startswith("ubuntu-")
    ]


def process_branches(db, Slice, branches, data_path: Path):
    for branch in branches:
        checkout_branch(data_path, branch)
        for sdf_path in data_path.glob("slices/*"):
            process_slice(Slice, branch, sdf_path)


def process_slice(Slice, branch: str, sdf_path: Path):
    sdf_text = sdf_path.read_text()
    data = yaml.safe_load(sdf_text)
    data_json = json.dumps(data)
    warnings = json.dumps(check_sdf(data, sdf_text))

    Slice.create(
        branch=branch,
        package=sdf_path.stem,
        branch_type="release",
        definition=data_json,
        raw_definition=sdf_text,
        warnings=warnings,
    )


def compress_database(output: Path):
    compressed = brotli.compress(output.read_bytes())
    compressed_path = Path(f"{output}.br")
    compressed_path.write_bytes(compressed)
