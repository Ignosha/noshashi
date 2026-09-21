# Interface translations

Each file is a flat map of `key: translation`. Keys are referenced from
the markup with `data-i18n="key"`, and `site/assets/i18n.js` swaps them.

**This translates the interface, not the argument.** Navigation,
headings, calls to action and the mission — the text that decides
whether a visitor stays. Body copy, the findings, the guide and the
legal pages remain in English.

That boundary is deliberate rather than unfinished. This is a compliance
product, and a mistranslated disclaimer is worse than an untranslated
one: "a GO verdict means the configured rules passed — it is not a
representation that a transaction is lawful in any jurisdiction" has to
survive translation exactly, and a phrase that drifts even slightly
becomes a claim the product does not make. Legal text stays in the
language it was reviewed in, and the switcher says so.

## Adding a language

1. Copy `es.json`, translate the values, keep the keys.
2. Add the entry to `LANGUAGES` in `api/_lib/i18n.js`.
3. Add the country codes that should default to it, in the same file.

Leave a key out and the English falls through — a missing translation
shows English rather than an empty element or a key name.
