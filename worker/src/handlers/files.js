// GET /files/:key — เสิร์ฟไฟล์จาก R2 (ใบเสร็จงบประมาณ, รูปโปรไฟล์) แทนลิงก์ Google Drive เดิม
export async function getFile(request, env, key) {
  const object = await env.FILES.get(key);
  if (!object) return new Response("Not Found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("Access-Control-Allow-Origin", "*");
  return new Response(object.body, { headers });
}
