import { handleOptions, json } from "./lib/cors.js";
import { requireAdmin } from "./lib/admin.js";
import { getSchedule, postCheckin } from "./handlers/checkup.js";
import { getActivities, search } from "./handlers/tokens.js";
import { postBudget } from "./handlers/budget.js";
import { postProfile } from "./handlers/profile.js";
import { getFile } from "./handlers/files.js";
import { generateQr, scanQr } from "./handlers/qr.js";
import { me, listAdmins, addAdmin, removeAdmin } from "./handlers/admin/admins.js";
import {
  listSchedule, createSchedule, updateSchedule, deleteSchedule, listLogs, exportLogsCsv
} from "./handlers/admin/checkupAdmin.js";
import {
  getTemplateCsv, importCsv, addTokenRecord, listTokenRecords, deleteTokenRecord
} from "./handlers/admin/tokensAdmin.js";

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
      if (pathname === "/checkup/qr" && request.method === "POST") {
        return await generateQr(request, env);
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

      // /admin/me เป็นเส้นทางเดียวใน /admin/* ที่ไม่ต้องผ่าน requireAdmin (ใช้เช็คสถานะตัวเอง)
      if (pathname === "/admin/me" && request.method === "GET") {
        return await me(request, env);
      }

      if (pathname.startsWith("/admin/")) {
        const admin = await requireAdmin(request, env);
        if (!admin.ok) return admin.response;

        if (pathname === "/admin/admins" && request.method === "GET") return await listAdmins(request, env);
        if (pathname === "/admin/admins" && request.method === "POST") return await addAdmin(request, env);
        const adminsMatch = pathname.match(/^\/admin\/admins\/([^/]+)$/);
        if (adminsMatch && request.method === "DELETE") {
          return await removeAdmin(request, env, adminsMatch[1], admin.email);
        }

        if (pathname === "/admin/checkup/schedule" && request.method === "GET") return await listSchedule(request, env);
        if (pathname === "/admin/checkup/schedule" && request.method === "POST") return await createSchedule(request, env);
        const scheduleMatch = pathname.match(/^\/admin\/checkup\/schedule\/(\d+)$/);
        if (scheduleMatch && request.method === "PUT") return await updateSchedule(request, env, scheduleMatch[1]);
        if (scheduleMatch && request.method === "DELETE") return await deleteSchedule(request, env, scheduleMatch[1]);

        if (pathname === "/admin/checkup/logs" && request.method === "GET") return await listLogs(request, env, url);
        if (pathname === "/admin/checkup/logs/export.csv" && request.method === "GET") return await exportLogsCsv(request, env, url);

        if (pathname === "/admin/checkup/qr/scan" && request.method === "POST") return await scanQr(request, env, admin.email);

        if (pathname === "/admin/tokens/template.csv" && request.method === "GET") return await getTemplateCsv(request, env);
        if (pathname === "/admin/tokens/import" && request.method === "POST") return await importCsv(request, env);
        if (pathname === "/admin/tokens/records" && request.method === "GET") return await listTokenRecords(request, env, url);
        if (pathname === "/admin/tokens/records" && request.method === "POST") return await addTokenRecord(request, env);
        const tokenRecordMatch = pathname.match(/^\/admin\/tokens\/records\/(\d+)$/);
        if (tokenRecordMatch && request.method === "DELETE") return await deleteTokenRecord(request, env, tokenRecordMatch[1]);

        return json(request, env, { error: "Not Found" }, 404);
      }

      return json(request, env, { error: "Not Found" }, 404);
    } catch (err) {
      return json(request, env, { error: "Internal Error", details: err.message }, 500);
    }
  }
};
