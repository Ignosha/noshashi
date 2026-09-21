import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "../format";

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
