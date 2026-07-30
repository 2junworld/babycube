# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

베이비큐브 (BabyCube) — a Korean-language React/Vite PWA for tracking baby food (이유식): ingredient stock (냉동 큐브/냉장), meal planning (식단표), feeding logs (기록), and a 시판 이유식 (store-bought baby food) module. Data is shared in real time between family members (e.g. both parents) via Firebase.

## Commands

```bash
npm install          # install dependencies
npm run dev           # dev server (Vite)
npm run build          # production build (also runs the PWA service-worker generation)
npm run preview        # preview a production build locally
```

There is no test runner, linter, or single-test command configured in this repo. Validate changes by running `npm run build` (catches syntax/import errors) and manually exercising the UI in the dev server — append `?demo` to the URL to skip login and use a local-only seeded state (see "Demo mode" below).

## Architecture

### State: one big reducer, no router

- `src/state/appState.js` holds the entire app state shape (`seedState()`), the migration function for old persisted data (`migrateState()`), and a single `reducer(state, action)` that handles every action type (`PLAN_SAVE_MEAL`, `LOG_SAVE`, `STOCK_ADD_BATCH`, `FEEDBACK_ADD`, etc.). This file is large (1000+ lines) — most business logic (stock deduction, category totals, unit conversions) lives here as plain exported functions, not just reducer cases.
- There is no client-side router. `src/screens/Shell.jsx` owns a bottom tab bar (`오늘`/`식단표`/`재고`/`기록`/`더보기`) and a manual navigation **stack** of `{route, params}` entries (`go(route, params)` pushes, `back()` pops one level). Screens receive `go`/`onBack` as props rather than using URL-based routing. When a screen can itself push a further sub-screen (e.g. 설정 → 끼니 설정), it must be reached through `go()`, not local component state, or "back" will not return to the right level.
- `src/store.js` just exports a React Context (`Store`) with `{ state, dispatch, cloud, notify }`. `useStore()` reads it. There's no separate global store singleton — the Provider is what actually holds the reducer instance.

### Sync layer: Firestore-backed, with a demo mode

`src/sync/providers.jsx` is the layer between the reducer and Firebase:

- `AuthGate` → Google sign-in → `FamilyStoreProvider` — the real, production path. A "family" is a Firestore doc at `families/{familyId}` whose `state` field holds the entire reducer state. `dispatch` is wrapped to auto-inject `_actor` (uid) and `_at` (timestamp) onto every action for author-tracking.
- Sync is a **partial, top-level-key diff**: `syncToCloud()` only sends the top-level state keys that changed since last sync (`updateDoc(doc, {"state.plans": ..., "state.stock": ...})`), not the whole document — this lets two family members edit different areas (e.g. one edits `stock`, the other `plans`) concurrently without one overwriting the other. Incoming remote snapshots are merged with any not-yet-synced local changes (see `mergeRemoteWithLocalChanges`) to avoid losing in-flight edits during a race.
- `?demo` (query param) renders `DemoProvider`, a local-only reducer with **no Firestore reads/writes at all** — it's used for UI development/testing and for App Store screenshots. `?demo=family` (`DemoFamilyFlow`) additionally mocks the family-creation/invite flow. Any feature that talks to Firestore directly (rather than through `dispatch`) must explicitly special-case demo mode (check `cloud.familyId === "demo"` or similar) so it doesn't attempt real network calls.
- Firestore document size is capped at 1MiB; `DOC_SIZE_LIMIT_BYTES`/`DOC_SIZE_WARN_BYTES` in `appState.js` are used to show a usage warning in Settings before that limit is hit.
- Firestore values must never be `undefined` — the SDK throws synchronously on `updateDoc`/`setDoc` if any nested field is `undefined`, and because that throw happens inside a `useEffect`, it propagates to the top-level React error boundary (`App.jsx`) and shows the generic "문제가 발생했어요" screen instead of a useful error. This has caused real bugs (e.g. reducer code that read `.name` off an item without checking `source !== "product"`, since 시판 제품 items use `productName` instead). When adding new item "sources" to `items` arrays (재료/product/etc.), audit every place that reads shared fields off those items.

### Feature module split

- `src/screens/` — one file per tab/screen area (`TodayTab`, `PlanTab`, `StockTab`, `RecordTab`, `MoreTab`, `FeedingLogScreen`), each exporting the main tab component plus its sub-screens (e.g. `MoreTab.jsx` also exports `SettingsScreen`, `CategoriesScreen`, `HistoryScreen`, `ChangelogHistoryScreen`, etc.). `Shell.jsx` is the only place that imports from all of them to wire up routing.
- `src/components/common.jsx` — shared display primitives (`ScreenHeader`, `SubHeader`, `CategoryBar`, `IngredientTable`, `MealItemList`, badges). `pickers.jsx` — the bottom-sheet pickers (`IngredientPicker`, `ProductPicker`, `MealSlotPicker`, product edit form). `planEditor.jsx` — `usePlanItemsEditor` hook + `PlanItemsEditor` UI, shared between `MealEditScreen` and `BulkSaveScreen` (식단표 끼니 편집).
- `src/lib/` — pure calculation/formatting helpers with no React or Firebase deps (`dates.js`, `stats.js`, `pairing.js`, `mealLabels.js`, `stockAlerts.js`, `exporters.js`, `labelRecognition.js`).
- Items in `plans`/`logs` arrays have a `source` discriminator: absent/`"frozen"`/`"fridge"` for raw ingredients (identified by `name`), or `"product"` for 시판 제품 (identified by `productId`/`productName`, no `name` field). Nearly every function that iterates these arrays (`gOf`, `catOf`, `sortByCategory`, `totalG`, category-split helpers in `appState.js`) branches on `it.source === "product"` — new code touching these arrays must do the same.
- 큐브 중량 (`unitG`): the ingredient master (`state.ingredients[name].unitG`) is set once, the first time an ingredient is ever manufactured (`ensureIngredientEntry` no-ops if the entry already exists), and never updated after that even if later batches use a different cube weight. `currentUnitGOf(state, name)` in `appState.js` instead looks at the most recent stock batch (preferring one with remaining stock) — use this, not `unitGOf`, whenever defaulting a *new* unitG value for UI that should reflect current reality (e.g. adding an ingredient to a plan).

### AI feature: 성분표(라벨) 인식 (Gemini)

시판 제품 등록 화면의 "성분표 촬영으로 자동 입력" button photographs a product's ingredient label and uses Gemini to prefill product name/brand/ingredients.

- `api/parse-label.js` is a **Vercel serverless function** (not part of the Vite client bundle) that: verifies the caller's Firebase ID token with `jose` + Google's JWKS endpoint (no Firebase Admin SDK), confirms family membership by re-querying `families/{familyId}` via the Firestore REST API using the caller's own ID token (a 200 response *is* the membership proof, since `firestore.rules` already restricts that read to members), enforces a 30-calls/family/day limit tracked in `families/{familyId}/meta/visionUsage`, then calls the Gemini API.
- Required env vars (Vercel dashboard, **Production** environment, no `VITE_` prefix so they never reach the client bundle): `GEMINI_API_KEY`, `GEMINI_MODEL` (defaults to `gemini-flash-latest` if unset — prefer leaving this unset over hardcoding a dated model version, since Google periodically retires older dated Gemini model names for new API keys).
- `src/lib/labelRecognition.js` (client-side) resizes the photo before upload and fuzzy-matches Gemini's returned ingredient list against the app's ingredient master (synonyms, exclusion of non-food additives, base-ingredient linking).
- Changes to `api/parse-label.js` alone (no `src/` changes) still require a normal PR merge to `main` to reach Vercel's production deployment — there's no separate deploy path for the `api/` folder.

### PWA update flow + changelog convention

- `vite.config.js` sets `registerType: 'prompt'`; `src/pwa.jsx`'s `PwaUpdateProvider`/`useRegisterSW` shows an in-app "새 버전이 있어요" banner instead of silently reloading, and checks for updates on `visibilitychange`/`focus` in addition to a 1-hour interval.
- `src/changelog.js` (`CHANGELOG` array, newest entry first) drives a one-time "what's new" bottom sheet shown after an update is applied (`WhatsNewSheet`/`useWhatsNew`, compares `__APP_VERSION__` — baked from `package.json` version via `vite.config.js`'s `define` — against a `localStorage` "last seen version"). 더보기 → 업데이트 내역 (`ChangelogHistoryScreen`) shows the full list at any time. When bumping `package.json`'s version for a user-visible change, add a matching entry to the top of `CHANGELOG`, or the version bump goes out silently unnoticed.

### Firestore layout (top-level collections)

- `families/{familyId}` — `{ ownerUid, members: [uid], memberInfo, state: <entire reducer state> }`. `families/{familyId}/meta/visionUsage` — Gemini call-count doc (see above).
- `invites/{code}` — maps a 6-character invite code to a `familyId` (kept separate from the family doc so a non-member can look up the code without needing read access to the family doc itself).
- `users/{uid}` — `{ familyId }`, used to reconnect a signed-in user to their family on reload.
- `globalFeedback/{id}` — world-readable feedback/suggestion box (더보기 → 개선 제안), intentionally a top-level collection rather than per-family so all users can see each other's submissions.
- `firestore.rules` changes are **not** auto-applied on deploy — they must be manually re-published in the Firebase Console (Firestore → 규칙 tab) after merging. Code that depends on a new rule (e.g. the `visionUsage` rate limit) is written to fail open/gracefully when the rule isn't live yet, but should be flagged in the PR description as a manual step.

## Documentation in this repo

- `개발_이력.md` — a long, dated running log of past work sessions (Korean). Not auto-loaded by anything; read it directly when you need historical context on *why* something was built a certain way, or before assuming a feature doesn't exist.
- `배포_공유_가이드.md` — end-user-facing setup/deployment walkthrough (Firebase project setup, Vercel env vars, Gemini API key). Keep its env var / model name references in sync with the actual code defaults when they change.
