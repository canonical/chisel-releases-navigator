import subprocess
from pathlib import Path

REPO_URL = "https://github.com/canonical/chisel-releases.git"


def init_repo(data_path):
    clone_path = Path(data_path)

    if not clone_path.exists():
        clone_repository(clone_path)
    else:
        validate_git_repository(clone_path)

    fetch_all_branches(clone_path)


def clone_repository(clone_path: Path):
    subprocess.run(["git", "clone", REPO_URL, str(clone_path)], check=True)


def validate_git_repository(clone_path: Path):
    if not (clone_path / ".git").exists():
        raise Exception(
            f"Error: The directory '{clone_path}' exists but is not a git repository."
        )

    result = subprocess.run(
        ["git", "remote", "get-url", "origin"],
        cwd=str(clone_path),
        check=True,
        text=True,
        capture_output=True,
    )
    remote_url = result.stdout.strip()
    if remote_url != REPO_URL:
        raise Exception(
            f"Error: The remote URL '{remote_url}' does not match the expected URL '{REPO_URL}'."
        )


def fetch_all_branches(clone_path: Path):
    subprocess.run(["git", "fetch", "--all"], cwd=str(clone_path), check=True)
