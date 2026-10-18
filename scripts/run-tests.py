#!/usr/bin/env python3
"""Run the automated test suite using Node's built-in test runner."""

from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
TESTS_DIR = ROOT / "tests"


def main() -> int:
    test_files = sorted(str(p) for p in TESTS_DIR.glob("*.test.mjs"))
    if not test_files:
        print("No test files found in tests/", file=sys.stderr)
        return 1

    import os
    env = os.environ.copy()
    env["TZ"] = "America/New_York"

    command = ["node", "--test", *test_files]
    result = subprocess.run(command, cwd=ROOT, env=env, check=False)
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
