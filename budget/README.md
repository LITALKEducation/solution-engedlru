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

Open `/?test=true` (optionally `&page=transaction`) to try the UI without logging in. It runs entirely on local fake data in the browser: no Auth0 login, no Budget API calls, nothing is saved. It does not grant access to real data.

## Donations (บริจาค)

The บริจาค tab records donors giving by cash or PromptPay (donor name or anonymous, amount, date, account, optional contact/note, slip — required for PromptPay). Each donation also creates an income transaction in category "เงินบริจาค", so balances, reports and evidence viewing keep working.

Before deploying the Worker, apply the D1 migration `worker/migrations/0003_budget_donations.sql` (the table does not exist until then).

## Recorder name

"ผู้บันทึก" shows the Auth0 display name (stored when the entry is created). Apply `worker/migrations/0004_budget_created_by_name.sql` before deploying the Worker. Entries made earlier fall back to the name set for that user in Admin, then to their email.
