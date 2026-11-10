# LITALK Education Budget

This directory is the complete frontend for the Budget application.

## Cloudflare Pages

Create a Cloudflare Pages project connected to this repository.

- Production branch: `main`
- Root directory: `budget`
- Build command: `exit 0`
- Build output directory: `.`
- Custom domain: `enged.sorasukt.com`

Cloudflare Pages Git integration will deploy changes to this directory automatically. Do not deploy the `worker/` directory as Pages; the API remains the `engedlru-api` Worker.

## API

The frontend calls:

`https://engedlru-api.stnetworld.workers.dev`

The Worker must allow:

`https://enged.sorasukt.com`

in `ALLOWED_ORIGINS`.

## Auth0

Add these URLs to the Auth0 application:

- Allowed Callback URL: `https://enged.sorasukt.com/`
- Allowed Logout URL: `https://enged.sorasukt.com/`
- Allowed Web Origins: `https://enged.sorasukt.com`

The frontend uses the existing LITALK Education Auth0 tenant and client.

## Verification QR

Transaction receipts point to:

`https://enged.sorasukt.com/verify/?id=TRANSACTION_ID`

The verification page calls the Budget API and does not expose private evidence files or user email addresses.

## Mobile web app (PWA)

The frontend is mobile-first and installable:

- Bottom tab bar, large touch targets, card-style transaction list, safe-area support.
- Camera capture for receipts; Excel/PDF libraries load only when exporting.
- `manifest.webmanifest`, `sw.js` (app-shell offline cache) and `icons/`. Bump `VERSION` in `sw.js` to force clients to refresh.
- Installs from Chrome/Android ("ติดตั้ง" banner) or iOS Safari (Share → Add to Home Screen).

## Test mode

Not linked anywhere in the UI. Open `/?test=true` (optionally `&page=transaction`) to try the UI without logging in. It runs entirely on local fake data in the browser: no Auth0 login, no Budget API calls, nothing is saved. It does not grant access to real data.

## Donations (บริจาค)

The บริจาค tab records donors giving by cash or PromptPay (donor name or anonymous, amount, date, account, optional contact/note, slip — required for PromptPay). Each donation also creates an income transaction in category "เงินบริจาค", so balances, reports and evidence viewing keep working.

Before deploying the Worker, apply the D1 migration `worker/migrations/0003_budget_donations.sql` (the table does not exist until then).

## Recorder name

"ผู้บันทึก" shows the Auth0 display name (stored when the entry is created). Apply `worker/migrations/0004_budget_created_by_name.sql` before deploying the Worker. Entries made earlier fall back to the name set for that user in Admin, then to their email.

## Admin notifications

Admins (`budget_admin`) get a bell icon in the header with an unread count. Every new transaction or donation recorded by someone else creates a notification (the person who recorded it is not notified of their own entry). Tapping a notification opens the transactions or donations page.

Optional phone push (works with the app closed; on iPhone only after "Add to Home Screen"):

1. `node worker/scripts/generate-vapid.mjs`
2. Put the public key in `worker/wrangler.toml` as `VAPID_PUBLIC_KEY` and run `npx wrangler secret put VAPID_PRIVATE_KEY` with the private key.
3. Apply `worker/migrations/0005_budget_notifications.sql` and deploy the Worker.
4. Each admin opens the bell and taps "เปิด" to turn on notifications for their device.

Without VAPID keys the bell still works; the panel says push is not configured.

## Phone install requirement

On phones and tablets the app only runs as an installed web app (home-screen app). In a normal mobile browser tab users see an install guide (iPhone: Share → Add to Home Screen; Android: install button or browser menu; LINE/Facebook in-app browsers: open in Safari/Chrome). Desktop browsers are not restricted. `?test=true` demo mode and the public `/verify/` page are not gated.
