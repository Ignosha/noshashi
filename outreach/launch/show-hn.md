# Show HN

Submit at https://news.ycombinator.com/submit. Read the Show HN rules
first: https://news.ycombinator.com/showhn.html. The submission URL must
be something people can try now, so use the certificate page. Post the
first comment yourself straight away, then stay around for a few hours
to answer questions.

**Title** (80 characters max):

```
Show HN: See what an XRP Ledger token issuer can still do to your balance
```

**URL:**

```
https://www.noshashi.app/certificate/
```

**First comment:**

```
I'm Joshua, and I built this. Tokens issued on the XRP Ledger carry
flags that decide what the issuer can still do to holders: freeze
trust lines, require permission to hold, and so on. Whether any key can
still sign for the issuer matters too. All of it is public ledger state,
but you have to know where to look and how to read it.

Paste an issuer address and the page reads those flags from mainnet and
explains each one. The answer is bound to the ledger index it was read
at and to a SHA-256 digest, so you can show later what was true at the
time. It answers one issuer per request, needs no account, and caches at
the edge. There's a JSON endpoint as well:
/api/authority?issuer=r...

It's the free part of a larger read-only desktop app (Tauri + React,
macOS/Windows/Linux) for compliance teams. The app checks fillable vs
advertised order-book depth, reads delivered amounts on partial
payments, screens for OFAC-listed senders up to three hops back, and
gives a GO/HOLD/NO-GO decision against a versioned policy with a
receipt. It never asks for keys, and there is no code path that signs.

Source: https://github.com/Ignosha/noshashi
To be upfront: the desktop builds aren't code-signed yet, and there are
no certifications. The known gaps are listed in the repo.

I'd love to hear about readings that are wrong or confusing.
```
