import { describe, it, expect, vi, afterEach } from "vitest";
import { getAuth0User, getManagementToken, updateAuth0User } from "../../src/lib/auth0.js";

const env = {
  AUTH0_DOMAIN: "example.auth0.com",
  AUTH0_M2M_CLIENT_ID: "client-id",
  AUTH0_M2M_CLIENT_SECRET: "client-secret"
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getAuth0User", () => {
  it("calls /userinfo with the bearer token and returns the parsed body", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      expect(url).toBe("https://example.auth0.com/userinfo");
      expect(init.headers.Authorization).toBe("Bearer abc123");
      return new Response(JSON.stringify({ email: "user@example.com" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = await getAuth0User(env, "abc123");
    expect(user).toEqual({ email: "user@example.com" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null when Auth0 responds with a non-2xx status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));
    const user = await getAuth0User(env, "bad-token");
    expect(user).toBeNull();
  });
});

describe("getManagementToken", () => {
  it("posts client-credentials and returns the access token", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      expect(url).toBe("https://example.auth0.com/oauth/token");
      const body = JSON.parse(init.body);
      expect(body).toEqual({
        grant_type: "client_credentials",
        client_id: "client-id",
        client_secret: "client-secret",
        audience: "https://example.auth0.com/api/v2/"
      });
      return new Response(JSON.stringify({ access_token: "mgmt-token" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const token = await getManagementToken(env);
    expect(token).toBe("mgmt-token");
  });

  it("throws when Auth0 rejects the client-credentials request", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad creds", { status: 401 })));
    await expect(getManagementToken(env)).rejects.toThrow(/Failed to get Management Token/);
  });
});

describe("updateAuth0User", () => {
  it("fetches a management token then PATCHes the user with it", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      if (url.includes("/oauth/token")) {
        return new Response(JSON.stringify({ access_token: "mgmt-token" }), { status: 200 });
      }
      expect(url).toBe("https://example.auth0.com/api/v2/users/auth0%7C123");
      expect(init.method).toBe("PATCH");
      expect(init.headers.Authorization).toBe("Bearer mgmt-token");
      expect(JSON.parse(init.body)).toEqual({ name: "New Name" });
      return new Response(JSON.stringify({ user_id: "auth0|123", name: "New Name" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const updated = await updateAuth0User(env, "auth0|123", { name: "New Name" });
    expect(updated).toEqual({ user_id: "auth0|123", name: "New Name" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws when the PATCH request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (url.includes("/oauth/token")) {
          return new Response(JSON.stringify({ access_token: "mgmt-token" }), { status: 200 });
        }
        return new Response("not found", { status: 404 });
      })
    );
    await expect(updateAuth0User(env, "auth0|123", {})).rejects.toThrow(/Failed to update user profile/);
  });
});
