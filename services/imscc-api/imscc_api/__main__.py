"""Command line: python -m imscc_api path/to/export.imscc [--include-unpublished] > result.json"""
import argparse
import sys

from .mapper import map_cartridge
from .package import Package, PackageError


def main() -> int:
    parser = argparse.ArgumentParser(description="Map a Canvas .imscc export onto Alma 41's lesson wizard steps.")
    parser.add_argument("path")
    parser.add_argument("--include-unpublished", action="store_true")
    args = parser.parse_args()
    with open(args.path, "rb") as handle:
        data = handle.read()
    try:
        result = map_cartridge(Package(data), args.include_unpublished)
    except PackageError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    sys.stdout.buffer.write(result.model_dump_json(by_alias=True, indent=2).encode("utf-8"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
