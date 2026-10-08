# XRPL Developers Discord: project showcase post

Find the showcase or "built on XRPL" channel and read its pinned rules
first. Post once, then answer questions in the thread. Don't cross-post
to other channels.

```
Hi all, I'm Joshua. I've been building NOSHASHI, a read-only compliance
and risk layer for the XRP Ledger. It never asks for keys and has no
code path that signs or submits a transaction.

Free tool, no account needed: paste any issuer address and it shows what
that issuer can still do to holders. That covers freeze powers, whether
holding needs permission, whether any key can sign for the account, and
supply concentration if you ask for it. Each answer is bound to a ledger
index and a SHA-256 digest.
https://www.noshashi.app/certificate/
JSON: https://www.noshashi.app/api/authority?issuer=r...

The desktop app (macOS/Windows/Linux, release 1.0.20) adds:
• fillable vs advertised order-book depth
• delivered amount on partial payments
• OFAC-listed sender screening up to three hops back
• a GO/HOLD/NO-GO decision against a versioned policy, with a receipt

Source: https://github.com/Ignosha/noshashi
The builds aren't code-signed yet, so the OS will warn you. Each release
publishes SHA-256 checksums.

I'd really value feedback from people who know the ledger better than
I do, especially if you find a reading that's wrong.
```
