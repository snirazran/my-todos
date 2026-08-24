# Android in-app purchases (Plus + fly packs)

Setting up Google Play billing for the same RevenueCat project that already powers iOS.
Nothing in `src/` needs to change — the code already branches on platform. This is Play
Console + Google Cloud + RevenueCat dashboard work, plus one env var.

**Order matters.** Google's credential propagation takes up to 36 hours, so do Part 3
early and let it bake while you do the rest.

---

## Part 0 — What's already wired

| Piece | Where | Status |
| --- | --- | --- |
| Capacitor plugin | `@revenuecat/purchases-capacitor@13.2.1` (Play Billing 8.3.0) | installed |
| Android key branch | `src/lib/purchases.ts:26` reads `NEXT_PUBLIC_REVENUECAT_GOOGLE_API_KEY` | done |
| Webhook | `src/app/api/webhooks/revenuecat/route.ts` — store-agnostic, maps `PLAY_STORE` → `android` | done |
| Fly grants | webhook matches `event.product_id` against `FLY_PACKS[].productId` | done |
| `launchMode` | `AndroidManifest.xml` MainActivity set to `singleTop` | done |

So the only three things that can go wrong are: product IDs not matching, service
credentials not propagated, and the API key missing from the Vercel build.

---

## Part 1 — Play Console: create the app and get a build on a track

You cannot create products until a signed build exists on a release track.

1. **Play Console → All apps → Create app.** Package name must be exactly
   `io.frog.tasks` (matches `capacitor.config.ts` and `android/app/build.gradle`).
2. Bump the version in `android/app/build.gradle` — `versionCode 1` needs to increase
   with every upload:
   ```gradle
   versionCode 1
   versionName "1.0"
   ```
3. Build a signed bundle:
   ```bash
   pnpm sync:prod          # bakes https://frogress.com as the server URL
   pnpm open:android       # Android Studio → Build → Generate Signed App Bundle
   ```
   Keep the keystore safe; opt into Play App Signing when prompted.
4. **Release → Testing → Internal testing → Create new release**, upload the `.aab`,
   roll out.
5. On the same page, add your Google account to the tester list and open the opt-in
   link on a real device.

> Internal testing is the narrowest track — no review wait, not public. Emulators do
> not do billing reliably; use a real device signed in with a tester account.

---

## Part 2 — Create the products

**Monetize with Play → Products.** Product IDs must match the iOS ones character for
character, because the fly-grant webhook looks up packs by product ID.

### Plus subscription

**Subscriptions → Create subscription.** One subscription, two base plans:

- Product ID: use the same subscription ID as App Store Connect
- Base plan `monthly` — auto-renewing, 1 month
- Base plan `yearly` — auto-renewing, 1 year
- Set prices, then **Activate** each base plan (inactive plans never reach RevenueCat)

In RevenueCat a Play subscription is addressed as `<subscription_id>:<base_plan_id>`,
e.g. `frogress_plus:yearly`. That's expected — you'll see that form in Part 5.

### Fly packs (six one-time products)

**One-time products → Create product.** Type **Consumable** for all six:

| Product ID | Flies | Price |
| --- | --- | --- |
| `io.frog.tasks.flies.pinch` | 350 | $1.99 |
| `io.frog.tasks.flies.rare_jar` | 1,000 | $4.99 |
| `io.frog.tasks.flies.swarm` | 2,400 | $9.99 |
| `io.frog.tasks.flies.epic_cloud` | 5,200 | $19.99 |
| `io.frog.tasks.flies.mega_swarm` | 14,000 | $49.99 |
| `io.frog.tasks.flies.legendary_vault` | 30,000 | $99.99 |

Source of truth: `src/lib/flyPacks.ts`. Activate every one.

> Play Console now calls these "one-time products" with purchase options/offers. Take
> the default **buy** purchase option — don't add pre-order or rent offers.

---

## Part 3 — Google Cloud service credentials

This is what lets RevenueCat's servers validate Play purchases. **Start it early —
propagation takes up to 36 hours.**

### 3a. Enable APIs

Google Cloud Console → the project linked to your Play developer account → enable:

- Google Play Android Developer API
- Google Play Developer Reporting API
- Cloud Pub/Sub API
- Cloud Resource Manager API
- IAM API

> Ignore the "Create credentials" banner — you need a service account key, not an API key.

### 3b. Create the service account

**IAM & Admin → Service Accounts → Create service account**

- Name: `revenuecat`
- Roles: **Pub/Sub Admin** and **Monitoring Viewer**
- Then **Keys → Add key → Create new key → JSON** and download it

> If you hit "Service account key creation is disabled," an org policy is blocking it.
> Create the key in a personal Google account project with no organization, then invite
> that service account into Play Console in the next step.

### 3c. Grant it Play Console access

**Play Console → Users and permissions → Invite new user**, paste the service account
email (`...@....iam.gserviceaccount.com`), grant these account permissions:

- View app information and download bulk reports (read-only)
- View financial data, orders, and cancellation survey responses
- **Manage orders and subscriptions** ← the one that breaks everything if missed

Status should read "Active".

### 3d. Speed up propagation

Open any product in **Monetize with Play**, tweak the description, save. That nudge
often activates the credentials within an hour instead of 36.

---

## Part 4 — Add the Android app in RevenueCat

Same project as iOS — do **not** create a second project, or Plus won't carry across
platforms for the same user.

1. **Project settings → Apps → + New app → Google Play Store**
2. Package name: `io.frog.tasks`
3. Upload the JSON key from 3b under **Service credentials**, Save, then
   **Validate credentials**. Yellow warnings in the first day are normal.
4. **Project settings → API keys → App-specific keys** → copy the **Google** public
   key (starts with `goog_`).
5. RevenueCat will show a **Pub/Sub topic**. Copy it into **Play Console → Monetize
   with Play → Monetization setup → Real-time developer notifications → Topic name**,
   and send a test notification. This is what makes renewals and cancellations reach
   your webhook.

---

## Part 5 — Attach products to the existing entitlement and offering

The code never names a product for Plus — it asks for `offering.annual` and
`offering.monthly`. So Android just needs to be added to the packages iOS already uses.

1. **Products → Import** — RevenueCat pulls the Play catalog. Import all seven
   (subscription base plans + six consumables).
2. Confirm the fly packs are marked **Consumable** (default). Leaving one as
   non-consumable would let a user buy it only once, ever.
3. **Entitlements → `plus`** → attach both Play base plans
   (`<subscription_id>:monthly` and `<subscription_id>:yearly`).
   Do **not** attach the fly packs — flies are granted by the webhook, not by an
   entitlement.
4. **Offerings → your current offering:**
   - Package `$rc_annual` → add the Play `yearly` base plan
   - Package `$rc_monthly` → add the Play `monthly` base plan
   - Packages `flies_pinch`, `flies_rare_jar`, `flies_swarm`, `flies_epic_cloud`,
     `flies_mega_swarm`, `flies_legendary_vault` → add the matching Play product

   Package identifiers must stay exactly as in `src/lib/flyPacks.ts` — `purchaseFlyPack`
   matches on `packageId` first.

---

## Part 6 — The env var (easy to miss)

The native shell loads `https://frogress.com`, so `NEXT_PUBLIC_*` values come from the
**Vercel** build, not from your local `.env.local`.

1. Vercel → project → Settings → Environment Variables → add
   `NEXT_PUBLIC_REVENUECAT_GOOGLE_API_KEY` = the `goog_...` key from step 4.4
   (Production + Preview).
2. **Redeploy.** Without a redeploy the Android app throws
   `RevenueCat API key not configured` at the first purchase tap.
3. Optionally mirror it into `.env.local` for `CAP_DEV=true` local testing.

Nothing else server-side changes — `REVENUECAT_SECRET_API_KEY` and
`REVENUECAT_WEBHOOK_AUTH` are project-level and already cover Android.

---

## Part 7 — Test on a real device

1. **Play Console → Settings → License testing** → add your tester Gmail accounts,
   response **RESPOND_NORMALLY**. Testers see "Test order" and are not charged.
2. Install the app from the internal testing opt-in link (not a sideloaded debug APK —
   billing only works for builds Play recognizes).
3. Run through:
   - Shop → buy a fly pack → flies land in the balance (webhook → `wardrobe.flies`)
   - Buy Plus monthly → `premiumUntil` updates via `/api/purchases/sync`
   - Kill and reopen the app → Plus still active
   - Settings → Restore purchases → still active
   - Buy the same fly pack twice → both succeed (proves it's consumable)
4. Watch logs while testing: `adb logcat | grep -i "Purchases\|flybuy"`. Debug logging
   is already on in non-production builds (`src/lib/purchases.ts:29`).
5. Cross-check RevenueCat → Customer History for the test user, and confirm the webhook
   fired (a `FlyPurchase` row should exist per pack purchase).

---

## Part 8 — Before going live

- [ ] Credentials show **Valid** in RevenueCat (not "needs attention")
- [ ] Every subscription base plan and one-time product is **Active** in Play Console
- [ ] Real-time developer notifications topic saved and test notification received
- [ ] `NEXT_PUBLIC_REVENUECAT_GOOGLE_API_KEY` set in Vercel **and redeployed**
- [ ] Play Console → Policy → **Data safety** and **App content** declare in-app purchases
- [ ] Store listing shows the price range for in-app products
- [ ] `versionCode` bumped for the production upload

---

## Gotchas that cost the most time

**Billing Library deadline.** From 31 Aug 2026 all new apps and updates must ship Play
Billing 8+. The current plugin bundles 8.3.0, so you're fine — just don't downgrade
`@revenuecat/purchases-capacitor`.

**36-hour credential lag.** Purchases fail with 503/521 "Invalid Play Store credentials"
until Google propagates. Not a bug; wait it out.

**Product IDs are permanent.** A deleted Play product ID can never be reused, in any app.
Get them right the first time.

**`launchMode`.** Must stay `standard` or `singleTop`. Google Play may punt the user to
their banking app mid-purchase; with `singleTask` the returning purchase gets cancelled.
Capacitor's default is `singleTask`, and **`npx cap sync` will not overwrite the
manifest**, but a future `cap add android` would — re-check after any Capacitor upgrade.

**One project, two apps.** iOS and Android live under the same RevenueCat project so the
`plus` entitlement and the `appUserID` (Firebase uid) carry across platforms.

---

## Sources

- [RevenueCat — Play service credentials](https://www.revenuecat.com/docs/service-credentials/creating-play-service-credentials)
- [RevenueCat — Google Play Billing setup codelab](https://revenuecat.github.io/codelabs/google-play.html)
- [RevenueCat — Google Play products & entitlements](https://www.revenuecat.com/docs/getting-started/entitlements/android-products)
- [RevenueCat — Capacitor installation](https://www.revenuecat.com/docs/getting-started/installation/capacitor)
- [Android Developers — One-time products](https://developer.android.com/google/play/billing/one-time-products)
- [Play Console Help — Product types and catalog considerations](https://support.google.com/googleplay/android-developer/answer/16431770)
