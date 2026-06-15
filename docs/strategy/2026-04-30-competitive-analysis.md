# TripMates — Competitive Analysis & Feature Recommendations

**Date:** 2026-04-30
**Context:** Pre-beta strategy doc, based on full codebase feature audit + competitive landscape research across 15+ adjacent and direct competitors.

---

## 1. The TripMates User (Inferred Profile)

The product as built points to a clear primary user:

- **22–35 year old**, mixed-gender but masculine-leaning friend groups
- Goes on **1–3 friend trips per year**, often international (Prague, Amsterdam, Krakow, Riga, Mallorca, Berlin) — multi-day, multi-stop, often party-oriented
- **"Grabbresa" / lads' trip / bachelor-party** is the load-bearing use case — the bingo card, drunkest-leaderboard, and theming for "Bachelor Party" trip type confirm this
- Tech-savvy enough to install a beta app; Gen Z / young millennial, TikTok-aware, content-conscious
- Already runs the **default group-trip stack**: WhatsApp (chat), Splitwise (bills), Snap Map / Find My (location), Google Photos shared (memories), Google Maps shared lists (where to eat) — and is annoyed at the app-juggling
- Trip happens *with* friends, but each individual carries their own coordination load: who paid for what, where are we going next, where did Anders disappear to, how do we get home

**What they actually want:**
- Less app-juggling — fewer parallel tools
- A **shared narrative** of the trip during AND after — photos + map + memories + "we destroyed that bar"
- **Less coordination friction** mid-trip — when six people are drunk in Prague at 02:00, decisions need to be one-tap
- A **"vibes app with planning features"**, not a planner app with social bolt-ons. They don't open a planner the morning after — they open the app to find the friend who got lost.

The bachelorette-party space (BACH, Bridesquad, Batch-bachelorette-skew) has 4–6 dedicated apps. The bachelor-party / lads' trip space has **zero** purpose-built apps despite being a comparably large market — friends settle for the WhatsApp + Splitwise + Snap Map stack. **This is TripMates' wedge.**

---

## 2. Where TripMates Stands vs Competitors

| Capability | Wanderlog | Tripsy | TripIt | Splitwise | Polarsteps | Snap Map | Batch | **TripMates** |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Real-time collaborative itinerary | ✅ | ✅ | 🟡 read-only sharing | ❌ | ❌ | ❌ | ✅ | ✅ |
| Map view for itinerary | ✅ | ✅ | 🟡 | ❌ | ✅ post-trip | ✅ | ✅ | ✅ |
| Multi-destination trips | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | 🟡 city-focused | ✅ |
| Bill-split | 🟡 basic | ❌ | ❌ | ✅ best-in-class | ❌ | ❌ | ✅ | ✅ |
| Receipt OCR | ❌ | ❌ | ❌ | ✅ Pro | ❌ | ❌ | ❌ | ✅ |
| Multi-currency settle-up | 🟡 | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ US-only | ✅ |
| Shared photo gallery | ❌ | 🟡 docs | ❌ | ❌ | 🟡 solo diary | ❌ | ❌ | ✅ |
| **Trip-scoped live location with duration dial** | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 ambient, not trip-scoped | ❌ | ✅ **only player** |
| Bingo / drinking games / leaderboards | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ **only player** |
| Follow social graph | ❌ | ❌ | ❌ | ❌ | 🟡 community feed | ✅ Snapchat-native | ❌ | ✅ |
| Polls / group voting | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | 🟡 only "drunkest" voting |
| Booking email auto-import | 🟡 | ✅ | ✅ killer feature | ❌ | ❌ | ❌ | ❌ | ❌ |
| Offline access | ✅ Pro | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| View invite without account | ✅ link | ✅ | ✅ | ❌ | ❌ | n/a | 🟡 | ❌ requires signup |
| Trip recap / shareable artifact | ❌ | 🟡 2025 recap | ❌ | ❌ | ✅ Trip Reels | 🟡 stories | ❌ | ❌ |
| In-app group chat | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Push notifications for trip events | 🟡 flight alerts | ✅ | ✅ flight alerts | ✅ debt | ❌ | ✅ | ✅ | 🟡 limited |
| Activity marketplace / curated bookings | ❌ | ❌ | ❌ | ❌ | 🟡 | ❌ | ✅ Viator integ. | ❌ |

✅ = solid / table-stakes &nbsp;&nbsp; 🟡 = present but partial/weak &nbsp;&nbsp; ❌ = missing

### What this table says

- **TripMates is already at parity** on itinerary, map, bill-split (with OCR ahead of Splitwise free), photo gallery, multi-destination — **all the things a serious group-trip app must have**.
- **Two cells are uniquely TripMates' alone**: trip-scoped live-location with a duration dial, and the bingo/drinking-game leaderboard layer. **These are the moat. Everything else is necessary, neither is sufficient.**
- **The gaps that hurt most for the target audience** (lads' trips abroad, often offline, often in chaos): no offline mode, no booking import, no view-without-account, no group polls beyond the "drunkest" vote, no auto-generated trip recap, no in-app chat, weak push notifications.

---

## 3. Strategic Observations

### Three things that are true about this category

1. **The incumbent isn't a single app — it's the WhatsApp + Splitwise + Snap Map stack.** No one will win by being mildly better at any one thing. The winning play is **bundling well enough that the friend group cancels the side apps**. TripMates is closer to that than any single competitor, but the chat dimension is missing.

2. **"Fun layer" is genuinely uncontested.** Polarsteps shipped Trip Reels, Snap Map shipped Place Loyalty badges, but no one in the planner category has actual gameplay. Bingo and drinking-game leaderboards are not table-stakes — they're the brand. **Lean harder, don't apologize for them.**

3. **Bachelor / bachelorette is bifurcated.** Bachelorette has BACH, Bridesquad, AvoSquado, Batch. Bachelor / mixed-gender lads' trips have nothing — those groups use generic tools. TripMates can claim that lane with positioning + curated content (party cities, bar crawls, hangover guides) without competing for the bachelorette demographic.

### What "good" looks like for the next 12 months

- Beta survives the 2026-05-08 grabbresa **as a working tool people actually open during the trip**, not just before.
- By month 3 post-launch, the daily drivers of session count are: **adding expenses, finding people on the live map, posting photos, checking the bingo board** — in roughly that order. If those four loops feel native, the planning side becomes "first-day-of-trip onboarding" instead of the main feature.
- By month 6, three things have landed that don't exist yet: **trip recap export, polls beyond drunkest-vote, and either booking import or offline mode** (the two top "table-stakes" gaps).

---

## 4. Feature Recommendations (Prioritized)

Each recommendation has: **why** (justification), **rough cost**, **fit with current architecture**.

### Tier 1 — High impact, low-to-moderate cost, ship before/around launch

#### 1.1 Polls / group voting beyond "drunkest"
**Why:** Real-time group decision-making is the #1 reason groups still revert to WhatsApp ("vart ska vi äta?"). Activity voting in TripMates already exists for "drunkest" — this generalizes that infrastructure into open polls. BACH, Troupe, Bridesquad all have this.
**Cost:** ~3–5 days. Reuses the existing voting model in `activities.ts`. New poll type, attached to a trip rather than an activity.
**Differentiator:** Combine with push notifications so all members get pinged when a poll opens — beats async chat.

#### 1.2 Trip recap / "Trip Movie"
**Why:** Polarsteps Trip Reels is the single most viral feature in the entire category. TripMates already has all the data (photos + locations + expenses + activities + bingo wins) — it just doesn't combine them. Auto-generated end-of-trip artifact: a sharable image card with stats ("4 days · 12 activities · 47 photos · 218 €/person · @anders won bingo").
**Cost:** ~1 week. Server-side image generation (Cloud Function with Vertex AI or Canvas/Puppeteer). Triggered manually from Profile when trip ends, not auto.
**Differentiator:** The shareability *outside* the app is itself a growth loop. People post these to Instagram Stories.

#### 1.3 Real push notifications on the events that matter
**Why:** The app doesn't lean on push the way it should. Notify on: someone added an expense involving you, someone started live-location-sharing on the trip, photo you're tagged in, activity starts in 30 min, poll just opened, bingo square completed.
**Cost:** ~1 week. Firebase Cloud Messaging is already wired (Firebase project supports it). Need server-side triggers (Firestore-trigger Cloud Functions) and per-user notification preferences.
**Differentiator:** Combined with live-location, push is what makes the app the *first* thing checked when someone wonders "where is everyone".

#### 1.4 In-app group chat scoped to the trip
**Why:** As long as the WhatsApp thread exists in parallel, photos, plans, and decisions split between two surfaces. A simple per-trip chat — text + emoji + reply-to-message — kills the parallel thread. Doesn't need to compete with WhatsApp for the friend graph; just for the trip-specific conversation.
**Cost:** ~2 weeks. Firestore-backed (sub-collection on trip), real-time via onSnapshot. No images for v1 (gallery already covers photos). Notifications via #1.3.
**Risk:** Group chat is high-engagement but high-support. Set scope tight (no DMs, no media beyond text + emoji + reactions).

#### 1.5 Offline mode for the active trip
**Why:** Bachelor parties go to Riga, Krakow, Tirana, Sarajevo. Roaming data is bad or off. Right now, no data = empty app. Wanderlog Pro charges for this — it's a clear "table stake at the high end".
**Cost:** ~2 weeks. Service worker + IndexedDB cache for the active trip's itinerary, member meta, expenses, and last 100 photos thumbnails. Map tiles cached via Leaflet plugins.
**Architecture note:** Capacitor's PWA layer makes this easier on web; iOS/Android may need plugin-level work.

### Tier 2 — Differentiates, moderate cost, post-launch

#### 2.1 Booking email auto-import
**Why:** TripIt's killer feature for 20 years. Tripsy and Wanderlog both have it. Forward a confirmation email to `plans@tripmates.app` → auto-extract flight/hotel/restaurant + add to itinerary.
**Cost:** ~2–3 weeks. Vertex AI (already in stack for receipts) handles email parsing. Mail-receiving infra (SendGrid Inbound, Postmark) is the new piece. Privacy story needs care.
**Differentiator:** With OCR for receipts already shipped, parsing booking emails reuses the same model and gives full lifecycle automation.

#### 2.2 View-trip-without-account
**Why:** A friend gets the invite link, opens it on iOS, hits a signup wall, doesn't bother. Fix: invite link opens a read-only view of the itinerary + members + photos preview. Sign up only required to interact (vote, post, share location, see expenses).
**Cost:** ~1–2 weeks. Public-mode rendering of the trip page; Firestore rules carve-out for read-only public view of a small subset of fields (trip name, destination, dates, member count, public activity count).
**Risk:** Privacy — the rule needs to be clearly defined. Default: trip is private, admin opts in to "shareable preview link".

#### 2.3 Place loyalty / "We've been here" badges
**Why:** Snap Map just shipped this for individuals; no one has done it for groups. "The Drunken Boat — visited 4 nights in a row by 6 of you" surfaces post-trip and during-trip. Leans into the social/fun layer that's already TripMates' moat.
**Cost:** ~1 week. Aggregation Cloud Function over RTDB live-location entries + activities. Surfaced on the Map page and Profile.

#### 2.4 Trip-tagged photo notifications + "Embarrassing photos of you" feed
**Why:** Photo upload exists but discovery is weak — you don't know when someone tagged you in a photo. Add: "Anders tagged you in a photo from Wednesday at Drunken Boat" → push + a feed of photos OTHERS took where you appear.
**Cost:** ~3–5 days. Firestore-trigger function on gallery write where taggedMembers includes uid → notification.

#### 2.5 Smart "Where now?" suggestions on Map
**Why:** During a trip, opening the Map with no plan should suggest the next thing. "5 min walk to the next planned activity (Parc Güell, 19:00)" or "3 nearby bars rated by members of your trip type". Combines existing trip data with a cheap heuristic.
**Cost:** ~1 week initial; bigger if it becomes a recommendation product.

### Tier 3 — Larger bets, evaluate after launch traction

#### 3.1 Activity / bar / restaurant marketplace per destination
**Why:** Batch's main moat: curated party-city activities with affiliate revenue. AvoSquado integrates Viator. TripMates' Explore page is currently social/discovery — turning it into a curated marketplace per destination (Prague, Amsterdam, etc.) gives revenue + content.
**Cost:** Months. Editorial layer + supplier integrations. **Don't do this until product-market fit on coordination is confirmed.**

#### 3.2 AI trip builder
**Why:** Polarsteps shipped one in 2025. "Bachelor party in Prague, 5 of us, 4 days, beer-focused, mid-budget" → draft itinerary. Reduces "blank-page" friction for first-time planners.
**Cost:** ~3–4 weeks with Vertex AI. Risk of producing generic plans — needs trip-type-specific prompts.

#### 3.3 Friend-group reuse / "Bring last year's crew"
**Why:** Tripsy's "Favorite Guests" pattern. The same 6 people travel together 2x/year. Today they have to re-invite each time. One-tap "import members from last trip" speeds this up.
**Cost:** ~3–5 days. UI work.

#### 3.4 Bedroom / cabin assignment
**Why:** AvoSquado's quirky differentiator. Trips to cabins or rented houses always have a "who sleeps where" coordination problem. A simple bed-assignment UI at the trip level handles it.
**Cost:** ~1 week. Niche but loved by the people who need it.

### Tier 4 — Brand / vibe, low cost, opportunistic

- **Trip energy / vibe selector** — set "chill / party / bender / wholesome" per trip; theme adapts. Builds on existing trip-type theming.
- **Hall-of-Fame aggregation** — across all past trips of the same friend group: "@anders won bingo 4 trips in a row". Recurring-friend-group framing.
- **End-of-trip survey** — 3 questions about the trip → builds member trust scores, surfaces favorite member-pairings, drives the recap above.
- **"Share the trip pin"** — single emoji + short message broadcast to all members. "🍻 Tonight at 22:00 Drunken Boat" — replaces 90% of the WhatsApp scroll.

---

## 5. Net Recommendation

**Ship beta as-is on 2026-05-08** — the feature set is competitive and live-location is genuinely novel.

**Within 90 days post-launch, prioritize Tier 1 (#1.1–1.5).** They close the gap on table-stakes (polls, push, chat, offline) while doubling down on the social layer (recap). Each is 1–2 weeks of work; all five together are roughly two months for a focused effort.

**Hold Tier 2 until usage data is in.** No point building booking import if nobody plans more than one day ahead.

**Skip Tier 3 until product-market fit is confirmed.** AI trip builder and marketplace are revenue plays, not retention plays.

**The brand lever is consistent: lads'-trip-coded, fun-first, vibes over planning.** Every feature should pass the test "does this make a 5-person group at 2 AM in Prague more or less likely to open the app?". If less, defer.
