// Usage: node worker/scripts/generate-vapid.mjs
// Prints a VAPID key pair for Web Push. Put the public key in wrangler.toml [vars] VAPID_PUBLIC_KEY,
// and store the private key with:  npx wrangler secret put VAPID_PRIVATE_KEY
const b64u = (b) => Buffer.from(b).toString("base64url");
const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
console.log("VAPID_PUBLIC_KEY  =", b64u(pub));
console.log("VAPID_PRIVATE_KEY =", jwk.d, "  (secret: keep private, do not commit)");
