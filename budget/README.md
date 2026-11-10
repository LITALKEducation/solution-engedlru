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
