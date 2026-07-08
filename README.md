This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Calendar sync (Google + Apple)

Two-way sync lives in `src/lib/calendar/`. Required environment variables:

- `GOOGLE_CALENDAR_CLIENT_ID` / `GOOGLE_CALENDAR_CLIENT_SECRET` — a "Web application" OAuth client in Google Cloud with the Calendar API enabled, scope `https://www.googleapis.com/auth/calendar.events` on the consent screen, and authorized redirect URI `<APP_BASE_URL>/api/calendar/google/callback`. This is a sensitive scope: until Google app verification is approved, only test users listed on the consent screen can connect.
- `CALENDAR_CRED_KEY` — 32-byte base64 key (`openssl rand -base64 32`) used to encrypt refresh tokens / Apple app-specific passwords at rest and to sign webhook + OAuth state tokens.
- `APP_BASE_URL` — public https origin (e.g. `https://frogress.com`). Google push webhooks are only registered when this is https.

Apple Calendar connects via iCloud CalDAV with an app-specific password (no cloud console setup needed). Background sync runs in-process via `src/lib/calendarSyncTicker.ts` (webhook-driven for Google plus a 15-minute poll; 5-minute ctag poll for Apple). Verification scripts: `npx tsx scripts/check-calendar-recurrence.ts` and `npx tsx scripts/check-calendar-ics.ts`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
