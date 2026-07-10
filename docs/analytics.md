# Frogress analytics

## Purpose

The first-party analytics system answers product questions without storing user-created task content. It supports acquisition, activation, engagement, retention, subscriptions, rewarded-ad UX, and operational quality.

Events are stored in `analyticsEvents` for 400 days and removed when the associated account is deleted. The admin API returns aggregates only.

Pre-sign-in `/try` events use a random first-party anonymous browser ID. Authenticated events carry the same ID so account deletion can also remove the linked pre-sign-in funnel history. Anonymous requests are restricted to lifecycle and `/try` events; economy and revenue events are accepted only from server mutations or authenticated RevenueCat webhooks.

## Metric definitions

| Metric | Definition |
| --- | --- |
| DAU / WAU / MAU | Unique users with any tracked event in the current UTC day, trailing 7 days, or trailing 30 days. |
| Stickiness | DAU divided by MAU. |
| Session | One `app_opened` event per browser or native webview session. |
| Activation funnel | Users created in the selected period who subsequently complete onboarding, create a task, complete a task, and start a focus timer. |
| D1 / D7 / D30 retention | New users who trigger `app_opened` on the exact UTC day offset after account creation. |
| Purchase conversion | Unique users with `purchase_completed` divided by unique users with `purchase_started`. |
| Gross revenue | Sum of production RevenueCat transaction prices in USD, including negative refund values. |
| Estimated proceeds | RevenueCat price after webhook-reported tax and store commission percentages. This is an estimate, not a payout reconciliation. |
| Ad completion | Rewarded ads completed divided by rewarded ads requested. |
| Gameplay flies per user | Total `fly_earned` amount excluding real-money packs, divided by unique earners, split by free or Plus status at event time. |
| Trade frequency | Completed trade-ups divided by unique traders, split by free or Plus status at event time. |
| Paywall trigger conversion | Unique purchase completions divided by unique paywall viewers for the placement that opened the paywall. |

## Event taxonomy

- Lifecycle: `app_opened`, `page_viewed`
- Acquisition and activation: `account_created`, `onboarding_completed`
- Core engagement: `task_created`, `task_completed`, `task_reopened`, `timer_started`, `timer_completed`
- Rewards: `quest_objective_claimed`, `daily_reward_claimed`, `season_reward_claimed`
- Friends and sharing: referral create/share/open/claim, friend-link share/open, friend-request outcomes, buddy invites, and buddy schedule-change outcomes

Engagement events contain structural product metadata only. Task events can include tag and checklist counts, focus-area connection, buddy/repeat/schedule/reminder flags, and streak tier. Timer events also include configured focus/break duration. Quest objective events include placement, category ID, authored/generated source, generated slot tier, objective type/target/tag scope, and summarized reward output. Login-calendar rewards and season rewards are separate events with their own day and prize output.

Never add task titles, notes, checklist text, tag names, quest titles, or other user-entered content to analytics properties. Detailed structural fields begin collecting after the version that introduced them; they are not reconstructed for historical events.
- Ads: `ad_requested`, `ad_impression`, `ad_completed`, `ad_dismissed`, `ad_failed`
- Monetization funnel: `paywall_viewed`, `purchase_started`, `purchase_completed`, `purchase_cancelled`, `purchase_failed`
- Subscription lifecycle: `subscription_started`, `subscription_renewed`, `subscription_cancelled`, `subscription_expired`, `subscription_billing_issue`, `subscription_refunded`, `subscription_product_changed`
- Paid-acquisition demo: `try_funnel_viewed`, `try_task_completed`, `try_gift_opened`, `try_signin_started`, `try_signup_completed`, `try_gift_claimed`, `try_cosmetic_previewed`, `try_continued`, `try_store_clicked`
- Economy: `fly_earned`, `fly_spent`, `skin_purchased`, `skin_sold`, `skin_traded`, `season_reward_claimed`
- Fly Shop: `fly_shop_viewed`, `fly_pack_selected`, `fly_pack_purchase_started`, `fly_pack_purchase_completed`, `fly_pack_purchase_cancelled`, `fly_pack_purchase_failed`

Properties are allowlisted in `src/lib/analytics/events.ts`. Do not add free-form user content, email, phone number, exact birthday, notification tokens, calendar data, task IDs, or advertising identifiers.

## Data sources and limitations

- Product events are written at successful server mutation points where possible.
- Revenue and subscription lifecycle events come from authenticated RevenueCat webhooks and use the webhook event ID for idempotency.
- Rewarded-ad request, impression, completion, dismissal, and failure events come from the AdMob client lifecycle.
- Ad revenue is not estimated. Add AdMob impression-level paid-event data or Reporting API ingestion before showing revenue, eCPM, ARPDAU, or ad LTV.
- Metrics start when this instrumentation is deployed. Existing users and historical actions are not backfilled as synthetic events.
- Dashboard time series use UTC so daily totals are reproducible.
- Statistics supports two independently selected UTC date ranges. Comparison deltas use the second period as the baseline.

## Fly Shop RevenueCat setup

Create six consumable products in App Store Connect and Google Play, attach them to the current RevenueCat offering as custom packages, and use these identifiers:

| Pack | RevenueCat package | Store product | Flies |
| --- | --- | --- | ---: |
| Pinch | `flies_pinch` | `io.frog.tasks.flies.pinch` | 200 |
| Rare Jar | `flies_rare_jar` | `io.frog.tasks.flies.rare_jar` | 650 |
| Swarm | `flies_swarm` | `io.frog.tasks.flies.swarm` | 1,500 |
| Epic Cloud | `flies_epic_cloud` | `io.frog.tasks.flies.epic_cloud` | 3,500 |
| Mega Swarm | `flies_mega_swarm` | `io.frog.tasks.flies.mega_swarm` | 10,000 |
| Legendary Vault | `flies_legendary_vault` | `io.frog.tasks.flies.legendary_vault` | 22,000 |

The authenticated RevenueCat webhook is the source of truth. A `NON_RENEWING_PURCHASE` is matched to the product table, recorded once in `flyPurchases`, and grants the pack balance inside a MongoDB transaction. Do not grant consumables from client success callbacks.

## Design references

- Amplitude product analytics: https://amplitude.com/docs/analytics
- Amplitude retention analysis: https://amplitude.com/docs/analytics/charts/retention-analysis/retention-analysis-build
- RevenueCat webhook fields: https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
- RevenueCat revenue chart: https://www.revenuecat.com/docs/dashboard-and-metrics/charts/revenue-chart
- AdMob impression-level revenue: https://support.google.com/admob/answer/11322405
- AdMob performance metrics: https://support.google.com/admob/answer/15337570
- Apple App Store analytics: https://developer.apple.com/help/app-store-connect-analytics/
- Google Play Data safety: https://support.google.com/googleplay/android-developer/answer/10787469
- European Commission GDPR principles: https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/principles-gdpr/overview-principles/what-data-can-we-process-and-under-which-conditions_en

## Launch checklist

1. Configure the RevenueCat webhook authorization secret and send production plus sandbox test events.
2. Confirm the Google Play Data safety form and App Store privacy answers match the updated Privacy Policy.
3. Verify account deletion removes `analyticsEvents` for the user.
4. Use UTM parameters consistently for campaigns: `utm_source`, `utm_medium`, and `utm_campaign`.
5. Validate dashboard totals against RevenueCat and AdMob reports before using them for accounting decisions.
