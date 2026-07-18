import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { env } from "cloudflare:test";
import { resetDb } from "./schema.js";
import worker from "../src/index.js";

beforeEach(async () => {
  await resetDb(env);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function get(path) {
  return worker.fetch(new Request(`https://api.example.com${path}`), env);
}

function post(path, body, headers = {}) {
  return worker.fetch(
    new Request(`https://api.example.com${path}`, { method: "POST", body: JSON.stringify(body), headers }),
    env
  );
}

async function makeAdmin(email) {
  await env.DB.prepare("INSERT INTO admin_users (email) VALUES (?)").bind(email).run();
}

function stubAuthAs(email) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ email }), { status: 200 })));
}

describe("router", () => {
  it("handles OPTIONS as a CORS preflight", async () => {
    const res = await worker.fetch(new Request("https://api.example.com/checkup/schedule", { method: "OPTIONS" }), env);
    expect(res.status).toBe(204);
  });

  it("returns 404 for an unknown path", async () => {
    const res = await get("/does/not/exist");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not Found" });
  });

  it("routes GET /checkup/schedule to the checkup handler", async () => {
    const res = await get("/checkup/schedule");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data).toEqual([]);
  });

  it("returns 400 for /tokens with an unknown action", async () => {
    const res = await get("/tokens?action=bogus");
    expect(res.status).toBe(400);
  });

  it("allows GET /admin/me without an Authorization header (self-status check)", async () => {
    const res = await get("/admin/me");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ isAdmin: false, email: null });
  });

  it("gates other /admin/* routes with 401 when unauthenticated", async () => {
    const res = await get("/admin/stats");
    expect(res.status).toBe(401);
  });

  it("gates other /admin/* routes with 403 for a non-admin user", async () => {
    stubAuthAs("student@example.com");
    const res = await worker.fetch(
      new Request("https://api.example.com/admin/admins", { headers: { Authorization: "Bearer tok" } }),
      env
    );
    expect(res.status).toBe(403);
  });

  it("allows an authenticated admin through to a nested /admin/* route", async () => {
    await makeAdmin("admin@example.com");
    stubAuthAs("admin@example.com");
    const res = await worker.fetch(
      new Request("https://api.example.com/admin/admins", { headers: { Authorization: "Bearer tok" } }),
      env
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([{ email: "admin@example.com", created_at: expect.any(String) }]);
  });

  it("returns 404 for an unknown /admin/* subpath once authenticated as admin", async () => {
    await makeAdmin("admin@example.com");
    stubAuthAs("admin@example.com");
    const res = await worker.fetch(
      new Request("https://api.example.com/admin/does-not-exist", { headers: { Authorization: "Bearer tok" } }),
      env
    );
    expect(res.status).toBe(404);
  });

  it("catches handler errors and returns a 500 with the error message", async () => {
    // Missing csv on /admin/tokens/import throws inside request.json().catch — instead
    // exercise a real thrown error: DELETE on a non-numeric schedule id path won't match
    // the route regex at all, so drive a genuine handler exception via an admin route
    // whose DB call fails on a query against a dropped table.
    await makeAdmin("admin@example.com");
    stubAuthAs("admin@example.com");
    await env.DB.prepare("DROP TABLE admin_users").run();
    const res = await worker.fetch(
      new Request("https://api.example.com/admin/stats", { headers: { Authorization: "Bearer tok" } }),
      env
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal Error");
  });
});
