#!/usr/bin/env python3
"""Check the inline JavaScript in index.html with Node.js."""

from pathlib import Path
import re
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / "index.html"
SCRIPT_PATTERN = re.compile(
    r"<script\b(?P<attributes>[^>]*)>(?P<body>.*?)</script\s*>",
    re.IGNORECASE | re.DOTALL,
)


def main() -> int:
    html = HTML_PATH.read_text(encoding="utf-8")
    inline_scripts = [
        match.group("body")
        for match in SCRIPT_PATTERN.finditer(html)
        if not re.search(r"\bsrc\s*=", match.group("attributes"), re.IGNORECASE)
    ]

    if len(inline_scripts) != 1:
        print(
            f"Expected one inline script in {HTML_PATH.name}; found {len(inline_scripts)}.",
            file=sys.stderr,
        )
        return 1

    with tempfile.TemporaryDirectory(prefix="ahs-check-") as temp_dir:
        script_path = Path(temp_dir) / "inline.js"
        script_path.write_text(inline_scripts[0], encoding="utf-8")
        result = subprocess.run(["node", "--check", str(script_path)], check=False)

    if result.returncode == 0:
        print("Inline JavaScript syntax is valid.")
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
