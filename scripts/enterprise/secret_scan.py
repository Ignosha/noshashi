#!/usr/bin/env python3
"""Focused current-tree credential scan. Never prints matched credential bytes.
Not a substitute for history scanning, platform secret scanning or assessment.
"""
import pathlib
import re
import subprocess
import sys

RULES = {
    'stripe_secret_or_restricted': re.compile(rb'\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}'),
    'stripe_claimable_sandbox': re.compile(rb'\brkcs_test_[A-Za-z0-9]{20,}'),
    'stripe_webhook_signing': re.compile(rb'\bwhsec_[A-Za-z0-9]{20,}'),
    'supabase_secret': re.compile(rb'\bsb_secret_[A-Za-z0-9_-]{20,}'),
    'github_token': re.compile(rb'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})'),
    'private_key_material': re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----'),
    'aws_access_key_identifier': re.compile(rb'\bAKIA[A-Z0-9]{16}\b'),
}

def findings(data):
    return [{'rule': name, 'line': data.count(b'\n', 0, match.start()) + 1}
            for name, pattern in RULES.items() for match in pattern.finditer(data)]

def main(root):
    result = subprocess.run(['git', 'ls-files', '-z'], cwd=root, check=True, capture_output=True)
    count = 0
    for raw_path in result.stdout.split(b'\0'):
        if not raw_path:
            continue
        path = pathlib.Path(raw_path.decode('utf-8', errors='surrogateescape'))
        file = root / path
        # Symlinks can point outside the repository; never follow them.
        if file.is_symlink() or not file.is_file():
            continue
        data = file.read_bytes()
        for item in findings(data):
            # Paths and line numbers only. No snippets, hashes or key suffixes.
            print(f'{path}:{item["line"]}: potential {item["rule"]}', file=sys.stderr)
            count += 1
    print(f'Focused current-tree secret scan: {count} finding(s). No matched values printed.')
    return int(count != 0)

if __name__ == '__main__':
    sys.exit(main(pathlib.Path(__file__).resolve().parents[2]))
