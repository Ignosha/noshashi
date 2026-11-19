"""Serve Continuity on loopback with a read-only SQLite credit source.

Run: python3 tools/continuity/credit_source.py /path/to/accounting.sqlite
The page (continuity.html) and its script (continuity.js) sit next to this
file and are served from it; nothing else is read from disk.
Provide a table or view continuity_credits(tx_hash, amount, issuer, currency).
Use text columns, decimal strings, and one row per posted credit. The view must
include all relevant posted credits; duplicates are deliberately preserved.
Use an up-to-date authoritative database. Replica lag is outside this adapter.
"""
import argparse
import json
import re
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


def credits(database, tx_hash):
    if not re.fullmatch("[A-Fa-f0-9]{64}", tx_hash):
        raise ValueError("Invalid transaction hash")
    uri = Path(database).resolve().as_uri() + "?mode=ro"
    with sqlite3.connect(uri, uri=True, timeout=3) as conn:
        rows = conn.execute(
            "SELECT amount, issuer, currency FROM continuity_credits "
            "WHERE tx_hash = ? COLLATE NOCASE LIMIT 1001", (tx_hash,)
        ).fetchall()
    if len(rows) > 1000:
        raise ValueError("Too many records for one deposit")
    return {"credits": [dict(txHash=tx_hash, amount=a, issuer=i, currency=c)
                        for a, i, c in rows], "creditExportComplete": True,
            "transactionHash": tx_hash}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        host = f"127.0.0.1:{self.server.server_port}"
        if self.headers.get("Host") != host or self.headers.get("Origin") not in (None, "http://" + host) or self.headers.get("Sec-Fetch-Site") == "cross-site":
            self.send_error(403)
            return
        path = urlsplit(self.path).path
        if path == "/":
            data, mime = self.server.page, "text/html; charset=utf-8"
        elif path == "/continuity.js":
            data, mime = self.server.script, "text/javascript; charset=utf-8"
        elif re.fullmatch(r"/credits/[A-Fa-f0-9]{64}", path):
            try:
                data = json.dumps(credits(self.server.database, path.split("/")[-1])).encode()
            except (sqlite3.Error, ValueError):
                self.send_error(503, "Credit source unavailable")
                return
            mime = "application/json"
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; "
                         "connect-src 'self' wss://s1.ripple.com wss://s2.ripple.com; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", type=Path)
    args = parser.parse_args()
    if not args.database.is_file():
        parser.error(f"{args.database} is not a file")
    here = Path(__file__).resolve().parent
    page = next((here / name for name in ("continuity.html", "NOSHASHI-Continuity.html", "index.html") if (here / name).exists()), None)
    if page is None or not (here / "continuity.js").exists():
        parser.error(f"continuity.html and continuity.js must sit next to {Path(__file__).name} in {here}")
    with ThreadingHTTPServer(("127.0.0.1", 8765), Handler) as server:
        server.database = args.database
        server.page = page.read_bytes()
        server.script = (here / "continuity.js").read_bytes()
        print("Open http://127.0.0.1:8765", flush=True)
        server.serve_forever()
