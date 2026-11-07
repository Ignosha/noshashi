import { describe, expect, it } from "vitest";
import { csvCell, sentenceCase, toCsv } from "../format";

describe("CSV export safety", () => {
  it.each(["=1", "+1", "-1", "@1"])(
    "neutralizes spreadsheet formulas beginning with %s",
    (value) => {
      expect(csvCell(value)).toBe(`'${value}`);
    }
  );

  it("preserves normal CSV quoting while neutralizing formula cells", () => {
    expect(
      toCsv([{ evidence: '=HYPERLINK("https://example.com")', note: "Observed" }])
    ).toBe(
      "evidence,note\n\"'=HYPERLINK(\"\"https://example.com\"\")\",Observed"
    );
  });
});

describe("sentenceCase", () => {
  it("sets a console label as a sentence and keeps acronyms", () => {
    expect(sentenceCase("TRUST LINES UNREADABLE")).toBe("Trust lines unreadable");
    expect(sentenceCase("XRPL REGISTRY UNREACHABLE")).toBe("XRPL registry unreachable");
    expect(sentenceCase("NO AMM POOL FOR THIS PAIR")).toBe("No AMM pool for this pair");
  });
  it("leaves text a person already wrote in mixed case alone", () => {
    expect(sentenceCase("No evaluation yet")).toBe("No evaluation yet");
  });
});
