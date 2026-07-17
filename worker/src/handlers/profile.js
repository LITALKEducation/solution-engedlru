import { json } from "../lib/cors.js";
import { getAuth0User, updateAuth0User } from "../lib/auth0.js";
import { decodeDataUrl, putFile, fileUrl, randomId } from "../lib/files.js";

const DEFAULT_AVATAR = "https://s3.ap-southeast-1.amazonaws.com/files.stnetradio.com/logo/ENGEDLOGO.ico";

// POST /profile — เดิมคือ GAS_PROFILE_UPDATE_URL (auth0_m2m.gs) ที่ใช้ Google Drive เก็บรูป
export async function postProfile(request, env) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json(request, env, { error: "รูปแบบข้อมูลไม่ถูกต้อง" }, 400);
  }

  const { access_token, name, imageBase64, imageMimeType, imageFileName } = data;
  if (!access_token) return json(request, env, { error: "Missing access token" }, 401);

  const user = await getAuth0User(env, access_token);
  if (!user) return json(request, env, { error: "Invalid Token or Unauthorized" }, 401);

  const userId = user.sub;
  let pictureUrl = null;

  if (imageBase64 === "DELETE") {
    // เดิม (auth0_m2m.gs) ไม่ได้จัดการค่านี้เป็นพิเศษ ทำให้พยายาม decode "DELETE" เป็น base64 แล้วพัง
    // ที่นี่ตั้งกลับเป็นรูป default แทนการลบจริง เพราะ Auth0 ต้องมีค่า picture เป็น URL เสมอ
    pictureUrl = DEFAULT_AVATAR;
  } else if (imageBase64) {
    try {
      const { bytes, mime } = decodeDataUrl(imageBase64, imageMimeType);
      const key = `avatars/${userId.replace(/[^a-zA-Z0-9_-]/g, "_")}-${randomId()}-${imageFileName || "avatar"}`;
      await putFile(env, key, bytes, mime);
      pictureUrl = fileUrl(request, key);
    } catch (e) {
      return json(request, env, { error: "อัปโหลดรูปภาพไม่สำเร็จ: " + e.message }, 500);
    }
  }

  const updatePayload = {};
  if (name && name.trim() !== "") updatePayload.name = name.trim();
  if (pictureUrl) updatePayload.picture = pictureUrl;

  if (Object.keys(updatePayload).length > 0) {
    try {
      await updateAuth0User(env, userId, updatePayload);
    } catch (e) {
      return json(request, env, { error: "Failed to update user profile: " + e.message }, 500);
    }
  }

  return json(request, env, {
    success: true,
    message: "Profile updated successfully",
    picture: pictureUrl || user.picture,
    name: updatePayload.name || user.name
  });
}
