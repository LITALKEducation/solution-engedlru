import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { resetDb } from "../schema.js";
import { getSchedule, findActiveSchedule, postCheckin } from "../../src/handlers/checkup.js";

beforeEach(async () => {
  await resetDb(env);
});

const LRU_LAT = 17.5393285;
const LRU_LNG = 101.7193514;

async function insertSchedule({ name = "Activity", openAt, closeAt, lat = LRU_LAT, lng = LRU_LNG, radiusM = 100 }) {
  const { meta } = await env.DB.prepare(
    `INSERT INTO checkup_schedule (name, open_at, close_at, lat, lng, radius_m) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(name, openAt, closeAt, lat, lng, radiusM).run();
  return meta.last_row_id;
}

async function insertStudent(studentId, name = "Student") {
  await env.DB.prepare("INSERT INTO checkup_students (student_id, name) VALUES (?, ?)").bind(studentId, name).run();
}

function postJson(body) {
  return new Request("https://api.example.com/checkup/checkin", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

describe("getSchedule", () => {
  it("returns all schedule rows shaped for the frontend", async () => {
    await insertSchedule({ name: "Morning", openAt: "2026-01-01 08:00", closeAt: "2026-01-01 09:00" });
    const res = await getSchedule(new Request("https://api.example.com/checkup/schedule"), env);
    const body = await res.json();
    expect(body.status).toBe("success");
    expect(body.data).toEqual([
      {
        id: expect.any(Number),
        name: "Morning",
        open: "2026-01-01 08:00",
        close: "2026-01-01 09:00",
        lat: LRU_LAT,
        lng: LRU_LNG,
        radiusM: 100
      }
    ]);
  });
});

describe("findActiveSchedule", () => {
  it("returns null when there are no schedules", async () => {
    expect(await findActiveSchedule(env)).toBeNull();
  });

  it("returns the schedule whose open/close window contains now", async () => {
    const now = new Date();
    const openAt = new Date(now.getTime() - 60_000);
    const closeAt = new Date(now.getTime() + 60_000);
    const fmt = (d) => d.toISOString().slice(0, 19).replace("T", " ");
    await insertSchedule({ name: "Active", openAt: fmt(openAt), closeAt: fmt(closeAt) });

    const active = await findActiveSchedule(env);
    expect(active?.name).toBe("Active");
  });

  it("excludes a schedule whose close_at is exactly now (close is exclusive)", async () => {
    const now = new Date();
    const fmt = (d) => d.toISOString().slice(0, 19).replace("T", " ");
    await insertSchedule({
      name: "JustClosed",
      openAt: fmt(new Date(now.getTime() - 120_000)),
      closeAt: fmt(now)
    });
    // now has advanced by microseconds since fmt(now) was computed, so close_at <= now holds
    const active = await findActiveSchedule(env);
    expect(active).toBeNull();
  });

  it("excludes schedules that haven't opened yet or have already closed", async () => {
    const now = new Date();
    const fmt = (d) => d.toISOString().slice(0, 19).replace("T", " ");
    await insertSchedule({
      name: "Future",
      openAt: fmt(new Date(now.getTime() + 60_000)),
      closeAt: fmt(new Date(now.getTime() + 120_000))
    });
    await insertSchedule({
      name: "Past",
      openAt: fmt(new Date(now.getTime() - 120_000)),
      closeAt: fmt(new Date(now.getTime() - 60_000))
    });
    expect(await findActiveSchedule(env)).toBeNull();
  });
});

describe("postCheckin", () => {
  it("rejects invalid JSON bodies", async () => {
    const req = new Request("https://api.example.com/checkup/checkin", { method: "POST", body: "not json" });
    const res = await postCheckin(req, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe("error");
  });

  it("rejects when required fields are missing or lat/lng aren't numbers", async () => {
    const res = await postCheckin(postJson({ studentId: "1", name: "A", lat: "17.5", lng: 101.7 }), env);
    expect(res.status).toBe(400);
  });

  it("rejects when no schedule is currently open", async () => {
    await insertStudent("6740102101");
    const res = await postCheckin(
      postJson({ studentId: "6740102101", name: "Student", lat: LRU_LAT, lng: LRU_LNG }),
      env
    );
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.message).toMatch(/นอกเวลาทำการ/);
  });

  it("rejects when the studentId isn't in checkup_students", async () => {
    const now = new Date();
    const fmt = (d) => d.toISOString().slice(0, 19).replace("T", " ");
    await insertSchedule({
      openAt: fmt(new Date(now.getTime() - 60_000)),
      closeAt: fmt(new Date(now.getTime() + 60_000))
    });
    const res = await postCheckin(
      postJson({ studentId: "unknown-id", name: "Student", lat: LRU_LAT, lng: LRU_LNG }),
      env
    );
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.message).toMatch(/ไม่พบรหัสนักศึกษา/);
  });

  it("rejects when the student is outside the activity radius", async () => {
    const now = new Date();
    const fmt = (d) => d.toISOString().slice(0, 19).replace("T", " ");
    await insertSchedule({
      openAt: fmt(new Date(now.getTime() - 60_000)),
      closeAt: fmt(new Date(now.getTime() + 60_000)),
      radiusM: 50
    });
    await insertStudent("6740102101");
    // ~1.4km away
    const res = await postCheckin(
      postJson({ studentId: "6740102101", name: "Student", lat: LRU_LAT + 0.0125, lng: LRU_LNG }),
      env
    );
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.message).toMatch(/นอกพื้นที่กิจกรรม/);
  });

  it("records a check-in and succeeds when inside the radius during the open window", async () => {
    const now = new Date();
    const fmt = (d) => d.toISOString().slice(0, 19).replace("T", " ");
    const scheduleId = await insertSchedule({
      openAt: fmt(new Date(now.getTime() - 60_000)),
      closeAt: fmt(new Date(now.getTime() + 60_000)),
      radiusM: 100
    });
    await insertStudent("6740102101", "Existing Name");

    const res = await postCheckin(
      postJson({ studentId: " 6740102101 ", name: "Student Name", lat: LRU_LAT, lng: LRU_LNG }),
      env
    );
    const body = await res.json();
    expect(body).toEqual({ status: "success" });

    const log = await env.DB.prepare("SELECT * FROM checkup_logs").first();
    expect(log.student_id).toBe("6740102101");
    expect(log.name).toBe("Student Name");
    expect(log.schedule_id).toBe(scheduleId);
    expect(log.method).toBe("gps");
    expect(log.distance).toBeLessThan(1);
  });
});
