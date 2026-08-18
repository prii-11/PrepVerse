# PrepVerse — Design Doc 1: Product Requirements & Domain Model

*Status: Draft for review. Locked decisions so far: real LLM (Gemini 3.6 Flash, free tier, provider-agnostic AI Orchestrator), Node/Express modular monolith, MongoDB Atlas, JWT + bcrypt, REST API versioned at /api/v1/, deterministic backend scoring (LLM output is never the final score).*

---

## 1. Product Requirements

### 1.1 What PrepVerse is

An AI-assisted interview preparation platform for students and early-career candidates preparing for technical roles. The core loop: upload a resume → get a personalized skill profile → practice AI-generated, role-specific interview questions → get structured AI feedback → see the skill profile update → get a smarter next practice session.

The central design principle: **every interview makes the next interview smarter.** PrepVerse is not three independent AI features bolted onto a CRUD app — it's a feedback loop where resume analysis, question generation, and answer evaluation all read from and write to the same evolving skill profile.

### 1.2 Primary user

A student (self-reported target role, e.g. "Backend Developer," experience level "Student/Entry") preparing for technical interviews. Single user type for MVP — no recruiter/admin role yet.

### 1.3 Core user journey (MVP)

```
Sign up → Onboarding (target role, experience level)
   → Upload resume → AI Resume Analysis (skills, strengths, gaps)
   → Personalized Dashboard (readiness score, recommended next action)
   → Practice Interview (AI-generated questions → answers → AI evaluation)
   → Interview Report (scores, strengths, weaknesses, recommendations)
   → Skill profile updates → Next practice plan reflects new weak areas
   → Analytics / Progress view (trend over time)
```

### 1.4 MVP feature set (build this first)

- Auth: signup, login, logout, session persistence (JWT)
- Onboarding: target role + experience level capture
- Resume upload + AI-driven structured analysis (skills, experience, strengths, missing skills)
- AI-generated mock interview (role/skill/difficulty-aware questions, 3–5 per session)
- Answer submission (text) + AI structured evaluation (correctness, technical depth, communication, strengths/weaknesses)
- Deterministic career readiness score (backend formula over LLM sub-scores)
- Interview report view
- Basic progress/analytics view (score trend across sessions)

### 1.5 Explicitly deferred (not MVP)

- Voice/audio answer capture (currently a placeholder — stays a placeholder for MVP)
- Interview scheduling/calendar
- Google OAuth login (currently a placeholder button)
- Background job queue / async processing (only introduce if resume/LLM latency actually requires it — see Design 2)
- Multi-provider LLM routing (implemented as the M5.7 availability failover in `docs/16-ai-failover.md`: Gemini primary preserved, config-driven chain with an optional, capability-gated Groq fallback; first-class routing, load-balancing, or provider-hopping per request remains deferred)

### 1.6 Non-functional requirements

- LLM calls must degrade gracefully on free-tier rate limits (429 handling with exponential backoff — see AI Architecture doc)
- LLM output is untrusted input: every response validated against a strict schema before it touches the database or the user
- Auth: bcrypt-hashed passwords, JWT with expiry, protected-route middleware (currently missing — Phase 1 of implementation)
- No production SLA expected (free-tier LLM + likely free-tier hosting) — acceptable for a portfolio/demo project, should be stated as a known constraint rather than hidden

---

## 2. Domain Model

### 2.1 Entities

```
User
 ├── Profile (target role, experience level, skill profile)
 ├── Resumes[]
 │     └── ResumeAnalysis (embedded — 1:1 with Resume)
 ├── Interviews[]
 │     ├── Questions[] (embedded)
 │     ├── Answers[] (embedded, linked to questionId)
 │     └── Report (embedded — derived after completion)
 └── PracticePlans[] (derived from latest skill profile)
```

### 2.2 Embedding vs. referencing (MongoDB design decisions)

| Relationship | Choice | Why |
|---|---|---|
| User → Resumes | Reference (Resume has `userId`) | Resumes can be re-analyzed/replaced independently; user doc shouldn't grow unbounded |
| Resume → ResumeAnalysis | Embedded in Resume | 1:1, always fetched together, never queried independently |
| User → Interviews | Reference (Interview has `userId`) | Interviews are numerous over time; would bloat User doc if embedded |
| Interview → Questions | Embedded array in Interview | Questions are generated per-interview, never reused or queried standalone |
| Interview → Answers | Embedded array in Interview | Same lifecycle as the interview; always read together |
| Interview → Report | Embedded in Interview (populated on completion) | 1:1, derived from the same interview's data |
| User → Skill Profile | Embedded in User (single evolving document) | Frequently read (every dashboard load), updated after each interview — embedding avoids a join on every page load |

### 2.3 Core entity shapes (conceptual; Design 5 is the persistence source of truth)

**User**
```
User
├── email, passwordHash
├── firstName, lastName
├── profileCompleted
├── targetRole, experienceLevel
├── skillProfile
│     ├── skills[] { skillKey, sources[], assessed, level, evidenceLog[], lastAssessed }
│     ├── skillGaps[]
│     └── readinessScore (deterministic, recalculated after each interview)
└── timestamps
```

**Resume**
```
Resume
├── userId
├── fileRef (storage path/URL)
├── status (UPLOADED | ANALYZED | FAILED)  // PROCESSING is future-only
├── analysis (embedded)
│     ├── extractedSkills[]
│     ├── experienceSummary
│     ├── projects[]
│     ├── strengths[]
│     ├── skillGaps[]
│     └── promptVersion, model
└── timestamps
```

**Interview**
```
Interview
├── userId
├── targetRole, difficulty
├── status (CREATED | IN_PROGRESS | SUBMITTED | EVALUATING | COMPLETED | EVALUATION_FAILED | CANCELLED)
├── questions[] { id, text, category, difficulty, expectedTopics[{ skillKey, topic }] }
├── answers[] { questionId, text, evaluationStatus, evaluation { correctness, technicalDepth, communication, strengths, weaknesses, improvementTip, topicAssessments[] } }
├── report (embedded, populated on COMPLETED)
│     ├── overallScore, technicalScore, communicationScore
│     ├── strengths[], weaknesses[], recommendations[]
├── startedAt, completedAt
└── timestamps
```

**PracticePlan** — derived/generated, not necessarily persisted long-term for MVP; can be computed on-demand from the current skill profile rather than stored. (Open question — see Section 3.)

### 2.4 Interview state machine

```
CREATED → IN_PROGRESS → SUBMITTED → EVALUATING → COMPLETED
                                              ↘ FAILED (LLM error, retried or surfaced to user)
CREATED/IN_PROGRESS → CANCELLED (user abandons)
```

This matters because "answer evaluation" is an LLM call that can fail or be slow — the interview needs an explicit `EVALUATING` state so the frontend can show a loading state honestly instead of blocking on a synchronous call.

### 2.5 Open questions for review

1. Should `PracticePlan` be a persisted collection or computed on-the-fly from `skillProfile`? Persisting gives history ("here's what we recommended last week"); computing keeps things simpler. Leaning toward **compute on-the-fly for MVP**, revisit if "practice plan history" becomes a real feature.
2. Resume storage: local disk (fine for a demo), or a free-tier object storage (e.g. Cloudinary free tier, S3 free tier)? Affects the `fileRef` field and the upload middleware design.
3. Should `rawModelResponse` actually be stored per resume/answer for debugging, or is that overkill for this project's scale? Leaning toward storing it (cheap, MongoDB doesn't care), useful when the LLM's structured output validation fails and you need to see what it actually returned.

---

*Next: Design 2 (System Architecture) and Design 4 (API Contract) — will follow once this is reviewed.*
