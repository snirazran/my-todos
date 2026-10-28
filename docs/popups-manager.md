# Popups manager (Admin → Popups): the complete guide

**Where:** `/admin/popups` (admin accounts only; the admin list is `ADMIN_EMAILS`).
**What it is:** the tool for designing in-app popups and offers, deciding when they fire and who sees them, and checking whether they work, all without shipping an app update.

> **How to use this file with an AI.** Paste it into Claude or ChatGPT and ask things like:
> - "Explain the popups manager to me like a new teammate, one tab at a time."
> - "I want a 30%-off fly pack sale this weekend for people who never paid. Walk me through every field."
> - "My popup is live but I never see it. Help me debug it with the checklist."
> - "Quiz me on tiers, budgets and caps until I get them right."
>
> Everything below describes how the code actually behaves (Oct 2026). The source files are listed in §13 if the AI needs to check something.

---

## 1. The mental model in one minute

A **campaign** = **one popup** + **the rules for when it appears** + **who may see it**.

You decide four things, one per editor tab:

| Tab | Question it answers |
| --- | --- |
| **Design** | What does it look like, and what do its buttons do? |
| **Rules** | Which moment triggers it, who wins if several popups want the same moment, how often one person may see it, and for how long it runs. |
| **Audience** | Who is eligible (payers, Plus, platform, account age, fly balance, rollout %)? |
| **Launch** | Is it safe to go live? Status, results, and a dry run against a real account. |

Then **the app decides at runtime** whether this person, right now, should see it. A popup can be perfectly configured and still wait, because the app protects the user from being spammed (§9). That's on purpose.

---

## 2. How a popup reaches a user (the pipeline)

1. **App opens → server filter.** The app asks `GET /api/campaigns`. The server returns only campaigns this user may see *now*: status (`live`, or `test` for admins), schedule, audience, rollout bucket, lifetime and daily caps, cooldown, dismissal limit, "already converted", and "personal countdown ran out".
2. **The list is held for the whole session.** A new session starts when the app opens fresh, or comes back after **30+ minutes** in the background. **So an edit to a live campaign reaches people at their next session, not instantly.**
3. **A trigger fires** (for example "Task completed"). The app picks the best matching campaign: not yet shown this session, inside its schedule, trigger options satisfied (for example "min gap"), session budget available. **Highest tier wins, and priority breaks ties.**
4. **If the screen is busy** (a sheet, the wardrobe, the fly shop, the Plus paywall, a cinematic, a coach hint, or another automatic popup), the campaign **waits** as "pending": up to 10 minutes (1 minute for moment-of-need offers). It appears the moment the screen clears.
5. **Preparation.** It waits its own delay (default 0.65 s) while the artwork loads and **live store prices** are fetched. If something it charges for, or a `{price}` in its text, can't get a price within 5 seconds, **it is skipped for this session** rather than shown with a blank price.
6. **Shown.** It counts an impression, then a tap, dismissal, or conversion.

---

## 3. The screen

- **Left: the campaign list.** Search, a status filter (All / draft / test / live / paused), a thumbnail, a status badge, and the schedule ("from…", "until…", "ended"). Each row has **Duplicate** (the copy starts as a draft) and **Delete** (tap twice; it deletes the artwork and all history).
- **Middle: the editor** with the 4 tabs.
- **Right: the live preview.** Switch between phone and web, and light and dark mode. **Buttons in the preview never charge, grant, or navigate**; they only describe what they would do. Prices are live web prices where available, otherwise samples. The frog is called "Ribbit".
- **Top bar:** Undo (⌘/Ctrl+Z), Redo (⇧⌘Z or Ctrl+Y), and an "Unsaved changes" chip with **Save now (⌘/Ctrl+S)**.
- **Nothing autosaves.** Leaving with unsaved work asks first. **Uploading a file saves the campaign first**, so name it before you upload.

On a phone the three panes show one at a time.

---

## 4. Starting a campaign

With no campaign open you get **starters**: pre-built layouts you then adjust.

| Starter | Format | Tier | What it sets up |
| --- | --- | --- | --- |
| **Sale** | Canvas | Time-limited offer | Struck-out old price, `{price}`, a countdown to the end date, and a **Buy** button (`buy_product`). You pick the product. |
| **Bundle** | Canvas | Time-limited offer | Several things for one price, paid with real money; `{price}` + Buy. |
| **Plus offer** | Canvas | Time-limited offer | The real Plus subscription at its introductory price, with the regular price spelled out and a **Start Plus** button. |
| **Announcement** | Canvas | Announcement | News, with one button that navigates to the feature. |
| **Action nudge** | Nudge banner | Evergreen nudge | A small inline banner asking for one thing. |
| **Blank** | Canvas | Evergreen nudge | An empty canvas for artwork you already have. |

Starters that sell something include a placeholder card. **Delete it once your artwork is uploaded.**

The campaign **id is made from the name** the first time you save.

---

## 5. Design tab

### 5.1 Format

| Format | What it is | Budget |
| --- | --- | --- |
| **Canvas — your artwork** | Your art centred on a darkened screen, with text, buttons, timers, and animation placed on top. A *takeover*. | Counts against the session budget (§9). |
| **Nudge — inline banner** | A slim bar above the tab bar. Doesn't block the screen; closes itself after 15 s. | No takeover budget. |

### 5.2 Artwork (Canvas)

- Upload the background art: PNG, JPG, WebP, GIF, or AVIF, **max 10 MB**. Images are optimized on upload.
- **Shape** (width ÷ height) is set automatically from the uploaded art.
- **Popup width** (240–720 px) is how wide it gets on big screens. Everything scales together.
- With no artwork, the elements sit on a plain card that follows light and dark mode. Check white text in both.

### 5.3 Elements (Canvas)

Every position and size is a **percentage of the artwork**, so the layout stays lined up on every screen size.

| Element | Use |
| --- | --- |
| **Text** | Any copy. Supports tokens (§5.5). Font size is a % of the art width. |
| **Image** | An extra uploaded image (a sticker, a product shot). |
| **Animation** | A Rive file, either one shipped with the app or an uploaded `.riv` (max 4 MB). |
| **Button** | A filled, tappable button with an **action** (§5.6). |
| **Text button** | A tappable line with no fill, like the "No thanks" under a CTA. |
| **Discount** | The old price, struck out (styles: line through, diagonal slash, badge). Default text `{was_price}`. |
| **Timer** | A countdown; its text must contain `{time}`. Modes: *Counts down to the end date* (same deadline for everyone; needs a schedule end) or *Counts down from first view* (a personal deadline, default 30 min). At zero: stop, hide the timer, or close the popup. Formats `01:59:59`, `59:59`, `2d 4h 30m`. |
| **Close (X)** | A small dismiss button. |

**Editing the canvas:** drag to move (it snaps to the art's edges, its centre, and other elements), drag handles to resize. **Arrow keys** nudge by 0.5% (**Shift** = 5%). **Delete/Backspace** removes, **⌘/Ctrl+D** duplicates, **Esc** deselects. The side panel has exact X/Y/W/H %, quick placement (Centre across, Centre down, Top, Bottom, Full width), rotation, typography (size, weight, line height, letter spacing, caps, italic, colour, alignment), fill, corner radius, shadow, border, and opacity. Layer buttons: bring forward, send back, duplicate, delete.

Each element's **label** is its admin-facing name, and it's the name shown in per-button stats. Give buttons clear labels ("Buy 50%", "No thanks").

### 5.4 Copy & button (Nudge banners)

Eyebrow, Headline (required), Body, Button label, Dismiss label, and **The button does** (an action, §5.6).

### 5.5 Text tokens: never type a price by hand

| Token | Becomes |
| --- | --- |
| `{price}` | The live store price of the button's product (or the popup's offer), **in the user's own currency**. |
| `{regular_price}` | For a discounted subscription: what it renews at. |
| `{period}` | For a subscription: "year", "month"… |
| `{was_price}` | The struck-out price: the "Compare against" product, or a discounted subscription's regular price. |
| `{save}` | How much cheaper, for example "50%", computed from the live prices. |
| `{frog}` | The user's frog name. |
| `{flies}` | The user's current fly balance. |
| `{time}` | Timers only: the time left. |

Why: the store charges in each person's own currency. A typed "$4.99" that the checkout then contradicts is a **false price** (a store-policy and consumer-law problem). The editor warns when it sees a hand-typed price.

### 5.6 What a button can do (actions)

| Action | What happens | Needs |
| --- | --- | --- |
| **Open the fly shop** | Closes the popup, opens the shop. | Optional: a pack to scroll to and highlight. |
| **Open the wardrobe** | Closes, opens the wardrobe. | — |
| **Open the Plus paywall** | Closes, opens the paywall (attributed to this campaign). | — |
| **Buy a fly pack — straight to checkout** | Raises the store's payment sheet immediately. | A pack. |
| **Buy a store product — straight to checkout** | Same one-tap checkout for an offer product, bundle, or discounted Plus. | A product (§6). |
| **Give the user something** (`claim_reward`) | Grants flies, a cosmetic, a background, or Plus days. | A reward (§5.7). |
| **Go to a page** | Closes and navigates, for example `/wardrobe?tab=shop`. | A path. |
| **Just close** | Dismisses. | — |

Buy buttons are flagged in the editor because they **charge real money**.

### 5.7 Rewards ("Give the user something")

- Grants: **Flies** (amount), **Cosmetic item**, **Background**, **Plus days**. You can combine them.
- **Can be claimed:** *Once ever* or *Once a day* (UTC day).
- **After claiming, say:** an optional success line (blank = the popup just closes).
- **The server decides what is granted.** It re-reads the campaign; the app only says which button was pressed. A double tap or a replayed request can never grant twice.
- At claim time the campaign must still be eligible (live, in schedule, the user still in the audience). A paused or ended campaign can't be claimed.
- More than one reward button on one popup = separate limits for each button (rarely what you want).

### 5.8 Offer & prices

- **What this popup sells:** the product `{price}` refers to in plain text, and what a Buy button charges for when it doesn't name its own product.
- **Compare against:** fills `{was_price}` and `{save}`, for example "the same flies at the usual price". A discounted Plus subscription compares with its own regular price, so it needs nothing here.
- If a price can't load for someone, **the popup doesn't show to them** (it never shows a blank).

### 5.9 Rive animations (advanced)

- Pick an animation **already in the app** or upload a `.riv`. Then choose the artboard and state machine; the editor reads them from the file, so the dropdowns list what actually exists.
- **Values on open:** set data-bind properties or state-machine inputs (number, boolean, string, enum, colour, trigger) when the popup appears, for example the frog's colour.
- **Repeating triggers (tickers):** fire a trigger every N ms with random jitter, to turn one-shot animations into a living idle (blink, breathe). Optionally fire once on open.
- **Buttons drawn inside Rive:** map a Rive *Event* or a data-bind *trigger* to an action (any action above, or "Same as the main button"), and choose whether it also closes the popup. Tap things in the preview; the **Signals seen** list shows the event names the file actually fires, and you can map them in one click.

---

## 6. Store products: selling real things

Offers are **RevenueCat packages**, so one button works on iOS, Android, and Web.

**Product kinds:** *One-time purchase* (a bundle or fly pack; consumable), *Permanent unlock*, *Plus subscription*.
**Coverage chips** (iOS / Android / Web) show where it's actually sold. Amber = not sold there yet, and people on that platform **won't see the popup**.

**Setting up a new offer:**
1. Create the product in each store: App Store Connect, Google Play Console, and Paddle (web).
   - A **bundle** = a one-time (consumable) product.
   - A **discounted Plus** = the real subscription with a store **introductory offer** (App Store intro offer, Play base-plan offer, Paddle discounted first period). Eligible people get it automatically.
2. Add those products to a **package** in a RevenueCat offering.
3. In the picker: **Refresh from RevenueCat** → find it under "New in RevenueCat — set up to use" → **Set up**.
4. Give it an admin-only **Name**, and set **what buying it delivers** (flies, items, backgrounds). Delivery happens on the purchase webhook once the store confirms payment.
5. Optional, for lapsed subscribers the intro offer doesn't reach: an **Apple promotional offer id** (needs the In-App Purchase key in RevenueCat) and/or a **Google Play offer id** (tag it `rc-ignore-offer` so the normal paywall never picks it).

**Rules baked in:**
- **No Plus days inside paid bundles.** Apple guideline 3.2.1: paid items must not expire. Sell Plus as the subscription itself.
- Bonus items on a subscription land **once, at the first paid period**, never during a free trial (so a cancelled trial doesn't keep them).
- Removing a product from the list doesn't affect purchases already made; they still deliver.
- **Web (Paddle):** Paddle's acceptable-use policy lists "virtual currency". Get Paddle's written OK before selling flies on the web.
- A product deleted in RevenueCat shows as missing, and the campaign can't go live while a button charges for it.

---

## 7. Rules tab

### 7.1 When it fires (triggers)

Add one or more. Some have an extra number to narrow them down.

| Trigger | Fires when… | Extra option |
| --- | --- | --- |
| **App opened** | Once per session, right after the campaign list loads. The everyday trigger; pair it with tight caps. | — |
| **Came back after time away** | First session after a gap of at least a day (this device). Fires alongside "App opened" and outranks it. | **min days** away |
| **Task completed** | Every task ticked off on the home list (including the frog task). | — |
| **Focus session finished** | A Frogodoro focus phase runs to its end (breaks and manual stops don't count). | **min minutes** |
| **Quest reward claimed** | A quest, objective, season day, or streak reward is claimed, after the reward reveal finishes. | — |
| **Streak milestone hit** | The login streak extends on the daily check-in. | **min streak** |
| **Can't afford an item** | They try to buy something they can't afford (wardrobe or shop). | **min gap** (flies short) |
| **Pinned a goal** | A cosmetic is pinned as a goal from the purchase sheet. | — |
| **Fly shop opened** | The fly shop opens, however they got there. | — |
| **Left the shop without buying** | The fly shop closes with no purchase that visit. The classic second-chance moment. | — |
| **Bought flies** | A fly pack purchase succeeds. Use it for thank-yous, not another offer. | — |

### 7.2 Who wins the moment: tier and priority

**The higher tier always wins**, whatever the priority. Priority (a number) only breaks ties **inside** a tier. Choose the tier by *what the message is*, not by how badly you want it seen.

| Tier | Meaning | Session budget |
| --- | --- | --- |
| **Critical** (account / system) | Something the user must deal with: failed payment, expiring subscription. | **Unlimited**: ignores the one-per-session rule. |
| **Moment-of-need offer** | Only makes sense right now (short on flies, just left the shop). | Its **own** slot: 1 per session. |
| **Time-limited offer** | A sale or seasonal offer with an end date. | Shares the **1 takeover per session** slot. |
| **Announcement** | News: a feature, a season, a change. | Shares the slot. |
| **Evergreen nudge** | Encouragement with no deadline. Lowest on purpose. | Shares the slot. |

### 7.3 How often one person sees it (caps)

| Field | Default | Meaning |
| --- | --- | --- |
| **Lifetime max** | 3 | Total times one person can see it. 0 = no limit. |
| **Max per day** | 1 | Per UTC day. 0 = no limit. |
| **Cooldown** | 24 h | Hours before the same person may see it again. |
| **Give up after** | 2 dismissals | Stop showing to someone who dismissed it this many times. 0 = never. |
| **Wait after the trigger** | 650 ms | A beat so it doesn't land in the same frame as the trigger. Over 5 s usually arrives after the user has moved on. |

Also: someone who **converted** on a campaign never sees it again, and someone whose **personal countdown ran out** never sees it again.

### 7.4 Schedule

**Starts** / **Ends** (entered in your local time). Blank start = as soon as it's live; blank end = no end. The end date is also what *Counts down to the end date* timers count to.

---

## 8. Audience tab

| Field | Options | Notes |
| --- | --- | --- |
| **Payers** | Any / Never paid / Has paid | "Paid" = bought a fly pack or a bundle, or pays for Plus (trials and promotional Plus don't count). |
| **Plus** | Any / Plus / Not Plus | **Anything that sells Plus must target "Not Plus"**, or paying members get asked to pay again. |
| **Platform** | Any / Web / Native (iOS + Android) | Store rules and prices differ; offers often should too. |
| **Account at least / at most** | days since signup | For example 0–3 for new users, 30+ for veterans. |
| **Flies below / above** | balance | For example "below 100" for a top-up offer. |
| **Rollout** | 0–100% (steps of 5) | The rest is a **stable holdout**: the same people every time (a hash of user + campaign), so their numbers are a real baseline. |

The panel ends with a plain-language summary: "This reaches …".

---

## 9. Session rules: why a popup can wait or be skipped

These run on the device and are **not** shown in the dry run.

- **One ambient takeover per session** (Canvas popups with the tiers Time-limited offer, Announcement, or Evergreen nudge). The app's own built-in blocking nudges share this same slot.
- **4-hour quiet window** between ambient takeovers on the same device.
- **Moment-of-need offers** have their own slot (1 per session), so an earlier announcement can't block them.
- **Critical** has no limit.
- **Nudge banners** don't use takeover budget; they auto-close after 15 s.
- **Each campaign shows at most once per session.**
- **Busy screen → waits** (up to 10 min, or 1 min for moment offers).
- **Prices or art not ready within 5 s → skipped for that session.**

---

## 10. Launch tab

### 10.1 Checks

Three levels, shown worst first. **Click a note to jump to the element.**

- **Errors (red) block going live.** The server also refuses to save a campaign as `live` with errors. Examples: no name; no trigger; nothing on the artwork; a button whose action is missing its setting; an image or animation element with nothing picked; a "count to end date" timer with no end date; rollout 0%; impossible audience ranges; schedule ends before it starts; `{price}` with nothing for sale; a product deleted from RevenueCat.
- **Warnings (amber) work, but you'll probably regret them.** Examples: no visible close button; a button smaller than a fingertip; a timer without `{time}`; no cap and no cooldown; delay over 5 s; schedule already ended; a typed price; `{was_price}` with nothing to compare against; a product not sold on a targeted platform; a Plus offer not limited to "Not Plus"; **a Buy button sitting on top of a close button** (a mis-tap becomes a purchase).
- **Tips (grey) are craft.** Personal countdowns are permanent once they run out; a transparent tap target; "this charges on every platform, consider splitting web and native"; multiple reward buttons.

### 10.2 Status

| Status | Who sees it |
| --- | --- |
| **Draft** | Nobody. Work freely; drafts may be broken. |
| **Test** | **Admin accounts only**, in the real app. The safe way to try it. |
| **Live** | Everyone the audience rules allow. Disabled while there are errors. |
| **Paused** | Nobody, but all history and stats are kept. |

### 10.3 Results

- **Shown:** total impressions.
- **Reached:** unique people who saw it.
- **Tapped:** taps ÷ impressions.
- **Converted:** purchases credited to the popup (a direct buy, or a purchase within 30 minutes of tapping it).
- **Per button:** taps and % for each clickable element, by its label.

### 10.4 Dry run and "Clear its history"

- **Dry run:** enter an account email (blank = you). For **every** campaign you see ✓ or ✕ and the exact reason ("Targets non-Plus members", "Cooling down for another 5h", "Held out — bucket 73 of 50% rollout"…), plus that account's facts (platform, balance, paid, Plus, account age).
  - The dry run **checks as if on web**. A native-only campaign shows "Platform is web, targets native"; that's expected.
  - ✓ means *allowed*, not *will appear*: the session rules in §9 still apply.
- **Clear its history:** deletes that account's whole record for this campaign (views, dismissals, conversion, personal countdown, **and reward claims**), so you can test it again. Careful: after clearing, a reward button **really grants again** for that account.

---

## 11. Recommended workflow

1. **Start** from a starter (or Blank) and **name it**.
2. **Design:** upload the art, place elements, set button actions, and use tokens for every price.
3. **Rules:** pick the trigger, the tier that matches what it *is*, and the caps. Add an end date for sales.
4. **Audience:** narrow it. Selling Plus → "Not Plus". Paid offer → consider separate web and native campaigns.
5. **Launch:** fix all red, read the amber.
6. Set status **Test** → open the real app with your admin account → trigger it.
   - Not showing? Run the **Dry run** with your email → **Clear its history** → fully close the app (or leave it 30+ min in the background) → trigger again. Remember the 4-hour quiet window if another takeover just showed on this device.
7. Switch to **Live**. Check **Results** after a day. **Pause** rather than delete, so you keep the history.

---

## 12. Recipes

**A. Weekend sale on flies (people who never paid)**
Starter *Sale* → product: a fly pack, Compare against: the same pack at full price → text `{was_price}` / `{price}` / "Save {save}" → Timer: count to end date → Rules: trigger *App opened* + *Fly shop opened*, tier *Time-limited offer*, caps 2 lifetime / 1 per day / 24 h → Schedule Fri 18:00 – Sun 23:59 → Audience: Never paid.

**B. "Can't afford it" rescue**
Canvas with a *Buy a fly pack* button → trigger *Can't afford an item*, **min gap** 50 → tier *Moment-of-need offer* (its own slot, so it still shows after an announcement) → caps 3 lifetime, cooldown 48 h.

**C. Comeback gift**
Trigger *Came back after time away*, **min days** 3 → button *Give the user something* → 100 flies, *Once ever*, success text "Welcome back, {frog} missed you!" → tier *Announcement* (it gives, it doesn't sell) → Audience: account at least 7 days.

**D. Discounted Plus**
Starter *Plus offer* → product: the Plus package whose store subscription has an introductory offer → text uses `{price}`, `{regular_price}`, `{period}` → **Audience: Not Plus** → consider *Native* only first.

**E. Feature announcement**
Starter *Announcement* → *Go to a page* `/insights` → trigger *App opened* → tier *Announcement* → lifetime 1, give up after 1 dismissal.

**F. Measure the real effect**
Any campaign with **Rollout 50%**. The other half is a stable holdout; compare their purchases or retention in Statistics.

---

## 13. Under the hood (for AIs and developers)

| Piece | File |
| --- | --- |
| Admin page | `src/app/admin/popups/page.tsx` → `src/components/ui/AdminCampaignsManager.tsx` |
| Canvas editor | `src/components/ui/admin/CampaignCanvasEditor.tsx` |
| Pickers | `src/components/ui/admin/campaigns/` (ActionPicker, RewardEditor, StoreProductPicker, RiveStudio, starters, TokenChips) |
| Shared vocabulary (triggers, tiers, actions, elements, defaults) | `src/lib/campaigns/types.ts` |
| Pre-launch checks | `src/lib/campaigns/review.ts` (the same rules run on save via `liveBlockers`) |
| Server eligibility (status, schedule, audience, caps) | `src/lib/campaigns/eligibility.ts`, `src/lib/campaigns/audience.ts` |
| Session rules, budgets, pending queue | `src/lib/campaigns/orchestrator.ts` |
| Rendering + price loading | `src/components/campaigns/CampaignHost.tsx`, `CampaignCanvasView.tsx`, `CampaignModal.tsx` |
| Price tokens | `src/lib/campaigns/tokens.ts` |
| Admin APIs | `src/app/api/admin/campaigns/` (CRUD, upload, store-products, explain = dry run, reset = clear history, reward-catalog, rive-library) |
| App APIs | `src/app/api/campaigns/` (list, `event` = impression/click/dismiss/convert, `claim` = rewards) |
| Data | `Campaign`, `CampaignUserState` (per user × campaign: impressions, clicks, dismissals, claims, timers), `StoreProduct` models |
| Where triggers are fired | `CampaignHost` (app opened, came back, bought flies), `TaskList` (task completed), `GlobalTimer` (focus finished), `StreakCheckInProvider` (streak), `questRewardReveal` (quest claimed), `CurrencyShop` (shop opened/abandoned/purchase), `PurchaseSheet` (can't afford, pinned a goal) |

**Adding a new trigger** = add it to `CAMPAIGN_TRIGGERS` + `TRIGGER_LABELS` + `TRIGGER_HELP` (and `TRIGGER_OPTIONS` if it has a number) in `types.ts`, then call `emitCampaignTrigger('<name>', context)` at the moment it happens in the app. A built-in blocking popup that isn't a campaign must call `claimBlockingSlot()` so it shares the session budget.

---

## 14. Glossary

- **Campaign:** one popup plus its rules.
- **Takeover:** a Canvas popup that dims the screen (vs. an inline banner).
- **Trigger:** the in-app moment that can show a campaign.
- **Tier:** the kind of message; decides who wins a collision and which budget it uses.
- **Priority:** tie-breaker inside one tier.
- **Caps:** per-person frequency limits (lifetime, per day, cooldown, give-up-after-dismissals).
- **Rollout / holdout:** the % of the audience that can see it; the rest is a fixed comparison group.
- **Impression / reach / tap / conversion:** shown count / unique people / button presses / purchases credited to the popup.
- **Test status:** live for admins only.
- **Dry run:** "would this account be allowed to see it, and if not, why".
- **Pending:** a chosen popup waiting for the screen to be free.
- **Token:** a `{placeholder}` filled live (price, frog name, balance, time left).
