# signalMOMENT v2 — Integration Backlog

**Version:** 1.0  
**Status:** MASTER IMPLEMENTATION DOCUMENT  
**Master issue:** #3

## Purpose

Every idea, research result, repository and reference must pass through:

```text
Research
→ Extract
→ Product Decision
→ GitHub Issue
→ Sprint
→ Pull Request
→ Production
```

No finding is considered integrated while it exists only in notes.

## Status model

| Status | Meaning |
|---|---|
| BACKLOG | Idea captured, not yet analysed |
| REVIEW | Analysis completed or in validation |
| READY | Clear scope and acceptance criteria; eligible for a sprint |
| IN SPRINT | Active implementation |
| IN PR | Pull Request exists |
| MERGED | Included in the target branch |
| DEPLOYED | Running and runtime-verified for users |

A sprint may contain only READY items.

## Product invariant

```text
CHAIN — primary entity
GAME — event inside a chain
RESULT — proof of participation
SHARE — continuation mechanism
```

Current loop:

```text
OPEN → PLAY → RESULT → SHARE
```

Target loop:

```text
OPEN
→ AUTH
→ CHAIN
→ GAME
→ RESULT
→ INVITE
→ FRIEND
→ COMPARISON
→ CHAIN UPDATE
→ NEXT INVITE
```

## Active GitHub map

| Area | Issue | Status | Target |
|---|---:|---|---|
| Integration governance | #3 | READY | Continuous |
| Interactive references | #4 | BACKLOG | Sprint 4+ |
| Telegram experience | #5 | REVIEW | Sprint 3 |
| Runtime vertical slice | #6 | READY | Sprint 3 |
| Chain product surface | #7 | READY after runtime | Sprint 4 |
| Motion and UI polish | #8 | BACKLOG | Sprint 4 |
| Audio feedback | #9 | BACKLOG | Sprint 5+ |
| Social retention | #10 | BACKLOG | Sprint 5 |
| Analytics and viral measurement | #11 | READY after runtime | Sprint 5 |
| Repository / AI Factory intake | #12 | READY | Continuous |

## 1. Product Research — Interactive Experience

**Issue:** #4  
**Status:** BACKLOG

Sources:

- Awwwards
- Bruno Simon
- In Pieces
- Species in Pieces
- The Boat
- Utsubo
- Gucci Off The Grid

Extract only reusable principles:

- motion;
- onboarding;
- storytelling;
- transitions;
- interaction;
- navigation;
- immersion.

Required output for each pattern:

```text
Source
→ What works
→ Why it works
→ signalMOMENT adaptation
→ Complexity
→ Priority
→ Issue
→ PR
→ Runtime evidence
```

Do not copy visual identity or proprietary assets.

## 2. Telegram Experience

**Issue:** #5  
**Status:** REVIEW

Scope:

- haptic and vibration;
- fullscreen and orientation;
- sharing;
- `start_param`;
- invite flow;
- loading;
- reconnect;
- fallback outside Telegram.

Security rule: `initDataUnsafe` is UI-only. Server identity must be based on verified `initData`.

## 3. Viral Loop

Primary release gate is issue #6.

```text
A plays
→ creates or joins chain
→ receives member share token
→ invites B
→ B is attributed to A
→ B sees A result
→ B plays
→ B result persists
→ A receives participation feedback
→ B passes the signal onward
```

The viral hypothesis is not proven until this loop works on two real Telegram accounts without mocks or manual database changes.

## 4. Chain

**Issue:** #7

Required product surface:

- lifecycle and expiration;
- participant count and depth;
- comparison;
- participant cards;
- statistics;
- activity feed;
- history;
- accepted challenge feedback.

All displayed state must come from verified server entities or events.

## 5. Motion System

**Issue:** #8

Candidate areas:

- transitions;
- particle systems;
- countdown;
- score reveal;
- victory;
- share animation;
- loading and reconnect.

Motion is accepted only when it improves comprehension, feedback, emotion at a key product moment, or chain continuation.

## 6. Audio

**Issue:** #9

Candidate events:

- click;
- hit;
- chain growth;
- invitation;
- victory;
- ambient state.

Audio remains optional, respects device state and Telegram/browser restrictions, and cannot block Sprint 3.

## 7. Backend

**Implementation:** PR #2  
**Code status:** IN PR

Implemented in repository:

- Telegram Auth ✅
- Chain ✅
- Chain membership and inviter attribution ✅
- Signed game session ✅
- Result persistence and validation ✅
- Events ✅
- RLS foundation ✅

The status becomes DEPLOYED only after:

- Supabase migration applied;
- Edge Function deployed;
- secrets configured;
- frontend environment configured;
- two-account runtime verification completed.

## 8. Social and Retention

**Issue:** #10

Backlog:

- accepted challenge;
- chain growth;
- comeback;
- streak;
- rejoin;
- notification eligibility;
- throttling and frequency caps.

Every social message must be triggered by a verified event and measured for effect.

## 9. Analytics

**Issue:** #11

Minimum funnel:

```text
Open
→ Verified auth
→ Game start
→ Game completion
→ Share
→ Invite open
→ Attribution
→ Friend game
→ Chain continuation
```

Minimum metrics:

- completion rate;
- replay rate;
- share rate;
- invite-open conversion;
- friend-play conversion;
- chain continuation rate;
- D1/D7 retention.

Each metric requires event source, numerator, denominator, query and decision threshold.

## 10. UI Polish Intake

Every proposal must record:

| Field | Required |
|---|---|
| Source | Yes |
| What was observed | Yes |
| Why it works | Yes |
| Adaptation for signalMOMENT | Yes |
| Complexity | Yes |
| Priority | Yes |
| GitHub Issue | Before READY |
| Pull Request | Before IN PR |
| Runtime evidence | Before DEPLOYED |

## 11. Repository Research

Managed by issue #12.

Required record:

```text
Repository
→ Extracted pattern
→ Product benefit
→ Product decision
→ Implementation location
→ License / risk
→ Complexity
→ Priority
→ Issue
→ PR
→ Runtime verification
```

Do not add a dependency merely because a repository is interesting.

## 12. AI Factory Research

Managed by issue #12.

Only implementation-oriented records are allowed:

```text
Pattern
→ Benefit
→ Implementation
→ Quality gate
→ Issue
→ PR
```

Reject multi-agent theatre, documentation growth without execution, autonomous self-improvement without approval, and infrastructure that does not support the active product loop.

## 13. Sprint Planner

### Sprint 3 — Runtime Social Chain

**Gate:** #6  
**Status:** READY

- Supabase runtime deployment;
- verified Telegram identity;
- chain runtime;
- two-account test;
- invite attribution;
- comparison;
- event feedback.

### Sprint 4 — Chain Experience

**Sources:** #4, #7, #8  
**Status:** BACKLOG until Sprint 3 runtime passes

- chain activity and history;
- participant cards;
- comparison UI;
- focused motion;
- UI polish.

### Sprint 5 — Retention and Measurement

**Sources:** #9, #10, #11  
**Status:** BACKLOG

- analytics baseline;
- notification experiments;
- comeback and rejoin;
- viral-loop improvements;
- optional audio after value validation.

## Research intake template

```md
### Source

### Extracted pattern

### Evidence

### Product benefit

### Product decision
- [ ] Apply
- [ ] Adapt later
- [ ] Reject

### Implementation location

### Complexity
- [ ] S
- [ ] M
- [ ] L

### Priority
- [ ] P0
- [ ] P1
- [ ] P2
- [ ] P3

### Target sprint

### GitHub issue

### Pull request

### Deployment

### Runtime verification
```

## Definition of Done

An idea is complete only after:

```text
Research
→ Integration Backlog
→ GitHub Issue
→ Sprint
→ Pull Request
→ Review
→ Merge
→ Deploy
→ Runtime Verification
→ Production
```

`MERGED` is not `DEPLOYED`.  
`DEPLOYED` without runtime verification is not complete.
