// แปลง data URL (เช่น "data:image/jpeg;base64,....") เป็น bytes + mime type
export function decodeDataUrl(dataUrl, fallbackMime) {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  const base64 = match ? match[2] : dataUrl;
  const mime = match ? match[1] : fallbackMime || "application/octet-stream";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, mime };
}

export async function putFile(env, key, bytes, mime) {
  await env.FILES.put(key, bytes, { httpMetadata: { contentType: mime } });
  return key;
}

export function fileUrl(request, key) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/files/${key}`;
}

export function randomId() {
  return crypto.randomUUID();
}
