import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { resetDb } from "../schema.js";
import {
  getTemplateCsv, importCsv, addTokenRecord, listTokenRecords, deleteTokenRecord
} from "../../src/handlers/admin/tokensAdmin.js";

beforeEach(async () => {
  await resetDb(env);
});

function req(body) {
  return new Request("https://api.example.com/admin/tokens/import", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

async function recordCount(activityName, studentId) {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM token_records WHERE activity_name = ? AND student_id = ?"
  ).bind(activityName, studentId).first();
  return row.c;
}

describe("getTemplateCsv", () => {
  it("returns a downloadable CSV with the expected header", async () => {
    const res = await getTemplateCsv(new Request("https://api.example.com/admin/tokens/template.csv"), env);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toContain("token-template.csv");
    const text = await res.text();
    expect(text.split("\r\n")[0]).toBe("activity_name,student_id,student_name,student_group,code,token");
  });
});

describe("importCsv", () => {
  it("rejects a missing csv field", async () => {
    const res = await importCsv(req({}), env);
    expect(res.status).toBe(400);
  });

  it("rejects an empty csv", async () => {
    const res = await importCsv(req({ csv: "" }), env);
    expect(res.status).toBe(400);
  });

  it("strips a header row that matches HEADER case-insensitively", async () => {
    const csv = "Activity_Name,Student_ID,student_name,student_group,code,token\nA1,6740102101,Name,Group,C1,T1";
    const res = await importCsv(req({ csv }), env);
    const body = await res.json();
    expect(body.insertedRecords).toBe(1);
    expect(await recordCount("A1", "6740102101")).toBe(1);
  });

  it("treats a non-matching first row as data, not a header", async () => {
    const csv = "A1,6740102101,Name,Group,C1,T1";
    const res = await importCsv(req({ csv }), env);
    const body = await res.json();
    expect(body.insertedRecords).toBe(1);
  });

  it("skips rows missing activity_name or student_id and reports an error", async () => {
    const csv = "A1,,Name,,,\n,6740102101,Name,,,\nA1,6740102101,Name,,,";
    const res = await importCsv(req({ csv }), env);
    const body = await res.json();
    expect(body.insertedRecords).toBe(1);
    expect(body.skipped).toBe(2);
    expect(body.errors).toHaveLength(2);
  });

  it("enforces the per-student/activity cap (5) within a single import", async () => {
    const rows = Array.from({ length: 7 }, (_, i) => `A1,6740102101,Name,,C${i},T${i}`).join("\n");
    const res = await importCsv(req({ csv: rows }), env);
    const body = await res.json();
    expect(body.insertedRecords).toBe(5);
    expect(body.skipped).toBe(2);
    expect(await recordCount("A1", "6740102101")).toBe(5);
  });

  it("counts pre-existing rows toward the cap in append mode", async () => {
    await importCsv(req({ csv: "A1,6740102101,Name,,C1,T1\nA1,6740102101,Name,,C2,T2\nA1,6740102101,Name,,C3,T3" }), env);
    expect(await recordCount("A1", "6740102101")).toBe(3);

    const res = await importCsv(
      req({ csv: "A1,6740102101,Name,,C4,T4\nA1,6740102101,Name,,C5,T5\nA1,6740102101,Name,,C6,T6" }),
      env
    );
    const body = await res.json();
    expect(body.insertedRecords).toBe(2);
    expect(body.skipped).toBe(1);
    expect(await recordCount("A1", "6740102101")).toBe(5);
  });

  it("replace mode wipes existing records/activities before importing, ignoring old counts for the cap", async () => {
    await importCsv(req({ csv: "A1,6740102101,Name,,C1,T1\nA1,6740102101,Name,,C2,T2\nA1,6740102101,Name,,C3,T3" }), env);
    expect(await recordCount("A1", "6740102101")).toBe(3);

    const res = await importCsv(req({ csv: "A2,6740102102,Name,,C1,T1", mode: "replace" }), env);
    const body = await res.json();
    expect(body.mode).toBe("replace");
    expect(body.insertedRecords).toBe(1);
    expect(await recordCount("A1", "6740102101")).toBe(0);
    expect(await recordCount("A2", "6740102102")).toBe(1);

    const activities = await env.DB.prepare("SELECT name FROM token_activities").all();
    expect(activities.results.map(r => r.name)).toEqual(["A2"]);
  });

  it("registers each distinct activity name exactly once (insertedActivities)", async () => {
    const csv = "A1,6740102101,Name,,,\nA1,6740102102,Name,,,\nA2,6740102103,Name,,,";
    const res = await importCsv(req({ csv }), env);
    const body = await res.json();
    expect(body.insertedActivities).toBe(2);
    expect(body.insertedRecords).toBe(3);
  });
});

describe("addTokenRecord", () => {
  function addReq(body) {
    return new Request("https://api.example.com/admin/tokens/records", {
      method: "POST",
      body: JSON.stringify(body)
    });
  }

  it("rejects missing activityName/studentId", async () => {
    const res = await addTokenRecord(addReq({ pairs: [{ code: "C1" }] }), env);
    expect(res.status).toBe(400);
  });

  it("rejects when no code/token pairs are given", async () => {
    const res = await addTokenRecord(addReq({ activityName: "A1", studentId: "S1", pairs: [] }), env);
    expect(res.status).toBe(400);
  });

  it("rejects more than 5 pairs in one request", async () => {
    const pairs = Array.from({ length: 6 }, (_, i) => ({ code: `C${i}` }));
    const res = await addTokenRecord(addReq({ activityName: "A1", studentId: "S1", pairs }), env);
    expect(res.status).toBe(400);
  });

  it("rejects when adding would exceed the cap given existing records", async () => {
    await addTokenRecord(addReq({
      activityName: "A1", studentId: "S1",
      pairs: [{ code: "C1" }, { code: "C2" }, { code: "C3" }, { code: "C4" }]
    }), env);
    const res = await addTokenRecord(addReq({
      activityName: "A1", studentId: "S1", pairs: [{ code: "C5" }, { code: "C6" }]
    }), env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/เพิ่มได้อีกไม่เกิน 1/);
  });

  it("inserts pairs and registers the activity", async () => {
    const res = await addTokenRecord(addReq({
      activityName: "A1", studentId: "S1", studentName: "Name",
      pairs: [{ code: "C1", token: "T1" }, { code: "C2" }]
    }), env);
    const body = await res.json();
    expect(body).toEqual({ status: "success", inserted: 2 });
    expect(await recordCount("A1", "S1")).toBe(2);
  });
});

describe("listTokenRecords", () => {
  it("rejects a missing activity query param", async () => {
    const res = await listTokenRecords(
      new Request("https://api.example.com/admin/tokens/records"),
      env,
      new URL("https://api.example.com/admin/tokens/records")
    );
    expect(res.status).toBe(400);
  });

  it("returns only records for the requested activity", async () => {
    await importCsv(req({ csv: "A1,S1,Name,,,\nA2,S2,Name,,," }), env);
    const url = new URL("https://api.example.com/admin/tokens/records?activity=A1");
    const res = await listTokenRecords(new Request(url), env, url);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].student_id).toBe("S1");
  });
});

describe("deleteTokenRecord", () => {
  it("removes the record with the given id", async () => {
    await importCsv(req({ csv: "A1,S1,Name,,," }), env);
    const row = await env.DB.prepare("SELECT id FROM token_records").first();
    const res = await deleteTokenRecord(new Request("https://api.example.com/admin/tokens/records/1", { method: "DELETE" }), env, row.id);
    expect((await res.json()).status).toBe("success");
    expect(await recordCount("A1", "S1")).toBe(0);
  });
});
