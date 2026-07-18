import { describe, it, expect } from "vitest";
import { parseCsv, toCsv } from "../../src/lib/csv.js";

describe("parseCsv", () => {
  it("parses simple comma-separated rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"]
    ]);
  });

  it("handles quoted fields containing commas", () => {
    expect(parseCsv('a,"b,c",d')).toEqual([["a", "b,c", "d"]]);
  });

  it("handles quoted fields containing newlines", () => {
    expect(parseCsv('a,"line1\nline2",c')).toEqual([["a", "line1\nline2", "c"]]);
  });

  it("unescapes doubled quotes inside quoted fields", () => {
    expect(parseCsv('a,"say ""hi""",c')).toEqual([["a", 'say "hi"', "c"]]);
  });

  it("strips \\r from CRLF line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"]
    ]);
  });

  it("drops fully blank rows but keeps rows with at least one non-empty field", () => {
    expect(parseCsv("a,b\n\n,\n1,\n")).toEqual([
      ["a", "b"],
      ["1", ""]
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });

  it("handles a trailing row with no final newline", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"]
    ]);
  });
});

describe("toCsv", () => {
  it("joins rows with commas and CRLF between rows", () => {
    expect(toCsv([["a", "b"], ["1", "2"]])).toBe("a,b\r\n1,2");
  });

  it("quotes fields containing commas, quotes, or newlines", () => {
    expect(toCsv([["a,b", 'c"d', "e\nf", "plain"]])).toBe(
      '"a,b","c""d","e\nf",plain'
    );
  });

  it("renders null/undefined values as empty strings", () => {
    expect(toCsv([[null, undefined, "x"]])).toBe(",,x");
  });

  it("round-trips through parseCsv for values with special characters", () => {
    const rows = [["name", "note"], ["Alice, PhD", 'said "hi"\nline2']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});
