import { describe, it, expect, vi, afterEach } from "vitest";
import { checkAdminStatus, requireAdmin } from "../../src/lib/admin.js";

function fakeEnv({ adminEmails = [] } = {}) {
  return {
    ALLOWED_ORIGINS: "https://example.com",
    DB: {
      prepare(sql) {
        return {
          bind(email) {
            return {
              async first() {
                return adminEmails.includes(email) ? { email } : null;
              }
            };
          }
        };
      }
    }
  };
}

function request(headers = {}) {
  return new Request("https://api.example.com/admin/me", { headers });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("checkAdminStatus", () => {
  it("returns not-admin with no email when Authorization header is missing", async () => {
    const status = await checkAdminStatus(request(), fakeEnv());
    expect(status).toEqual({ isAdmin: false, email: null });
  });

  it("returns not-admin with no email when Auth0 rejects the token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));
    const status = await checkAdminStatus(
      request({ Authorization: "Bearer bad-token" }),
      fakeEnv()
    );
    expect(status).toEqual({ isAdmin: false, email: null });
  });

  it("returns the email but isAdmin=false when the email isn't in admin_users", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ email: "student@example.com" }), { status: 200 }))
    );
    const status = await checkAdminStatus(
      request({ Authorization: "Bearer good-token" }),
      fakeEnv({ adminEmails: ["admin@example.com"] })
    );
    expect(status).toEqual({ isAdmin: false, email: "student@example.com" });
  });

  it("returns isAdmin=true when the lowercased email matches admin_users", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ email: "Admin@Example.com" }), { status: 200 }))
    );
    const status = await checkAdminStatus(
      request({ Authorization: "Bearer good-token" }),
      fakeEnv({ adminEmails: ["admin@example.com"] })
    );
    expect(status).toEqual({ isAdmin: true, email: "Admin@Example.com" });
  });
});

describe("requireAdmin", () => {
  it("returns 401 when there is no email at all", async () => {
    const result = await requireAdmin(request(), fakeEnv());
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(401);
  });

  it("returns 403 when the user is authenticated but not an admin", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ email: "student@example.com" }), { status: 200 }))
    );
    const result = await requireAdmin(
      request({ Authorization: "Bearer good-token" }),
      fakeEnv({ adminEmails: ["admin@example.com"] })
    );
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(403);
  });

  it("returns ok:true with the email for a valid admin", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ email: "admin@example.com" }), { status: 200 }))
    );
    const result = await requireAdmin(
      request({ Authorization: "Bearer good-token" }),
      fakeEnv({ adminEmails: ["admin@example.com"] })
    );
    expect(result).toEqual({ ok: true, email: "admin@example.com" });
  });
});
