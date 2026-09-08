"""Run the SIH 26012 frontend from the repository root.

Usage in GitHub Codespaces:
    python serve_frontend.py --port 3001

The server deliberately serves ./frontend as its document root so that
http://localhost:<port>/ opens frontend/index.html instead of returning 404.
"""
from __future__ import annotations

import argparse
import http.server
import os
from functools import partial
from pathlib import Path


ROOT = Path(__file__).resolve().parent
FRONTEND = ROOT / "frontend"


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve the SIH 26012 frontend")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "3000")))
    args = parser.parse_args()

    if not FRONTEND.is_dir():
        raise SystemExit(f"Frontend directory not found: {FRONTEND}")

    handler = partial(http.server.SimpleHTTPRequestHandler, directory=str(FRONTEND))
    with http.server.ThreadingHTTPServer(("0.0.0.0", args.port), handler) as server:
        print(f"SIH 26012 frontend running at http://localhost:{args.port}/")
        print(f"Serving directory: {FRONTEND}")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")


if __name__ == "__main__":
    main()
