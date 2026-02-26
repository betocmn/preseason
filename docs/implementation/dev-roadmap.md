# Wine2cents Development Roadmap

## Overview

This roadmap breaks the Wine2cents MVP into agent-promptable phases. Each phase is a self-contained unit of work that a coding agent can complete in one session, including writing tests.

**Status legend:** `[DONE]` `[TODO]` `[TBD]` (decision pending)

**Tech stack:** Next.js 15 App Router, tRPC v11, Drizzle ORM, Supabase (PostgreSQL + Auth), Tailwind CSS v4, shadcn/ui, Vitest + Testcontainers

**Conventions:**
- All tables use `wine_fair_*` prefix (via `pgTableCreator`)
- Migrations: edit `schema.ts` → `pnpm run db:generate` → `pnpm run db:migrate`
- Tests use Testcontainers for PostgreSQL (Docker required)

---

## Sprint 1: Foundation & Authentication (Weeks 1–2) `[DONE]`

### Phase 1.1: Email OTP Authentication `[DONE]`

- [x] Login page with email OTP (6-digit code)
- [x] Signup page with profile collection (firstName, lastName, birthDate, email)
- [x] OTP verification flow
- [x] Supabase auth integration (server + client helpers)
- [x] Protected routes via middleware (redirects unauthenticated users to /login)
- [x] Auth callback route

**Key files:** `src/app/login/`, `src/app/signup/`, `src/components/auth/`, `src/lib/auth.ts`, `src/lib/supabase/`, `src/middleware.ts`

---

### Phase 1.2: User Profiles & Database Foundation `[DONE]`

- [x] `wine_fair_user_profile` table (id, email, firstName, lastName, birthDate, role, timestamps)
- [x] Role enum: admin, producer, attendee
- [x] tRPC user router with `createProfile` and `getProfile`
- [x] Seed script for admin users
- [x] Migrations applied

**Key files:** `src/server/db/schema.ts`, `src/server/api/routers/user.ts`, `src/server/db/seed.ts`

---

### Phase 1.3: App Layouts & Navigation `[DONE]`

- [x] Attendee layout with HeaderNav (desktop) and BottomNav (mobile)
- [x] BottomNav tabs: Home, Search, My Reviews, My Favorites, Profile
- [x] Admin layout with sidebar (Wine Fairs, Attendees, Wines, Producers)
- [x] Role-based routing (admin → `/manage`, attendee → `/`)

**Key files:** `src/app/(attendee)/layout.tsx`, `src/app/manage/layout.tsx`, `src/components/attendee/`, `src/components/manage/`

---

### Phase 1.4: Stub Pages & Homepage `[DONE]`

- [x] Homepage with Welcome Hero and Quick Actions (Scan Wine, Browse Wines)
- [x] Stub pages for /search, /profile, /reviews, /favorites (ComingSoonAttendee)
- [x] Admin stubs for /manage/wines, /manage/producers, /manage/attendees, /manage/fairs, /manage/settings
- [x] Admin dashboard with mock stat cards

**Key files:** `src/app/(attendee)/page.tsx`, `src/app/manage/dashboard/page.tsx`

---

### Phase 1.5: Profile Page `[DONE]`

- [x] Replace /profile stub with real profile page
- [x] Display user info (name, email, birth date, role)
- [x] Edit form for first name, last name
- [x] Logout button
- [x] Language preference selector (prep for i18n, stored in profile or localStorage)
- [x] Add `updateProfile` mutation to user tRPC router
- [x] Tests: integration test for updateProfile mutation, component test for form validation

**Key files:** `src/components/attendee/profile-view.tsx`, `src/components/attendee/profile-edit-form.tsx`, `src/app/(attendee)/profile/page.tsx`, `src/server/api/routers/user.ts`

**Depends on:** Phase 1.2

---

### Phase 1.6: Sprint 1 Test Hardening `[DONE]`

- [x] Update `src/test/db.ts` to match current schema (added `cleanTestDatabase` helper, correct types)
- [x] Update or replace `src/test/example.test.ts` with current-schema tests
- [x] Add tests for user tRPC router: createProfile (valid, invalid, duplicate), getProfile (existing, non-existing)
- [x] Add test for middleware redirect logic

**Key files created:** `src/middleware.test.ts`
**Key files modified:** `src/test/db.ts`, `src/test/example.test.ts`, `src/test/setup.ts`, `src/server/api/routers/user.test.ts`

**Depends on:** Phase 1.2

---

## Sprint 2: Core Data Models & Search (Weeks 3–4) `[DONE]`

### Phase 2.1: Producer & Wine Database Schema `[DONE]`

- [x] Create `wineTypeEnum` pgEnum: white, red, rose, orange, sparkling, dessert
- [x] Create `wine_fair_producer` table (id, name, region, description, website, imageUrl, userId FK nullable, timestamps)
- [x] Create `wine_fair_wine` table (id, name, vintage, type, grapeVariety, alcoholPercent, region, description, imageUrl, producerId FK, parentWineId self-referential FK nullable, price nullable, fermentationContainer nullable, oakAging nullable, leesContact nullable, sedimentContact nullable, timestamps)
- [x] Define Drizzle relations for producer ↔ wine, wine ↔ parentWine, userProfile ↔ producer
- [x] Run `pnpm run db:generate` and `pnpm run db:migrate`
- [x] Update `src/test/db.ts` to create new tables in test container
- [x] Tests: basic smoke tests for insert/query producers and wines, enum values, vintage linking

**Note:** Added `description` text column to wines table (not in original spec) for producer tasting notes.

**Key files modified:** `src/server/db/schema.ts`, `src/test/db.ts`
**Key files created:** `src/test/db-schema.test.ts`, `drizzle/0003_sudden_tiger_shark.sql`

---

### Phase 2.2: Fair Database Schema `[DONE]`

- [x] Create `wine_fair_fair` table (id, name, description, location, startDate, endDate, isActive boolean, imageUrl, timestamps)
- [x] Create `wine_fair_fair_wine` junction table (id, fairId FK, wineId FK, createdAt) with unique constraint on (fairId, wineId)
- [x] Create `wine_fair_fair_producer` junction table (id, fairId FK, producerId FK, boothNumber nullable, createdAt) with unique constraint on (fairId, producerId)
- [x] Define Drizzle relations for fair ↔ wine, fair ↔ producer
- [x] Run `pnpm run db:generate` and `pnpm run db:migrate`
- [x] Tests: junction table insert/query, unique constraint violation, cascade delete

**Note:** Moved `boothNumber` from `fair_wine` to `fair_producer` — at wine fairs, producers have a booth/stand where all their wines are displayed, so the booth belongs to the producer, not individual wines.

**Key files modified:** `src/server/db/schema.ts`, `src/test/db.ts`, `src/test/db-schema.test.ts`
**Key files created:** `drizzle/0004_nebulous_shen.sql`

**Depends on:** Phase 2.1

---

### Phase 2.3: Producer tRPC Router `[DONE]`

- [x] Create producer router with procedures: `list` (paginated, filterable by region), `getById`, `create` (admin/producer only), `update` (admin/producer only), `delete` (admin only)
- [x] Register in app router
- [x] Tests: all CRUD operations, authorization checks (attendee cannot create), pagination

**Note:** Added shared auth helper (`src/server/api/helpers/auth.ts`) with `getUserProfile` and `requireRole` functions used by all routers for role-based authorization.

**Key files created:** `src/server/api/routers/producer.ts`, `src/server/api/routers/producer.test.ts`, `src/server/api/helpers/auth.ts`
**Key files modified:** `src/server/api/root.ts`

**Depends on:** Phase 2.1

---

### Phase 2.4: Wine tRPC Router `[DONE]`

- [x] Create wine router with procedures: `list` (paginated, filters for type/grape/region/price/producer), `getById` (joins producer info), `create` (admin/producer), `update` (admin/producer), `delete` (admin), `search` (text search across name, grape, producer name, region)
- [x] Register in app router
- [x] Tests: CRUD, all filter combinations, text search matching, authorization

**Note:** Search uses `ilike` with LEFT JOIN on producers table for cross-table text search. SQL special characters (`%`, `_`) are escaped in search input.

**Key files created:** `src/server/api/routers/wine.ts`, `src/server/api/routers/wine.test.ts`
**Key files modified:** `src/server/api/root.ts`

**Depends on:** Phase 2.1, Phase 2.3

---

### Phase 2.5: Fair tRPC Router `[DONE]`

- [x] Create fair router with procedures: `list` (all or active-only), `getById` (with wines and producers), `create`/`update`/`delete` (admin only), `addWine`/`removeWine` (admin/producer), `addProducer`/`removeProducer` (admin)
- [x] Register in app router
- [x] Tests: CRUD, junction table operations, active fair filter

**Note:** `getById` uses nested eager loading via Drizzle relational queries for producers and wines. Junction table operations catch unique constraint violations and return CONFLICT errors. `create` validates endDate >= startDate via Zod refinement.

**Key files created:** `src/server/api/routers/fair.ts`, `src/server/api/routers/fair.test.ts`
**Key files modified:** `src/server/api/root.ts`

**Depends on:** Phase 2.2

---

### Phase 2.6: Seed Data Expansion `[DONE]`

- [x] Add sample producers (7 Bulgarian wineries: Bessa Valley, Todoroff, Midalidare, Edoardo Miroglio, Villa Yustina, Rossidi, Zagreus)
- [x] Add sample wines (24 across producers, varied types/grapes/vintages including vintage linking)
- [x] Add 2 sample fairs with wines and producers assigned (Sofia Wine Festival active, Plovdiv Wine & Food inactive)
- [x] Add 4 sample attendee users
- [x] Make seed script idempotent (skip existing records via checks before insert and onConflictDoNothing)

**Note:** Wine types covered: red, white, rosé, orange, sparkling, dessert. Bulgarian grape varieties included: Mavrud, Rubin, Dimyat, Rkatsiteli. Vintage linking demonstrated with Enira 2020/2021. Fair assignments include booth numbers for producers and all wines assigned to their respective fairs.

**Key files modified:** `src/server/db/seed.ts`

**Depends on:** Phase 2.1, Phase 2.2

---

### Phase 2.7: Schema Normalization — Grape Varieties, Regions & Wine One-Liner `[DONE]`

- [x] Create `wine_fair_region` table (id, name, country nullable, description nullable, timestamps) with unique constraint on name
- [x] Create `wine_fair_grape_variety` table (id, name, description nullable, timestamps) with unique constraint on name
- [x] Create `wine_fair_wine_grape_variety` junction table (id, wineId FK, grapeVarietyId FK, createdAt) with unique constraint on (wineId, grapeVarietyId) — enables wines to have one or multiple grape types
- [x] Replace `region` varchar on `wine_fair_wine` with `regionId` FK referencing `wine_fair_region`
- [x] Replace `region` varchar on `wine_fair_producer` with `regionId` FK referencing `wine_fair_region`
- [x] Remove `grapeVariety` varchar from `wine_fair_wine` (replaced by junction table)
- [x] Add `oneLiner` optional varchar(280) to `wine_fair_wine` — a short tagline/description for the wine
- [x] Define Drizzle relations for region ↔ wine, region ↔ producer, wine ↔ grapeVariety (many-to-many)
- [x] Run `pnpm run db:generate` and `pnpm run db:migrate`
- [x] Update seed data to use new region and grape variety tables
- [x] Update producer tRPC router (filter by regionId instead of region string)
- [x] Update wine tRPC router (filter/search using grape variety junction, regionId, include grapeVarieties in getById)
- [x] Update existing tests to reflect new schema structure
- [x] Tests: region and grape variety CRUD, many-to-many grape assignment, wine one-liner, updated router filters

**Note:** Wine search now queries across normalized tables: grape variety names via junction table join, region names via region table join, in addition to wine name and producer name. Wine list filtering by grape variety uses a two-step approach (find matching wine IDs from junction table, then filter). Seed data includes 3 Bulgarian regions, 18 grape varieties (4 Bulgarian + 14 international), and oneLiner for all 24 wines.

**Key files modified:** `src/server/db/schema.ts`, `src/server/db/seed.ts`, `src/server/api/routers/producer.ts`, `src/server/api/routers/wine.ts`, `src/test/db.ts`, `src/test/db-schema.test.ts`, `src/server/api/routers/producer.test.ts`, `src/server/api/routers/wine.test.ts`, `src/server/api/routers/fair.test.ts`
**Key files created:** `drizzle/0005_dear_darwin.sql`

**Depends on:** Phase 2.1, Phase 2.6

---

### Phase 2.8: Search Page UI `[DONE]`

- [x] Replace /search stub with functional search page
- [x] Search bar component with text input and submit (debounced 300ms)
- [x] Filter panel (collapsible on mobile via Sheet): wine type dropdown, price range selector (below 9 / 9–18 / above 18 EUR), grape variety dropdown, region dropdown, producer dropdown
- [x] Wine card component showing: image (Next.js Image with placeholder), name, vintage, type badge, one-liner, alc%, producer, region, price
- [x] Paginated results list with load-more button
- [x] Empty state and loading skeleton
- [x] Tests: region router (4 tests), grape variety router (4 tests), wine list with producer/region names (2 tests), wine search with filters (5 tests)

**Note:** Created `region` and `grapeVariety` tRPC routers with `list` procedures for filter dropdown data. Enhanced `wine.list` to join producer and region names (return shape changed to `{ wine, producerName, regionName }`). Enhanced `wine.search` to accept optional filter parameters (type, grapeVarietyId, regionId, minPrice, maxPrice, producerId) and return regionName. Search page uses `wine.search` when text is present, `wine.list` when only filters are active. Installed shadcn/ui select, badge, and skeleton components.

**Key files created:** `src/server/api/routers/region.ts`, `src/server/api/routers/grape-variety.ts`, `src/server/api/routers/region.test.ts`, `src/server/api/routers/grape-variety.test.ts`, `src/components/attendee/search-bar.tsx`, `src/components/attendee/search-filters.tsx`, `src/components/attendee/wine-card.tsx`, `src/components/attendee/wine-card-list.tsx`, `src/components/attendee/wine-card-skeleton.tsx`, `src/components/attendee/search-empty-state.tsx`
**Key files modified:** `src/app/(attendee)/search/page.tsx`, `src/server/api/routers/wine.ts`, `src/server/api/routers/wine.test.ts`, `src/server/api/root.ts`

**Depends on:** Phase 2.4, Phase 2.7

---

### Phase 2.9: Homepage Dynamic Content `[DONE]`

- [x] Replace static homepage with dynamic data from tRPC
- [x] Show active fair info (name, dates, location) from fair router
- [x] Show recently added or featured wines
- [x] Update "Current Fair" card with real data (or hide if no active fair)
- [x] Tests: homepage renders fair data, handles no-active-fair state

**Note:** Homepage uses server-side tRPC calls (`fair.list` with `activeOnly: true`, `fair.getById`) and client-side `wine.listRecent` query. `ActiveFairCard` component shows name, dates, location, producer/wine counts with graceful no-active-fair placeholder. `FeaturedWines` component renders recently added wines with loading skeleton. Comprehensive test coverage in `homepage.test.ts` and `wine.test.ts`.

**Key files created:** `src/components/attendee/active-fair-card.tsx`, `src/components/attendee/featured-wines.tsx`, `src/server/api/routers/homepage.test.ts`
**Key files modified:** `src/app/[locale]/(attendee)/page.tsx`, `src/server/api/routers/wine.ts`, `src/server/api/routers/wine.test.ts`

**Depends on:** Phase 2.5, Phase 2.6

---

### Phase 2.10: i18n Setup & English Strings `[DONE]`

- [x] Set up internationalization framework (`next-intl` with URL-prefix locale routing)
- [x] Extract all hardcoded English strings into translation file (`messages/en.json`)
- [x] Language switcher in profile page (`src/components/language-switcher.tsx`)
- [x] Configure locale-aware routing (`/en/...`, `/bg/...` via `[locale]` route segment)
- [x] Combined i18n middleware with Supabase auth middleware
- [x] All ~200 strings across ~30 files extracted into namespaced message keys
- [x] Middleware tests updated for locale-prefixed paths

**Key files created:** `src/i18n/routing.ts`, `src/i18n/request.ts`, `src/i18n/navigation.ts`, `messages/en.json`, `src/components/language-switcher.tsx`
**Key files modified:** `src/app/layout.tsx`, `src/app/[locale]/layout.tsx`, `src/middleware.ts`, `next.config.js`, all UI components

**Depends on:** None

---

### Phase 2.11: Bulgarian Translation `[DONE]`

- [x] Add Bulgarian translation file with all UI strings (`messages/bg.json`)
- [x] Translate all ~200 strings: error messages, labels, buttons, system messages
- [x] Translation verification script (`scripts/verify-translations.ts`)
- [x] `pnpm run i18n:verify` command to check key parity between locales

**Key files created:** `messages/bg.json`, `scripts/verify-translations.ts`

**Depends on:** Phase 2.10

---

## Sprint 3: Wine Details & Rating System (Weeks 5–6) `[TODO]`

### Phase 3.1: Review & Favorites Database Schema `[DONE]`

- [x] Create `wine_fair_review` table (id, userId FK, wineId FK, rating integer 1–5, notes text nullable, voiceNoteUrl varchar nullable, createdAt, updatedAt) with unique constraint on (userId, wineId)
- [x] Flatten characteristic ratings into review table as nullable columns (colorRating, aromaRating, acidityRating, tanninsRating, bodyRating, flavorRating — all integer 1–5) instead of separate `wine_fair_review_characteristic` table
- [x] Create `wine_fair_favorite` table (id, userId FK, wineId FK, createdAt) with unique constraint on (userId, wineId)
- [x] Define Drizzle relations (review ↔ user, review ↔ wine, favorite ↔ user, favorite ↔ wine, plus reverse many() on userProfiles and wines)
- [x] Run `pnpm run db:generate` and `pnpm run db:migrate`
- [x] Tests: insert/query reviews with characteristics, favorites unique constraint, cascade delete

**Note:** Replaced the originally planned separate `wine_fair_review_characteristic` table (1:1 with reviews) with nullable columns directly on the review table. This eliminates a JOIN on every review query, simplifies CRUD to single operations, and is the standard approach for 1:1 optional data. Both tables use `onDelete: 'cascade'` for userId and wineId FKs. Favorites table omits `updatedAt` since favorites are only created/deleted (toggle semantics).

**Key files modified:** `src/server/db/schema.ts`, `src/test/db.ts`
**Key files created:** `drizzle/0006_brave_scorpion.sql`

**Depends on:** Phase 2.1

---

### Phase 3.2: Review tRPC Router `[DONE]`

- [x] Create review router: `create` (with characteristics, protected, any authenticated user), `update` (own only), `delete` (own only), `getByWine` (all reviews for a wine with reviewer firstName/lastName), `getMyReviews` (paginated with wine/producer/region details), `getByIdWithDetails` (single review with nested wine + user data via Drizzle relational queries)
- [x] Register in app router
- [x] Tests: all CRUD, ownership validation, review-with-characteristics creation, cascade deletes, pagination, auth checks (31 tests)

**Note:** `create` uses `getUserProfile` to validate profile exists before insert, catches unique constraint violations and returns CONFLICT. `update`/`delete` use ownership checks (`review.userId !== ctx.user.id` → FORBIDDEN). `getByWine` uses INNER JOIN with userProfiles for reviewer names. `getByIdWithDetails` uses Drizzle relational queries with nested wine (producer, region, grapeVarieties) and user (id, firstName, lastName only — no email/birthDate exposed).

**Key files created:** `src/server/api/routers/review.ts`, `src/server/api/routers/review.test.ts`
**Key files modified:** `src/server/api/root.ts`

**Depends on:** Phase 3.1

---

### Phase 3.3: Favorites tRPC Router `[DONE]`

- [x] Create favorites router: `toggle` (add/remove, protected), `getMyFavorites` (paginated with wine/producer/region details), `isFavorited` (check for specific wine)
- [x] Register in app router
- [x] Tests: toggle add, toggle remove, double-toggle idempotency, list pagination, isFavorited check, user isolation, cascade deletes, auth checks (16 tests)

**Note:** `toggle` uses query-then-insert/delete approach — checks for existing favorite, deletes if found (returns `{ favorited: false }`), inserts if not (returns `{ favorited: true }`). Unique constraint provides safety net for race conditions. All procedures are `protectedProcedure` with no role restriction. `getMyFavorites` joins wines + producers + regions for full wine context.

**Key files created:** `src/server/api/routers/favorite.ts`, `src/server/api/routers/favorite.test.ts`
**Key files modified:** `src/server/api/root.ts`

**Depends on:** Phase 3.1

---

### Phase 3.4: Wine Detail Page `[DONE]`

- [x] New route `/wine/[id]` with server component fetching wine data
- [x] Wine detail view: image (placeholder if none), name, vintage, type, grape, alc%, producer, region
- [x] Display average rating and review count (via new `review.getStats` tRPC procedure)
- [x] "Add to Favorites" toggle button with optimistic updates
- [x] Other users' reviews for this wine (paginated, load more)
- [x] Link wine cards in search results to this detail page (already existed in wine-card.tsx)
- [x] Tests: `review.getStats` tests (average/count, zero reviews, wine isolation, public access)

**Note:** Added `review.getStats` public procedure using SQL `AVG()`/`COUNT()` for efficient server-side computation. Wine detail page is a server component; interactive parts (favorite button, reviews section) are client components. Extracted `wineTypeBadgeStyles` to shared `src/lib/wine-type-styles.ts`. Wine type translations duplicated in `wineDetail` namespace for i18n separation.

**Key files created:** `src/app/[locale]/(attendee)/wine/[id]/page.tsx`, `src/components/attendee/favorite-button.tsx`, `src/components/attendee/wine-reviews-section.tsx`, `src/components/attendee/review-card.tsx`, `src/lib/wine-type-styles.ts`
**Key files modified:** `src/server/api/routers/review.ts`, `src/server/api/routers/review.test.ts`, `src/components/attendee/wine-card.tsx`, `messages/en.json`, `messages/bg.json`

**Depends on:** Phase 2.4, Phase 3.2, Phase 3.3

---

### Phase 3.5: Star Rating Component `[DONE]`

- [x] Reusable 5-star rating component (interactive mode: clickable, hover preview)
- [x] Display-only mode for showing existing ratings
- [x] Show average rating with review count label (used on wine detail page)
- [x] Animated star fill on hover/click via CSS clip-path for partial fills
- [x] Three size variants (sm, md, lg) and accessibility support

**Note:** Uses `Star` icon from lucide-react with `clip-path` CSS for fractional star fills (e.g., 3.7 average). Interactive mode renders buttons with hover preview state; display mode renders spans. Amber-400 fill color, muted-foreground/30 empty color.

**Key files created:** `src/components/ui/star-rating.tsx`

**Depends on:** None (standalone)

---

### Phase 3.6: Characteristic Sliders Component `[TODO]`

- [ ] Slider components for 6 wine characteristics: color, aroma, acidity, tannins, body, flavor
- [ ] Each slider ranges 1–5 with visual labels
- [ ] Grouped form section component
- [ ] Both edit and display (read-only) modes
- [ ] Add shadcn/ui slider if not already present
- [ ] Tests: slider value changes, form state management

**Key files to create:** `src/components/ui/characteristic-slider.tsx`, `src/components/attendee/characteristics-form.tsx`

**Depends on:** None (standalone)

---

### Phase 3.7: Review Form & Submission `[TODO]`

- [ ] Full review form on wine detail page combining: star rating, characteristic sliders, text notes textarea, save button
- [ ] Form validation with Zod (rating required, characteristics optional, notes optional)
- [ ] Success/error toast notifications via Sonner
- [ ] Edit mode: pre-populate form when user has existing review
- [ ] Tests: form validation, submission flow, edit mode pre-population

**Key files to create:** `src/components/attendee/review-form.tsx`
**Key files to modify:** `src/app/(attendee)/wine/[id]/page.tsx`

**Depends on:** Phase 3.2, Phase 3.4, Phase 3.5, Phase 3.6

---

### Phase 3.8: Swipe Navigation Between Wines `[TODO]`

- [ ] From search results, swipe left/right between wine detail pages
- [ ] Touch gesture handling for mobile
- [ ] Wine count indicator (e.g., "3 of 12")
- [ ] Preload adjacent wines for smooth transitions
- [ ] Tests: gesture detection, navigation state

**Key files to create:** `src/components/attendee/wine-swipe-container.tsx`
**Key files to modify:** `src/app/(attendee)/wine/[id]/page.tsx`

**TBD: Swipe library** — Options: (a) custom touch event handlers with CSS transforms, (b) `react-swipeable`, (c) `embla-carousel`. Recommendation: start with custom handlers; switch to `embla-carousel` if complex.

**Depends on:** Phase 3.4

---

## Sprint 4: User Features & Reviews (Weeks 7–8) `[TODO]`

### Phase 4.1: My Reviews Page `[TODO]`

- [ ] Replace /reviews stub with functional page
- [ ] List all wines reviewed by current user: wine card (name, vintage, producer), star rating, date
- [ ] Sort by most recent
- [ ] Tap to expand showing full review (characteristics, notes)
- [ ] Edit button → navigate to wine detail with review form in edit mode
- [ ] Delete button with confirmation dialog
- [ ] Empty state when no reviews
- [ ] Tests: review list renders, edit navigation, delete confirmation flow

**Key files to create:** `src/components/attendee/review-list.tsx`, `src/components/attendee/review-list-item.tsx`
**Key files to modify:** `src/app/(attendee)/reviews/page.tsx`

**Depends on:** Phase 3.2, Phase 3.7

---

### Phase 4.2: My Favorites Page `[TODO]`

- [ ] Replace /favorites stub with functional page
- [ ] List all favorited wines as wine cards
- [ ] Remove from favorites button on each card
- [ ] Tap card to navigate to wine detail
- [ ] Empty state when no favorites
- [ ] Tests: favorites list renders, unfavorite removes from list, empty state

**Key files to create:** `src/components/attendee/favorites-list.tsx`
**Key files to modify:** `src/app/(attendee)/favorites/page.tsx`

**Depends on:** Phase 3.3, Phase 2.8

---

### Phase 4.3: User Profile Enhancements `[TODO]`

- [ ] Show review statistics on profile: total reviews, average rating given, favorite wine type
- [ ] Show account creation date
- [ ] Add privacy policy link
- [ ] Add "Delete Account" option with confirmation dialog
- [ ] Add `getStats` query and `deleteAccount` mutation to user router
- [ ] Tests: stats calculation, delete account cascade behavior

**Key files to modify:** `src/app/(attendee)/profile/page.tsx`, `src/server/api/routers/user.ts`

**Depends on:** Phase 1.6, Phase 3.1

---

### Phase 4.4: Privacy Policy Page `[TODO]`

- [ ] Static privacy policy page at `/privacy`
- [ ] GDPR compliance text (data collection, storage, user rights, contact info)
- [ ] Link from profile page
- [ ] Tests: page renders, links work

**Key files to create:** `src/app/privacy/page.tsx`

**Depends on:** None

---

## Sprint 5: Producer & Admin Features (Weeks 9–10) `[TODO]`

### Phase 5.1: Producer Layout & Dashboard `[TODO]`

- [ ] New route group `/produce` for producer-role users
- [ ] Producer dashboard showing: their wines count, average ratings, fair participation
- [ ] Producer sidebar navigation (My Wines, Fairs, Profile)
- [ ] Role-based redirect: producer → `/produce`
- [ ] Update middleware for `/produce` protected routes
- [ ] Tests: role-based routing (producer sees producer UI)

**Key files to create:** `src/app/produce/layout.tsx`, `src/app/produce/page.tsx`, `src/components/producer/producer-layout.tsx`, `src/components/producer/producer-sidebar.tsx`
**Key files to modify:** `src/middleware.ts`

**Depends on:** Phase 2.3

---

### Phase 5.2: Producer Wine Management `[TODO]`

- [ ] Wine list page showing producer's own wines
- [ ] Create wine form with all fields: name, vintage, type, grape, alc%, region, image upload, plus backend-only fields (fermentation container, oak aging, lees contact, sediment contact)
- [ ] Edit wine page
- [ ] Delete wine with confirmation
- [ ] Vintage linking: select an existing wine as parent when creating a new vintage
- [ ] Tests: wine form validation, create/update flow, vintage linking

**Key files to create:** `src/app/produce/wines/page.tsx`, `src/app/produce/wines/new/page.tsx`, `src/app/produce/wines/[id]/edit/page.tsx`, `src/components/producer/wine-form.tsx`, `src/components/producer/wine-list.tsx`

**TBD: Image upload** — Options: (a) Supabase Storage with signed URLs, (b) Cloudinary, (c) UploadThing. Recommendation: Supabase Storage since already in the stack.

**Depends on:** Phase 2.4, Phase 5.1

---

### Phase 5.3: Producer Fair Participation `[TODO]`

- [ ] View upcoming/active fairs
- [ ] Select existing wines from catalog to present at a fair (no duplicates)
- [ ] View booth info
- [ ] View attendee ratings for their wines at a fair
- [ ] Tests: wine-to-fair assignment, duplicate prevention

**Key files to create:** `src/app/produce/fairs/page.tsx`, `src/app/produce/fairs/[id]/page.tsx`, `src/components/producer/fair-wine-selector.tsx`

**Depends on:** Phase 2.5, Phase 5.1, Phase 5.2

---

### Phase 5.4: Admin Wine Management `[TODO]`

- [ ] Replace /manage/wines stub with data table (sortable, filterable, searchable)
- [ ] Create/edit/delete any wine (admin overrides ownership)
- [ ] Assign wine to producer
- [ ] Bulk import placeholder (UI with instructions, actual import TBD)
- [ ] Add shadcn/ui data table if needed
- [ ] Tests: table rendering, CRUD operations, filter/sort

**Key files to create:** `src/components/manage/wines-table.tsx`, `src/components/manage/wine-admin-form.tsx`
**Key files to modify:** `src/app/manage/wines/page.tsx`

**Depends on:** Phase 2.4

---

### Phase 5.5: Admin Producer Management `[TODO]`

- [ ] Replace /manage/producers stub with data table
- [ ] Create/edit/delete producers
- [ ] Assign user account to producer profile
- [ ] View producer's wines inline
- [ ] Tests: table rendering, CRUD operations

**Key files to create:** `src/components/manage/producers-table.tsx`, `src/components/manage/producer-admin-form.tsx`
**Key files to modify:** `src/app/manage/producers/page.tsx`

**Depends on:** Phase 2.3

---

### Phase 5.6: Admin Fair Management `[TODO]`

- [ ] Replace /manage/fairs stub with data table
- [ ] Create/edit/delete fairs
- [ ] Toggle active fair
- [ ] Manage wines and producers in a fair
- [ ] View fair analytics (attendee count, reviews submitted)
- [ ] Tests: CRUD, active fair toggle, analytics queries

**Key files to create:** `src/components/manage/fairs-table.tsx`, `src/components/manage/fair-admin-form.tsx`, `src/components/manage/fair-detail-admin.tsx`
**Key files to modify:** `src/app/manage/fairs/page.tsx`

**Depends on:** Phase 2.5

---

### Phase 5.7: Admin Attendee Management `[TODO]`

- [ ] Replace /manage/attendees stub with data table
- [ ] View attendee profiles, reviews, favorites
- [ ] Change user roles (promote to producer, etc.)
- [ ] Disable/enable accounts
- [ ] Add admin-only `listUsers` and `updateRole` to user router
- [ ] Tests: user listing, role change, authorization checks

**Key files to create:** `src/components/manage/attendees-table.tsx`
**Key files to modify:** `src/app/manage/attendees/page.tsx`, `src/server/api/routers/user.ts`

**Depends on:** Phase 1.2

---

### Phase 5.8: Admin Dashboard with Real Data `[TODO]`

- [ ] Replace mock data with real tRPC queries
- [ ] Stats cards: total producers, total wines, active fairs, registered attendees
- [ ] Latest ratings list from actual reviews
- [ ] Create `stats` tRPC router for aggregate queries
- [ ] Tests: stats queries return correct counts

**Key files to create:** `src/server/api/routers/stats.ts`
**Key files to modify:** `src/app/manage/dashboard/page.tsx`, `src/server/api/root.ts`

**Depends on:** Phase 3.1, Phase 5.4, Phase 5.5, Phase 5.6

---

## Sprint 6: Export, Share & Polish (Weeks 11–12) `[TODO]`

### Phase 6.1: PDF Review Export `[TODO]`

- [ ] Generate PDF containing all of a user's reviews
- [ ] Include per review: wine name, vintage, producer, rating, characteristics, notes, date
- [ ] Wine2cents branding/header
- [ ] Download button on /reviews page
- [ ] Tests: PDF generation produces valid output, includes correct review data

**TBD: PDF library** — Options: (a) `@react-pdf/renderer` (React-based, client-side), (b) `jsPDF` (lightweight), (c) `puppeteer` (server-side HTML-to-PDF), (d) `pdfmake` (declarative). Recommendation: `@react-pdf/renderer` for React ecosystem fit.

**Key files to create:** `src/components/attendee/review-pdf.tsx`
**Key files to modify:** `src/app/(attendee)/reviews/page.tsx`

**Depends on:** Phase 4.1

---

### Phase 6.2: Share Reviews `[TODO]`

- [ ] Share button on /reviews page using Web Share API (native sharing on mobile for WhatsApp, Viber, email)
- [ ] Desktop fallback: email link, copy link
- [ ] Share the generated PDF or a summary link
- [ ] Tests: Web Share API detection, fallback behavior

**Key files to create:** `src/components/attendee/share-reviews.tsx`, `src/lib/share.ts`
**Key files to modify:** `src/app/(attendee)/reviews/page.tsx`

**Depends on:** Phase 6.1

---

### Phase 6.3: Label Scanning & Camera `[TODO]`

- [ ] Camera button on homepage opens device camera (WebRTC / getUserMedia)
- [ ] Capture wine label image
- [ ] Send image to OCR service to extract wine name / producer
- [ ] Auto-populate search with extracted text
- [ ] Graceful fallback if OCR fails or camera not available
- [ ] Tests: camera permission handling, OCR response parsing, search redirect

**TBD: OCR technology** — Options: (a) Google Cloud Vision API (high accuracy, paid), (b) Tesseract.js (client-side, free, lower accuracy), (c) AWS Textract (paid), (d) Azure Computer Vision (paid). Recommendation: Google Cloud Vision API for best accuracy on wine labels. Consider Tesseract.js as a free fallback.

**Key files to create:** `src/app/(attendee)/scan/page.tsx`, `src/components/attendee/camera-capture.tsx`, `src/components/attendee/label-scanner.tsx`, `src/lib/ocr.ts`
**Optionally:** `src/server/api/routers/scan.ts` (if server-side OCR)

**Depends on:** Phase 2.8

---

### Phase 6.4: Voice Command Search `[TODO]`

- [ ] Voice button on homepage captures speech input
- [ ] Convert speech to text
- [ ] Auto-populate search bar with transcript and trigger search
- [ ] Visual feedback during recording (pulsing mic icon, transcript preview)
- [ ] Tests: Speech API availability detection, transcript handling

**TBD: Speech-to-text** — Options: (a) Web Speech API (browser-native, free, Chrome/Safari), (b) Whisper API (OpenAI, paid, higher accuracy), (c) Google Speech-to-Text (paid). Recommendation: Web Speech API for MVP (free, good enough); Whisper as future upgrade.

**Key files to create:** `src/components/attendee/voice-search.tsx`, `src/lib/speech.ts`
**Key files to modify:** `src/app/(attendee)/page.tsx` or search page

**Depends on:** Phase 2.8

---

### Phase 6.5: UI Polish & Accessibility `[TODO]`

- [ ] Review all pages for mobile / tablet / desktop responsiveness
- [ ] Add loading states and skeleton screens for all data-fetching pages
- [ ] Add error boundaries and fallback UI
- [ ] Add empty states for all list pages (reviews, favorites, search results)
- [ ] Consistent spacing, typography, color usage
- [ ] Accessibility audit: aria labels, keyboard navigation, contrast ratios
- [ ] Tests: accessibility tests with @testing-library

**Key files to modify:** various components across the project

**Depends on:** All previous phases

---

### Phase 6.6: Production Deployment `[TODO]`

- [ ] Set up Vercel production deployment
- [ ] Configure Supabase production project
- [ ] Document all required environment variables in `.env.example`
- [ ] Database migration strategy for production
- [ ] Image optimization configuration (Vercel Image Optimization)
- [ ] Error monitoring setup (e.g., Sentry — TBD)
- [ ] Performance baseline (Core Web Vitals)

**Key files to modify:** `next.config.js`, `.env.example`

**Depends on:** All previous phases

---

## Post-MVP: Sprint 7 — AI Recommendations (Weeks 13–14) `[TODO]`

### Phase 7.1: User Preference Analysis `[TODO]`

- [ ] Aggregate user review data to build preference profiles
- [ ] Calculate preferred wine types, grape varieties, regions, characteristic ranges
- [ ] Store computed preferences (new table or materialized view)
- [ ] Tests: preference calculation from review data

**TBD: Computation approach** — Options: (a) PostgreSQL aggregate queries from tRPC, (b) materialized views, (c) background jobs (Inngest, BullMQ). Recommendation: PostgreSQL aggregates first; materialized views if slow.

**Key files to create:** `src/server/api/routers/recommendations.ts`

**Depends on:** Phase 3.1, Phase 3.2

---

### Phase 7.2: Recommendation Engine `[TODO]`

- [ ] Wine similarity algorithm based on type, grape, region, characteristic scores
- [ ] "Next Wine to Try" — recommend wines at the active fair that match preferences and haven't been tried
- [ ] API endpoint returning top N recommendations with explanation text
- [ ] Tests: recommendation logic, filtering already-reviewed wines

**TBD: Algorithm** — Options: (a) content-based filtering (cosine similarity on attributes), (b) collaborative filtering (users who liked X liked Y), (c) LLM-based (send profile + catalog to Claude/GPT). Recommendation: content-based for MVP (simpler, works with small data); collaborative when userbase grows.

**Key files to modify:** `src/server/api/routers/recommendations.ts`

**Depends on:** Phase 7.1

---

### Phase 7.3: Recommendation UI `[TODO]`

- [ ] "Recommended for You" section on homepage
- [ ] "Try Next" card on wine detail page
- [ ] Explanation text ("Based on your love for Sangiovese...")
- [ ] Dismissible recommendation cards
- [ ] Feedback loop (helpful? yes/no)
- [ ] Tests: recommendation card renders, dismiss works, feedback submission

**Key files to create:** `src/components/attendee/recommendation-card.tsx`, `src/components/attendee/recommendations-section.tsx`
**Key files to modify:** `src/app/(attendee)/page.tsx`, `src/app/(attendee)/wine/[id]/page.tsx`

**Depends on:** Phase 7.2

---

## Post-MVP: Sprint 8 — Advanced Features (Weeks 15–16) `[TODO]`

### Phase 8.1: Gamification System `[TODO]`

- [ ] Points system: earn points for reviews, fair attendance, favorites
- [ ] Achievement badges (first review, 10 reviews, all wines at a fair, etc.)
- [ ] Leaderboard
- [ ] Display on profile page
- [ ] New schema tables: `wine_fair_achievement`, `wine_fair_user_achievement`, `wine_fair_points_log`

**Depends on:** Phase 3.2, Phase 4.3

---

### Phase 8.2: Enhanced User Profiles `[TODO]`

- [ ] Optional fields: age, gender, city
- [ ] Fun questionnaires about food/drink preferences
- [ ] Taste profile visualization (radar chart of preferred characteristics)

**Depends on:** Phase 4.3, Phase 7.1

---

### Phase 8.3: Ticket Integration `[TODO]`

- [ ] Integration with Urbo ticketing platform for Bulgarian wine fairs
- [ ] Show ticket status within the app
- [ ] QR code scanning for fair entry

**TBD: Urbo API** — Need to investigate whether Urbo (https://urboapp.com/) has a public API. May need deep link integration or a generic ticketing approach instead.

**Depends on:** Phase 2.5

---

### Phase 8.4: Voice Notes for Reviews `[TODO]`

- [ ] Record voice notes during wine review via MediaRecorder API
- [ ] Store audio files in Supabase Storage
- [ ] Playback on review detail page
- [ ] Optional transcription to text notes

**TBD: Transcription** — Options: (a) Whisper API for transcription, (b) browser-native (limited). Recommendation: Supabase Storage for audio files + optional Whisper transcription.

**Key files to create:** `src/components/attendee/voice-note-recorder.tsx`, `src/lib/audio.ts`

**Depends on:** Phase 3.7

---

### Phase 8.5: Wine Sales Platform `[TODO]`

- [ ] E-commerce for exclusive wines ("wine of the month")
- [ ] Product pages, cart, checkout
- [ ] Pre-orders, limited quantity tracking, countdowns
- [ ] Dynamic pricing algorithm
- [ ] Targeted offers based on user preferences

**TBD: Payment processing** — Options: Stripe, PayPal, local Bulgarian payment providers. This is the largest post-MVP feature and will need its own detailed planning.

**Depends on:** Phase 5.2, Phase 7.1

---

### Phase 8.6: Google OAuth Integration `[TODO]` *(optional)*

- [ ] Add "Sign in with Google" button to login page
- [ ] Add "Sign up with Google" option to signup page
- [ ] Implement `signInWithGoogle` in auth client helpers
- [ ] Handle OAuth callback in `/auth/callback/route.ts`
- [ ] Configure Supabase Google OAuth provider (document required env vars)
- [ ] Tests: unit test for Google auth methods (mock Supabase), integration test for callback route

**Key files to modify:** `src/components/auth/login-form.tsx`, `src/components/auth/signup-form.tsx`, `src/lib/auth-client.ts`, `src/app/auth/callback/route.ts`

**Depends on:** Phase 1.1, Supabase dashboard configuration for Google OAuth credentials

---

## TBD Decisions Summary

| Decision | Options | Recommended | Phase |
|---|---|---|---|
| Image upload | Supabase Storage, Cloudinary, UploadThing | Supabase Storage | 5.2 |
| OCR for label scanning | Google Cloud Vision, Tesseract.js, AWS Textract, Azure CV | Google Cloud Vision | 6.3 |
| i18n library | next-intl, next-i18next, react-i18next, Paraglide.js | next-intl | 2.10 |
| PDF generation | @react-pdf/renderer, jsPDF, puppeteer, pdfmake | @react-pdf/renderer | 6.1 |
| Speech-to-text | Web Speech API, Whisper API, Google Speech-to-Text | Web Speech API | 6.4 |
| Swipe navigation | Custom handlers, react-swipeable, embla-carousel | Custom → embla | 3.8 |
| Recommendation algorithm | Content-based, Collaborative, LLM-based | Content-based | 7.2 |
| Preference computation | PostgreSQL aggregates, Materialized views, Background jobs | PostgreSQL aggregates | 7.1 |
| Urbo ticket integration | Direct API, Deep links, Generic ticketing | Investigate API | 8.3 |
| Voice note transcription | Whisper API, Browser-native | Whisper API | 8.4 |
| Payment processing | Stripe, PayPal, Local providers | Stripe | 8.5 |
| Error monitoring | Sentry, LogRocket, Datadog | Sentry | 6.6 |
