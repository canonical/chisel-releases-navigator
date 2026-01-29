import argparse
import logging
from pathlib import Path
import sys

from .compile import compile_data
from .fetch import init_repo


logging.basicConfig(level=logging.INFO)

repo_root = Path(__file__).parents[1]
data_dir = repo_root / "data"
db_path = repo_root / "index.db"  # TODO: should this specify the compressed database?
cli_name = Path(__file__).parent.stem


def main():
    parser = argparse.ArgumentParser(prog=cli_name)
    parser.add_argument(
        "-v", "--verbose", action="store_true", help="Enable verbose logging"
    )
    subparsers = parser.add_subparsers(dest="cmd", help="subcommand help")

    subparsers.add_parser(
        "fetch", help="Fetch or update the chisel-releases repository"
    )
    subparsers.add_parser("compile", help="Compile the data into the database")

    args = parser.parse_args()

    if not args.cmd:
        parser.print_help()
        return

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    if args.cmd == "fetch":
        init_repo(data_dir)

    elif args.cmd == "compile":
        db_path.unlink(missing_ok=True)
        compile_data(db_path, data_dir)

    else:
        logging.error(f"Unknown command: {args.cmd}")
        sys.exit(1)


if __name__ == "__main__":
    main()
