/*
 * Tests for the public site's server-rendered layer.
 *
 * The bias here is deliberate: most of these are about text that came
 * from somewhere else. The newsroom renders third-party RSS into HTML
 * served from noshashi.app, so an escaping regression is a stored XSS
 * on the marketing site, and it is the kind of regression that looks
 * completely fine in a browser. Everything else — feed parsing, the
 * status window, download labelling — is tested because it is logic
 * that silently produces a plausible wrong answer rather than an error.
 *
 * No network. Every case is a hand-built fixture.
 */

import { describe, it, expect } from "vitest";

import { esc, attrUrl, decodeEntities, stripTags, clamp, ago, megabytes } from "../api/_lib/html.js";
import { parseFeed } from "../api/_lib/news.js";
import { deriveStatus } from "../api/_lib/project-feed.js";
import { answer, search, CONFIDENT, ENTRIES } from "../api/_lib/kb.js";
import { renderNews, renderLog, renderDownloads, renderBoard } from "../api/_lib/sections.js";
import { ungroundedFigures } from "../api/support-chat.js";

describe("escaping", () => {
  it("neutralises the characters that close a tag or an attribute", () => {
    expect(esc(`<script>alert("x")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
    );
    expect(esc("it's")).toBe("it&#39;s");
  });

  it("returns empty string for null and undefined rather than the word", () => {
    // A feed with a missing field must not render the text "undefined".
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
  });

  it("refuses a javascript: URL, which survives entity escaping intact", () => {
    expect(attrUrl("javascript:alert(1)")).toBe("#");
    expect(attrUrl("JavaScript:alert(1)")).toBe("#");
    expect(attrUrl(" javascript:alert(1)")).toBe("#");
    expect(attrUrl("data:text/html,<script>")).toBe("#");
    expect(attrUrl("vbscript:msgbox")).toBe("#");
  });

  it("allows the schemes the site actually links with", () => {
    expect(attrUrl("https://example.com/a?b=1&c=2")).toBe("https://example.com/a?b=1&amp;c=2");
    expect(attrUrl("/news/")).toBe("/news/");
    expect(attrUrl("mailto:support@noshashi.app")).toBe("mailto:support@noshashi.app");
    expect(attrUrl("#download")).toBe("#download");
  });
});

describe("feed text handling", () => {
  it("unwraps CDATA before stripping tags, not after", () => {
    // Stripping first matches `<![CDATA[...]]>` end to end and deletes
    // the whole headline — which silently dropped two of three sources.
    expect(stripTags(decodeEntities("<![CDATA[Ripple files a brief]]>"))).toBe("Ripple files a brief");
  });

  it("decodes numeric and named entities", () => {
    expect(decodeEntities("Ripple &amp; SBI &#8212; &quot;pilot&quot;")).toBe('Ripple & SBI — "pilot"');
  });

  it("clamps on a word boundary and only marks a cut that happened", () => {
    expect(clamp("short title", 40)).toBe("short title");
    expect(clamp("one two three four five six", 12).endsWith("…")).toBe(true);
    expect(clamp("one two three four five six", 12)).not.toContain("thr…");
  });

  it("reports age in units a reader can act on", () => {
    const now = Date.parse("2026-09-17T12:00:00Z");
    expect(ago("2026-09-17T11:59:30Z", now)).toBe("just now");
    expect(ago("2026-09-17T11:30:00Z", now)).toBe("30m ago");
    expect(ago("2026-09-17T06:00:00Z", now)).toBe("6h ago");
    expect(ago("2026-09-10T12:00:00Z", now)).toBe("7d ago");
    expect(ago("not a date", now)).toBe("");
  });

  it("sizes a download the way the page states it", () => {
    expect(megabytes(4233369)).toBe("4.2 MB");
    expect(megabytes(81373688)).toBe("81 MB");
  });
});

describe("parseFeed", () => {
  const RSS = `<rss><channel>
    <item>
      <title><![CDATA[Ripple expands the ledger - CoinDesk]]></title>
      <link>https://example.com/one</link>
      <pubDate>Wed, 16 Sep 2026 21:43:00 GMT</pubDate>
      <source url="https://coindesk.com">CoinDesk</source>
    </item>
    <item>
      <title>An undated story</title>
      <link>https://example.com/two</link>
    </item>
    <item>
      <title>No link at all</title>
    </item>
    <item>
      <title>Relative link only</title>
      <link>/not-absolute</link>
    </item>
  </channel></rss>`;

  it("keeps only items with an absolute http(s) link", () => {
    const items = parseFeed(RSS, "Test");
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.url)).toEqual(["https://example.com/one", "https://example.com/two"]);
  });

  it("takes the publisher from <source> and strips it off the headline", () => {
    const [first] = parseFeed(RSS, "Test");
    expect(first.title).toBe("Ripple expands the ledger");
    expect(first.publisher).toBe("CoinDesk");
  });

  it("records a missing date as null rather than inventing one", () => {
    const [, second] = parseFeed(RSS, "Test");
    expect(second.publishedAt).toBeNull();
    expect(second.publisher).toBe("Test");
  });

  it("survives malformed markup instead of throwing", () => {
    expect(() => parseFeed("<rss><item><title>unclosed", "Test")).not.toThrow();
    expect(parseFeed("", "Test")).toEqual([]);
  });
});

describe("renderNews", () => {
  const hostile = {
    live: true,
    fetchedAt: new Date().toISOString(),
    sources: [{ name: "Test", ok: true }],
    items: [
      {
        title: `<img src=x onerror="alert(1)">`,
        url: "javascript:alert(document.domain)",
        publisher: `"><script>alert(1)</script>`,
        publishedAt: new Date().toISOString(),
      },
    ],
  };

  it("never emits an executable construct from feed content", () => {
    const html = renderNews(hostile);
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:");
    // `onerror=` appears in the escaped text and is inert there. The
    // dangerous form is the one followed by a real quote, because that
    // is the only way the attribute can actually close and take effect.
    expect(html).not.toContain('onerror="');
    expect(html).not.toContain('"><script');
    // The text is still shown — escaped, not dropped.
    expect(html).toContain("&lt;img src=x");
    expect(html).toContain("onerror=&quot;");
  });

  it("collapses a rejected URL to an inert href", () => {
    expect(renderNews(hostile)).toContain('href="#"');
  });

  it("says nothing rather than showing stale headlines when no source answered", () => {
    const html = renderNews({ live: false, items: [], sources: [], fetchedAt: "" });
    expect(html).toContain("No source answered");
    expect(html).not.toContain("feed-item");
  });
});

describe("renderLog", () => {
  it("escapes repository-authored entries too", () => {
    const html = renderLog([
      { kind: "note", title: "<b>bold</b>", body: "a & b", at: "2026-09-17T00:00:00Z", url: "/status/" },
    ]);
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
    expect(html).toContain("a &amp; b");
  });

  it("falls back to NOTE for an unknown kind rather than printing it raw", () => {
    const html = renderLog([{ kind: "wat", title: "x", body: "y", at: "2026-09-17T00:00:00Z" }]);
    expect(html).toContain(">NOTE<");
  });
});

describe("deriveStatus", () => {
  const at = (hoursAgo) => new Date(Date.now() - hoursAgo * 3600_000).toISOString();

  it("is operational with only notes and milestones", () => {
    const status = deriveStatus([{ kind: "note", at: at(1) }, { kind: "milestone", at: at(2) }]);
    expect(status.overall).toBe("go");
    expect(status.overallWord).toBe("OPERATIONAL");
  });

  it("drops to maintenance on a recent maintenance notice", () => {
    expect(deriveStatus([{ kind: "maintenance", at: at(2) }]).overallWord).toBe("MAINTENANCE");
  });

  it("lets an incident outrank a maintenance window", () => {
    const status = deriveStatus([{ kind: "maintenance", at: at(1) }, { kind: "incident", at: at(2) }]);
    expect(status.overall).toBe("nogo");
    expect(status.overallWord).toBe("DEGRADED");
  });

  it("stops colouring the board once the 72-hour window passes", () => {
    // The entry stays in the log permanently; only its effect expires.
    expect(deriveStatus([{ kind: "incident", at: at(80) }]).overallWord).toBe("OPERATIONAL");
  });

  it("pairs every state with a word, never colour alone", () => {
    for (const row of deriveStatus([]).rows) {
      expect(row.word).toBeTruthy();
      expect(["go", "hold", "nogo"]).toContain(row.state);
    }
    expect(renderBoard(deriveStatus([]))).toContain("board-state");
  });
});

describe("support knowledge base", () => {
  it("routes the questions visitors actually ask", () => {
    const cases = [
      ["how much does pro cost", "price"],
      ["how do I cancel my subscription", "billing"],
      ["gatekeeper will not open the app", "unsigned"],
      ["do I need to sign up", "account"],
      ["can it move my funds", "custody"],
      ["which network does it read", "network"],
      ["is this production ready", "beta"],
    ];
    for (const [question, expected] of cases) {
      expect(answer(question).matched[0], question).toBe(expected);
    }
  });

  it("hands off rather than guessing when it does not know", () => {
    const reply = answer("tell me about the weather in Paris");
    expect(reply.grounded).toBe(false);
    expect(reply.links.some((l) => l.href === "/contact/")).toBe(true);
  });

  it("refuses a price prediction instead of answering a nearby question", () => {
    // "what will XRP be worth next year" used to reach the entry about
    // which network is read, on the word "xrp" alone — a confident
    // answer to a question nobody asked.
    for (const question of ["what will XRP be worth next year",
                            "is XRP a good investment",
                            "give me a price forecast"]) {
      const reply = answer(question);
      expect(reply.matched[0], question).toBe("advice");
      expect(reply.text).toContain("does not forecast a price");
    }
  });

  it("cannot be pushed over the threshold by incidental body words alone", () => {
    // Body matches are worth 0.5; the floor is one real keyword hit.
    const hits = search("the");
    expect(hits.every((h) => h.score < CONFIDENT)).toBe(true);
  });

  it("states a price only where the site states one", () => {
    const pricing = ENTRIES.find((e) => e.id === "price");
    expect(pricing.a).toContain("$749");
    expect(pricing.a).toContain("$4,000");
  });
});

describe("renderDownloads", () => {
  const release = {
    tag: "v0.3.1",
    at: "2026-09-15T17:32:32Z",
    assets: [
      { name: "NOSHASHI_0.3.1_aarch64.dmg", size: 4233369, url: "https://example.com/a.dmg", sha256: "a".repeat(64) },
      { name: "NOSHASHI_0.3.1_x64.dmg", size: 4409444, url: "https://example.com/i.dmg", sha256: "b".repeat(64) },
      { name: "NOSHASHI_0.3.1_x64-setup.exe", size: 2440354, url: "https://example.com/w.exe", sha256: "c".repeat(64) },
      { name: "NOSHASHI_0.3.1_amd64.deb", size: 3544994, url: "https://example.com/l.deb", sha256: "d".repeat(64) },
    ],
  };

  it("labels every platform BETA", () => {
    const html = renderDownloads(release);
    expect(html.match(/>BETA</g)).toHaveLength(3);
    expect(html).not.toContain(">READY<");
  });

  it("states the channel as beta, not stable", () => {
    expect(renderDownloads(release)).toContain("Beta · v0.3.1");
  });

  it("prints the full hash for the primary artifact so it can be verified", () => {
    expect(renderDownloads(release)).toContain("a".repeat(64));
  });

  it("links out instead of fabricating a version when the release is unavailable", () => {
    const html = renderDownloads(null);
    expect(html).toContain("github.com/Ignosha/noshashi/releases");
    expect(html).not.toContain("v0.3");
  });
});

describe("support console figure guard", () => {
  /*
   * The system prompt tells the model not to state a figure the
   * knowledge base does not contain. Claude follows that; a 70B
   * open-weight model on a free tier follows it most of the time, and
   * on a site whose argument is that it does not invent figures, most
   * of the time is not good enough. Every money amount, percentage and
   * version in a model reply is checked, and a reply carrying an
   * ungrounded one is discarded in favour of the deterministic answer.
   */
  it("passes figures the site actually states", () => {
    expect(ungroundedFigures("Pro is $749 per seat per month.")).toEqual([]);
    expect(ungroundedFigures("Institutional is $4,000 a month.")).toEqual([]);
    expect(ungroundedFigures("You get 10 address checks per month.")).toEqual([]);
  });

  it("catches an invented price", () => {
    expect(ungroundedFigures("Pro costs $299 per month.")).toEqual(["$299"]);
  });

  it("catches an invented percentage", () => {
    expect(ungroundedFigures("It is about 45% faster.")).toEqual(["45%"]);
  });

  it("catches a version number, even a true one", () => {
    // The knowledge base deliberately states no version — versions
    // change and the download page is the source. A bot repeating one
    // is a bot that will still be repeating it three releases later.
    expect(ungroundedFigures("The current build is v0.3.1.")).toEqual(["v0.3.1"]);
  });

  it("is not defeated by thousands separators", () => {
    // "$4,000" and "$4000" are the same claim and both appear in the
    // wild; comparing with separators stripped keeps a true statement
    // from being thrown away over a comma.
    expect(ungroundedFigures("Institutional is $4000 a month.")).toEqual([]);
  });

  it("ignores prose with no figures in it", () => {
    expect(ungroundedFigures("It reads validated ledger state and returns a verdict.")).toEqual([]);
  });
});
