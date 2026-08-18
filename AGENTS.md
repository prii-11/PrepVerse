# AGENTS.md — Instructions for coding agents (OpenCode and others)

## Read this first, every session

Before writing or modifying any code in this repo, read `/docs/` in order:

1. `docs/01-requirements-domain.md` — what PrepVerse is, MVP scope, domain entities
2. `docs/02-architecture-api.md` — system architecture, module layout, API contract (v1)
3. `docs/05-database-schema.md` — the authoritative Mongoose schemas
4. `docs/06-security.md` — auth, authorization, AI-specific security rules
5. `docs/07-ai-contracts.md` — the three AI operations: prompts, schemas, validation, retry policy
6. `docs/08-skill-evolution.md` — the skill-assessment algorithm (the core intelligence loop)

**These documents are the source of truth.** `server/` is implemented against the design milestone-by-milestone (M2.1–M4.5 and M5.1–M5.7 CLOSED; see `ROADMAP.md`). `client/` is still the pre-design prototype — it does NOT define the target architecture and awaits frontend integration (M7). Where existing code conflicts with `/docs/`, the docs win. See `ROADMAP.md` for what's been completed.

## Non-negotiable rules (violating these breaks the architecture, not just style)

1. **Gemini never writes to MongoDB.** Every AI response passes through schema validation in `ai/orchestrator.js` before a domain service touches the database. No controller or service calls the Gemini provider directly — always through the orchestrator.

2. **Invalid AI output fails, it does not get silently clamped or coerced.** A score outside `[0,100]`, a wrong array length, a missing required field — these are schema-validation failures that trigger the retry path (`docs/07-ai-contracts.md` §5), not values that get forced into range and persisted anyway.

3. **The frontend does not implement business logic.** No readiness formula, no skill-level calculation, no "can this interview be submitted" check in React. The frontend calls the API and renders what it returns. If you find yourself computing a score or checking a state-transition rule in a `.jsx` file, stop — that belongs in a backend service.

4. **Resource ownership is enforced at the service layer, every time.** Every fetch-by-ID for a Resume or Interview does `findOne({ _id, userId: req.user.id })`, never `findById(_id)` alone. A mismatched owner returns `404`, not `403` (`docs/06-security.md` §2).

5. **`skillKey` is canonical everywhere.** Never match or store skills by free-text name (`"MongoDB"` vs `"Mongo DB"`) — always the canonical key (`"mongodb"`) from the seeded `RoleSkillCatalog`. This applies to `currentSkillProfile`, `topicAssessments`, and `RoleSkillCatalog` itself.

6. **`Interview.status` and `questionGeneration.status` are separate fields.** Do not conflate interview lifecycle with AI-prep-work status. Likewise, `profileSyncStatus` lives at `Interview.report.profileSyncStatus` — it is NOT a top-level `Interview` field, and it does NOT block `Interview.status` from reaching `COMPLETED` (`docs/08-skill-evolution.md` §9 — this was a corrected design decision, don't regress it).

7. **State-transition endpoints are idempotent.** `submit`, `start`, `cancel` etc. check current status before transitioning (ideally via a single atomic `findOneAndUpdate({ _id, status: <expected> }, ...)`, not read-then-write) and return `409 Conflict` on an invalid transition, never a silent no-op or a duplicate side effect.

8. **`AIExecution` logs are sanitized in every environment**, dev included — never raw resume text, raw answers, or unrestricted model output. Structured summaries only.

9. **`SkillProfileService` writes use a MongoDB transaction** to protect against concurrent interview evaluations racing on the same user's `currentSkillProfile` (`docs/08-skill-evolution.md` §8).

## Standing rule for every milestone

Don't improvise architecture, even locally. If a design doc is ambiguous or two docs disagree, STOP and report the ambiguity rather than picking an interpretation and proceeding — this repo has already been through several rounds of catching exactly this kind of drift, and it's cheaper to ask than to build the wrong thing and unwind it later. Each milestone's own master prompt states its specific scope boundaries (what NOT to touch this phase); treat those as hard constraints, not suggestions.

## Where things go

Follow the module layout in `docs/02-architecture-api.md` §2.1:
```
server/src/modules/{auth,users,resumes,interviews,analytics}/
server/src/ai/{orchestrator.js, providers/gemini.js, resumeAnalyzer.js, questionGenerator.js, answerEvaluator.js, schemas/}
server/src/middleware/{auth,error,rateLimit,upload}.js
```
Each module: `controller → service → routes → validation`. Controllers are thin — validation and business logic live in services, not controllers.

## Current status

See `ROADMAP.md` for what exists and what's next. Backend milestones M2.1–M4.5 and M5.1–M5.7 are CLOSED (M5.7 = AI provider failover per `docs/16`); the current milestone is M6 (Storage — Supabase resume upload/download per `docs/06`). `client/` remains the pre-design prototype — don't assume it matches the design.


## Canonical design rule

The files under `docs/` are the implementation source of truth. Do not infer a
new architecture from stale code, old comments, or generated summaries.

If two canonical docs appear to contradict each other, STOP and report the
contradiction before implementing it. Do not silently choose one.

The final MVP auth strategy is stateless short-lived JWT. There is no
RefreshToken collection, refresh cookie, refresh-token rotation, or server-side
JWT blacklist.

For skill evolution, preserve the aggregation boundary:
`topic → skill` = AnswerEvaluator,
`skill → interview` = backend normalization,
`interview → profile` = SkillProfileService.
