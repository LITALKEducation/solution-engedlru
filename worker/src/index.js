import { handleOptions, json } from "./lib/cors.js";
import { getSchedule, postCheckin } from "./handlers/checkup.js";
import { getActivities, search } from "./handlers/tokens.js";
import { postBudget } from "./handlers/budget.js";
import { postProfile } from "./handlers/profile.js";
import { getFile } from "./handlers/files.js";

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return handleOptions(request, env);

    const url = new URL(request.url);
    const { pathname } = url;

    try {
      if (pathname === "/checkup/schedule" && request.method === "GET") {
        return await getSchedule(request, env);
      }
      if (pathname === "/checkup/checkin" && request.method === "POST") {
        return await postCheckin(request, env);
      }

      if (pathname === "/tokens" && request.method === "GET") {
        const action = url.searchParams.get("action");
        if (action === "getActivities") return await getActivities(request, env);
        if (action === "search") return await search(request, env, url);
        return json(request, env, { error: "Unknown action" }, 400);
      }

      if (pathname === "/budget" && request.method === "POST") {
        return await postBudget(request, env);
      }

      if (pathname === "/profile" && request.method === "POST") {
        return await postProfile(request, env);
      }

      if (pathname.startsWith("/files/") && request.method === "GET") {
        return await getFile(request, env, pathname.slice("/files/".length));
      }

      return json(request, env, { error: "Not Found" }, 404);
    } catch (err) {
      return json(request, env, { error: "Internal Error", details: err.message }, 500);
    }
  }
};
