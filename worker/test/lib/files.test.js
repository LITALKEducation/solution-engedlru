import { describe, it, expect } from "vitest";
import { decodeDataUrl, putFile, fileUrl, randomId } from "../../src/lib/files.js";

describe("decodeDataUrl", () => {
  it("decodes a base64 data URL into bytes and mime type", () => {
    // "hello" base64-encoded
    const { bytes, mime } = decodeDataUrl("data:text/plain;base64,aGVsbG8=");
    expect(mime).toBe("text/plain");
    expect(new TextDecoder().decode(bytes)).toBe("hello");
  });

  it("falls back to raw base64 with the fallback mime when there's no data: prefix", () => {
    const { bytes, mime } = decodeDataUrl("aGVsbG8=", "application/pdf");
    expect(mime).toBe("application/pdf");
    expect(new TextDecoder().decode(bytes)).toBe("hello");
  });

  it("defaults mime to application/octet-stream when there's no prefix and no fallback", () => {
    const { mime } = decodeDataUrl("aGVsbG8=");
    expect(mime).toBe("application/octet-stream");
  });
});

describe("putFile", () => {
  it("puts the bytes under the given key with the mime type as content-type", async () => {
    const calls = [];
    const env = {
      FILES: {
        async put(key, bytes, opts) {
          calls.push({ key, bytes, opts });
        }
      }
    };
    const bytes = new Uint8Array([1, 2, 3]);
    const key = await putFile(env, "budget/abc-file.pdf", bytes, "application/pdf");

    expect(key).toBe("budget/abc-file.pdf");
    expect(calls).toEqual([
      { key: "budget/abc-file.pdf", bytes, opts: { httpMetadata: { contentType: "application/pdf" } } }
    ]);
  });
});

describe("fileUrl", () => {
  it("builds an absolute /files/<key> URL from the request's protocol and host", () => {
    const request = new Request("https://api.example.com/budget");
    expect(fileUrl(request, "budget/abc-file.pdf")).toBe("https://api.example.com/files/budget/abc-file.pdf");
  });
});

describe("randomId", () => {
  it("generates unique-looking UUIDs", () => {
    const a = randomId();
    const b = randomId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
  });
});
