# Permissions & Role-Based Access Control

## Roles

| Role | Description | Default |
|---|---|---|
| **admin** | Full access to all resources. Manages fairs, producers, wines, and users. | No |
| **producer** | Manages own producer profile and wines. Participates in fairs. | No |
| **attendee** | Default role. Reviews/favorites wines. Views public data. | Yes |
| **unauthenticated** | No account. Public read-only access (browse wines, view fairs). | — |

Roles are defined in `src/server/db/schema.ts` as `userRoleEnum`. New users default to `attendee`. Role changes require direct DB update (no API endpoint yet — Phase 5.7 will add admin `updateRole`).

---

## Authorization Layers

The system uses 4 layers of defense-in-depth:

### Layer 1: Middleware (`src/middleware.ts`)

Authentication gate only — no role checks. Unauthenticated users are redirected to `/login` for any non-public route.

**Public routes** (no auth required): `/login`, `/signup`, `/auth/callback`

### Layer 2: Layout Components

Role-based routing at the layout level:

| Layout | File | Allowed Roles | Redirect |
|---|---|---|---|
| Attendee | `src/app/(attendee)/layout.tsx` | attendee, producer | Admins → `/manage` |
| Admin | `src/app/manage/layout.tsx` | admin | Non-admins → `/` |
| Producer | `src/app/produce/layout.tsx` | producer | Not yet implemented (Phase 5.1) |

### Layer 3: tRPC Procedure Types (`src/server/api/trpc.ts`)

| Procedure | Auth Required | Use For |
|---|---|---|
| `publicProcedure` | No | Read operations anyone can access (list wines, search, view fairs) |
| `protectedProcedure` | Yes | Any operation requiring a logged-in user |

### Layer 4: Router-Level Authorization (`src/server/api/helpers/auth.ts`)

Fine-grained checks inside each mutation/query:

- **`getUserProfile(db, userId)`** — Fetches profile, throws `UNAUTHORIZED` if not found
- **`requireRole(db, userId, allowedRoles)`** — Checks role, throws `FORBIDDEN` if not in allowed list. Returns the profile for ownership checks.

**Ownership pattern** (used by producers):
```typescript
const profile = await requireRole(ctx.db, ctx.user.id, ['admin', 'producer'])
if (profile.role === 'producer') {
  // Verify producer owns the resource they're modifying
  if (resource.userId !== ctx.user.id) {
    throw new TRPCError({ code: 'FORBIDDEN', message: '...' })
  }
}
```

---

## Route Access Matrix

| Route Group | Auth | Roles | Notes |
|---|---|---|---|
| `/login`, `/signup` | No | unauthenticated | Redirects to `/` if already logged in |
| `/auth/callback` | No | any | OAuth/OTP callback |
| `/(attendee)/*` | Yes | attendee, producer | Admins redirected to `/manage` |
| `/manage/*` | Yes | admin | Non-admins redirected to `/` |
| `/produce/*` (Phase 5.1) | Yes | producer | Not yet implemented |
| `/privacy` (Phase 4.4) | No | any | Static page, public |

---

## API Permission Matrix

### User Router (`user`)

| Procedure | Type | Roles | Ownership | Notes |
|---|---|---|---|---|
| `createProfile` | public | any | — | Called during signup, hardcodes role=attendee |
| `getProfile` | protected | any | own only | Returns current user's profile |
| `updateProfile` | protected | any | own only | Can update firstName, lastName only |
| `listUsers` | protected | admin | — | Phase 5.7 |
| `updateRole` | protected | admin | — | Phase 5.7 |
| `getStats` | protected | any | own only | Phase 4.3 |
| `deleteAccount` | protected | any | own only | Phase 4.3 |

### Producer Router (`producer`)

| Procedure | Type | Roles | Ownership | Notes |
|---|---|---|---|---|
| `list` | public | any | — | Filterable by regionId |
| `getById` | public | any | — | |
| `create` | protected | admin, producer | producer: own account only | |
| `update` | protected | admin, producer | producer: own profile only | |
| `delete` | protected | admin | — | |

### Wine Router (`wine`)

| Procedure | Type | Roles | Ownership | Notes |
|---|---|---|---|---|
| `list` | public | any | — | Filterable by type, grape, region, producer, price |
| `getById` | public | any | — | Joins producer info + grape varieties |
| `search` | public | any | — | Text search across name, grape, producer, region |
| `create` | protected | admin, producer | producer: own producer's wines | |
| `update` | protected | admin, producer | producer: own producer's wines | |
| `delete` | protected | admin | — | |

### Fair Router (`fair`)

| Procedure | Type | Roles | Ownership | Notes |
|---|---|---|---|---|
| `list` | public | any | — | Optional active-only filter |
| `getById` | public | any | — | Includes wines + producers |
| `create` | protected | admin | — | Validates endDate >= startDate |
| `update` | protected | admin | — | |
| `delete` | protected | admin | — | |
| `addWine` | protected | admin, producer | producer: own wines only | |
| `removeWine` | protected | admin, producer | producer: own wines only | |
| `addProducer` | protected | admin | — | |
| `removeProducer` | protected | admin | — | |

### Review Router (`review`) — Phase 3.2

| Procedure | Type | Roles | Ownership | Notes |
|---|---|---|---|---|
| `create` | protected | any | — | One review per user per wine |
| `update` | protected | any | own only | |
| `delete` | protected | any | own only | |
| `getByWine` | public | any | — | All reviews for a wine |
| `getMyReviews` | protected | any | own only | Paginated |
| `getByIdWithDetails` | public | any | — | Single review with wine + characteristics |

### Favorites Router (`favorite`) — Phase 3.3

| Procedure | Type | Roles | Ownership | Notes |
|---|---|---|---|---|
| `toggle` | protected | any | own only | Add/remove |
| `getMyFavorites` | protected | any | own only | Paginated with wine details |
| `isFavorited` | protected | any | own only | Check for specific wine |

### Stats Router (`stats`) — Phase 5.8

| Procedure | Type | Roles | Ownership | Notes |
|---|---|---|---|---|
| `dashboard` | protected | admin | — | Aggregate counts |

---

## Adding Permissions to New Procedures

When creating a new tRPC procedure, follow this decision tree:

1. **Can unauthenticated users access this?** → Use `publicProcedure`
2. **Does it require a logged-in user?** → Use `protectedProcedure`
3. **Is it restricted to specific roles?** → Call `requireRole(ctx.db, ctx.user.id, ['admin', ...])` inside the handler
4. **Can a producer only modify their own resources?** → Add ownership check after `requireRole`
5. **Is it admin-only?** → Call `requireRole(ctx.db, ctx.user.id, ['admin'])`

Always return the profile from `requireRole` so you can use it for ownership checks without a second DB query.
