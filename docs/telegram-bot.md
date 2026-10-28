# Telegram stats bot — build guide

This is a spec for a Telegram bot that sends the team Frogress numbers: instant trial and purchase alerts, a daily report, and a weekly summary with tips. One piece is already built and tested: the secure stats API (`GET /api/bot/stats`). Everything else is still a plan, laid out so a person or an AI can build it phase by phase.

If you are an AI agent building this, read the whole file first, then build one phase at a time. Each phase ends with acceptance checks. Don't start a phase until the previous one passes its checks.

---

## 1. What the team asked for

From the partner's proposal, agreed with the founder:

- **Telegram, not WhatsApp.** WhatsApp would need a dedicated business number. Telegram bots are free and take minutes to set up.
- **It runs inside the existing backend** (this Next.js app). Most of the data is already collected for the admin statistics page.
- **Four streams:**
  1. **Trial and purchase alerts (RevenueCat), sent in real time.** Example:
     `🐸 Trial started — US, via Apple Ads › habitica, paywall trigger: onboarding, signed up 2 days ago, 7 own tasks`
  2. **Daily report:**
     - **Ads** (Apple Ads, TikTok, Meta): which keywords work and which specific ads perform.
     - **User behavior:** new users by source, D1/D7 retention, social features (friends and buddies).
     - **Social media:** posts, engagement, and so on (see the note in §4: this data is **not** in the backend yet).
  3. **Weekly summary with tips** on what to do next.

---

## 2. What already exists

### 2.1 The stats API: `GET /api/bot/stats` (built)

Returns the same snapshot the admin statistics page (`/admin/statistics`) shows, for any UTC day or range, using machine authentication instead of an admin login.

Files:
- `src/app/api/bot/stats/route.ts`: the endpoint
- `src/lib/statsApi.ts`: key checking and rate limiting
- `src/lib/analytics/export.ts`: `snapshotToDays`, `withDeclaredColumnsOnly`, and `snapshotToBrief` (the brief formatter the admin export already used)
- `src/lib/analytics/report/index.ts`: `buildSnapshot`, which builds all the numbers

#### Setup

1. Generate a key (256 random bits):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
2. Add it to the server environment: `STATS_API_KEYS=<key>`.
   - Keys shorter than 32 characters are ignored, and the server logs an error.
   - To rotate a key without downtime, set two keys separated by a comma (`STATS_API_KEYS=<new>,<old>`), switch the bot to the new one, then remove the old one.
3. Redeploy. While `STATS_API_KEYS` is empty, the endpoint answers `404` (it is switched off).

#### Request

```
GET /api/bot/stats?date=yesterday&format=brief
Authorization: Bearer <STATS_API_KEY>
```

| Param | Values | Default | Notes |
| --- | --- | --- | --- |
| `date` | `YYYY-MM-DD`, `today`, `yesterday` | — | One UTC day. Overrides `start`/`end`. |
| `start`, `end` | `YYYY-MM-DD` | — | Inclusive UTC range, up to 400 days. |
| `days` | `7`, `14`, `30`, `90`, `180`, `365` | `30` | Used when no `date`/`start` is given. Any other value falls back to 30. |
| `compare` | `0` / `1` | `1` | Adds `previous` values for the period of equal length just before. `date=yesterday` is compared with the day before. Set `compare=0` to halve the work. |
| `format` | `json`, `brief`, `days` | `json` | See below. |
| `rows` | 1–300 | `20` | `brief` only: rows per table. |

**Formats**

- `json`: the full `StatisticsSnapshot` (type in `src/lib/analytics/catalog.ts`): `meta`, `summary` (plain-language lines), `headline`, `signals` (judgements against healthy bands, worst first), `acquisition` (channel → campaign → ad group → keyword tree, with spend), `sections[]` (each with `kpis`, `series`, `tables`), and `glossary` (definition of every metric). About 100–450 KB.
- `brief`: Markdown written for an LLM (about 30 KB for one day): how to read it, data caveats, headline, signals, every section, and metric definitions. **This is the best input for an AI summary.**
- `days`: compact day-by-day rows. `metrics[]` describes each column (`key`, `label`, `chart`, `section`, `format`), and `days[]` holds one object per date, for example `{ "date": "2026-10-27", "growth.daily.new": 4, "growth.daily.active": 31, ... }`. Use it for trends ("go over it day by day").

**Responses:** `200`; `400` for bad parameters (a JSON `error` says what's wrong); `401` for a missing or wrong key; `404` when the API is switched off; `429` when rate-limited (read the `Retry-After` header); `500` when the build fails.

#### Security properties (keep them if you change the code)

| Property | How |
| --- | --- |
| Separate credential | Admin endpoints require an interactive cookie session (`requireAdmin`), and user API tokens never carry admin rights. The bot gets its own key, which can only read statistics. |
| Fails closed | No key configured → `404`. Short keys are rejected. Compare with `/api/cron/*`, which accept anything when `CRON_SECRET` is unset; don't copy that pattern. |
| Constant-time check | The presented key and the stored key are each SHA-256 hashed, then compared with `timingSafeEqual`. |
| Header only | The key is read only from `Authorization: Bearer`. A key in the query string is ignored (URLs end up in logs). |
| Brute-force throttle | 10 failed attempts per IP per 15 minutes → `429`. A valid key is never locked out, so an attacker can't block the real bot. |
| Load cap | 30 snapshot builds per 10 minutes per server instance. Each build runs heavy Mongo aggregations. |
| Read-only | `GET` only, with no side effects. |
| Data minimization | Table rows carry only their declared columns, so the full user id on the per-signup table is stripped (only the 8-character short id stays). There are no emails, names, or task content anywhere in the snapshot. |
| No caching by proxies | `Cache-Control: no-store` on every response. |

The rate limiters are kept in memory, so each server instance counts separately and a restart resets them. That's acceptable here because the 256-bit key is the real protection. If the app ever runs many instances, move the limiters to Mongo or Redis.

#### Quick test

```bash
curl -s -H "Authorization: Bearer $STATS_API_KEY" \
  "https://<your-domain>/api/bot/stats?format=days&days=7&compare=0" | head -c 600
```

### 2.2 Other pieces the bot reuses

| Need | Where |
| --- | --- |
| All report numbers | `buildSnapshot({ start, end, days, compare })` in `src/lib/analytics/report/index.ts`. Inside the backend, call it directly (no HTTP hop). |
| LLM-ready text | `snapshotToBrief(snapshot)` in `src/lib/analytics/export.ts` |
| Day-by-day rows | `snapshotToDays(snapshot)` in the same file |
| Trial/purchase webhook | `POST /api/webhooks/revenuecat` → `src/app/api/webhooks/revenuecat/route.ts` |
| A user's acquisition path ("Apple Ads › habitica") | `channelKeyFor`, `channelLabel`, `pathFor` (exported from `src/lib/analytics/report/acquisition.ts`), applied to `User.acquisition` |
| Paywall trigger for a trial | RevenueCat subscriber attribute `paywall_placement` (the webhook stores it as `placement` on `subscription_started`) |
| Test and admin accounts to ignore | `isStatsExcludedUser(userId)` (`src/lib/analytics/statsExclusion.ts`) |
| Ad spend (Apple Ads, Meta, TikTok) | Imported by hand on the statistics page into `AdSpend`. Apple Ads can also sync through `src/lib/attribution/appleAdsApi.ts`. Cost columns stay blank for days with no import. |
| Claude SDK | `@anthropic-ai/sdk` is already a dependency (see `src/app/api/insights/weekly/route.ts` for an existing call) |

---

## 3. Architecture

```
RevenueCat ──webhook──▶ /api/webhooks/revenuecat ──(new)──▶ notifyTelegram()  ──▶ Telegram group
                                                                          ▲
Scheduler ──▶ /api/cron/telegram-daily  ── buildSnapshot → brief → Claude ┤
Scheduler ──▶ /api/cron/telegram-weekly ── buildSnapshot(7d) → Claude ────┘

External tools (another bot, n8n, a Claude routine) ──▶ GET /api/bot/stats
```

- **Alerts must live in the backend.** They hang off the RevenueCat webhook that already runs here.
- **Reports run as cron routes in the backend** and call `buildSnapshot` directly. `/api/bot/stats` is the door for anything outside the backend. Both produce identical numbers.
- **Scheduler:** use whatever already calls the existing `/api/cron/*` routes (`vercel.json` lists them). Report times are in UTC. `date=yesterday` is a complete UTC day once 00:00 UTC has passed, so 06:00 UTC (08:00–09:00 in Israel) is a good daily slot.

### New environment variables

| Var | Purpose |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | From @BotFather. Treat it as a password: anyone with it can post as the bot. |
| `TELEGRAM_CHAT_ID` | The private group's id (negative number, often `-100…`). The bot posts **only** here. |
| `TELEGRAM_ALERTS_ENABLED` | `1` to send real-time alerts. A kill switch that needs no deploy. |
| `ANTHROPIC_API_KEY` | Already used by insights and tag suggestions. |
| `CRON_SECRET` | Already exists. The new cron routes must **reject** requests when it's unset. |
| `STATS_API_KEYS` | Only if something outside the backend reads `/api/bot/stats`. |

### Telegram setup (one time, about 5 minutes)

1. In Telegram, open **@BotFather** → `/newbot` → pick a name and username → copy the token into `TELEGRAM_BOT_TOKEN`.
2. Create a **private** group (for example "Frogress HQ") and add the bot.
3. Get the chat id: send any message in the group, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` and read `message.chat.id`. Put it in `TELEGRAM_CHAT_ID`.
4. Back in @BotFather → `/setjoingroups` → **Disable**, so nobody can add the bot to other groups.
5. Keep privacy mode on (the default). The bot only needs to post, not read the chat.

---

## 4. The data, mapped to each report

| Report line | Snapshot source |
| --- | --- |
| New users by source | `acquisition.nodes` (depth 1 = channel), `sections[acquisition].tables['acquisition.channels']`, series `acquisition.daily` |
| Keywords / ads that work | `acquisition.nodes` at depth 3–4 (`path.length`): accounts, D1/D7, trials, paid, revenue, plus `spend`/`installs`/`taps` when spend was imported. Level names per channel are in `acquisition.levelNames`. |
| D1 / D7 retention | headline `retention_d1`, `retention_d7`; table `growth.retention_cohorts` |
| Activation | headline `activation_rate`; table `growth.activation_funnel` |
| Trials, revenue, paywall | section `money`: `money.trials`, `money.revenue`, `money.paywall_funnel`, `money.paywall_moment`, `money.subscription_lifecycle` |
| In-app social (friends, buddies, invites) | section `social`: `social.referral_funnel`, `social.friendship_sources`, `social.buddies` |
| Engagement | sections `tasks`, `quests`, `frog` (daily series and averages) |
| Is tracking healthy | section `tracking`. If events went silent, say so before trusting the rest. |
| Plain-language verdicts | `summary[]` (tone `good`/`watch`/`bad`) and `signals[]` (with `action` suggestions) |

**Important caveats for whoever writes the summary:**
- **Small samples.** Most days have few signups. Any KPI with `sample < 20` is provisional; the brief marks it `[provisional, n=…]`. The bot must not call trends on those.
- **Social media is not in the backend.** Instagram, TikTok, and X post engagement needs a new integration (TikTok Business API, Instagram Graph API, Meta Marketing API). That's phase 5. Until then, the "Social" line of the report covers in-app social only, and should say so.
- **Ad spend only covers days that have an imported report.** Blank cost ≠ zero cost.
- **Accounts ≠ installs.** Accounts are created at the end of onboarding, so installs that quit during onboarding never show up as accounts.
- Days are UTC.

---

## 5. Build plan

### Phase 1: Telegram sender (small, no behavior change)

Create `src/lib/telegram.ts`:

- `sendTelegram(text: string, options?: { silent?: boolean })` → `POST https://api.telegram.org/bot${TOKEN}/sendMessage` with `{ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true, disable_notification: silent }`.
- Escape `&`, `<`, `>` in every dynamic value (`escapeHtml`). Campaign and keyword names come from ad networks, and an unescaped `<` makes Telegram reject the whole message.
- Split anything longer than 4,096 characters into multiple messages, at line breaks.
- Use a 10 s timeout. Never throw into the caller: log and return `false`. A Telegram outage must never break a webhook or a cron route.
- Never send to any chat id except `TELEGRAM_CHAT_ID`. The function takes no chat-id parameter.
- If the token or chat id is missing, do nothing and return `false`.

**Acceptance:** a temporary script sends "🐸 hello" to the group. HTML escaping is unit-checked with `<b>&` in a value. A 9,000-character text arrives as 3 messages.

### Phase 2: Real-time trial and purchase alerts

Hook into `src/app/api/webhooks/revenuecat/route.ts` after `recordAnalyticsEvent(...)` succeeds.

**Which events**

| RevenueCat | Analytics name | Alert |
| --- | --- | --- |
| `INITIAL_PURCHASE` with `period_type: TRIAL` | `subscription_started` | 🐸 Trial started |
| `INITIAL_PURCHASE` without trial | `subscription_started` | 💸 Plus purchased |
| `RENEWAL` with `is_trial_conversion: true` | `subscription_renewed` | 🎉 Trial converted |
| `CANCELLATION` during trial | `subscription_cancelled` | 🥀 Trial cancelled (send silently) |
| Fly pack | `fly_pack_purchase_completed` | 🪰 Fly pack bought |
| Refund | `subscription_refunded` | ↩️ Refund (send silently) |

**Message** (the partner's format):

```
🐸 Trial started — US, via Apple Ads › habitica, paywall trigger: onboarding, signed up 2 days ago, 7 own tasks
```

- Country: `event.country_code`
- Source: load the `User` (`acquisition createdAt`) and build the label with `pathFor(user.acquisition)`; join segment labels with ` › ` (channel, then the most specific known level).
- Paywall trigger: `event.subscriber_attributes.paywall_placement.value`
- Signed up: days between `user.createdAt` and now
- Own tasks: count of the user's tasks with `isSeededPlan !== true` (starter-plan tasks aren't "own")
- Add the price for paid events: `event.price` (USD) and the product (`event.product_id`).
- **Never include** email, name, frog name, or any task text. The group is a team chat, not an admin console.

**Must-haves**

- **Exactly once.** RevenueCat retries webhooks, so the same event can arrive several times. Before sending, insert a row into a new `TelegramAlert` collection with a unique index on `key = revenuecat:${event.id}`; only send when the insert succeeded (a duplicate-key error means "already sent"). Don't rely on `recordAnalyticsEvent`, which returns nothing about whether it inserted.
- **Skip sandbox** (`event.environment === 'SANDBOX'`), or send it with a 🧪 prefix only when `TELEGRAM_ALERTS_SANDBOX=1`.
- **Skip test accounts:** `isStatsExcludedUser(userId)`.
- **Fire and forget:** `void notify(...).catch(log)`. Never `await` Telegram inside the webhook's success path. The webhook must still answer RevenueCat fast, and a Telegram error must never make it return 500, because that would make RevenueCat retry and re-run purchase grants.
- Respect `TELEGRAM_ALERTS_ENABLED`.

**Acceptance:** RevenueCat dashboard → send test event → one message arrives. Sending the same event twice → still one message. A sandbox event → no message. Telegram token set to garbage → webhook still returns 200.

### Phase 3: Daily report

Route: `src/app/api/cron/telegram-daily/route.ts` (GET, `Authorization: Bearer ${CRON_SECRET}`; **reject if `CRON_SECRET` is unset**). Schedule: daily at 06:00 UTC.

1. `snapshot = await buildSnapshot({ start: yesterday, end: yesterday, compare: true })`.
2. Also build `snapshotToDays(await buildSnapshot({ days: 7, compare: false }))` so the summary sees the last week's trend, not one noisy day.
3. `brief = snapshotToBrief(snapshot, { rowLimit: 15 })`.
4. Ask Claude for the report (see §6), passing the brief plus the 7-day rows.
5. `sendTelegram(report)`.
6. Idempotency: key `daily:${yesterday}` in `TelegramAlert`, so a retried cron doesn't post twice.

**Report shape** (the LLM must follow it; keep it under about 1,500 characters):

```
📊 Frogress — Tue 27 Oct (UTC)

👥 Users: 12 new (+4 vs Mon) · 31 active · D1 42% (n=9, early)
💰 Money: 2 trials (onboarding ×2) · 1 paid · $29.99
📣 Ads: Apple Ads › "habit tracker" — 5 accounts, 2 back on D1, $11 spend
        TikTok › Halloween ad — 3 accounts, 0 back on D1
🤝 Social (in-app): 4 invites sent, 1 friend joined
⚠️ Watch: activation 38% (healthy ≥ 50%)

One thing to do: pause the TikTok Halloween ad until D1 holds.
```

**Acceptance:** calling the route with the secret posts one message. Calling it again posts nothing. Calling it without the secret → 401. Calling it when `CRON_SECRET` is unset → 401.

### Phase 4: Weekly summary with tips

Route: `src/app/api/cron/telegram-weekly/route.ts`, every Monday at 06:00 UTC.

1. `buildSnapshot({ start: lastMonday, end: lastSunday, compare: true })` compares the week with the week before.
2. Add `snapshotToDays` for the same 7 days.
3. Ask Claude for: the 3 biggest changes (with numbers), what worked (channels and keywords with the best D7 and trial rate per dollar), what didn't, and **3 concrete tips** tied to a metric each. Tips must be actions this team can take this week (ads, onboarding, paywall placement, push copy), not generic advice.
4. Idempotency key `weekly:${lastMonday}`.

### Phase 5 (later): Social media

A new integration, not in the backend today: TikTok Business API (organic video stats), Instagram Graph API (business account insights), optionally the Meta and TikTok Marketing APIs (to replace the manual spend import). Store daily rows in a new `SocialDaily` model, expose them as a new snapshot section, and the daily report picks them up automatically through the brief.

### Phase 6 (optional): Ask the bot questions

`/today`, `/week`, `/ask why did D1 drop?`:
- Use `setWebhook` with `secret_token`, and verify the `X-Telegram-Bot-Api-Secret-Token` header in constant time.
- Accept updates **only** when `message.chat.id === TELEGRAM_CHAT_ID`, and only from an allowlist of Telegram user ids (`TELEGRAM_ALLOWED_USER_IDS`).
- Treat the question text as untrusted. Pass it to Claude as the user turn, never as instructions in the system prompt. Give Claude no tools that write anything.
- Rate-limit per user.

---

## 6. LLM summary: model and call

Use the Anthropic SDK that's already installed. Default model: **`claude-opus-5-5`** at `effort: "medium"`. A one-day brief is about 8–10K input tokens plus about 1K output, roughly $0.05 per report at $4 / $20 per million tokens. For something cheaper, `claude-sonnet-5-5` ($2 / $10) or `claude-haiku-5-5` ($0.10 / $0.50) work for this kind of summary; that's a cost choice to make deliberately.

```ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const SYSTEM = `You write the daily Telegram report for Frogress, a gamified to-do app.
Rules:
- Use only numbers that appear in the data. Never estimate or invent.
- A metric marked provisional (n < 20) is not a trend. Say "early" and move on.
- Follow the exact layout you are given. Telegram HTML only: <b>, <i>, no Markdown.
- Under 1500 characters. One concrete action at the end.
- Social media data does not exist yet; the Social line covers in-app invites and friends only.`;

export async function writeReport(brief: string, days: unknown, layout: string) {
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium' },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Layout:\n${layout}\n\nLast 7 days, one row per UTC day:\n${JSON.stringify(days)}\n\nAnalytics brief:\n${brief}`,
      },
    ],
  });

  if (response.stop_reason === 'refusal') return null;
  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}
```

Notes:
- `fallbacks: 'default'` (with its beta header) retries a rare refusal on another model inside the same call. If the installed SDK version doesn't type `fallbacks` yet, upgrade `@anthropic-ai/sdk`, or drop those two lines and keep the `refusal` check.
- Claude Opus 5.5 always thinks. Don't send `thinking: { type: 'disabled' }` or `budget_tokens` (both return 400); control depth with `effort`.
- If the LLM call fails or returns `null`, still post a plain fallback built from `snapshot.summary` lines. A report with no prose beats no report.
- **Escape before sending.** Escape every value from the snapshot that goes into a template you build yourself. For LLM output, allow only `<b>`/`<i>`, and strip any other tags before calling `sendTelegram`.
- The brief contains no PII, so sending it to the Anthropic API is fine. Keep it that way: never add emails or task text to the snapshot.

---

## 7. Security checklist (whole bot)

- [ ] `TELEGRAM_BOT_TOKEN`, `CRON_SECRET`, `STATS_API_KEYS`, and `ANTHROPIC_API_KEY` live only in server env vars. They are never in git, in the client bundle (no `NEXT_PUBLIC_` prefix), or in logs.
- [ ] The bot can only post to `TELEGRAM_CHAT_ID`; joining other groups is disabled in BotFather.
- [ ] New cron routes reject requests when `CRON_SECRET` is unset (fail closed).
- [ ] Alerts are idempotent (unique key per RevenueCat event), skip sandbox, and skip excluded test users.
- [ ] Telegram failures never fail the RevenueCat webhook.
- [ ] Messages contain no email, name, frog name, or task content. The short user id is the most that's allowed.
- [ ] If commands are added: secret-token webhook, chat and user allowlists, untrusted input handling.
- [ ] Rotate the keys if someone leaves the group or the group's membership changes. Group membership = access to business numbers.

---

## 8. Prompt to give an AI to build it

> Read `docs/telegram-bot.md` and `docs/analytics.md`. Build **Phase N** of the Telegram stats bot exactly as specified, in this Next.js app. Reuse `buildSnapshot`, `snapshotToBrief`, `snapshotToDays`, and the RevenueCat webhook as described; don't duplicate report logic. Follow `CLAUDE.md` (no explanatory comments). Keep every item of the security checklist in §7. When done, run `npx tsc --noEmit`, show me how you verified each acceptance check of the phase, and list the env vars I need to set.
