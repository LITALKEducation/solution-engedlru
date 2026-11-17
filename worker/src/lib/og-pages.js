// Link-preview (Open Graph) text and image for every public Camps page. These are the DEFAULTS: they are written into each page's <head>
// by scripts/build-og-meta.mjs (so crawlers always find valid tags) and an admin can override title / description / image per page
// (D1 table camp_og_pages). The Pages Function in camps/functions swaps the admin's values into the HTML for crawlers.
export const OG_SITE = "https://enged.sorasukt.com";
export const OG_SITE_NAME = "Camps · English Education LRU";
export const OG_LIMITS = { title: 70, description: 200, image: 2 * 1024 * 1024 };
// key -> { path (canonical), files (camps/ files that carry the tags), title, description }. Images: camps/assets/og/<key>.png (1200x630)
export const OG_PAGES = {
  home: { path: "/", files: ["index.html"], label: "หน้าแรก", title: "Camps · กิจกรรมค่าย | English Education LRU", description: "ระบบกิจกรรมค่ายของคณะครุศาสตร์ สาขาวิชาภาษาอังกฤษ เลือกฝ่าย ตั้งชื่อ AKA และอื่น ๆ ในที่เดียว" },
  hr: { path: "/hr/", files: ["hr/index.html", "hr/departments.html", "hr/choose.html", "hr/select.html"], label: "เลือกฝ่าย", title: "เลือกฝ่ายในค่าย · Camps", description: "ดูหน้าที่ของแต่ละฝ่ายและลงทะเบียนเลือกฝ่ายด้วยอีเมลมหาวิทยาลัย (@lru.ac.th)" },
  aka: { path: "/hr/aka", files: ["aka/index.html", "hr/aka.html"], label: "ตั้งชื่อ AKA", title: "ตั้งชื่อ AKA · Camps", description: "ตั้งชื่อเล่นและชื่อที่เรียกกันในค่ายของคุณ แก้ไขได้จนกว่าแอดมินจะปิดรับ" },
  lotto: { path: "/lotto/", files: ["lotto/index.html"], label: "จับสลาก", title: "จับสลาก · Camps", description: "สแกน QR เช็กชื่อ และดูเลขสลากในวันงาน (สำหรับเจ้าหน้าที่)" },
  qrcheck: { path: "/qrcheck/", files: ["qrcheck/index.html"], label: "เช็ก QR", title: "เช็ก QR · Camps", description: "ตรวจและบันทึกผลในวันงาน เช่น ตรวจครั้งที่ 1 หรือป้าย AKA (สำหรับเจ้าหน้าที่)" },
  shirt: { path: "/shirt/", files: ["shirt/index.html", "hr/shirt.html"], label: "แบบเสื้อค่าย", title: "แบบเสื้อค่าย · Camps", description: "ดูแบบเสื้อค่ายที่นักศึกษาส่งเข้าประกวด พร้อมชื่อผู้ออกแบบและหมู่เรียน" },
  survey: { path: "/hr/survey", files: ["hr/survey.html"], label: "แบบสำรวจโรงเรียน", title: "แบบสำรวจโรงเรียน · Camps", description: "กรอกแบบสำรวจโรงเรียนของฝ่ายคุณ บันทึกอัตโนมัติและใช้งานออฟไลน์ได้ (สำหรับผู้ที่ได้รับมอบหมาย)" }
};
export const ogDefaultImage = (key) => `${OG_SITE}/assets/og/${key}.png`;
// the page key for a request path (with or without the trailing slash / .html)
export function ogKeyForPath(pathname) {
  const p = String(pathname || "/").replace(/\.html$/, "").replace(/\/index$/, "/");
  const norm = (x) => (x.length > 1 ? x.replace(/\/$/, "") : x);
  for (const [key, v] of Object.entries(OG_PAGES)) {
    if (norm(v.path) === norm(p)) return key;
    if (v.files.some((f) => norm(("/" + f).replace(/\.html$/, "").replace(/\/index$/, "/")) === norm(p))) return key;
  }
  return null;
}
// every request path that serves this page (canonical, each file with and without the trailing slash / .html)
export function ogPaths(key) {
  const v = OG_PAGES[key], out = new Set([v.path]);
  for (const f of v.files) { const base = ("/" + f).replace(/\.html$/, "").replace(/\/index$/, "/"); out.add(base); if (base.length > 1) out.add(base.endsWith("/") ? base.slice(0, -1) : base + "/"); }
  return [...out];
}
