# signalMOMENT v2 — Sprint 2 Backend Foundation

## Runtime flow

```text
Telegram initData
→ Edge Function HMAC verification
→ verified users row
→ Supabase Auth session
→ chain membership
→ signed game session
→ validated result
→ chain aggregate update
→ append-only event
```

## Data model

- `users`: verified Telegram identities.
- `chains`: social chain lifecycle, aggregate participant count, depth, best result and expiry.
- `chain_members`: one user per chain, exact inviter, member-specific share token and depth.
- `game_sessions`: server-issued seed, nonce, signature and timestamps.
- `results`: one result per session with client/server duration and suspicious flag.
- `events`: append-only authentication, attribution, session and result events.

All tables have RLS enabled. Browser reads are restricted to the authenticated application user and chains they belong to. Writes are performed by the Edge Function after Telegram/session verification.

## API

- `POST /auth/telegram` — verifies Telegram `initData`, upserts identity and returns a Supabase token exchange hash.
- `POST /chains` — creates a chain or joins through a member-specific inviter token.
- `GET /chains/:id` — returns chain members and results for an authorized member.
- `POST /game-sessions` — issues signed session data: seed, nonce, signature and server timestamp.
- `POST /game-sessions/:id/results` — validates signature, duration and bounds; stores result.
- `GET /users/me/activity` — returns authorized activity events.

## Minimal anti-cheat

- server-created session UUID;
- random seed;
- nonce;
- HMAC session signature;
- server and client duration comparison;
- score/accuracy bounds;
- suspicious results retained but excluded from chain best result.

## Deployment

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase secrets set TELEGRAM_BOT_TOKEN=... SESSION_SIGNING_SECRET=...
supabase functions deploy api --no-verify-jwt
```

Configure the frontend variables shown in `.env.example`.

## Sprint 3 readiness

The member-specific `share_token` resolves the exact inviter and depth. Sprint 3 can add comparison and feedback UI without changing the database boundaries or API transport.
