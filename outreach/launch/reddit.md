# Reddit

Read each subreddit's rules on self-promotion first. Post it as a text
post, say clearly that you built the tool, and stay to answer comments.
Post to one subreddit first, and only post to a second a week later.

Candidates: r/XRP, r/Ripple, r/XRPL (check that it is active).

**Title:**

```
I built a free tool that shows what an XRPL token issuer can still do to holders (freeze, permission, signing keys)
```

**Body:**

```
Before you hold an issued token on the XRP Ledger, you can check on the
ledger whether the issuer kept the power to freeze your trust line,
whether holding needs their permission, and whether any key can still
sign for the issuer. Most wallets don't show this.

I built a free page that reads it from mainnet for any issuer address.
No account or wallet is needed, and you never connect anything:
https://www.noshashi.app/certificate/

Each result is bound to the ledger index it was read at and to a
SHA-256 digest, so it works as a dated record.

It doesn't judge whether a token is good or bad. Keeping freeze powers
is normal for regulated stablecoins, for example. The tool just shows
you what is true.

I'm the developer (Joshua). The code is public:
https://github.com/Ignosha/noshashi
Feedback is very welcome, especially if a reading looks wrong.
```
