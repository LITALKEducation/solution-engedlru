import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { env } from "cloudflare:test";
import { resetDb } from "../schema.js";
import { postBudget } from "../../src/handlers/budget.js";

beforeEach(async () => {
  await resetDb(env);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function envWithAllowlist(allowedEmails) {
  return { ...env, BUDGET_ALLOWED_EMAILS: allowedEmails };
}

function req(body) {
  return new Request("https://api.example.com/budget", { method: "POST", body: JSON.stringify(body) });
}

async function firstEntry() {
  return env.DB.prepare("SELECT * FROM budget_entries").first();
}

describe("postBudget", () => {
  it("rejects invalid JSON", async () => {
    const res = await postBudget(
      new Request("https://api.example.com/budget", { method: "POST", body: "not json" }),
      envWithAllowlist("")
    );
    expect(res.status).toBe(400);
  });

  it("rejects missing date/category", async () => {
    const res = await postBudget(req({ category: "Food" }), envWithAllowlist(""));
    expect(res.status).toBe(400);
  });

  it("skips the auth gate entirely when BUDGET_ALLOWED_EMAILS is empty", async () => {
    const res = await postBudget(
      req({ date: "2026-01-01", category: "Food", qty: "2", price: "50" }),
      envWithAllowlist("")
    );
    const body = await res.json();
    expect(body.status).toBe("success");
    const entry = await firstEntry();
    expect(entry.total).toBe(100);
  });

  it("requires access_token when an allowlist is configured", async () => {
    const res = await postBudget(
      req({ date: "2026-01-01", category: "Food" }),
      envWithAllowlist("admin@example.com")
    );
    expect(res.status).toBe(401);
  });

  it("rejects a token belonging to a non-allowlisted email", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ email: "outsider@example.com" }), { status: 200 }))
    );
    const res = await postBudget(
      req({ date: "2026-01-01", category: "Food", access_token: "tok" }),
      envWithAllowlist("admin@example.com")
    );
    expect(res.status).toBe(403);
  });

  it("accepts a token belonging to an allowlisted email (case-insensitive)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ email: "Admin@Example.com" }), { status: 200 }))
    );
    const res = await postBudget(
      req({ date: "2026-01-01", category: "Food", access_token: "tok", qty: 1, price: 10 }),
      envWithAllowlist("admin@example.com")
    );
    const body = await res.json();
    expect(body.status).toBe("success");
  });

  it("treats non-numeric qty/price as 0 rather than rejecting the request", async () => {
    const res = await postBudget(
      req({ date: "2026-01-01", category: "Food", qty: "abc", price: "xyz" }),
      envWithAllowlist("")
    );
    const body = await res.json();
    expect(body.status).toBe("success");
    const entry = await firstEntry();
    expect(entry.qty).toBe(0);
    expect(entry.price).toBe(0);
    expect(entry.total).toBe(0);
  });

  it("decodes and stores a base64 file attachment, returning its URL", async () => {
    const res = await postBudget(
      req({
        date: "2026-01-01",
        category: "Food",
        fileName: "receipt.txt",
        fileMimeType: "text/plain",
        fileBase64: "data:text/plain;base64,aGVsbG8="
      }),
      envWithAllowlist("")
    );
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.fileUrl).toMatch(/^https:\/\/api\.example\.com\/files\/budget\/.+receipt\.txt$/);

    const entry = await firstEntry();
    expect(entry.file_name).toBe("receipt.txt");
    expect(entry.file_mime).toBe("text/plain");

    const stored = await env.FILES.get(entry.file_key);
    expect(await stored.text()).toBe("hello");
  });

  it("leaves fileUrl null when no attachment is provided", async () => {
    const res = await postBudget(req({ date: "2026-01-01", category: "Food" }), envWithAllowlist(""));
    const body = await res.json();
    expect(body.fileUrl).toBeNull();
  });
});
