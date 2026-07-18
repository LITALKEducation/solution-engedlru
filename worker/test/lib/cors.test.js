import { describe, it, expect } from "vitest";
import { corsHeaders, json, handleOptions } from "../../src/lib/cors.js";

function envWith(allowed) {
  return { ALLOWED_ORIGINS: allowed };
}

function requestFrom(origin) {
  return new Request("https://api.example.com/x", {
    headers: origin ? { Origin: origin } : {}
  });
}

describe("corsHeaders", () => {
  it("echoes the request Origin when it's in the allowed list", () => {
    const headers = corsHeaders(
      requestFrom("https://b.example.com"),
      envWith("https://a.example.com, https://b.example.com")
    );
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://b.example.com");
  });

  it("falls back to the first allowed origin when the request Origin isn't allowed", () => {
    const headers = corsHeaders(
      requestFrom("https://evil.example.com"),
      envWith("https://a.example.com,https://b.example.com")
    );
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://a.example.com");
  });

  it("returns an empty allow-origin when ALLOWED_ORIGINS is unset and no Origin header is sent", () => {
    const headers = corsHeaders(requestFrom(null), envWith(""));
    expect(headers["Access-Control-Allow-Origin"]).toBe("");
  });

  it("always sets Vary: Origin", () => {
    const headers = corsHeaders(requestFrom("https://a.example.com"), envWith("https://a.example.com"));
    expect(headers["Vary"]).toBe("Origin");
  });
});

describe("json", () => {
  it("serializes the body and defaults to status 200", async () => {
    const res = json(requestFrom("https://a.example.com"), envWith("https://a.example.com"), { ok: true });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(await res.json()).toEqual({ ok: true });
  });

  it("honors an explicit status code", async () => {
    const res = json(requestFrom("https://a.example.com"), envWith("https://a.example.com"), { error: "nope" }, 403);
    expect(res.status).toBe(403);
  });
});

describe("handleOptions", () => {
  it("returns a 204 with CORS headers and no body", async () => {
    const res = handleOptions(requestFrom("https://a.example.com"), envWith("https://a.example.com"));
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://a.example.com");
    expect(await res.text()).toBe("");
  });
});
