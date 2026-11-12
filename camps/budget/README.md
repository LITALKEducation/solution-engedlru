# Camps · Budget (finance web app)

This directory (`camps/budget/`, served at `https://enged.sorasukt.com/budget/`) is the complete frontend for the finance application. It is the only part of the Camps site that is a web app (manifest + service worker, scope `/budget/`).

## Cloudflare Pages

Create a Cloudflare Pages project connected to this repository.

- Production branch: `main`
- Root directory: `camps`
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

- Allowed Callback URL: `https://enged.sorasukt.com/budget/`
- Allowed Logout URL: `https://enged.sorasukt.com/budget/`
- Allowed Web Origins: `https://enged.sorasukt.com`

The frontend uses the existing LITALK Education Auth0 tenant and client.

## Verification QR

Transaction receipts point to:

`https://enged.sorasukt.com/budget/verify/?id=TRANSACTION_ID` (old `/verify/?id=…` links redirect there)

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

## Settings page & motion

Settings is split into three sliding tabs (บัญชี / หมวดหมู่ / ผู้ใช้). Add forms open as sheets; categories are grouped in accordions with on/off switches (hide/show); validation errors shake the field. Motion patterns (modal, toast, tabs sliding, accordion, toggle, success check, error shake, page slide) follow the transitions.dev snippets; tokens live at the end of `assets/budget-v2.css` and all of it is disabled under `prefers-reduced-motion`.

## Google sign-in

The welcome page signs in with Google through Auth0's Google social connection (`google-oauth2`; override with `window.BUDGET_AUTH0_CONNECTION`). One-time Auth0 setup:

1. Auth0 Dashboard → Authentication → Social → **Google**: use your own Google OAuth client ID/secret (Auth0 dev keys are not for production) and enable the connection for this application.
2. A Google login is a **different Auth0 user** from the old username/password one (`google-oauth2|…`). Roles belong to the Auth0 user, so assign `budget_admin` to the Google user (or link the accounts) — otherwise an admin signs in as a normal user.
3. Regular users: enable their **Google email** on the Admin → ผู้ใช้ tab. The app matches by email only when Google reports it as verified, then remembers the Google user id.
4. Optional: turn off the database connection for this application so Google is the only option.

If a Google account has no access, the app shows its email so the person can send it to an admin, and offers "ใช้บัญชี Google อื่น" (asks Google to show its account chooser).

## Screen sizes

- **Phone (< 768px):** single column with a bottom tab bar and floating "บันทึก" button. Phones must use the installed web app.
- **iPad / small laptop (768–1023px):** left icon rail, content up to 1160px. Tablets are not forced to install.
- **Desktop / iPad landscape (≥ 1024px):** full left sidebar with the signed-in user, two-column dashboard, and table views for transactions and donations. Dialogs open as centred cards.

## Editing a user's access

Admin → ผู้ใช้ → tap a user to change their display name, student ID, on/off switch and which accounts they can use. A disabled user is refused at sign-in (message "บัญชีนี้ถูกปิดสิทธิ์ใช้งาน"). Admins can't disable themselves, and users who hold the Auth0 `budget_admin` role always see every account (manage that role in Auth0). Every change is written to the audit log (`USER_UPDATED`).
