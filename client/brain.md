# Brain

Single-source architecture notes for the client app. This document is intentionally conservative: if something is not present in the repository, it is marked as unknown instead of inferred.

## Project Purpose

The project is an AI mock interview ecosystem for candidates preparing for technical roles. It guides a user through landing, authentication, resume upload and analysis, interview setup, live practice, feedback review, practice planning, progress tracking, and a profile/dashboard experience.

Primary users appear to be students or job candidates. The UX is centered on improving interview readiness through guided practice and score/feedback surfaces.

## High-Level Architecture

The workspace currently contains only a React client. There is no checked-in backend application, database schema, or CI/CD system.

Core runtime shape:

`main.jsx -> App.jsx -> AuthProvider + UserProvider -> AppRoutes -> layout/page components -> reusable feature components`

Routing is handled by React Router. Authenticated screens are protected by `ProtectedRoute`, which reads auth state from `AuthContext`. The authenticated shell uses `MainLayout` with shared navbar, sidebar, content outlet, and footer. Public auth screens use `AuthLayout`. The landing page is separate at `/`.

The app uses a mock-first service layer. `src/services/*.js` exposes asynchronous functions that resolve demo data through `createMockResponse`. `src/services/api.js` is an Axios client prepared for a future backend, but the repository does not currently include a real API server.

## Folder Responsibilities

- `src/pages/`: Route-level screens for landing, auth, dashboard, profile, resume, interview, practice, progress, and reports.
- `src/components/`: Reusable UI grouped by feature area (`common`, `dashboard`, `interview`, `landing`, `practice`, `report`, `resume`).
- `src/layouts/`: App shells for public auth pages and protected app pages.
- `src/routes/`: Router definition and route guard.
- `src/context/`: Global client state for auth and user/profile data.
- `src/hooks/`: Thin context hooks, mainly `useAuth`.
- `src/services/`: Mock API/service wrappers and the shared Axios client.
- `src/utils/`: Constants, helper utilities, and landing theme tokens.
- `src/assets/`: Static assets.
- `public/`: Static public assets for Vite.
- `.vscode/`: Workspace task configuration.
- `dist/`: Vite build output, generated artifact.

## Technology Stack

- Language: JavaScript + JSX
- Framework: React 19.1.0
- Build tool: Vite 7.0.4
- Router: react-router-dom 7.7.1
- Styling: Tailwind CSS 4.1.11 with `@tailwindcss/vite`
- Animation: Framer Motion 12.40.0
- HTTP client: Axios 1.11.0
- Icons: lucide-react 1.17.0
- Utility helpers: clsx 2.1.1, tailwind-merge 3.6.0

No database or server framework is present in the workspace.

## Dependency Graph

- `src/main.jsx` mounts `App` and imports global CSS.
- `src/App.jsx` composes `AuthProvider` and `UserProvider` around the router tree.
- `src/routes/AppRoutes.jsx` resolves public and protected pages.
- `src/routes/ProtectedRoute.jsx` reads `AuthContext` and redirects unauthenticated users to `/login`.
- `src/layouts/MainLayout.jsx` renders shared shell UI for protected pages.
- `src/layouts/AuthLayout.jsx` centers auth forms.
- `src/context/AuthContext.jsx` stores auth session data in `localStorage`.
- `src/context/UserContext.jsx` stores a seeded profile object in component state.
- `src/services/api.js` injects `auth_token` into Axios requests when present.
- `src/services/*.js` currently return demo payloads rather than making real network calls.

## Execution Flow

1. Vite loads `index.html` and mounts React in `src/main.jsx`.
2. `App` wraps the app in auth and user providers.
3. `AppRoutes` selects the landing page, auth pages, or protected application shell.
4. On first load, `AuthContext` reads `auth_token` and `auth_user` from `localStorage`.
5. `ProtectedRoute` blocks protected routes until auth state is known and redirects unauthenticated users.
6. Auth pages call `auth.login()` or `auth.signup()`, which persist demo data to `localStorage` and update context.
7. Protected pages render feature cards and forms backed by demo constants and mock services.

## Request Lifecycle

There is no true backend request lifecycle yet. The closest current flow is user-action driven:

- User submits a login/signup/resume/interview action.
- The page component calls a context method or mock service.
- The mock service resolves a synthetic payload immediately.
- Auth data may be stored in `localStorage`.
- The UI navigates to the next page or updates local component state.

If a future backend is added, `src/services/api.js` is already prepared to send a bearer token from `localStorage`.

## Data Flow Overview

- Landing page: static composition only, no data persistence.
- Auth flow: form input -> page handler -> `AuthContext` -> `localStorage` -> protected route access.
- User profile flow: `UserContext` seeds demo profile data and exposes `updateProfile`, but no backend save exists.
- Resume flow: upload and analysis UI -> mock service / placeholder card -> demo score and suggestions.
- Interview flow: setup screen -> mock interview service -> live interview UI widgets -> mock answer submission and feedback.
- Practice/report flow: pages render demo lists and cards from constants or mock service responses.

## Database Design

No database schema, migrations, ORM models, or persistence layer are present.

Known data structures are in-memory/demo only:

- `AuthContext.user`
- `UserContext.profile`
- `DEMO_USER`, `DEMO_WEAK_AREAS`, `DEMO_STEPS`
- mock response payloads from service modules

Relationships, indexes, and storage strategy are unknown because no database exists in the repository.

## API Contracts

There are no live API endpoints defined in the workspace.

Known service contracts are client-side mocks:

- `authService.login(credentials)` -> `{ token, user }`
- `authService.signup(payload)` -> `{ token, user }`
- `authService.logout()` -> `{ success }`
- `interviewService.startInterview()` -> `{ interviewId, questions }`
- `interviewService.submitAnswer()` -> `{ score, feedback }`
- `practiceService.getPracticePlan()` -> `{ days }`
- `reportService.getInterviewReport()` -> `{ overallScore, strengths, weaknesses, feedback }`
- `resumeService.uploadResume()` -> `{ message }`
- `resumeService.analyzeResume()` -> `{ score, strengths, suggestions }`

`src/services/api.js` creates an Axios client with `baseURL = import.meta.env.VITE_API_BASE_URL || 'https://api.example.com'` and adds `Authorization: Bearer <auth_token>` when a token exists.

## Key Algorithms & Business Logic

- Auth state is accepted when both `auth_token` and `auth_user` exist in `localStorage`.
- Login and signup are demo-only; they store synthetic token/user payloads and route to the dashboard.
- Password confirmation on signup is validated client-side with a simple equality check.
- `InterviewProgress` derives completion percent as `Math.round((current / total) * 100)`.
- `ProgressGraph` and other dashboard widgets render simple demo metrics.
- `formatPercent` clamps numeric values between 0 and 100.

Most business logic is presentational or demo-only; no scoring engine, AI evaluation pipeline, or persistence workflow is implemented.

## Configuration

Verified config files:

- `package.json`: package metadata, dependencies, and scripts.
- `vite.config.js`: Vite plugins for React and Tailwind.
- `.vscode/tasks.json`: workspace task for `npm run dev`.
- `src/index.css`: global Tailwind entry and base theme.

No `.env` file is present in the repository.

## Environment Variables

Only one environment variable reference is present in code:

- `VITE_API_BASE_URL` in `src/services/api.js`

Default behavior:

- If unset, Axios uses `https://api.example.com`.

Unknowns:

- Required production values are not documented in the repo.
- No env schema or example file exists.

## Coding Standards

Observed conventions:

- Functional React components.
- Hooks for local state and context access.
- Tailwind utility classes for layout and styling.
- Small, single-purpose components grouped by feature.
- Descriptive inline comments in a few places, mostly for animation and UI intent.

No ESLint, Prettier, or TypeScript config is present, so lint/format rules are unknown.

## Naming Conventions

- Files and folders use PascalCase for React components and feature pages.
- Hooks use `use*` naming.
- Constants live in `src/utils/constants.js`.
- Service modules use domain names such as `authService`, `interviewService`, `resumeService`.
- Route labels and navigation labels use human-readable names.

## Reusable Patterns

- Context providers for global state (`AuthContext`, `UserContext`).
- Route guarding with `ProtectedRoute`.
- Layout wrappers for shell reuse (`AuthLayout`, `MainLayout`).
- Feature folders containing a page component plus smaller cards/widgets.
- Mock services using `createMockResponse` to keep async signatures stable.
- Shared UI primitives in `src/components/common`.

## Error Handling

Current handling is minimal:

- Signup shows a browser alert when passwords do not match.
- `ProtectedRoute` redirects unauthenticated users.
- `AuthContext` uses `loading` to avoid rendering before auth state is checked.

There is no centralized error boundary, toast system, structured logging, or monitoring integration in the repository.

## Security Practices

Present:

- Protected routes require a locally stored auth token/user pair.
- Axios automatically attaches a bearer token when available.
- Auth and profile data remain client-side only.

Missing or unknown:

- Server-side authorization.
- Token refresh.
- Password hashing.
- Input sanitization beyond native form validation and a few required fields.
- CSRF/XSS hardening at the backend layer.

Security is not production-grade yet because the app has no backend and relies on demo-localStorage auth.

## Performance Considerations

Helpful choices already present:

- Vite for fast local development and bundling.
- Feature-based component splitting.
- Route-level separation between landing, auth, and protected areas.
- Static mock data keeps rendering simple.

Potential bottlenecks or trade-offs:

- No caching layer or server-side pagination because no backend exists.
- Animations are everywhere, so low-end device performance should be checked.
- Mixed visual treatments exist between the light olive design system and a few darker interview widgets.

## External Integrations

Verified integrations:

- React Router
- Framer Motion
- Tailwind CSS
- Axios
- Lucide icons

Not present in the repository:

- Authentication provider integration
- Audio capture service
- Resume parsing service
- AI/LLM provider
- Email, storage, queue, analytics, payments, or subscriptions

## Testing Strategy

No automated tests are present in the workspace.

Unknown:

- Test framework.
- Coverage targets.
- Component or integration test location.

## CI/CD Pipeline

No CI/CD configuration is present in the repository.

Unknown:

- Build/test/lint steps in CI.
- Security scanning.
- Deployment automation.
- Release or rollback process.

## Deployment

The app is currently a frontend Vite project. A likely deployment target would be static hosting, but that is not documented in the repo.

Unknown:

- Hosting provider.
- Production environment configuration.
- Scaling strategy.
- Monitoring/alerting.
- Rollback process.

## Common Commands

Available package scripts from `package.json`:

- `npm run dev` - start the Vite development server.
- `npm run build` - build the client for production.
- `npm run preview` - preview the built app.

Workspace task:

- `dev:client` in `.vscode/tasks.json` runs `npm run dev` via `npm.cmd` on Windows.

Missing or unknown:

- `test`
- `lint`
- `seed`
- `migrate`
- `deploy`

## Important Files

- `src/main.jsx`: React entry point.
- `src/App.jsx`: provider composition.
- `src/routes/AppRoutes.jsx`: full route map.
- `src/routes/ProtectedRoute.jsx`: auth gate.
- `src/context/AuthContext.jsx`: auth persistence in localStorage.
- `src/context/UserContext.jsx`: demo profile state.
- `src/services/api.js`: Axios client and token injection.
- `src/services/*.js`: mock domain services.
- `src/utils/constants.js`: routes, app name, demo data.
- `src/utils/helpers.js`: shared helper functions.
- `src/utils/landingTheme.js`: landing theme tokens.
- `src/layouts/MainLayout.jsx`: authenticated shell.
- `src/layouts/AuthLayout.jsx`: auth shell.
- `src/components/landing/*`: landing page visuals.
- `src/components/common/*`: reusable primitives.
- `src/index.css`: global theme and Tailwind entry.
- `vite.config.js`: build configuration.
- `package.json`: dependencies and scripts.

## Known Limitations

- No real backend exists in the repository.
- No database schema or persistence layer exists.
- Most user journeys are demo-backed or placeholder-based.
- No automated tests or CI/CD are configured.
- No documented production deployment path exists.
- Visual design is not perfectly uniform across all screens; most of the app follows the white-and-olive system, while some interview widgets still use darker surfaces.

## Assumptions & Unknowns

Assumptions made from code only:

- The project is intended to be a mock interview product for candidates.
- `localStorage` is the current source of truth for auth session persistence.
- `UserContext` profile values are seeded demo data, not synced from a backend.

Unknowns that cannot be verified from the repo:

- Real backend framework and server location.
- Database type, schema, and migrations.
- Production AI model/provider.
- Deployment target and CI/CD pipeline.
- Testing policy and coverage expectations.

## Maintenance Guidelines

- Keep route names, constants, and demo data in `src/utils/constants.js` synchronized with router changes.
- Preserve the provider order in `App.jsx` unless auth/user state ownership changes.
- When adding real backend calls, replace mock service bodies first and keep the Axios client token interceptor intact.
- Extend the design system through shared components in `src/components/common` before duplicating UI.
- Keep placeholder/mock flows clearly marked until they are backed by real persistence.
- Re-check the landing theme and the authenticated shell together when adjusting visuals, because the current codebase mixes a light olive system with a few darker practice widgets.

## Data Flow Summary

User input enters a page component, is validated locally, then either updates client state, writes to `localStorage`, or calls a mock service that resolves demo data. The result is rendered immediately in the same React tree. No data is persisted to a server or database yet.