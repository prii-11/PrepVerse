# PrepVerse

**AI-Powered Mock Interview Ecosystem** — A comprehensive platform for technical interview preparation featuring intelligent resume analysis, adaptive question generation, real-time answer evaluation, and continuous skill evolution tracking.

---

## Overview

PrepVerse helps candidates prepare for technical interviews through an AI-driven pipeline that analyzes resumes, generates role-specific questions, evaluates answers with rubric-based scoring, and tracks skill progression over time using a statistically grounded evolution algorithm.

**Current Status**: Backend milestones M2.1–M6 complete. Frontend (M7) in active development.

---

## System Flow

```mermaid
flowchart TD
    %% User Actions
    U[User] -->|Upload Resume| RU[Resume Upload]
    U -->|Configure Interview| IC[Interview Config]
    U -->|Submit Answers| IA[Answer Submission]
    U -->|View Analytics| AR[Analytics Request]

    %% Resume Pipeline
    RU --> RUL[Upload Validation<br/>Type/Size/Sniff]
    RUL --> RE[Text Extraction]
    RE -->|Azure DI| ADI[Azure Document Intelligence]
    RE -->|Local Fallback| LF[pdf-parse / mammoth]
    ADI --> EX[Extracted Text]
    LF --> EX
    EX --> RA[Resume Analyzer<br/>AI Orchestrator]
    RA -->|Validated| RS[RoleSkillCatalog<br/>Canonical skillKeys]
    RA -->|Persisted| RP[Resume Document<br/>profileSyncStatus]

    %% Interview Pipeline
    IC --> IV[Interview Validation]
    IV --> IQ[Question Generator<br/>AI Orchestrator]
    IQ -->|Validated| QS[Questions + Metadata]
    QS --> IS[Interview Created<br/>status: CREATED]

    IS -->|Start| IP[Interview IN_PROGRESS]
    IP --> IA
    IA --> AE[Answer Evaluator<br/>AI Orchestrator]
    AE -->|Validated| EV[Evaluation + TopicAssessments]
    EV -->|Per Answer| ANS[Answer Document<br/>evaluation.status]
    
    %% Submission & Sync
    IA -->|Submit| SUB[Submit Endpoint<br/>Atomic CAS]
    SUB --> EVL[Full Evaluation<br/>All Answers]
    EVL --> REP[Report Generation<br/>strengths/weaknesses/recommendations]
    REP --> SYNC[SkillProfileService<br/>MongoDB Transaction]
    SYNC -->|Update| CSP[User.currentSkillProfile<br/>EWMA + Confidence]
    SYNC -->|Mark| RSY[report.profileSyncStatus<br/>COMPLETED/FAILED]
    RSY --> COMP[Interview COMPLETED]

    %% Analytics Pipeline
    AR --> READ[ReadinessService<br/>Computed on Read]
    READ -->|Aggregates| CSP
    READ -->|Scores| RB[Readiness Breakdown<br/>technical/communication/coverage/consistency/trend]
    READ -->|Returns| API[Analytics Response<br/>score + breakdown + interviewCount]

    %% Cross-cutting
    RA -.->|Logs| AIL[AIExecution<br/>Sanitized]
    IQ -.->|Logs| AIL
    AE -.->|Logs| AIL
    SUB -.->|Idempotent| CAS[findOneAndUpdate<br/>409 on Conflict]
    SYNC -.->|Transactions| TXN[MongoDB Transaction]

    %% Auth
    U -->|Register/Login| AUTH[Auth Module<br/>JWT Issuance]
    AUTH -.->|Middleware| ALL[All Protected Routes]
    ALL -.->|Ownership| OWN[findOne {_id, userId}]
    
    classDef user fill:#e3f2fd,stroke:#1976d2,stroke-width:2px;
    classDef ai fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px;
    classDef data fill:#e8f5e9,stroke:#388e3c,stroke-width:2px;
    classDef process fill:#fff3e0,stroke:#f57c00,stroke-width:2px;
    classDef security fill:#ffebee,stroke:#c62828,stroke-width:2px;

    class U user;
    class RA,IQ,AE,ADI,LF ai;
    class RS,RP,CSP,REP,ANS,RB data;
    class RUL,RE,EX,IV,QS,IS,IP,EVL,SUB,EV,SYNC,READ,CAS,TXN process;
    class AUTH,ALL,OWN security;
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        PrepVerse Architecture                    │
├─────────────────────────────────────────────────────────────────┤
│  Client (React + Vite + Tailwind)                               │
│  └── Services: auth, resume, interview, analytics               │
├─────────────────────────────────────────────────────────────────┤
│  API Gateway (Express)                                          │
│  ├── Auth Middleware (JWT)                                      │
│  ├── Rate Limiting                                              │
│  └── Error Handling                                             │
├─────────────────────────────────────────────────────────────────┤
│  Domain Modules                                                 │
│  ├── auth/        → Registration, login, JWT issuance           │
│  ├── users/       → Profile, currentSkillProfile                │
│  ├── resumes/     → Upload, extraction, analysis, sync          │
│  ├── interviews/  → Lifecycle, questions, answers, reports      │
│  └── analytics/   → Readiness, trends, weak areas               │
├─────────────────────────────────────────────────────────────────┤
│  AI Pipeline (Orchestrator Pattern)                             │
│  ├── orchestrator.js      → Validation gate, retry, failover    │
│  ├── providers/gemini.js  → Primary LLM provider                │
│  ├── resumeAnalyzer.js    → Skill extraction, experience level  │
│  ├── questionGenerator.js → Adaptive question generation        │
│  ├── answerEvaluator.js   → Rubric scoring, topic assessment    │
│  └── schemas/             → Zod contracts for all AI I/O        │
├─────────────────────────────────────────────────────────────────┤
│  Storage & Extraction                                           │
│  ├── azure.di.extractor.js  → Azure Document Intelligence       │
│  ├── textExtractor.js       → Local fallback (pdf-parse, mammoth)│
│  └── config/di.js           → Provider abstraction              │
├─────────────────────────────────────────────────────────────────┤
│  Data Layer (MongoDB + Mongoose)                                │
│  ├── User, Resume, Interview, RoleSkillCatalog, AIExecution     │
│  └── Transactions for skill profile updates                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Features

### Resume Analysis (M3)
- **Multi-format upload**: PDF, DOCX, TXT with type/size validation
- **Azure Document Intelligence**: Layout-aware extraction with confidence scoring, table/formula detection
- **Local fallback**: pdf-parse + mammoth for resilience
- **AI-powered skill extraction**: Maps to canonical `RoleSkillCatalog` skillKeys
- **Profile sync tracking**: `PENDING → SYNCED/FAILED` with structured logging

### Interview System (M4)
- **Configuration**: Role, level, duration, topic distribution
- **Question generation**: AI-generated with difficulty calibration per topic
- **Answer evaluation**: Rubric-based scoring (0–100) with evidence citations
- **Lifecycle**: `CREATED → IN_PROGRESS → COMPLETED/CANCELLED`
- **Idempotent transitions**: Atomic `findOneAndUpdate` with `409 Conflict` on invalid moves

### Skill Evolution (M5)
- **Aggregation pipeline**: Topic → Skill → Interview → Profile
- **EWMA updates**: Exponentially weighted moving average with confidence weighting
- **Readiness scoring**: 0–100 per role with band classification (Not Ready → Strong)
- **Concurrency protection**: MongoDB transactions on `currentSkillProfile`
- **Canonical skillKeys**: No free-text matching anywhere

### AI Infrastructure (M5.1–M5.7)
- **Orchestrator validation gate**: Every AI response passes Zod schema validation before persistence
- **Retry policy**: Max 2 retries with exponential backoff on validation failure
- **Provider failover**: Gemini primary → fallback provider
- **Sanitized logging**: `AIExecution` stores structured summaries only (no PII/raw output)
- **Fail-fast**: Invalid AI output (out-of-range scores, wrong array lengths, missing fields) triggers retry, never silent coercion

---

## Design Principles (Non-Negotiable)

| Principle | Enforcement |
|-----------|-------------|
| **Gemini never writes to MongoDB** | Orchestrator validates every AI response via Zod before any service touches DB |
| **Invalid AI output fails fast** | Schema validation failures trigger retry path; no clamping/coercion |
| **Frontend is thin** | Zero business logic in React — no readiness formula, no skill calc, no state checks |
| **Ownership at service layer** | Every fetch: `findOne({ _id, userId: req.user.id })`; mismatch returns `404` |
| **skillKey is canonical** | All skill references use seeded `RoleSkillCatalog` keys (e.g., `mongodb`) |
| **Status separation** | `Interview.status` ≠ `questionGeneration.status` ≠ `report.profileSyncStatus` |
| **Idempotent transitions** | Atomic compare-and-swap; `409 Conflict` on invalid state change |
| **Sanitized AI logs** | `AIExecution` stores structured metadata only — dev included |
| **Transactions for skills** | `SkillProfileService` writes use MongoDB transactions |

---

## Tech Stack

**Backend**
- Node.js 20+, Express 5
- MongoDB 8 + Mongoose
- Google Gemini (`@google/generative-ai`)
- Azure Document Intelligence (`@azure/ai-form-recognizer`)
- Zod for schema validation
- JWT (stateless, short-lived, no refresh tokens)

**Frontend**
- React 19 + Vite 7
- Tailwind CSS 4
- React Router 7
- Axios + Vitest + Testing Library

**Testing**
- Node native test runner (backend)
- Vitest + jsdom (frontend)
- MongoDB Memory Server for integration tests

---

## Getting Started

### Prerequisites
- Node.js 20+
- MongoDB 6+ (local or Atlas)
- Google Gemini API key
- Azure Document Intelligence endpoint/key (optional — local fallback available)

### Environment Variables

**Server** (`server/.env`)
```env
PORT=4000
MONGODB_URI=mongodb://localhost:27017/prepverse
JWT_SECRET=your-secret-min-32-chars
GEMINI_API_KEY=your-gemini-key
AZURE_DI_ENDPOINT=https://<resource>.cognitiveservices.azure.com/
AZURE_DI_KEY=your-azure-key
```

**Client** (`client/.env`)
```env
VITE_API_BASE=http://localhost:4000/api/v1
```

### Install & Run

```bash
# Backend
cd server && npm install && npm run dev

# Frontend (separate terminal)
cd client && npm install && npm run dev
```

### Run Tests

```bash
# Backend
cd server && npm test

# Frontend
cd client && npm test
```

---

## API Contract (v1)

Base: `/api/v1`

| Module | Endpoints |
|--------|-----------|
| **Auth** | `POST /auth/register`, `POST /auth/login` |
| **Users** | `GET /users/me`, `PATCH /users/me` |
| **Resumes** | `POST /resumes`, `GET /resumes`, `GET /resumes/:id`, `DELETE /resumes/:id`, `POST /resumes/:id/analyze`, `GET /resumes/:id/sync-status` |
| **Interviews** | `POST /interviews`, `GET /interviews`, `GET /interviews/:id`, `POST /interviews/:id/start`, `POST /interviews/:id/answer`, `POST /interviews/:id/submit`, `POST /interviews/:id/cancel` |
| **Analytics** | `GET /analytics/readiness/:roleKey`, `GET /analytics/skill-trends`, `GET /analytics/weak-areas` |

Full spec: [`docs/02-architecture-api.md`](docs/02-architecture-api.md)

---

## Project Structure

```
PrepVerse/
├── client/                 # React frontend (M7 in progress)
│   ├── src/
│   │   ├── components/     # ui/, layout/, charts/, interviews/, resumes/
│   │   ├── pages/          # Home, Interviews, Practice, Profile, Progress, ResumeAnalysis
│   │   ├── services/       # API clients + mock data
│   │   ├── routes/         # AppRoutes, ProtectedRoute
│   │   └── utils/
│   └── package.json
├── server/                 # Express backend (M2.1–M6 complete)
│   ├── src/
│   │   ├── ai/             # orchestrator, providers, analyzers, generators, evaluators, schemas
│   │   ├── config/         # env, di
│   │   ├── middleware/     # auth, error, rateLimit, upload
│   │   ├── modules/        # auth, users, resumes, interviews, analytics
│   │   ├── storage/        # textExtractor, azure.di.extractor
│   │   └── server.js
│   ├── tests/              # Unit + integration tests per milestone
│   └── package.json
├── docs/                   # Canonical design documents (source of truth)
│   ├── 01-requirements-domain.md
│   ├── 02-architecture-api.md
│   ├── 05-database-schema.md
│   ├── 06-security.md
│   ├── 07-ai-contracts.md
│   ├── 08-skill-evolution.md
│   ├── 16-ai-provider-failover.md
│   ├── 17-storage-abstraction.md
│   ├── 20-m7-p4-interview-recon.md
│   └── 21-azure-di-extraction-audit.md
└── ROADMAP.md              # Milestone tracking
```

---

## Documentation

The [`docs/`](docs/) directory is the **single source of truth** for architecture and design. Implementation must match these documents.

| Doc | Purpose |
|-----|---------|
| [01-requirements-domain.md](docs/01-requirements-domain.md) | MVP scope, domain entities, user journeys |
| [02-architecture-api.md](docs/02-architecture-api.md) | System architecture, module layout, API contract |
| [05-database-schema.md](docs/05-database-schema.md) | Authoritative Mongoose schemas |
| [06-security.md](docs/06-security.md) | Auth, authorization, AI-specific security |
| [07-ai-contracts.md](docs/07-ai-contracts.md) | Three AI operations: prompts, schemas, validation, retry |
| [08-skill-evolution.md](docs/08-skill-evolution.md) | Core intelligence loop: topic→skill→interview→profile |
| [ROADMAP.md](ROADMAP.md) | Milestone status and upcoming work |

---

## Milestone Status

| Milestone | Scope | Status |
|-----------|-------|--------|
| M2.1–M2.3 | Auth, Users, Core Infrastructure | ✅ Complete |
| M3 | Resume Upload & Analysis | ✅ Complete |
| M4 | Interview Lifecycle & Questions | ✅ Complete |
| M5.1–M5.6 | AI Pipeline, Skill Evolution, Readiness | ✅ Complete |
| M5.7 | AI Provider Failover | ✅ Complete |
| M6 | Storage Abstraction & Azure DI | ✅ Complete |
| M7 | Frontend Integration | 🚧 In Progress |

See [ROADMAP.md](ROADMAP.md) for detailed breakdown.

---

## Contributing

1. Read the relevant design doc in [`docs/`](docs/) before starting work
2. Follow the module layout: `controller → service → routes → validation`
3. Controllers are thin — business logic lives in services
4. All AI output passes through `ai/orchestrator.js` validation
5. Run tests and lint before committing

---

## License

ISC — See individual package.json files for details.