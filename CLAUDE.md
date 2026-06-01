# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Table of contents

- [ABSOLUTE RULE: Database schema is FROZEN](#absolute-rule-database-schema-is-frozen)
- [ABSOLUTE RULE: Dual-patient model — never use a single `patientId`](#absolute-rule-dual-patient-model--never-use-a-single-patientid)
- [Design system — Teal Medica, Arabic RTL, Cairo font](#design-system--teal-medica-arabic-rtl-cairo-font)
- [Critical code patterns (from real bugs)](#critical-code-patterns-from-real-bugs)
- [Current pending work](#current-pending-work)
  - [Dashboard audit findings (as of 2026-04-19)](#dashboard-audit-findings-as-of-2026-04-19)
    - [Patient backend integrity (URGENT - 2026-04-19 audit)](#patient-backend-integrity-urgent---2026-04-19-audit)
    - [AI history storage — supersedes earlier ai_analyses plan (2026-04-20)](#ai-history-storage--supersedes-earlier-ai_analyses-plan-2026-04-20)
- [Git workflow](#git-workflow)
- [Environment](#environment)
- [Team](#team)
- [Verified repo facts](#verified-repo-facts)
  - [Repository layout](#repository-layout)
  - [Common commands](#common-commands)
  - [Required environment](#required-environment)
  - [Backend architecture](#backend-architecture)
  - [Data model](#data-model)
  - [ECG AI](#ecg-ai)
  - [Frontend architecture](#frontend-architecture)
  - [Conventions worth knowing](#conventions-worth-knowing)

## ABSOLUTE RULE: Database schema is FROZEN

The file patient360_db_final.js is the authoritative frozen schema
reference. Do NOT propose edits to it. All 25 collection structures,
field names, enum values, validation rules, and indexes are locked.
Every controller, model, route, and frontend API call must match
its field names, enums, and structure EXACTLY. Deviations cause
MongoDB error 121.

Allowed: collections use additionalProperties:true, so new fields
may be added to existing documents without schema change. Forbidden:
renaming existing fields, changing enum values, or adding new
required fields.

## ABSOLUTE RULE: Dual-patient model — never use a single `patientId`

Adults live in `persons` (11-digit nationalId). Children under 14
live in `children` (auto-generated childRegistrationNumber). At
age ~14 they migrate from children → persons.

Every patient reference uses TWO fields, never one:
  - patientPersonId (ObjectId → persons._id) for adults
  - patientChildId  (ObjectId → children._id) for children

This pattern appears in visits, appointments, prescriptions,
lab_tests, pharmacy_dispensing, emergency_reports, audit_logs,
notifications, reviews. Using a single `patientId` field is a
recurring bug that has already broken the audit log middleware.
Always handle both refs in queries, controllers, middleware, UI.

## Design system — Teal Medica, Arabic RTL, Cairo font

All user-facing content is Arabic (RTL). English reserved for code,
comments, docs. Palette: Primary #0D3B3E, Action #00897B, Accent
#4DB6AC, Surface #E0F2F1, Background #F5FAFA. Use CSS variables
(--tm-primary, --tm-action, etc.), never hex codes directly — a
dark theme flips variables at runtime. Cairo font for Arabic, Inter
for Latin/numbers. All pages set direction: rtl. LTR inputs
(emails, phones, national IDs, licenses) get dir="ltr" explicitly.

## Critical code patterns (from real bugs)

- Password hashing goes in pre('validate'), NOT pre('save'). The
  Account model's password has minLength:60 (bcrypt hash length).
  Hashing in pre('save') lets Mongoose validator reject plaintext
  before it's hashed.

- Optional schema-validated fields: OMIT, don't null. MongoDB JSON
  Schema rejects null for string-typed fields. Use conditional
  spread: { ...(value && { field: value }) }

- Middleware restrictTo was renamed to authorize. Backwards-compat
  alias exists. Use authorize in new code; watch for stale
  restrictTo in old routes.

- auditLog resourceType values are lowercase: 'visit',
  'prescription', 'patient', 'doctor' — not capitalized.

- Frontend API response shapes must be verified, not assumed. Known
  bug: AdminDashboard expects one shape but backend returns
  { requests: [...] }. Always read both sides before changing either.

- CSS file integrity is suspect. Files in styles/ have contained
  swapped content (SignUp.css once held PatientDashboard.css body).
  Verify first few lines match filename before debugging visual bugs.

- .env files must be UTF-8 without BOM. dotenv v17+ rejects BOM
  silently, loading zero variables. On PowerShell use
  New-Object System.Text.UTF8Encoding $false.

- Seed scripts must be idempotent. Check existence before inserting.
  Use findOneAndUpdate with upsert:true.

## Current pending work

1. AdminDashboard.jsx: shape mismatch is RESOLVED (verified
   2026-04-19 audit — `data.requests` matches backend
   `{ success, count, requests }`). The real bug is different:
   routes exist for several admin tabs but the backend controller
   methods are missing, so those tabs 404 silently. See
   "Dashboard audit findings" below.

2. Audit all other dashboards (DoctorDashboard, PatientDashboard,
   PharmacistDashboard, LabDashboard) for same pattern. Check
   whether any still call authService.js / patientService.js
   localStorage fallbacks instead of services/api.js.

3. ProtectedRoute.jsx exists in components/common but is NOT wired
   into App.js. Dashboards are currently URL-accessible without
   auth. Fix before any real deployment.

4. initializeAdminAccount() seeds 'admin@health.gov.sy' / 'admin123'
   to localStorage on every app mount. Development-only — must be
   removed or gated behind NODE_ENV==='development' before
   deployment.

5. Activate unused middleware: rateLimiter, security, upload,
   sanitize, errorHandler.

6. Implement 5 new backend endpoints for SignUp v2 (see API_CONTRACT.md):
   POST /api/auth/register-pharmacist
   POST /api/auth/register-lab-technician
   GET  /api/pharmacies/search
   GET  /api/laboratories/search
   POST /api/auth/check-professional-status
   Plus extend admin approval controller for pharmacist /
   lab_technician requestType branches.

7. Resolve bcrypt + bcryptjs double-dependency in backend
   package.json. Standardize on bcryptjs (already used by models)
   and remove bcrypt.

8. Voice input for emergency triage AI (deferred from v1 of
   PatientDashboard redesign — requires HTTPS).

9. Consolidate dashboard sidebars into a shared component
   (currently inlined per-dashboard matching Pharmacist/Lab pattern).

10. Email change flow for patients (confirmation token via old
    and new email; deferred from updateMyProfile v1).

### Dashboard audit findings (as of 2026-04-19)

1. **PatientDashboard.jsx bypasses `services/api.js`** — 10
   hardcoded `http://localhost:5000` URLs at lines 122, 772, 808,
   840, 863, 886, 918, 939, 966, 991. Highest priority: migrate to
   `patientAPI` calls so `REACT_APP_API_URL` is respected.

2. **AdminDashboard.jsx has missing controllers, not a shape
   mismatch** — routes exist for children, hospitals, pharmacies,
   laboratories, emergency reports, and reviews, but the backend
   controller methods are not implemented. Those tabs 404 silently.

3. **DoctorDashboard.jsx mixes real `doctorAPI` with legacy
   `authService.js`** (only for `logout`). Migrate logout to
   `authAPI`. Some response shapes are unverified — needs a
   follow-up controller trace.

4. **PharmacistDashboard.jsx and LabDashboard.jsx are CLEAN
   reference implementations.** Use their patterns when migrating
   the others:
   - Defensive `res?.success` checks before destructuring
   - Errors routed through `openAlert()` wrapper, not `console.*`
   - No direct `localStorage` data bypass

#### Patient backend integrity (URGENT - 2026-04-19 audit)

- All 9 /api/patient/* endpoints exist as routes — no missing
  controllers here.

- 5 of 9 endpoints violate the dual-patient rule: #2 GET visits,
  #4 GET appointments, #5 GET lab-results, #6 GET prescriptions,
  #9 POST appointments. All query a single patientId field against
  req.user.personId, assuming adult users only. Child patients
  return empty from every one. Write endpoints (POST appointment)
  are creating documents with wrong field names.

- 6 of 9 endpoints are INLINE ANONYMOUS HANDLERS in routes/patient.js,
  not proper controller functions. They hit raw MongoDB collections
  (appointments, lab_tests, prescriptions, availability_slots)
  without Mongoose models. This means the frozen schema in
  patient360_db_final.js is NOT enforced on writes through these
  endpoints. Currently-stored data may not pass validation.

- Only visitController.getVisits and medicationController.getCurrentMedications
  live in proper controllers.

- backend/routes/patient.route.js is confirmed dead code (not
  imported anywhere). Safe to delete separately.

- DECISION: backend correctness must be fixed BEFORE PatientDashboard
  frontend migration. Migrating the frontend first would make a
  broken backend reachable from production without fixing the
  underlying bugs.

#### AI history storage — supersedes earlier ai_analyses plan (2026-04-20)

An earlier planning session proposed adding a new `ai_analyses` collection to persist AI model output. After reading `patient360_db_final.js` directly, that plan is SUPERSEDED. The frozen schema already defines `emergency_reports` with exactly the fields the senior redwan emergency-triage AI returns — `inputType` (text/image/voice/combined), `textDescription`, `imageUrl`, `voiceNoteUrl`, `voiceTranscript`, `aiRiskLevel`, `aiFirstAid[]`, `aiConfidence`, `aiRawResponse`, `aiModelVersion`, plus `patientPersonId` / `patientChildId` dual-reference. No new collection is needed; no schema change is required. CLAUDE.md rule #1 (frozen schema) is therefore preserved. Note: the specialist-recommender AI at `/api/patient/ai-symptom-analysis` is a separate service returning `{specialist, disease, organ_system}` and remains intentionally ephemeral — no persistence in v1.

## Git workflow

Repo: https://github.com/Nablsi22/patient360-juniorproject.git

Commit convention: <type>(<scope>): <subject>
Types: feat, fix, refactor, docs, style, test, chore
Scopes: signup, auth, admin, doctor, patient, pharmacy, lab,
        dentist, emergency, db, middleware, api

Before pushing: always git status and git diff first.

## Environment

Windows 10/11, PowerShell. MongoDB localhost:27017, database
PATIENT360. Node 18+. Project inside OneDrive — watch for
sync-vs-write race conditions.

## Team

Anas Nablsi (Development Director, Frontend Lead), Muath Jabri (CEO),
Ali Raei (Technology Director), Kinan Al-Majzoub (Operations
Director). University: Arab International University, Damascus.
Client: Syrian Ministry of Health.

---

## Verified repo facts

The sections below were discovered by reading the repo during `/init`. Where they conflict with the absolute rules above, the absolute rules win — the items below describe the code *as it currently exists*, which may include known bugs listed in "Current pending work".

### Repository layout

This repo holds **two separate Node projects** side by side:

- `backend/` — Express 5 + Mongoose API (entry: `backend/index.js`, default port `5000`)
- `frontend/` — Create React App (React 19 + Tailwind, entry: `frontend/src/index.js`, dev port `3000`)

There is no root `package.json` and no monorepo tooling. Run commands from inside whichever project you are touching.

### Common commands

Backend (`cd backend`):
- `npm run dev` — start API with nodemon (auto-reload)
- `npm start` — start API with plain `node`
- `node seed.js` — create 6 test accounts (one per role) in the `PATIENT360` database; password for all is `Test@1234`
- `node seed-database.js` / `node seed-data.js` — alternate seed scripts
- `node fix-fields.js`, `node reset-password.js` — one-off maintenance scripts

Frontend (`cd frontend`):
- `npm start` — CRA dev server on `http://localhost:3000`
- `npm run build` — production build to `frontend/build/`
- `npm test` — Jest + React Testing Library watcher (CRA default). Run a single test with `npm test -- --testPathPattern=<filename>` or inside the watcher press `p` and filter.

There is no lint script configured on either side; CRA's built-in ESLint runs during `npm start` / `npm run build`.

### Required environment

- **`.env` at repo root** — consumed by CRA; currently sets `REACT_APP_API_URL=http://localhost:5000/api`. The frontend reads this via `frontend/src/services/api.js`; changes require restarting `npm start`.
- **`backend/.env`** — must provide `MONGODB_URI`, `JWT_SECRET`, optional `JWT_EXPIRE` (default `7d`), optional `PORT` (default `5000`), optional `NODE_ENV`, and SMTP vars used by `backend/utils/sendEmail.js` for the forgot-password OTP flow. This file is gitignored and is not checked in.
- Backend CORS is hardcoded to allow `http://localhost:3000`, `3001`, `3002` (see `backend/index.js`). Add new origins there if you serve the frontend elsewhere.

### Backend architecture

Layered Express app wired up in `backend/index.js`:

- `config/database.js` — Mongoose connection, reads `MONGODB_URI`, logs collections on boot.
- `routes/` — one router per domain: `auth.js`, `patient.js` (+ legacy `patient.route.js`), `doctor.js`, `admin.js`, `visit.js`, `ecg.js`. Mounted under `/api/auth`, `/api/patient`, `/api/doctor`, `/api/admin`, `/api/visits`, `/api/ecg`.
- `controllers/` — request handlers (`authController`, `patientController`, `visitController`, `adminController`, `ecgController`, `medicationController`, `simpleSignup`).
- `services/` — domain logic callable from controllers (`patientService`, `visitService`, `medicationService`).
- `middleware/auth.js` exports `protect` (JWT verify + load Account/Person/Patient onto `req.user`), `restrictTo(...roles)` for role gating, and `verifyPatientOwnership` which blocks a patient from reading another patient's `patientId`/`visitId`. Other middleware: `upload.js` / `uploadDoctorFiles.js` (multer), `security.js`, `rateLimiter.js`, `validator.js`, `auditLog.js`.
- `utils/` — shared helpers including `fileUpload.js` (`FileUploadManager` that generates organized paths under `uploads/`) and `sendEmail.js` (OTP emails).
- `uploads/` — multer writes here at runtime. Subfolders created on demand: `doctor-requests/`, `visits/`, `ecg/`, `temp/`. The whole directory is gitignored and served statically at `/uploads`.

### Data model

User identity is split across three collections, joined by ObjectId references — keep this in mind when touching auth or user-facing queries:

- `Person` (`persons` collection) — demographics. Enforces a minor/adult invariant in `pre('validate')`: adults must have `nationalId` (11 digits) and no `parentNationalId`; minors must have `parentNationalId` and no `nationalId`. `isMinor` is auto-calculated from `dateOfBirth` in `pre('save')`.
- `Account` (`accounts` collection) — login credentials. Holds `email`, bcrypt-hashed `password`, a `roles` array (one or more of `patient`, `doctor`, `admin`, `pharmacist`, `lab_technician`, `dentist`, `nurse`, `receptionist`), and deactivation / reactivation / OTP fields. `personId` links to `Person`. Password pre-save hook **skips hashing when the value already starts with `$2a$`/`$2b$`** so seed scripts can insert pre-hashed passwords.
- Role-specific docs: `Patient`, `Doctor`, `Admin`, plus `DoctorRequest` (pending doctor registrations awaiting admin approval), `Visit`, `AuditLog`.

Password policy is enforced in `Account.js`: min 8 chars + uppercase + lowercase + digit + one of `!@#$%^&*`.

### ECG AI

`ecgController.js` is an HTTP client. It POSTs uploaded images as multipart form data to a **separate Flask service at `http://localhost:8000/predict`** (URL hardcoded in `backend/controllers/ecgController.js`). That Flask service is not in this repo; ECG endpoints will fail unless it is running.

### Frontend architecture

- Routing lives in `frontend/src/App.js` — a flat `BrowserRouter` with one route per role-specific dashboard (`/patient-dashboard`, `/doctor-dashboard`, `/admin-dashboard`, `/pharmacist-dashboard`, `/lab-dashboard`) plus `/` (Login) and `/signup`. There is **no route guard wired in** — `ProtectedRoute.jsx` exists in `components/common/` but is not used in `App.js`.
- `App.js` calls `initializeAdminAccount()` on mount, which seeds a default admin in localStorage (`admin@health.gov.sy` / `admin123`).
- `services/api.js` is the axios instance for the real backend: base URL from `REACT_APP_API_URL`, attaches `Bearer <token>` from `localStorage.token` on every request, and on a 401 (except during login) clears `token`/`user` and redirects to `/login`.
- `services/authService.js` and `services/patientService.js` are **legacy localStorage-backed services** from the pre-backend phase. Some pages still use them. When modifying auth/patient flows, prefer calling `api.js` endpoints and check which layer the page you are editing actually uses before assuming.
- Tailwind is configured (`tailwind.config.js`, `postcss.config.js`); global CSS lives in `src/index.css` and `src/App.css`, with additional CSS under `src/styles/` (backup folders there are gitignored).
- `src/backend-guides/` and `src/docs/` contain stale design documents from before the backend existed — treat as historical context, not specification. The real contract is the routes in `backend/routes/`.

### Conventions worth knowing

- User-facing API error messages (`message` field) are in Arabic. Match the existing tone if you add new responses.
- The project uses both `bcrypt` and `bcryptjs` in the backend's `package.json`; the model and controllers import `bcryptjs`. Prefer `bcryptjs` for new code to avoid native-build issues on Windows.
- Windows dev environment: paths in the repo contain spaces (`New folder (3)`), so always quote paths in shell commands.
- `backend/src/` exists but is a stale copy of CRA scaffolding — the live backend code is directly under `backend/` (controllers, routes, models, etc.), not under `backend/src/`.
