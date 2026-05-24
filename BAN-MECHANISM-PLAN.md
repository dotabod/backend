# Ban mechanism — design plan

Status: **tabled** (researched 2026-05-24, no implementation yet)

Replaces the current "edit `accounts.providerAccountId = '00000000'`" workaround
that one bad actor is on today. That workaround works by coincidence (Twitch
`/helix/users?id=00000000` returns empty `data:[]` → `botApi.users.getUserById`
returns null → `handleNewUser` skips them → no EventSub subs registered → no
events flow). But it pollutes `accounts` queries, can't be `.single()`-queried
cleanly, generates ~3,168 useless `[TWITCHEVENTS] subscription failed for
00000000 cannot create a subscription for a user that does not exist` log
lines per day, and doesn't actually block the user from re-OAuthing with a
fresh `accounts` row (Twitch ID match doesn't hit the `00000000` row).

---

## Current state (what already exists)

- **No ban primitive in DB.** `users` has stream/MMR columns; `settings` has a
  per-feature `disable_reason` enum (`TOKEN_REVOKED`, `MANUAL_DISABLE`,
  `BOT_BANNED`, `ACCOUNT_SHARING`) at `frontend/prisma/schema.prisma:501` but
  nothing user-level.
- **Off-boarding today** = Twitch revoke flow only. `revokeEvent.ts:42`
  `disableChannel()` deletes `steam_accounts` and writes
  `settings.commandDisable=true` reason `TOKEN_REVOKED`. Doesn't delete the
  user, account, or block re-signin.
- **Subscription teardown** lives in `stopUserSubscriptions()`
  (`packages/twitch-events/src/twitch/lib/revokeEvent.ts:21`) — fired by the
  `DELETE:accounts` watcher (`packages/twitch-events/src/watcher.ts:81-99`).
  Clears `eventSubMap` in-memory and DELETEs Twitch EventSub subs.
- **Frontend admin tooling already exists**: `admin` table (`schema.prisma:184`,
  role-only), `requireDashboardAccess({ requireAdmin: true })`
  (`frontend/src/lib/server/dashboardAccess.ts:32`), `jwt()` callback reads
  admin role at `auth.ts:130-133`, impersonate `CredentialsProvider` at
  `auth.ts:295-447`, one admin page (`dashboard/admin/index.tsx`). API admin
  endpoints check `session.user.role.includes('admin')`.
- **Enforcement chokepoints already exist** for similar gating patterns:
  - GSI POST: `packages/dota/src/dota/validateToken.ts:13`
    (`invalidTokens` Set) → `getDBUser` (`packages/dota/src/db/getDBUser.ts:28,154`)
  - Chat in: `packages/twitch-chat/src/handleChat.ts:232`
  - EventSub onboarding: `handleNewUser`
    (`packages/twitch-events/src/handleNewUser.ts:38`) + `initUserSubscriptions`
  - Frontend signin: NextAuth `jwt()` callback (`frontend/src/lib/auth.ts:46`)
    — already does a `prisma.user.findFirst` per signin, so adding a ban
    check is one column read

---

## Proposed minimal design

### Schema (one migration on `users`, no new tables)

```sql
ALTER TABLE users
  ADD COLUMN banned_at    TIMESTAMPTZ NULL,
  ADD COLUMN banned_reason TEXT       NULL,
  ADD COLUMN banned_by    UUID        NULL;  -- informational FK to users.id (admin); not enforced
```

`banned_at IS NOT NULL` = banned. `banned_by` is informational only — admins
are rare and FK enforcement adds no value here.

### Enforcement points (each gates on `users.banned_at IS NOT NULL`)

1. **`frontend/src/lib/auth.ts` `jwt()` callback (~line 85 select)**: add
   `banned_at` to the existing `prisma.user.findFirst` select. If set:
   `throw new Error('ACCOUNT_BANNED')` → user redirected to
   `/error?error=ACCOUNT_BANNED`. Add the string to `pages/error.tsx`.

2. **`packages/dota/src/db/getDBUser.ts:86` user SELECT**: add `banned_at`.
   If set: `invalidTokens.add(lookupToken)` + return null. This blocks GSI
   POSTs and any other path that calls `getDBUser`.

3. **`packages/twitch-events/src/handleNewUser.ts:38`**: short-circuit before
   Step 1 if banned (skip profile update + skip `initUserSubscriptions`).

4. **`packages/twitch-chat/src/handleChat.ts:232`**: defense-in-depth. Mostly
   covered by (3) — banned users don't have a `channel.chat.message` sub, so
   no chat events flow. But add a check via `getDBUser` here too in case
   subs were already registered before the ban.

### Ban action (script, no admin UI for v1)

```bash
pnpm --filter @dotabod/frontend exec tsx scripts/ban-user.ts <userId> <reason>
```

Does:

1. `UPDATE users SET banned_at = now(), banned_reason = ?, banned_by = ?
WHERE id = ?`
2. `commandDisable.disable(userId, 'MANUAL_DISABLE', { banned: true })`
   (existing facade — writes the per-feature disable flag)
3. `DELETE FROM accounts WHERE userId = ?` — fires existing
   `DELETE:accounts` watcher → `stopUserSubscriptions` → removes from
   `eventSubMap` and Twitch's EventSub conduit
4. `DELETE FROM sessions WHERE userId = ?` — force logout existing JWTs at
   next refresh (JWT strategy means the 3-day session can otherwise keep
   the dashboard alive)

### Watcher integration (live ban without restart)

The `UPDATE:users` handlers in `packages/twitch-events/src/watcher.ts:100`
and `packages/dota/src/db/watcher.ts:232` already see all user updates via
Supabase Realtime. Add a tiny branch: if `banned_at` transitioned null→set:

- twitch-events watcher: call `stopUserSubscriptions`
- dota watcher: call `clearCacheForUser` + add to `invalidTokens`

This makes a Prisma Studio edit fully effective without bouncing the
services.

### Re-signin defense

`accounts` is unique on `(provider, providerAccountId)`. After we delete the
account row, the user **can** re-OAuth and create a fresh `accounts` row
attached to the same `users.id` (NextAuth's PrismaAdapter matches by email
via `allowDangerousEmailAccountLinking: true`). The `banned_at` on `users`
survives that re-link, so the `jwt()` gate at (1) still fires.

**Unsolvable at this layer**: a banned user using a different email gets a
new `users` row. That's Twitch identity, not us — accept it.

---

## Migration for the existing `00000000` user

One-off SQL after deploy:

```sql
-- Find them
SELECT "userId" FROM accounts WHERE "providerAccountId" = '00000000';

-- Apply real ban (substitute the userId from above)
UPDATE users
  SET banned_at = now(),
      banned_reason = 'migrated from 00000000 workaround'
  WHERE id = '<userId>';

-- Clean up workaround row
DELETE FROM accounts WHERE "providerAccountId" = '00000000';
```

Side benefit: the `subscriptionHealthCheck`
`cannot create a subscription for a user that does not exist` spam (~3,168
log lines/day) goes away.

---

## Open questions (resolve before implementing)

1. **UX for banned users hitting the site**: hard-redirect to
   "you're banned, contact support" page, or still let them see billing for
   refund/cancellation purposes? Default recommendation: hard-redirect with
   `banned_reason` displayed.

2. **Admin UI scope**: real admin route now, or `prisma studio` + script
   acceptable for v1? Recommendation: script only — you've banned one
   user in years.

3. **Stripe sub cancellation**: should `banned_at` cascade-cancel active
   Stripe subscriptions, or leave that as a manual step in the script?

4. **REPLICA IDENTITY check**: confirm `users` table has
   `REPLICA IDENTITY FULL`. The rename watcher already relies on it (see
   `packages/twitch-events/src/watcher.ts:14-20` comment block); the new
   ban-detect branch in the watcher will too. If it's not set, the
   `UPDATE:users` payload's `old.banned_at` won't be delivered and the
   watcher can't see the null→set transition.

---

## Files this would touch

**Schema**:

- `frontend/prisma/schema.prisma` — add `banned_at`/`banned_reason`/`banned_by`
  to User model
- One migration file under `frontend/prisma/migrations/`

**Frontend**:

- `frontend/src/lib/auth.ts` (~line 85 select + jwt callback ban check)
- `frontend/src/pages/error.tsx` (handle `ACCOUNT_BANNED` error)
- `frontend/scripts/ban-user.ts` (new — the ban action script)

**Backend**:

- `packages/twitch-events/src/handleNewUser.ts:38` (short-circuit if banned)
- `packages/twitch-events/src/watcher.ts:100` (banned_at transition branch)
- `packages/dota/src/db/getDBUser.ts:86` (ban check on user fetch)
- `packages/dota/src/db/watcher.ts:232` (banned_at transition branch)

**Tests** (TDD):

- backend `watcher.test.ts` — pin: `banned_at` null→set fires teardown
- backend `handleNewUser` test — pin: banned user returns early without
  hitting Twitch API
- backend `getDBUser` test — pin: banned user returns null + adds to
  `invalidTokens`
- frontend auth helper test — pin: jwt callback throws `ACCOUNT_BANNED`
  when `banned_at` is set

---

## Why this is minimal

- One column triplet on existing table, no new tables, no Ban/Sanction
  hierarchy
- Reuses every existing chokepoint (auth jwt, getDBUser, handleNewUser,
  watcher) — additions are 3-5 lines each
- No admin UI v1 — script + `prisma studio` is fine for a 1-banned-user
  problem
- Watcher branch makes manual DB edits fully effective without service
  bounce
- Migration path for the existing workaround is two `UPDATE`+`DELETE`
  statements
