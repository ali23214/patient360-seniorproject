# Patient 360° — Patient Mobile App Brief & Claude Code Playbook

> **Prepared for:** Anas Al-Nablsi, Dev Director & Frontend Lead
> **Platform:** Patient 360° — Syrian National Medical Platform
> **Scope of this document:** Complete handoff for building the patient-only mobile app. Contains (1) dashboard analysis, (2) stack recommendation with citations, (3) Teal Medica theme bridge, (4) project structure, (5) a sequence of 11 Claude Code prompts you paste one at a time.
> **Audience for prompts:** Claude Code running against a fresh Flutter project directory alongside the existing `patient360frontend/` and `backend/` folders.

---

## 0 — Executive summary

| Decision | Choice | Why (one line) |
|---|---|---|
| Mobile framework | **Flutter 3.27+ / Dart 3.6+** | Pixel-parity, native RTL and Cairo font rendering, one codebase for iOS + Android. |
| State management | **Riverpod 3.0** (`flutter_riverpod` + `riverpod_generator`) | Compile-time safety, async-first, lowest boilerplate — consensus default for 2026. |
| Navigation | **go_router** (Flutter team) | Declarative, deep-link ready (needed for FCM notification taps). |
| HTTP | **dio** + **pretty_dio_logger** | Interceptors for JWT refresh, multipart (AI triage image), cancel tokens. |
| Models | **freezed** + **json_serializable** | Immutable DTOs that mirror `patient360_db_final.js` exactly. |
| Auth storage | **flutter_secure_storage** | Keychain (iOS) / EncryptedSharedPreferences (Android) for JWT. |
| Push | **firebase_messaging** + `firebase_core` | Matches the existing `accounts.pushNotificationTokens[]` schema. |
| Icons | **lucide_icons_flutter** | Same icon set as the web dashboard, with `*Dir` RTL variants. |
| Fonts | **google_fonts** (Cairo + Inter) | Same typography as web. |
| L10n | **intl** + `flutter_localizations` | Native `ar_SY` locale, RTL throughout. |
| Backend | **No new backend.** Reuse existing Node/Express/Mongoose API. | See §B.2 for the single small delta required. |

**Critical scope rule:** this is a **patient-only** app. The web dashboard serves six roles (admin, doctor, patient, pharmacist, lab_technician, dentist); the mobile app exposes only the patient role. Login rejects any account whose `roles` array does not contain `"patient"`.

---

# Part A — Patient Dashboard: what the mobile app must replicate

This analysis is drawn directly from `PatientDashboard.jsx` (3,488 lines) and `PatientDashboard.css` (3,234 lines). Every UX element below already exists in the web dashboard and has a server endpoint behind it (via `patientAPI` in `services/api.js`). The mobile app is **not** a new product — it is a native reinterpretation of this dashboard shaped for a phone.

## A.1 Shell & navigation

The web uses a **sidebar + top bar + main content** triad. On mobile this does not translate directly — a permanent 280 px sidebar on a 375 px phone is unusable. Map it to:

| Web element | Mobile equivalent |
|---|---|
| `.pd-sidebar` (fixed drawer, 280 px) | **Bottom navigation bar** with 5 primary destinations + **hamburger drawer** for secondary |
| `.pd-page-header` (sticky top, 64 px) | **SliverAppBar** per screen with section title, bell icon + badge, theme toggle |
| `.pd-main` scroll container | Each screen owns its own `CustomScrollView` |
| Modal system (Alert / Confirm / Custom) | `showDialog` for alerts + `showModalBottomSheet` for forms (booking, profile edit, review) |

**Bottom nav (5 tabs):** Home · Appointments · **Medications** · Lab · Profile (the Medications destination is a parent hub with 3 sub-tabs: Today's Schedule · Calendar · Prescriptions — added in Prompt 6.5)
**Drawer (secondary):** Visits · AI Assistant · Reviews · Notifications · Logout

Reasoning: the 4 KPIs on the home screen already point to Appointments / Prescriptions / Lab / Notifications, so the four most-used destinations are obvious. Profile goes in the bottom bar because it hosts the emergency contact — during an actual emergency, the user needs one tap to show relationship and phone to a bystander.

## A.2 Nine sections — feature inventory

Every section below is **in scope** for the mobile app. No features are cut.

### A.2.1 Home (`renderHome`)
- Hero card: time-aware Arabic greeting (`صباح الخير` before noon, otherwise `مساء الخير`) + patient first name + `HeartPulse` accent.
- **4 KPI tiles** (tap → navigate):
  - `upcomingAppointments` (info variant, `Calendar` icon)
  - `activePrescriptions` (success variant, `Pill` icon)
  - `pendingLabResults` (warning variant, `FlaskConical` icon)
  - `unreadNotifications` (accent variant, `Bell` icon)
- **Recent activity** list — up to 5 items, each with type icon (appointment / visit / prescription / lab_test / notification), title, subtitle, timestamp. Data comes from `overview.recentActivity[]`.
- **Quick actions** — 4 tiles: Book appointment · View prescriptions · AI assistant · Profile.

### A.2.2 Appointments (`renderAppointments`)
- Three tab filter: **upcoming** (`scheduled` | `confirmed` | `checked_in` | `in_progress`) · **past** (`completed`) · **cancelled** (`cancelled` | `no_show` | `rescheduled`).
- **Book new appointment** — 3-step modal:
  1. *Search* → `patientAPI.searchDoctors({ specialization })` → list of doctors with `_id`, `firstName`, `lastName`, `specialization`.
  2. *Pick slot* → `patientAPI.getDoctorSlots(doctorId)` → filter `!isBooked`, show `date`, `startTime`, `endTime`.
  3. *Confirm* → free-text `reasonForVisit` (required) + priority enum (`routine` | `urgent` | `emergency`) → `patientAPI.bookAppointment({ slotId, appointmentType: 'doctor', reasonForVisit, priority })`.
- **Cancel flow** — `patientAPI.cancelAppointment(id, { cancellationReason })` where reason is the five-value DB enum: `patient_request` · `doctor_unavailable` · `emergency` · `duplicate` · `other`.
- Appointment card displays: reason, doctor name, date/time, status pill, priority badge, payment status.

### A.2.3 Visits (`renderVisits`)
- **Vertical timeline** with marker + expandable card.
- Collapsed: chief complaint, visit type badge (`regular` / `follow_up` / `emergency` / `consultation` / `dental` / `lab_only`), date, status pill.
- Expanded sub-sections (any may be empty):
  - **Diagnosis** — free text from doctor.
  - **Vital signs** (9 fields) — bloodPressureSystolic/Diastolic (mmHg), heartRate (bpm), oxygenSaturation (%), bloodGlucose (mg/dL), temperature (°C), weight (kg), height (cm), respiratoryRate (/min). Display as 3×3 grid with label above value.
  - **Prescribed medications** — per-item: name, dosage · frequency · duration, instructions.
  - **Doctor notes** — free text.
  - **Follow-up** — date + optional follow-up notes.
  - **Visit photo** — image URL (tap to open full-screen).
  - **ECG analysis** — AI cardiologist output: `topPrediction`, `recommendation`, `ecgImageUrl`. Shows only when doctor is `isECGSpecialist`.
  - **Payment status** — label + color-coded pill.

### A.2.4 Prescriptions (`renderPrescriptions`)
- Three tab filter: **active** (`active` | `partially_dispensed`) · **dispensed** · **expired** (`expired` | `cancelled`).
- **Card** shows `prescriptionNumber` (LTR) + medication name summary + status.
- **Expanded view shows a QR code** rendered from the `qrCode` field, plus the 6-digit `verificationCode` as a fallback for pharmacies without a scanner. Both are **hidden when the prescription is fully dispensed** (backend status `dispensed`, or every med item has `isDispensed: true`) — patient can't reuse a used Rx.
- Per-medication rows: `medicationName` / `arabicName`, dosage, frequency, duration, route (7-value enum: `oral` · `topical` · `injection` · `inhalation` · `sublingual` · `rectal` · `other` — each mapped to an Arabic label), quantity, instructions, isDispensed checkbox (read-only from patient side).
- Dispensed banner with the earliest `dispensedAt` timestamp across items.

### A.2.5 Lab results (`renderLabTests`)
- Filter tabs: **all** · **pending** (not `completed`) · **completed**.
- Card collapsed: `testNumber` (LTR), order date, status pill, unread dot if `!isViewedByPatient`, abnormal/critical flag badge if any result row has `isAbnormal`/`isCritical`.
- **Expanding a completed test auto-marks it as viewed** by calling `patientAPI.markLabTestViewed(id)` in the background.
- Expanded view:
  - Structured `testResults[]` table: 3 columns — test name, value (with optional unit), reference range. Abnormal rows get `warning` background, critical rows get `error` background.
  - **PDF result download** — link is `resultPdfUrl` prefixed with the API base URL. On mobile, open with `url_launcher` (external browser) or embed with `flutter_pdfview` if we want in-app preview.
  - Lab notes (free text).

### A.2.6 AI Assistant (`renderAIAssistant`)
Two sub-tabs:

**(a) Specialist recommender** — `patientAPI.analyzeSymptoms({ symptoms })`
- Text input (maxLength 2000, Ctrl+Enter submit on web — long-press Send button on mobile).
- Returns `{ specialization, arabicSpecialization, reasoning, confidence }` (shape per the web `ResultCard variant="specialist"`).
- No history tab. This is a stateless query.

**(b) Emergency triage** — `patientAPI.submitEmergencyReport(formData)`
- Input mode toggle: **text** or **image**. (Voice is explicitly deferred to v2 per your prior decision.)
- On text submit → multipart with `inputType=text`, `textDescription=<text>`.
- On image submit → multipart with `inputType=image`, `image=<File>`, max 10 MB.
- Before submit, attempt `navigator.geolocation.getCurrentPosition` with a **3-second timeout**. If granted, append `location: JSON.stringify({lat, lng})` and `locationAccuracy: <meters>` as form fields. If denied or timed out, submit without location — never block the user in an emergency.
- Response returns `{ _id, reportedAt, aiRiskLevel, aiFirstAid[], aiConfidence, inputType, textDescription?, imageUrl?, location? }`.
- `ResultCard variant="triage"` shows: `SeverityBadge` (4 levels: low / moderate / high / critical with matching icons — `CheckCircle` / `AlertTriangle` / `AlertOctagon`), `FirstAidSteps` (staggered numbered list), `ConfidenceBar`.
- **History list below the form** — `patientAPI.getEmergencyReports()` paginated, newest first. Each item: input-type icon, timestamp, severity badge, first 2 aid steps collapsed, expand for full details.

### A.2.7 Reviews (`renderReviews`)
- List of the patient's reviews with star rating, target (doctor / dentist / lab / pharmacy / hospital), review text, status (`pending` / `approved` / `rejected` / `flagged`), anonymous flag, admin note when present.
- **Submit review** modal:
  - Target type radio (5 options) + target ID text input (v2: replace with a picker).
  - 5-star rating (keyboard-accessible radiogroup).
  - Optional text (maxLength 1000).
  - "Submit anonymously" checkbox.
- `patientAPI.submitReview(payload)`.

### A.2.8 Notifications (`renderNotifications`)
- Filter tabs: **unread** · **all**.
- 14 notification types, each with a distinct icon and Arabic label (see `NOTIFICATION_TYPE_META` in the JSX — mirror exactly).
- **Tap behavior:** (1) optimistic mark-read (`status: 'read'`, `readAt: now`) + background `patientAPI.markNotificationRead(id)`, (2) deep-link to related section via `relatedType` → section mapping: `appointments` → appointments, `visits` → visits, `prescriptions` → prescriptions, `lab_tests` → lab-results, `emergency_reports` → ai-assistant.
- Priority styling: `low` · `medium` · `high` · `urgent` affects left-border color.

### A.2.9 Profile (`renderProfile`)
Three cards:

1. **Personal info** (read-only except via edit modal):
   full name (firstName + fatherName + lastName), national ID (or CRN for minors — `isMinor` boolean on profile response), gender, date of birth + computed age, email (shown with lock icon — not editable), phoneNumber, alternativePhoneNumber, address (governorate + city + street), occupation, education.
2. **Medical info**:
   bloodType (9 values including `unknown`), height/weight/BMI, smokingStatus, alcoholConsumption, exerciseFrequency, allergies[] (tag pills), chronicDiseases[] (tag pills), familyHistory[], currentMedications[] (long-term), previousSurgeries[] (with date + hospital + notes).
3. **Emergency contact**: name, relationship, phone, alt phone.

**Edit modal** — editable fields: phoneNumber, alternativePhoneNumber, address, governorate (14-value enum), city, bloodType, height, weight, smokingStatus, allergies (comma/Arabic-comma separated), chronicDiseases, emergency contact (name/relationship/phone as a group). `patientAPI.updateMyProfile(payload)`.

## A.3 Cross-cutting concerns carried over from the web

- **Dual-patient identity.** The profile response returns either `profile.person` (adult) or `profile.child` (minor under 14) plus `profile.patient` (medical info). Server resolves identity from JWT — **never send patient ID in request params**. Every list (appointments, visits, prescriptions, lab_tests) is already filtered server-side to the logged-in patient.
- **Arabic RTL + English LTR mixing.** Names, diagnosis, reason-for-visit, notes, and all labels render RTL. National IDs, phone numbers, medical card numbers, dates in ISO, prescription numbers, and test numbers are **forced LTR** via `Directionality(textDirection: TextDirection.ltr)` wrapping a `Text`. The web uses `dir="ltr"` or `dir="auto"` — we need the same discipline in Flutter.
- **Dark mode.** `ThemeProvider` on the web toggles `[data-theme="dark"]` on `<html>`. On mobile, use `MaterialApp.themeMode` + `ColorScheme.light` / `ColorScheme.dark` + a `ThemeController` Riverpod provider that persists the choice via `shared_preferences`.
- **Lazy per-section loading.** The web dashboard loads profile + overview at mount (`Promise.allSettled`), and each section fetches on first visit with a `…Loaded` memo to prevent refetch. Flutter equivalent: a `FutureProvider.family` or `AsyncNotifier` per section, gated by a "loaded once" flag.
- **Graceful degradation.** When an endpoint returns `{ success: false }` or throws, the web calls `openAlert('error', title, message)`. Mobile shows a `SnackBar.floating` with the error + a "Retry" action.
- **Error ceiling.** `Promise.allSettled` on mount means one failing endpoint doesn't break the whole dashboard — same pattern on mobile with `Future.wait(..., eagerError: false)`.

---

# Part B — Stack rationale & backend compatibility

## B.1 Why Flutter (honestly)

Your CLAUDE.md memory notes React Native + Expo as the original plan. That path is still valid — same API, NativeWind gives Tailwind-like styling. But for this specific app, Flutter wins on three axes that matter here:

1. **RTL + Cairo rendering.** Flutter handles bidirectional text, Arabic ligatures, and custom fonts deterministically — rendered via its own Skia pipeline. React Native delegates to the OS text engine, which means small but visible differences between iOS and Android in Arabic weight rendering and line-breaking. For a Ministry of Health submission this matters.
2. **Medical UI precision.** Widgets like the vital-signs grid and the QR-code prescription card benefit from pixel-level control. Flutter's `CustomPaint` and `RenderObject` give you that for free.
3. **Senior-project story.** Flutter is a meaningful technical bet — Dart is a new language for the committee, the project gains a second language surface. React Native would read as "JavaScript again."

**What you give up:** a slightly steeper initial ramp if you haven't written Dart before, and you cannot share hooks/components directly with the React web. For a patient-only app where the screen set is fixed, that doesn't matter.

State management: Riverpod 3.0 is the modern default for most Flutter projects in 2026 because it combines Provider's ergonomics with better scalability, testability, and async-first patterns, and specifically for this app the compile-time safety, built-in offline persistence, and minimal boilerplate match the shape of your existing code (lots of small async lists). BLoC would be defensible for its event-driven audit trails and strict separation of concerns in regulated industries, but for a one-developer senior project the boilerplate cost outweighs the audit benefit.

For icons, `lucide_icons_flutter` gives you the exact same set as the web (1,695+ icons) with built-in RTL support via `*Dir` variants for directional icons like chevrons — "For RTL (right-to-left) support, use the Dir icon: LucideIcons.aArrowDownDir" — so `ChevronLeft` on web maps cleanly to `LucideIcons.chevronLeftDir` on Flutter.

## B.2 Backend compatibility: keep the server, add one endpoint

You asked which backend frameworks are compatible with your database. The honest answer is: **you already built the right one.** Your Express 5 / Mongoose 8 / MongoDB stack, with JWT auth, multer uploads, and role middleware, is fully compatible with a Flutter mobile client. Flutter talks HTTP/JSON like any other REST client. There is nothing to rewrite.

There is one small **additive** change you'll want, and it's already half-built in the schema:

**New endpoint — register FCM token**

```
POST /api/auth/fcm-token          (JWT required)
body: { token, platform, deviceName?, appVersion? }
→ pushes an entry into accounts.pushNotificationTokens[] (already in schema)
→ idempotent: if the token exists, update lastUsedAt; otherwise insert
```

**New endpoint — unregister FCM token (on logout)**

```
DELETE /api/auth/fcm-token
body: { token }
→ removes the matching entry from the array
```

Both endpoints are ~30 lines of Express each. Schema already supports them:
`accounts.pushNotificationTokens[]` with the `{token, platform, deviceName, appVersion, addedAt, lastUsedAt, isActive}` structure is already in `patient360_db_final.js`. The index `idx_fcm_token` on `pushNotificationTokens.token` is already created.

**One networking note.** Mobile apps cannot reach `http://localhost:5000` directly — `localhost` on an iOS/Android device points to the device itself. During development either (a) run the backend on your LAN IP and set `API_BASE_URL=http://192.168.x.x:5000`, or (b) use `ngrok http 5000` and point the app at the public URL. For production, you deploy the backend to a public host (Render/Railway/your university's infrastructure) and point the mobile `.env` at that.

---

# Part C — Teal Medica theme bridge: CSS vars → Flutter ThemeData

This table is the single source of truth. Every Claude Code prompt below references it.

## C.1 Color tokens (light mode)

| CSS variable | Hex | Flutter `ColorScheme` role | Dart constant |
|---|---|---|---|
| `--tm-primary` | `#0D3B3E` | `primary` | `AppColors.primary` |
| `--tm-action` | `#00897B` | `secondary` | `AppColors.action` |
| `--tm-accent` | `#4DB6AC` | `tertiary` | `AppColors.accent` |
| `--tm-surface` | `#E0F2F1` | `surfaceContainerHighest` | `AppColors.surface` |
| `--tm-background` | `#F5FAFA` | `surface` (background) | `AppColors.background` |
| `--tm-card-bg` | `#FFFFFF` | `surfaceContainer` | `AppColors.card` |
| `--tm-sidebar-bg` | `#0D3B3E` | N/A (drawer only) | `AppColors.drawer` |
| `--tm-error` | `#D32F2F` | `error` | `AppColors.error` |
| `--tm-warning` | `#F57C00` | custom | `AppColors.warning` |
| `--tm-success` | `#388E3C` | custom | `AppColors.success` |
| `--tm-text-primary` | `#0D3B3E` | `onSurface` | `AppColors.textPrimary` |
| `--tm-text-secondary` | `#546E7A` | `onSurfaceVariant` | `AppColors.textSecondary` |
| `--tm-border` | `#B2DFDB` | `outline` | `AppColors.border` |

## C.2 Color tokens (dark mode)

| CSS variable | Hex | Flutter |
|---|---|---|
| `--tm-primary` | `#4DB6AC` | `AppColors.primaryDark` |
| `--tm-action` | `#4DB6AC` | `AppColors.actionDark` |
| `--tm-accent` | `#80CBC4` | `AppColors.accentDark` |
| `--tm-surface` | `#1A2F31` | `AppColors.surfaceDark` |
| `--tm-background` | `#0F1F21` | `AppColors.backgroundDark` |
| `--tm-card-bg` | `#162628` | `AppColors.cardDark` |
| `--tm-sidebar-bg` | `#0D1E20` | `AppColors.drawerDark` |
| `--tm-text-primary` | `#E0F2F1` | `AppColors.textPrimaryDark` |
| `--tm-text-secondary` | `#90A4AE` | `AppColors.textSecondaryDark` |
| `--tm-border` | `#2A4A4D` | `AppColors.borderDark` |

## C.3 Radii, spacing, shadows

| CSS variable | Value | Flutter constant |
|---|---|---|
| `--pd-radius-sm` | `4px` | `AppRadii.sm = 4.0` |
| `--pd-radius-md` | `8px` | `AppRadii.md = 8.0` |
| `--pd-radius-lg` | `12px` | `AppRadii.lg = 12.0` |
| `--pd-radius-xl` | `16px` | `AppRadii.xl = 16.0` |
| `--pd-shadow-sm` | `0 1px 2px rgba(13,59,62,0.06)` | `BoxShadow(color: Color(0x0F0D3B3E), offset: Offset(0, 1), blurRadius: 2)` |
| `--pd-shadow-md` | `0 4px 12px rgba(13,59,62,0.08)` | `BoxShadow(color: Color(0x140D3B3E), offset: Offset(0, 4), blurRadius: 12)` |
| `--pd-shadow-lg` | `0 8px 28px rgba(13,59,62,0.12)` | `BoxShadow(color: Color(0x1F0D3B3E), offset: Offset(0, 8), blurRadius: 28)` |
| `--pd-transition` | `0.2s ease` | `Duration(milliseconds: 200)` |

## C.4 Typography

| Use | Font | Weight | Size (web → mobile) |
|---|---|---|---|
| Section title | Cairo | 700 | 24px → 22sp |
| Card title | Cairo | 600 | 18px → 16sp |
| Body | Cairo | 400 | 14px → 14sp |
| Label/secondary | Cairo | 500 | 13px → 12sp |
| Numbers (LTR) | Inter | 600 | 16px → 15sp |

Both loaded via `google_fonts`. Default to Cairo; apply Inter only to numeric-LTR fields.

---

# Part D — Project structure (what Claude Code will scaffold)

```
patient360_mobile/
├── pubspec.yaml
├── analysis_options.yaml                 # Flutter lints + a stricter ruleset
├── .env.example                           # API_BASE_URL, FIREBASE_*
├── android/app/google-services.json       # FCM (you add manually)
├── ios/Runner/GoogleService-Info.plist    # FCM (you add manually)
├── assets/
│   ├── images/logo.png
│   └── translations/                      # if we add more locales later
└── lib/
    ├── main.dart
    ├── app.dart                            # MaterialApp + theme + go_router
    ├── core/
    │   ├── config/env.dart                 # reads .env via flutter_dotenv
    │   ├── theme/
    │   │   ├── app_colors.dart             # ← Part C tokens live here
    │   │   ├── app_radii.dart
    │   │   ├── app_shadows.dart
    │   │   ├── app_typography.dart
    │   │   └── app_theme.dart              # lightTheme + darkTheme factories
    │   ├── localization/
    │   │   ├── ar_sy.dart                  # all Arabic strings as constants
    │   │   └── arabic_labels.dart          # enum→Arabic lookups (governorates, route, etc.)
    │   ├── network/
    │   │   ├── dio_client.dart             # base URL, interceptors
    │   │   ├── auth_interceptor.dart       # attaches Bearer token
    │   │   └── api_exception.dart          # unified error shape
    │   ├── storage/
    │   │   └── secure_storage.dart         # JWT + refresh + FCM token
    │   └── utils/
    │       ├── date_format.dart            # ar-SY Intl wrappers
    │       ├── validators.dart             # nationalId regex, phone, etc.
    │       └── logger.dart
    ├── features/
    │   ├── auth/
    │   │   ├── data/                       # AuthRepository
    │   │   ├── domain/                     # User / Session models
    │   │   └── presentation/
    │   │       ├── login_screen.dart
    │   │       └── providers/auth_provider.dart
    │   ├── home/
    │   │   ├── data/                       # OverviewRepository
    │   │   └── presentation/
    │   │       ├── home_screen.dart
    │   │       └── widgets/
    │   │           ├── hero_card.dart
    │   │           ├── kpi_tile.dart
    │   │           ├── recent_activity_list.dart
    │   │           └── quick_actions.dart
    │   ├── appointments/
    │   │   ├── data/
    │   │   ├── domain/                     # Appointment, Doctor, Slot models
    │   │   └── presentation/
    │   │       ├── appointments_screen.dart
    │   │       ├── booking_flow_sheet.dart
    │   │       ├── cancel_sheet.dart
    │   │       └── widgets/appointment_card.dart
    │   ├── visits/
    │   │   ├── data/ domain/ presentation/
    │   │   └── widgets/ vital_signs_grid.dart, ecg_block.dart, etc.
    │   ├── prescriptions/
    │   │   ├── data/ domain/ presentation/
    │   │   └── widgets/ qr_code_card.dart, medication_row.dart
    │   ├── lab_results/
    │   │   ├── data/ domain/ presentation/
    │   │   └── widgets/ results_table.dart, pdf_opener.dart
    │   ├── ai_assistant/
    │   │   ├── data/ domain/ presentation/
    │   │   └── widgets/ input_mode_toggle.dart, severity_badge.dart, first_aid_steps.dart, confidence_bar.dart, result_card.dart
    │   ├── reviews/
    │   ├── notifications/
    │   │   └── fcm_handler.dart            # foreground / background / terminated
    │   └── profile/
    ├── shared/
    │   ├── widgets/
    │   │   ├── primary_button.dart
    │   │   ├── ghost_button.dart
    │   │   ├── empty_state.dart
    │   │   ├── loading_spinner.dart
    │   │   └── error_snackbar.dart
    │   └── models/
    │       └── api_response.dart            # { success, message, data/items }
    └── router/
        ├── app_router.dart                  # go_router config
        └── route_names.dart

test/
├── features/
│   ├── auth/auth_provider_test.dart
│   └── ...
└── widget_test.dart
```

---

# Part E — Claude Code prompts

**How to use this section.** Open a new Claude Code session *inside a new sibling folder of your web project*, e.g.:

```
C:\Users\anasn\OneDrive\Desktop\Junior project\New folder (3)\patient360mobile\
```

You can also init it as a subfolder of the existing monorepo if you want a single Git repo. Either way, **paste prompts one at a time**, wait for completion and a green test run, commit, then paste the next one. Every prompt ends with an explicit sign-off line so Claude Code knows when to stop.

The prompts assume Claude Code has access to the existing repo at:
- `patient360_db_final.js` — locked schema (read-only reference)
- `patient360frontend/src/pages/PatientDashboard.jsx` — UX source of truth (read-only)
- `patient360frontend/src/services/api.js` — API method signatures (read-only)

If Claude Code is in a separate folder, paste the relevant file into the first prompt as context.

---

## 🎯 Prompt 1 of 11 — Project scaffolding, theme tokens, lints

**Paste this verbatim into Claude Code:**

````
You are a senior Flutter engineer building the Patient 360° mobile app — a patient-only companion to the existing web dashboard at patient360frontend/. This first task is scaffolding only. Do not build any features yet.

STRICT SCOPE — this prompt:
1. Create a new Flutter project named patient360_mobile at the current working directory.
   - Flutter stable channel, Dart >= 3.6.
   - Org identifier: sy.gov.patient360.mobile
   - Platforms: iOS + Android only. Remove web/ windows/ linux/ macos/ folders.

2. pubspec.yaml dependencies (pin to the latest stable at time of writing, but do not use git refs or pre-releases):
   - flutter_riverpod: ^3.0.0
   - riverpod_annotation: ^3.0.0
   - go_router: ^15.0.0
   - dio: ^5.7.0
   - pretty_dio_logger: ^1.4.0
   - freezed_annotation: ^2.4.0
   - json_annotation: ^4.9.0
   - flutter_secure_storage: ^9.2.0
   - shared_preferences: ^2.3.0
   - google_fonts: ^6.2.0
   - lucide_icons_flutter: ^3.0.0   # LucideIcons, with *Dir variants for RTL
   - intl: ^0.19.0
   - flutter_dotenv: ^5.2.0
   - url_launcher: ^6.3.0
   - cached_network_image: ^3.4.0
   - qr_flutter: ^4.1.0
   - logger: ^2.4.0

   dev_dependencies:
   - build_runner: ^2.4.0
   - freezed: ^2.5.0
   - json_serializable: ^6.8.0
   - riverpod_generator: ^3.0.0
   - custom_lint: ^0.7.0
   - riverpod_lint: ^3.0.0
   - flutter_lints: ^5.0.0
   - mocktail: ^1.0.0

3. analysis_options.yaml:
   - include: package:flutter_lints/flutter.yaml
   - analyzer.plugins: custom_lint
   - add linter.rules: prefer_const_constructors, prefer_const_declarations, require_trailing_commas, prefer_single_quotes, always_declare_return_types, unawaited_futures

4. Create the directory scaffold described in Part D of the project brief (all folders + a one-line comment in each barrel README so they show up in git). Do NOT implement features yet — only create the folders and a stub file where noted below.

5. Implement the theme token layer in lib/core/theme/:
   - app_colors.dart: a pure Dart class AppColors with static const Color fields for EVERY token in Part C.1 and C.2 (light and dark). Use the exact hex values. Include a helper `AppColors.scheme(Brightness)` that returns a ColorScheme.
   - app_radii.dart: static const double sm=4, md=8, lg=12, xl=16. Plus `BorderRadius`-valued helpers radiusSm/Md/Lg/Xl.
   - app_shadows.dart: three `List<BoxShadow>` constants sm/md/lg matching Part C.3 rgba values EXACTLY.
   - app_typography.dart: TextTheme builders using GoogleFonts.cairoTextTheme as the base. Provide numericStyle(size, weight) that returns GoogleFonts.inter(...).
   - app_theme.dart: lightTheme() and darkTheme() factory methods returning ThemeData. Scaffold background, card theme, input decoration, elevated/outlined/text button themes, chip theme, snackbar theme — all pulled from AppColors. Default font: Cairo. Material3 enabled.

6. main.dart:
   - Load .env via flutter_dotenv (.env.example committed, .env in .gitignore).
   - Enable system UI style for Teal Medica primary.
   - runApp(ProviderScope(child: Patient360App()))
   - Patient360App is defined in app.dart with MaterialApp.router, go_router hooked up to a temporary placeholder route (just a scaffold saying "Patient 360 — scaffolding OK") and Localizations with ar-SY primary + RTL.

7. Verify: flutter analyze returns 0 issues. flutter test runs the default widget test successfully (update it to just assert the placeholder screen renders).

8. Initialize git, .gitignore the Flutter defaults + .env, and commit:
   "chore(scaffold): bootstrap Flutter project with Riverpod, go_router, Teal Medica theme tokens

   - pubspec locked to stable versions for Riverpod 3, go_router 15, dio 5, freezed 2
   - complete theme token layer (light + dark) mirroring PatientDashboard.css
   - Cairo + Inter via google_fonts
   - lucide_icons_flutter with RTL *Dir variants
   - analysis_options.yaml with strict lints + custom_lint + riverpod_lint
   - RTL Arabic locale as the default"

WHAT NOT TO DO in this prompt:
- Do not build a login screen, dashboard, or any feature UI.
- Do not create models, repositories, API clients, or Riverpod providers beyond what is needed to run main.dart.
- Do not add Firebase yet — that is prompt 10.
- Do not touch the patient360frontend/ or backend/ folders.

When done, print the output of `flutter analyze` and `flutter test`, then reply exactly:
"Scaffold complete. Ready for prompt 2."
````

---

## 🎯 Prompt 2 of 11 — Network layer, models, auth repository

````
SCOPE — this prompt:
Build the network layer, shared models, and authentication feature. No UI yet beyond the login screen.

CONTEXT TO READ FIRST:
- patient360_db_final.js — ESPECIALLY the "persons", "children", "accounts", and "patients" collections. Your Dart models must match every field name exactly.
- patient360frontend/src/services/api.js — copy the method signatures and URL paths for authAPI and patientAPI. The mobile app must call the exact same endpoints.
- patient360frontend/src/pages/PatientDashboard.jsx lines 1–250 and the getMyProfile handling around line 975 — this is how the profile payload is shaped.

STEP 1: Network layer (lib/core/network/)
- dio_client.dart: a Riverpod provider `dioProvider` that returns a singleton Dio with baseUrl from env, 15s timeouts, headers Accept:application/json + X-Client:p360-mobile.
- auth_interceptor.dart: intercepts requests to attach `Authorization: Bearer <jwt>` when present. On 401 responses, clears secure storage and emits an `authExpired` event through a `StreamController` exposed by an authEventsProvider. Does NOT attempt a refresh flow yet (backend doesn't expose refresh).
- api_exception.dart: freezed union with cases `network`, `timeout`, `unauthorized`, `server(int, String?)`, `unknown(Object)`. Include `ApiException.fromDioError(DioException)` factory.

STEP 2: Shared response model (lib/shared/models/api_response.dart)
- Generic freezed `ApiResponse<T>` with fields:
  - bool success
  - String? message
  - T? data
  - List<String>? errors
- Manual fromJson factory that takes a `T Function(Object?) fromJsonT`.

STEP 3: Auth domain models (lib/features/auth/domain/)
- user.dart (freezed):
  - String id (from accounts._id)
  - String email
  - List<String> roles
  - bool isActive
  - bool isVerified
  - String? personId
  - String? childId
- person.dart: mirrors the `persons` schema — nationalId, firstName, fatherName, lastName, motherName, dateOfBirth (DateTime), gender, governorate (enum as string), city, address, phoneNumber, alternativePhoneNumber?, email?, profilePhoto? (url, uploadedAt).
- child.dart: mirrors `children` — childRegistrationNumber, parentNationalId, firstName, fatherName, lastName, motherName, dateOfBirth, gender, governorate, city, address, migrationStatus, hasReceivedNationalId.
- patient_profile.dart: mirrors `patients` — bloodType?, height?, weight?, bmi?, smokingStatus?, allergies[], chronicDiseases[], currentMedications[], previousSurgeries[], familyHistory[], emergencyContact? (name, relationship, phoneNumber, alternativePhoneNumber?), medicalCardNumber?.
- auth_session.dart: String jwt + User user + Person/Child identity + PatientProfile patient + bool isMinor.

Generate all json_serializable code via `flutter pub run build_runner build --delete-conflicting-outputs`.

STEP 4: Auth repository (lib/features/auth/data/auth_repository.dart)
- `login({required String email, required String password})` — POSTs /api/auth/login. On success: saves JWT to flutter_secure_storage key `p360.jwt`. **Rejects the login with a thrown ApiException.unauthorized if the returned roles array does not contain "patient"** — this is a patient-only app.
- `getCurrentSession()` — reads JWT; if present, calls GET /api/patient/profile (match the web's patientAPI.getMyProfile); returns AuthSession or null.
- `logout()` — deletes JWT, clears session. (FCM token unregistration will be added in prompt 10.)
- `requestPasswordResetOtp(email)` — POST /api/auth/forgot-password. Returns success only.
- `verifyPasswordResetOtp({email, otp, newPassword})` — POST /api/auth/reset-password.

Wrap each call in try/catch → ApiException. Log via logger, never with print.

STEP 5: Auth Riverpod providers (lib/features/auth/presentation/providers/auth_provider.dart)
Use riverpod_generator annotations:
- `@Riverpod(keepAlive: true) class AuthController extends _$AuthController` with:
  - Future<AuthSession?> build() — reads existing session from secure storage on mount.
  - Future<void> login(email, password) — sets AsyncLoading, calls repo, sets AsyncData/Error, on success go_router.go to /home.
  - Future<void> logout() — clears state, go_router.go to /login.

STEP 6: Login screen (lib/features/auth/presentation/login_screen.dart)
- Replicates the web Login.jsx look at a phone scale: Teal Medica hero gradient top 40%, white card bottom 60% with:
  - Logo (HeartPulse icon in white circle + "مريض 360°" title + "لوحة المريض" subtitle).
  - Email TextField (keyboardType: emailAddress, LTR forced for input).
  - Password TextField with obscure toggle using LucideIcons.eye / LucideIcons.eyeOff.
  - "تسجيل الدخول" primary button (loading spinner while AsyncLoading).
  - "نسيت كلمة المرور؟" text button → opens forgot-password sheet (3 steps: request OTP → enter OTP → set new password — implement all three as stateful forms inside a single showModalBottomSheet with a PageView).
- Show errors as SnackBar.floating with red background and LucideIcons.alertCircle leading icon.
- The screen must respect RTL — Arabic labels on the right, everything laid out with Directionality.rtl implicitly via MaterialApp locale.

STEP 7: Router
- Update lib/router/app_router.dart with two routes: /login (redirects to /home if session exists) and /home (placeholder — redirects to /login if no session). Redirects are computed from authControllerProvider.

STEP 8: Tests
- test/features/auth/auth_repository_test.dart using mocktail — verify: login rejects accounts without 'patient' role; getCurrentSession returns null when no JWT; 401 response surfaces as ApiException.unauthorized.
- Widget test for login_screen: email + password required validation.

COMMIT:
"feat(auth): network layer, auth domain models, login + password reset flow

- dio client with auth interceptor and unified ApiException
- freezed models for accounts, persons, children, patients (schema-exact)
- AuthRepository enforces patient-only role gate on login
- Forgot password 3-step flow (OTP request → verify → reset)
- Login screen matches Teal Medica hero layout at phone scale"

DO NOT:
- Do NOT build the home dashboard yet.
- Do NOT build any other feature's repository.
- Do NOT add FCM or any background isolate.

When done, paste `flutter analyze` (must be 0 issues) and `flutter test` output, then reply:
"Auth layer complete. Ready for prompt 3."
````

---

## 🎯 Prompt 3 of 11 — Navigation shell, home screen, overview

````
SCOPE — this prompt:
Build the navigation shell (bottom nav + drawer) and the Home screen with its 4 KPIs + recent activity + quick actions. Wire the theme toggle here.

CONTEXT TO READ:
- PatientDashboard.jsx lines 1215–1630 (sidebar render + page header + renderHome).
- PatientDashboard.css lines 1–400 (theme tokens + layout primitives).
- services/api.js patientAPI.getDashboardOverview and patientAPI.getMyProfile method signatures.

STEP 1: Shell widget (lib/shared/widgets/app_shell.dart)
A ShellRoute wrapper used by go_router. It exposes:
- A persistent bottom NavigationBar with 5 destinations (Home / Appointments / Prescriptions / Lab / Profile) — icons via LucideIcons.home, .calendar, .pill, .flaskConical, .user. Active tint = AppColors.action.
- A Drawer (opened from the AppBar leading hamburger) with the SECONDARY destinations: Visits, AI Assistant, Reviews, Notifications, Logout. Drawer background = AppColors.drawer (light) / AppColors.drawerDark (dark). Brand block at top (HeartPulse + "مريض 360°" + "لوحة المريض"). User block (avatar with initial, full name, medical card number, isMinor badge).
- A PreferredSize SliverAppBar rendered by each screen, not by the shell — so each screen owns its title and bell.

STEP 2: Theme controller (lib/core/theme/theme_controller.dart)
- @Riverpod class that persists `ThemeMode` to shared_preferences under key `p360.themeMode` (values: system/light/dark). Default = system. Provide toggle() helper.
- Wire into MaterialApp.themeMode in app.dart.

STEP 3: Common widgets (lib/shared/widgets/)
- primary_button.dart: ElevatedButton with AppColors.action bg, white fg, loading state shows CircularProgressIndicator(strokeWidth: 2).
- ghost_button.dart: OutlinedButton with AppColors.border outline.
- empty_state.dart: mirrors components/ai/EmptyState.jsx — icon (48), title (titleMedium), subtitle (bodyMedium, secondary color), optional cta button.
- loading_spinner.dart: centered CircularProgressIndicator + optional message text below.
- error_snackbar.dart: static `ErrorSnackbar.show(context, title, message)` helper returning a SnackBar with error bg + alertCircle icon + Retry action (optional callback).

STEP 4: Overview domain + data (lib/features/home/)
- domain/overview.dart freezed:
  - int upcomingAppointments
  - int activePrescriptions
  - int pendingLabResults
  - int unreadNotifications
  - List<RecentActivity> recentActivity
- domain/recent_activity.dart freezed:
  - String id
  - String type  (appointment | visit | prescription | lab_test | notification)
  - String? title
  - String? subtitle
  - DateTime occurredAt
- data/overview_repository.dart: getDashboardOverview() → GET /api/patient/overview.
- presentation/providers/home_providers.dart:
  - @riverpod Future<Overview> dashboardOverview(DashboardOverviewRef ref) — calls repository.
  - @riverpod Future<AuthSession> currentSession(CurrentSessionRef ref) — reads auth state.

STEP 5: Home screen (lib/features/home/presentation/home_screen.dart)
Build the 4 sections matching renderHome in PatientDashboard.jsx:

(a) Hero card (HeroCard widget):
    - Teal Medica gradient (primary → action, 135°).
    - Arabic greeting based on hour: "صباح الخير" (5 ≤ hour < 12) else "مساء الخير".
    - First name from session.identity.firstName.
    - Subtitle text from the dashboard (copy exactly: "نتمنى لك يوماً صحياً. يمكنك متابعة مواعيدك ووصفاتك ونتائج الفحوصات من هنا.").
    - Trailing HeartPulse icon (48) in white with 20% opacity background circle.

(b) KPI grid (KpiGrid widget):
    - 2×2 grid, 12px gap, 16px horizontal padding.
    - Each KpiTile: leading Lucide icon (22), big value, small label. Tap navigates via go_router.
    - Variant colors:
      - info (Calendar) → AppColors.action bg-tint
      - success (Pill) → AppColors.success tint
      - warning (FlaskConical) → AppColors.warning tint
      - accent (Bell) → AppColors.accent tint
    - While overviewProvider is loading, show skeletons (shimmer).

(c) Recent activity card:
    - Card with header "النشاط الأخير" + Clock icon.
    - List of up to 5 RecentActivity items. Each: icon circle (type-colored), type label (Arabic), title (auto-dir), subtitle, timestamp (LTR, ar-SY locale Intl).
    - Empty state: EmptyState(icon: Clock, title: "لا يوجد نشاط حديث", subtitle: "سيظهر هنا آخر نشاطاتك الطبية.").

(d) Quick actions card:
    - 2x2 grid of QuickAction tiles: Book appointment / Prescriptions / AI assistant / Profile. Each navigates via go_router. Label Arabic, ChevronLeftDir chevron on trailing side (RTL-aware).

STEP 6: Page header (lib/shared/widgets/page_header.dart)
Reusable AppBar-like widget used by every feature screen:
- Leading: Builder(builder: (ctx) => IconButton(icon: Menu, onPressed: () => Scaffold.of(ctx).openDrawer())).
- Title: Arabic section name + optional subtitle beneath.
- Actions:
  - Bell icon with unread-count badge (0 shown as dot-only, 1-99 numeric, 100+ shows "99+"). Tap navigates to /notifications.
  - Theme toggle: Sun / Moon icon that calls themeControllerProvider.notifier.toggle().

STEP 7: Wire go_router
Routes:
- /login (standalone)
- ShellRoute with bottom nav:
  - /home
  - /appointments
  - /prescriptions
  - /lab
  - /profile
- Secondary (not in bottom nav, still inside shell):
  - /visits
  - /ai
  - /reviews
  - /notifications

Redirect logic: unauthenticated → /login; authenticated on /login → /home.

STEP 8: Tests
- Widget test: home_screen renders 4 KPI tiles with placeholder zeros while loading; renders actual values after AsyncData; renders empty state for recent activity when empty.
- Widget test: theme toggle switches ThemeMode from light → dark.

COMMIT:
"feat(home+shell): navigation shell, home screen with KPIs and recent activity

- bottom nav (Home/Appointments/Prescriptions/Lab/Profile) + drawer (secondary)
- reusable PageHeader with notifications bell badge and theme toggle
- hero card, KpiGrid, recent activity, quick actions — parity with web renderHome
- ThemeController persists to shared_preferences
- ar-SY Intl for dates and time-aware Arabic greeting"

DO NOT:
- Do NOT load appointments / prescriptions / labs / notifications data yet. Leave those tabs showing placeholder EmptyState with a "جاري التطوير" subtitle.
- Do NOT implement the drawer's logout flow fully — stub it to call authControllerProvider.logout().

When done, screenshot the home screen in light + dark mode (use flutter screenshot or describe the render), run flutter analyze + flutter test, then reply:
"Shell + home complete. Ready for prompt 4."
````

---

## 🎯 Prompt 4 of 11 — Appointments: list, booking wizard, cancel flow

````
SCOPE — this prompt:
Build the Appointments feature end-to-end, including the 3-step booking wizard and the cancel-with-reason modal.

CONTEXT TO READ:
- PatientDashboard.jsx lines 327–540 (AppointmentBookingFlow component).
- PatientDashboard.jsx lines 273–324 (AppointmentCancelForm).
- PatientDashboard.jsx lines 1632–1820 (renderAppointments + cards).
- patient360_db_final.js — collection "appointments" — match every enum and field.
- services/api.js — patientAPI.getAppointments, searchDoctors, getDoctorSlots, bookAppointment, cancelAppointment.

STEP 1: Domain models (lib/features/appointments/domain/)
- appointment.dart freezed — ALL fields from the appointments collection:
  - String id, String appointmentType (enum), String? patientPersonId, String? patientChildId, String? doctorId, String? dentistId, String? laboratoryId, String? hospitalId, String? slotId
  - DateTime appointmentDate, String appointmentTime, int? estimatedDuration
  - String reasonForVisit, String status (enum), String bookingMethod, String? cancellationReason (enum)
  - DateTime? cancelledAt, String priority, String paymentStatus, String? paymentMethod, String? visitId, String? notes
  - DateTime createdAt, DateTime updatedAt
  - Optional denormalized doctor info for display (when the backend joins it): DoctorSummary? doctor.
- doctor_summary.dart freezed — id, firstName, lastName, specialization, averageRating?, consultationFee?, hospitalAffiliation?.
- availability_slot.dart freezed — id, DateTime date, String startTime, String endTime, int maxBookings, int currentBookings, bool isAvailable, String status. Include a computed bool isBooked => currentBookings >= maxBookings || !isAvailable.
- Include fromJson / toJson.

STEP 2: Arabic enum labels (lib/core/localization/arabic_labels.dart — add to what exists)
- appointmentStatusLabels: scheduled → "مجدول", confirmed → "مؤكد", checked_in → "تم الحضور", in_progress → "قيد التنفيذ", completed → "مكتمل", cancelled → "ملغى", no_show → "لم يحضر", rescheduled → "أُعيد الجدولة".
- priorityLabels: routine → "روتيني", urgent → "عاجل", emergency → "طارئ".
- cancellationReasonLabels: patient_request → "طلب المريض", doctor_unavailable → "الطبيب غير متاح", emergency → "حالة طارئة", duplicate → "موعد مكرر", other → "سبب آخر".
- specializationLabels: cardiology → "قلبية", dermatology → "جلدية", ... (all 24 values from the DB enum — take them from patient360_db_final.js lines around doctors.specialization).

STEP 3: Repository (lib/features/appointments/data/appointments_repository.dart)
- getAppointments({String? statusGroup}) → GET /api/patient/appointments?statusGroup=…
- searchDoctors({String? specialization, String? governorate}) → GET /api/patient/doctors/search
- getDoctorSlots(doctorId) → GET /api/patient/doctors/{doctorId}/slots
- bookAppointment(BookAppointmentDto) → POST /api/patient/appointments
- cancelAppointment(id, {String cancellationReason}) → POST /api/patient/appointments/{id}/cancel

Unit test: all five methods with mocktail + dio mock.

STEP 4: Providers (lib/features/appointments/presentation/providers/)
- appointmentsProvider — AsyncNotifier fetching list, exposing groupedByStatus getter:
  - upcoming: [scheduled, confirmed, checked_in, in_progress]
  - past: [completed]
  - cancelled: [cancelled, no_show, rescheduled]
- bookingFlowProvider — class with state {step: search|slots|confirm, specialization, selectedDoctor, doctorsList, selectedSlot, slotsList, reasonForVisit, priority}. Methods: searchDoctors, pickDoctor, pickSlot, confirmBooking.
- Provide an invalidation signal from bookingFlowProvider.confirmBooking so appointmentsProvider refreshes after a successful booking.

STEP 5: Appointments screen (lib/features/appointments/presentation/appointments_screen.dart)
- PageHeader title "المواعيد", subtitle "إدارة المواعيد القادمة والسابقة".
- SegmentedButton-like 3-tab row: "القادمة" / "السابقة" / "الملغاة" — tab state is local to the screen.
- Primary FAB "+" → opens BookingFlowSheet as a modal bottom sheet.
- Body: AsyncValue.when:
  - loading → LoadingSpinner.
  - error → empty state with retry.
  - data → Column of AppointmentCard per grouped appointment, or EmptyState if the group is empty.

AppointmentCard widget:
- Leading icon circle (Stethoscope for doctor appointment, User for dentist, FlaskConical for lab).
- Title: appointment.reasonForVisit (auto-dir).
- Subtitle (column): doctor name (if denormalized), date (LTR via Intl ar-SY) + time (LTR).
- Trailing: status chip using statusLabels map + priority chip if urgent/emergency.
- Expandable for more details.
- Action row on upcoming appointments: "إلغاء الموعد" ghost button → opens CancelSheet.
- Dark-mode aware via Theme.of(context).

STEP 6: BookingFlowSheet (lib/features/appointments/presentation/booking_flow_sheet.dart)
- showModalBottomSheet with isScrollControlled, full-height, useSafeArea, drag handle visible.
- PageView controlled by bookingFlowProvider.state.step.
- Step 1 (search):
  - DropdownButtonFormField for specialization (24 options from specializationLabels) + optional governorate dropdown (14 values) + "بحث" primary button.
  - Results: ListView of DoctorSummaryTile (Stethoscope, "د. <firstName> <lastName>" + specialization + rating stars + consultationFee). Tap → pickDoctor → step advances.
- Step 2 (slots):
  - LoadingSpinner while fetching. Empty state if no slots.
  - ListView of SlotTile: Calendar icon + date (LTR) + time range (LTR).
  - Tap → pickSlot → step advances.
  - "رجوع" ghost button sends back to step 1.
- Step 3 (confirm):
  - Summary block: doctor name (auto-dir), date, time.
  - TextField multiline for reasonForVisit (required, maxLength 500).
  - RadioListTile row for priority (routine/urgent/emergency with colored leading dots).
  - "تأكيد الحجز" primary button (disabled while reason empty). On success: close sheet, show SnackBar success "تم الحجز بنجاح", invalidate appointmentsProvider.
- Show a top stepper indicator "1 — اختيار الطبيب · 2 — اختيار الموعد · 3 — التأكيد" with the active step highlighted in action color.

STEP 7: CancelSheet (lib/features/appointments/presentation/cancel_sheet.dart)
- showModalBottomSheet with warning styling (AppColors.warning header strip).
- Title: "إلغاء الموعد".
- Body: "هل أنت متأكد من إلغاء موعد «<reasonForVisit>»?"
- RadioListTile group for the 5 cancellation reasons.
- Footer: "تراجع" ghost + "تأكيد الإلغاء" danger button → cancelAppointment → close sheet → SnackBar + refresh list.

STEP 8: Tests
- Repository: all 5 methods succeed and handle errors.
- Widget tests:
  - tab switching renders the correct grouped list
  - cancel sheet shows 5 radio options
  - booking step 3 disables confirm when reason empty

COMMIT:
"feat(appointments): list + 3-step booking wizard + cancel with reason

- schema-exact appointment/slot/doctor domain models
- segmented tabs: upcoming/past/cancelled with proper status grouping
- BookingFlowSheet: specialization→doctors→slots→confirm with priority
- CancelSheet: 5-reason DB enum, warning styling
- appointmentsProvider invalidated on successful booking/cancel"

DO NOT:
- Do NOT implement reschedule (out of scope for v1 — mirrors web).
- Do NOT fetch denormalized doctor data client-side — expect the backend to join it. If the field is missing, show "طبيب" as a placeholder.

When done, run flutter analyze + flutter test, then reply:
"Appointments complete. Ready for prompt 5."
````

---

## 🎯 Prompt 5 of 11 — Visits timeline with vital signs, meds, ECG

````
SCOPE — this prompt:
Build the Visits feature — a vertical timeline of clinical encounters, each card expandable to show vitals, prescribed meds, doctor notes, follow-up, visit photo, ECG analysis.

CONTEXT TO READ:
- PatientDashboard.jsx lines 1820–2050 (renderVisits + visit card).
- PatientDashboard.jsx vital signs display helpers around lines 1750–1820.
- patient360_db_final.js — collection "visits" including the full vitalSigns sub-object and ecgAnalysis sub-object.
- services/api.js — patientAPI.getVisits.

STEP 1: Domain models (lib/features/visits/domain/)
- vital_signs.dart freezed with nullable fields: bloodPressureSystolic, bloodPressureDiastolic, heartRate, oxygenSaturation, bloodGlucose, temperature, weight, height, respiratoryRate. Include helper `hasAny` and per-field unit strings.
- prescribed_medication.dart freezed: medicationId?, medicationName, dosage, frequency, duration, route (7-value enum), instructions?, quantity?.
- ecg_analysis.dart freezed: analyzedAt, ecgImageUrl?, topPrediction?, recommendation?, predictions[] (class + confidence + arabicLabel + englishLabel), modelVersion?.
- visit.dart freezed: id, visitType (enum), patientPersonId?, patientChildId?, doctorId?, dentistId?, hospitalId?, appointmentId?, DateTime visitDate, status, chiefComplaint, diagnosis?, VitalSigns? vitalSigns, List<PrescribedMedication> prescribedMedications, doctorNotes?, followUpDate?, followUpNotes?, visitPhotoUrl?, visitPhotoUploadedAt?, EcgAnalysis? ecgAnalysis, paymentStatus, DateTime createdAt.
- Optional denormalized doctor name for display.

STEP 2: Arabic enum maps (extend arabic_labels.dart)
- visitTypeLabels: regular → "زيارة عادية", follow_up → "متابعة", emergency → "طارئة", consultation → "استشارة", dental → "أسنان", lab_only → "مختبر".
- visitStatusLabels.
- paymentStatusLabels: pending, paid, partially_paid, cancelled, free.
- medicationRouteLabels (7 values — match PatientDashboard.jsx MED_ROUTE_LABELS exactly).

STEP 3: Repository (lib/features/visits/data/)
- getVisits() → GET /api/patient/visits.

STEP 4: Providers
- visitsProvider — AsyncNotifier returning List<Visit> sorted by visitDate descending.
- expandedVisitsProvider — a local StateProvider<Set<String>> (feature-scoped) that tracks which visits are currently expanded.

STEP 5: Visits screen (lib/features/visits/presentation/visits_screen.dart)
- PageHeader title "الزيارات الطبية", subtitle "سجل الزيارات والفحوصات السابقة".
- Body: AsyncValue.when → vertical timeline. Each visit is a row: a left rail with a colored dot + vertical line (use CustomPaint for the connector), and a card to the right.
- VisitCard widget (widgets/visit_card.dart):
  - Collapsed: chief complaint title (auto-dir), row of chips (visit type, status, date LTR).
  - Tap → toggles expanded set.
  - Expanded: each sub-section only renders when data is present:
    a. Diagnosis (if any) — Activity icon + header + p tag.
    b. Vital signs — if VitalSigns.hasAny. Use the VitalSignsGrid widget below.
    c. Prescribed medications — if non-empty. Each row: Pill icon, name (bold auto-dir), meta line "<dosage> • <frequency> • <duration>", route label pill, instructions in muted color.
    d. Doctor notes — FileText icon + header + p tag.
    e. Follow-up date — Calendar icon + date + optional notes.
    f. Visit photo — shows CachedNetworkImage (max 240px height), tap → open in full-screen gallery via a separate screen (PhotoView-style — use photo_view package, add it to pubspec here).
    g. ECG analysis — only when ecgAnalysis != null. See VitalEcgBlock below.
    h. Payment status chip at the bottom.

STEP 6: VitalSignsGrid widget (widgets/vital_signs_grid.dart)
- 3-column grid of cells (use GridView.count or Wrap with fixed width). Each cell:
  - Small icon (HeartPulse for pressure, Heart for HR, Droplet for glucose, etc. — pick from Lucide).
  - Label (Arabic, secondary color, size 11).
  - Value bold, size 18, LTR.
  - Unit small secondary.
- Only render cells where the value is non-null.
- Apply clinical flag colors:
  - BP systolic ≥ 140 OR diastolic ≥ 90 → warning tint.
  - BP systolic ≥ 180 OR diastolic ≥ 120 → error tint.
  - HR < 60 or > 100 → warning.
  - Temp > 38 → warning, > 39.5 → error.
  - SpO2 < 95 → warning, < 90 → error.
  - Glucose > 180 fasting → warning.
- Never block the UI — if values are missing, just hide the cell.

STEP 7: EcgBlock widget (widgets/ecg_block.dart)
- Heart icon + "تحليل تخطيط القلب" header.
- Top prediction highlighted.
- Recommendation paragraph.
- Link "عرض صورة التخطيط" → opens ecgImageUrl via url_launcher (external).
- Predictions bar list: each class with a progress bar whose width = confidence %.

STEP 8: Add the drawer entry
- Wire the Visits drawer item in AppShell to navigate to /visits.

STEP 9: Tests
- VisitsRepository: success + 401 handled.
- Widget tests:
  - Renders empty state when list is empty.
  - Expanding a card reveals diagnosis subsection when diagnosis present; does NOT render the subsection when diagnosis is empty.
  - VitalSignsGrid flags BP 145/95 as warning styling.

COMMIT:
"feat(visits): timeline view with vitals, medications, ECG, visit photo

- schema-exact Visit / VitalSigns / EcgAnalysis / PrescribedMedication models
- expandable timeline card with conditional subsections
- VitalSignsGrid with WHO/AHA-aligned warning/critical thresholds
- ECG block with prediction bars and external image link
- medication route enum mapped to Arabic labels (7 values)"

DO NOT:
- Do NOT re-create the ECG AI analysis itself — the mobile app only *displays* results produced by the doctor's web dashboard.

When done, run flutter analyze + flutter test, then reply:
"Visits complete. Ready for prompt 6."
````

---

## 🎯 Prompt 6 of 11 — Prescriptions, QR code, medication reminders

````
SCOPE — this prompt:
Build the Prescriptions feature AND the reminder-scheduling infrastructure. In this prompt, "الأدوية" is not yet a bottom-nav destination — you'll wire that in Prompt 6.5. Here we build the prescription list, QR card, and the reminder setup flow that a patient runs per active prescription.

CONTEXT TO READ:
- PatientDashboard.jsx lines 2047–2440 (renderPrescriptions + full prescription card).
- patient360_db_final.js — collection "prescriptions" with medications array.
- services/api.js — patientAPI.getPrescriptions.

ADD DEPENDENCIES TO pubspec.yaml:
- flutter_local_notifications: ^17.2.3   (local scheduling, no server needed)
- timezone: ^0.9.4                       (required for scheduled zonedSchedule)
- flutter_timezone: ^3.0.1               (reads device timezone for Damascus time)
- permission_handler: ^11.3.1            (notification permission on Android 13+)
- shared_preferences: ^2.3.2             (already in scaffold, confirm)
- qr_flutter: ^4.1.0                     (already in scaffold, confirm)
- uuid: ^4.5.0                           (schedule and adherence record IDs)

STEP 1: Domain (lib/features/prescriptions/domain/)

medication_item.dart freezed — per `prescriptions.medications` entry:
  - medicationId?, medicationName, arabicName?, dosage, frequency, duration
  - route (7-value enum matching visits: oral, topical, injection, inhalation, sublingual, rectal, other)
  - instructions?, quantity?
  - bool isDispensed, DateTime? dispensedAt.

prescription.dart freezed — mirror the collection exactly:
  - String id, String prescriptionNumber
  - String? patientPersonId / patientChildId, String? doctorId, String? dentistId, String? visitId
  - DateTime prescriptionDate, DateTime? expiryDate
  - List<MedicationItem> medications
  - String status (active | dispensed | partially_dispensed | expired | cancelled)
  - String? verificationCode, String? qrCode
  - int printCount
  - String? dispensingId, String? prescriptionNotes
  - DateTime createdAt, DateTime updatedAt.

Computed helpers on Prescription:
  - bool get isFullyDispensed => status == 'dispensed' || (medications.isNotEmpty && medications.every((m) => m.isDispensed));
  - DateTime? get firstDispensedAt => earliest non-null dispensedAt across medications.
  - bool get isActive => status == 'active' || status == 'partially_dispensed';

STEP 2: Reminder domain (lib/features/prescriptions/domain/reminders/)

reminder_schedule.dart freezed:
  - String id                  // UUID generated client-side via uuid package
  - String prescriptionId
  - int medicationIndex        // index into prescription.medications[]
  - String medicationName      // denormalized for notification body
  - String dosage              // e.g. "500mg"
  - List<TimeOfDayDto> times   // daily times, sorted ascending (e.g. 08:00, 14:00, 20:00)
  - DateTime startDate
  - DateTime endDate           // startDate + parsed duration (exclusive)
  - bool isEnabled             // patient can toggle without deleting
  - DateTime createdAt, DateTime updatedAt.

time_of_day_dto.dart freezed:
  - int hour (0–23), int minute (0–59).
  - String get label => HH:MM string.

adherence_record.dart freezed — the local-only audit trail, shaped for future server sync:
  - String id                  // UUID
  - String prescriptionId
  - int medicationIndex
  - DateTime scheduledAt       // the dose's scheduled time (not the tap time)
  - DateTime takenAt           // when the patient tapped "taken"
  - DateTime createdAt
  - Include toJson/fromJson so a future sync can POST batches.

STEP 3: Frequency parser (lib/features/prescriptions/domain/frequency_parser.dart)

Pure function `List<TimeOfDayDto> parseFrequencyToDefaults(String frequencyRaw)`.
Strategy: lowercase + trim + match against an ordered rule table of Arabic and English patterns.

Rules (priority order):
  - r"once\b|مرة واحدة|قبل النوم|bedtime"               → [22:00]
  - r"twice|2 times|مرتين"                              → [08:00, 20:00]
  - r"3 times|three times|ثلاث مرات"                    → [08:00, 14:00, 20:00]
  - r"4 times|four times|أربع مرات"                     → [08:00, 12:00, 16:00, 20:00]
  - r"every 4 hours|كل 4 ساعات"                         → [06:00, 10:00, 14:00, 18:00, 22:00]
  - r"every 6 hours|كل 6 ساعات"                         → [08:00, 14:00, 20:00, 02:00]
  - r"every 8 hours|كل 8 ساعات"                         → [08:00, 16:00, 00:00]
  - r"every 12 hours|كل 12 ساعة"                        → [08:00, 20:00]
  - r"morning|صباحاً"                                    → [08:00]
  - r"evening|مساءً"                                     → [20:00]
  - fallback                                            → [08:00] (single dose, user will adjust)

Also export `Duration parseDurationToDays(String durationRaw)`:
  - r"(\d+)\s*day|يوم"                                  → Duration(days: N)
  - r"(\d+)\s*week|أسبوع"                               → Duration(days: N*7)
  - r"(\d+)\s*month|شهر"                                → Duration(days: N*30)
  - r"ongoing|continuous|مستمر"                          → Duration(days: 365)  // 1-year cap
  - fallback                                            → Duration(days: 7)

Unit test the parser with 15+ real-world phrasings (Arabic + English + malformed).

STEP 4: Reminder storage (lib/features/prescriptions/data/reminder_local_store.dart)

- Uses shared_preferences with namespaced keys:
  - "p360.reminders.v1"               → JSON-encoded list of ReminderSchedule
  - "p360.adherence.v1"               → JSON-encoded list of AdherenceRecord
  - "p360.reminders.lastScheduledAt"  → ISO timestamp of last scheduler run
- Methods:
  - Future<List<ReminderSchedule>> loadAll();
  - Future<void> upsert(ReminderSchedule schedule);
  - Future<void> removeByPrescriptionId(String prescriptionId);
  - Future<void> recordAdherence(AdherenceRecord record);
  - Future<List<AdherenceRecord>> adherenceForRange(DateTime from, DateTime to);
  - Future<AdherenceRecord?> findAdherence({required String prescriptionId, required int medicationIndex, required DateTime scheduledAt});
- All JSON serialization via freezed toJson/fromJson. Tolerate version drift — future versions add fields but old data still loads.

STEP 5: Notification scheduler (lib/features/prescriptions/data/notification_scheduler.dart)

- initialize() — called ONCE from main.dart after `flutter_local_notifications` setup:
  - Configure Android notification channel id="p360_meds", name="تذكيرات الأدوية", importance=high.
  - Initialize iOS settings (sound + badge + alert).
  - Load device timezone via flutter_timezone → tz.setLocalLocation(tz.getLocation(name)).

- Future<bool> requestPermission() — returns whether permission granted. Shows Arabic rationale dialog BEFORE the OS prompt on first call:
  - Title: "السماح بالتذكيرات"
  - Body: "سنستخدم الإشعارات لتذكيرك بمواعيد أدويتك في الوقت المحدد."
  - Confirm → OS permission flow. Deny → returns false (caller shows graceful fallback).

- Future<void> scheduleSlidingWindow(List<ReminderSchedule> schedules, {int windowDays = 7}):
  - Step 1: cancel ALL existing notifications (clear + re-schedule since we own the full list).
  - Step 2: for each enabled ReminderSchedule, for each day in the next windowDays:
    - Skip if date < schedule.startDate or date > schedule.endDate.
    - For each time in schedule.times:
      - Compute the zoned DateTime in Damascus timezone.
      - Skip if already in the past.
      - Compute a deterministic notification ID: hash(scheduleId + isoDateTime) & 0x7fffffff.
      - zonedSchedule(
          id,
          title="حان وقت دواء ${schedule.medicationName}",
          body="${schedule.dosage} — اضغط لتسجيل الجرعة",
          scheduledDateTime,
          NotificationDetails with channel p360_meds,
          payload=jsonEncode({type:"med_reminder", scheduleId, medicationIndex, scheduledAt: isoDateTime}),
          androidScheduleMode: exactAllowWhileIdle,
          matchDateTimeComponents: null  // one-shot; next window refresh re-schedules
        )
  - Step 3: track total scheduled; if approaching 60 on iOS, log a warning and truncate.
  - Step 4: write lastScheduledAt to shared_preferences.

- Future<void> cancelByPrescription(String prescriptionId) — removes the schedule from the store and cancels notifications. Called when a prescription is fully dispensed, expired, or its reminder is disabled.

- onDidReceiveNotificationResponse handler:
  - Parses payload, extracts scheduleId and scheduledAt.
  - Deep-link via GoRouter: /medications?tab=schedule&focusDose={scheduleId}:{scheduledAtIso}.

Every scheduler method must work when permission is denied — it simply becomes a no-op that logs a warning. Never throws to the caller.

Integration points: call `notificationScheduler.scheduleSlidingWindow(...)` from:
1. App resume (AppLifecycleState.resumed) — re-scheduling the next 7 days.
2. After the reminder setup sheet is saved (Step 8 below).
3. After logout (call cancelAll) — another patient on the same device must not see leftover reminders.

STEP 6: Providers (lib/features/prescriptions/presentation/providers/)

Repository:
- prescriptions_repository.dart → getPrescriptions() → GET /api/patient/prescriptions.

Riverpod providers using riverpod_generator:
- prescriptionsProvider — AsyncNotifier<List<Prescription>>. Computed `grouped` getter:
  - active: {active, partially_dispensed}
  - dispensed: {dispensed}
  - expired: {expired, cancelled}

- remindersProvider — AsyncNotifier<List<ReminderSchedule>>. Methods:
  - Future<void> createOrUpdate(ReminderSchedule schedule) — upserts to local store + re-schedules sliding window + invalidates self.
  - Future<void> toggleEnabled(String id, bool enabled) — same.
  - Future<void> deleteByPrescription(String prescriptionId) — same.

- adherenceProvider — AsyncNotifier<List<AdherenceRecord>>. Methods:
  - Future<void> markTaken({required String prescriptionId, required int medicationIndex, required DateTime scheduledAt}) — records with takenAt=DateTime.now() + invalidates.
  - Computed: adherenceRateForWeek({required DateTime weekStart}) returning {expectedDoses, takenDoses, rate}.

- activeReminderTodayProvider — Stream-like provider using a Timer.periodic(Duration(minutes: 1)) that emits the list of (schedule, scheduledTime) pairs due in the next 60 minutes. Used by the home hero to show "دواء Cipro خلال 15 دقيقة".

STEP 7: Standalone Prescriptions list screen (for this prompt, to be embedded by Prompt 6.5)

lib/features/prescriptions/presentation/prescriptions_screen.dart:
- PageHeader title "الوصفات الطبية", subtitle "الوصفات النشطة والمصروفة".
- 3-tab SegmentedButton: "النشطة" / "تم صرفها" / "منتهية/ملغاة".
- Sorted by prescriptionDate desc.
- Card list of PrescriptionCard (see Step 8).
- Empty states per tab, matching copy from PatientDashboard.jsx.

Also export a PrescriptionsList widget (body only, no PageHeader) for 6.5 to embed.

STEP 8: PrescriptionCard widget (lib/features/prescriptions/presentation/widgets/prescription_card.dart)

Collapsed:
  - Leading: Pill icon circle (action tint).
  - Title: prescriptionNumber (LTR, Inter).
  - Subtitle: summary line of medication names joined with "، ".
  - Trailing: status chip + ChevronDownDir (RTL-aware).
  - If fully dispensed: subtle success tint + green "تم الصرف في <date>" banner.

Expanded:
  - QR + verification block (widgets/qr_code_card.dart):
    - Render only when !isFullyDispensed AND qrCode != null.
    - QrImageView size 200, foreground AppColors.primary.
    - verificationCode in Inter bold 28 with letter-spacing 4, tap-to-copy → SnackBar "تم النسخ".
    - Instruction: "اعرض هذا الرمز على الصيدلي لصرف الوصفة".

  - **NEW: "تذكيرات الأدوية" section** — only when prescription.isActive:
    - For each medication item in prescription.medications:
      - If a ReminderSchedule exists for this {prescriptionId, medicationIndex}:
        - Row: Bell icon + medication name + small chip showing active times ("08:00 · 14:00 · 20:00") + Switch bound to isEnabled.
        - Long-press → opens ReminderSetupSheet in edit mode.
      - Else:
        - Row: BellOff icon (muted) + medication name + "إعداد التذكير" outlined button → opens ReminderSetupSheet in create mode.

  - Medication list — each MedicationItem as a MedicationRow:
    - Check icon when isDispensed, else Circle icon.
    - Name (bold, auto-dir).
    - Line: dosage • frequency • duration.
    - Small pill: route label (Arabic from medicationRouteLabels).
    - Quantity ("× N") if present.
    - Instructions in a muted box if present.
    - dispensedAt in LTR at the bottom of the row if isDispensed.

  - Prescription notes (if present) — FileText icon + body.
  - Footer: expiry date "ينتهي في <date>" with warning tint if < 7 days remaining.

STEP 9: ReminderSetupSheet (lib/features/prescriptions/presentation/reminder_setup_sheet.dart)

Opens as showModalBottomSheet with isScrollControlled, full-height, drag handle.

Top summary card:
  - Medication name (auto-dir, bold).
  - "الموصوف من الطبيب: <dosage> • <frequency raw> • <duration raw>" — show the doctor's original instructions so the patient understands what they're confirming.

Parsed defaults section:
  - Call parseFrequencyToDefaults(frequency) and parseDurationToDays(duration) on sheet open.
  - Header: "سنذكرك في الأوقات التالية:"
  - Chip row of the parsed times.
  - Each chip tappable → showTimePicker → on confirm, replaces the time and re-sorts.
  - "+" chip at the end → adds a new time (default 12:00).
  - Long-press on a chip → confirms removal.

Date range:
  - "من" date picker (defaults to today).
  - "إلى" date picker (defaults to today + parsed duration).
  - Helper text: "مدة العلاج: <N> يوم".

Enable toggle:
  - Switch: "تفعيل التذكيرات لهذا الدواء" (default on).

Permission rationale (shown only if notification permission is denied):
  - AlertCircle icon + "التذكيرات تتطلب إذن الإشعارات من نظام التشغيل. سنطلب منك الإذن الآن."
  - Button "منح الإذن" → notificationScheduler.requestPermission(). If denied, save the schedule anyway and warn.

Actions row:
  - "إلغاء" ghost button.
  - "حفظ" primary button → remindersProvider.createOrUpdate(schedule) → close sheet → SnackBar "تم حفظ التذكير — سيتم تذكيرك في <next time>".

Validation:
  - At least 1 time required.
  - endDate must be >= startDate.

STEP 10: Home hero upgrade (lib/features/home/presentation/widgets/hero_card.dart)

Extend the existing HeroCard to show an "upcoming dose" chip inline when activeReminderTodayProvider has data:

- If one dose is due within the next 60 minutes:
  - Append a pill chip below the greeting: Pill icon + "الجرعة القادمة: <medicationName> خلال <N> دقيقة".
  - Tap → navigate to /medications?tab=schedule.
- If no dose is upcoming, show nothing extra.
- When the scheduled time passes without a tap, the chip updates to "متأخر بـ <N> دقيقة" in warning tint.

This makes the mobile app's most visible screen medically useful, not just a welcome mat.

STEP 11: Tests

Unit:
- FrequencyParser: 15+ cases including Arabic, English, malformed, and fallback.
- DurationParser: 8+ cases.
- ReminderLocalStore: upsert + load round-trips; JSON versioning tolerance.
- NotificationScheduler: the ID hash is deterministic (same input → same ID).

Widget:
- PrescriptionCard shows "إعداد التذكير" button when no reminder exists for that med.
- PrescriptionCard shows Bell + times chip + Switch when a reminder exists.
- ReminderSetupSheet: "+" chip adds a time; long-press removes a time; "Save" disabled when times.isEmpty.
- HeroCard: upcoming-dose chip renders when provider emits a dose due in 30 min.

Integration-style (fake timezone + fake plugin):
- Creating a reminder schedules N notifications within the 7-day window.
- Toggling isEnabled=false cancels pending notifications for that schedule.

COMMIT:
"feat(prescriptions+reminders): QR card + local notification scheduling

- schema-exact Prescription and MedicationItem models
- 3-tab filter: active/dispensed/expired
- QR card with qr_flutter + tap-to-copy 6-digit verification code
- QR hidden when fully dispensed
- flutter_local_notifications with Damascus timezone and sliding 7-day window
- frequency + duration parsers with Arabic and English patterns (15+ cases tested)
- ReminderSetupSheet: parsed defaults, per-time editing, date range, enable toggle
- Permission rationale dialog before OS prompt (Arabic copy)
- PrescriptionCard gains inline reminder row per medication
- HeroCard shows upcoming dose within 60 minutes
- Adherence data model provisioned (shared_preferences for v1, forward-compatible for server sync)"

DO NOT:
- Do NOT add adherence tracking UI in this prompt — that's Prompt 6.5.
- Do NOT implement the calendar view — that's Prompt 6.5.
- Do NOT add the bottom-nav "الأدوية" destination — that's Prompt 6.5.
- Do NOT send reminder data to the server. All reminder state is local.
- Do NOT auto-dial any pharmacy or doctor on upcoming-dose — patient opens the schedule themselves.

When done, run flutter analyze + flutter test, then reply:
"Prescriptions + reminders complete. Ready for prompt 6.5."
````

---

## 🎯 Prompt 6.5 of 11 — Medications hub: today's schedule, calendar, adherence tracking

````
SCOPE — this prompt:
Build the "الأدوية" bottom-nav destination. It is a parent screen with 3 internal tabs: "الجدول اليوم" (default), "التقويم", "الوصفات". Schedule tab shows today's doses with mark-as-taken. Calendar tab shows a week strip + month view with adherence dots. Prescriptions tab embeds the list from Prompt 6.

CONTEXT TO READ:
- Prompt 6 output (this is a direct continuation).
- Flow architecture: device-local reminders (Prompt 6) + visual surface (this prompt) + deep-link from notification taps (Prompt 6 already registered the handler).

ADD DEPENDENCIES TO pubspec.yaml:
- table_calendar: ^3.1.2    (battle-tested, RTL-aware, ar_SA locale supported)

STEP 1: Update bottom-nav (lib/shared/widgets/app_shell.dart)

Replace the 5 bottom-nav destinations from Prompt 3:
  Home · Appointments · Prescriptions · Lab · Profile
with:
  Home · Appointments · **Medications** · Lab · Profile.

- Icon for Medications: LucideIcons.pill.
- Label: "الأدوية".
- Active tint: AppColors.action.
- Route: /medications.

Remove the standalone /prescriptions route from go_router; replace it with /medications (the sub-tab is controlled via query param ?tab=). Update any existing navigator calls that hit /prescriptions to use /medications?tab=prescriptions.

STEP 2: MedicationsScreen (lib/features/medications/presentation/medications_screen.dart)

A HookConsumerWidget managing the active sub-tab. Reads `?tab=` query param on route entry to allow deep-linking from the home hero's upcoming-dose chip and from notification taps.

Layout:
- PageHeader title "الأدوية", subtitle "جرعاتك اليومية وأدويتك".
- SegmentedButton (3 options, full-width): "الجدول اليوم" (default) / "التقويم" / "الوصفات".
- IndexedStack body keeps sub-tab state alive across switches.

Query param parsing:
- ?tab=schedule → index 0 (default).
- ?tab=calendar → index 1.
- ?tab=prescriptions → index 2.
- ?focusDose={scheduleId}:{scheduledAtIso} → handled by TodayScheduleTab.

STEP 3: Today's Schedule sub-tab (lib/features/medications/presentation/widgets/today_schedule_tab.dart)

Builds a list of ScheduledDose items for today.

ScheduledDose local value type (lib/features/medications/domain/scheduled_dose.dart freezed):
  - String prescriptionId
  - int medicationIndex
  - String medicationName
  - String dosage
  - DateTime scheduledAt       // today at this time
  - bool isTaken
  - DateTime? takenAt
  - DoseWindow window          // upcoming | current | overdue | taken | missed

DoseWindow enum derivation (pure function, unit-tested):
  - taken: adherenceProvider has a matching record (this wins over all other states).
  - upcoming: scheduledAt > now.
  - current: now is within ±30 minutes of scheduledAt and not taken.
  - overdue: scheduledAt < now - 30m and not taken and < 4 hours old.
  - missed: scheduledAt < now - 4 hours and not taken.

Top card: AdherenceSummaryCard
  - Shows today's progress: "4 من 7 جرعات اليوم" with a horizontal progress bar.
  - Weekly adherence rate computed from adherenceProvider.adherenceRateForWeek.
  - Icon: Activity.

List below, grouped by time of day with sticky time headers (e.g. "الصباح 08:00", "الظهيرة 14:00", "المساء 20:00", "الليل 22:00"):
  - Each DoseRow:
    - Leading: DoseWindowBadge (colored dot + small label: قادم / الآن / متأخر / مكتمل / فائت).
    - Center: medication name (auto-dir, bold) + dosage + small prescription number ref (LTR, muted).
    - Trailing:
      - For current/overdue/upcoming: large Checkbox (60×60 tap target) → onTap calls adherenceProvider.markTaken(prescriptionId, medicationIndex, scheduledAt).
      - For taken: green check icon + "تم في <takenAt time>" in LTR.
      - For missed: muted X icon + "فات وقتها".
  - Row background tinted faintly by window: current = accent tint, overdue = warning tint, missed = neutral muted.

Empty state (no doses scheduled today):
  - EmptyState(icon: Pill, title: "لا توجد جرعات اليوم", subtitle: "عندما يصف لك الطبيب دواءً وتفعّل التذكير، ستظهر جرعاتك هنا.", cta: {label: "عرض الوصفات", onTap: switch to prescriptions sub-tab}).

If query param `focusDose={scheduleId}:{scheduledAtIso}` is present on route entry:
  - Scroll to the matching dose (use ScrollController + GlobalKey on the row).
  - Highlight it with a 2-second pulse animation (respects MediaQuery.disableAnimations).
  - This is the deep-link target from notification taps.

STEP 4: Calendar sub-tab (lib/features/medications/presentation/widgets/calendar_tab.dart)

Top: WeekStrip widget
  - 7 cells horizontally, from 3 days ago to 3 days ahead, today centered and highlighted.
  - Each cell: Arabic day abbreviation + day number (LTR) + adherence dot:
    - green: 100% taken
    - amber: ≥50% taken
    - red: <50% taken (past only)
    - grey: future (no data)
  - Tap a cell → selects that date and updates the day detail below.
  - Horizontal swipe moves the window.

Middle: TableCalendar (table_calendar package)
  - Locale 'ar_SA' (ar_SY not standard; ar_SA month/day names identical).
  - Format: month view with a format toggle to week view.
  - headerStyle: titleCentered, no default format button (we provide our own toggle).
  - calendarBuilders.markerBuilder: render a small dot row for each day matching the adherence computation.
  - onDaySelected: update selected date.
  - Primary color: AppColors.action; today: AppColors.accent; selected: AppColors.primary.
  - Respects dark mode via Theme.of(context).

Bottom: DayDetailCard
  - Title: "جرعات <formattedDate>".
  - Lists all ScheduledDose for the selected date with the same DoseRow widget as Schedule tab.
  - Past dates are read-only — the checkbox becomes a muted indicator.
  - Future dates show doses but checkboxes are disabled.
  - Empty: "لا توجد جرعات في هذا اليوم".

STEP 5: Prescriptions sub-tab

Simply embed the PrescriptionsList widget (body only) exported from Prompt 6 — no extra PageHeader since the parent MedicationsScreen already has one.

STEP 6: ScheduledDose derivation (lib/features/medications/domain/dose_derivation.dart)

Pure function `List<ScheduledDose> deriveDosesForDate({
  required DateTime date,
  required List<ReminderSchedule> schedules,
  required List<AdherenceRecord> adherence,
  required DateTime now,
})`:

For each schedule where date is within [startDate, endDate] and isEnabled:
  - For each time in schedule.times:
    - Build scheduledAt = DateTime(date.year, date.month, date.day, time.hour, time.minute).
    - Look up adherence record where prescriptionId + medicationIndex + scheduledAt match (within ±1 minute tolerance).
    - Compute DoseWindow per rules in Step 3.
    - Append ScheduledDose.

Return sorted by scheduledAt ascending.

Unit-test this extensively — it's the heart of the UX.

STEP 7: Week adherence computation (lib/features/medications/domain/adherence_stats.dart)

`AdherenceStats statsForRange({
  required DateTime from,   // inclusive
  required DateTime to,     // exclusive
  required List<ReminderSchedule> schedules,
  required List<AdherenceRecord> adherence,
})`:

AdherenceStats freezed:
  - int expectedDoses                 // count of scheduled doses in [from, to)
  - int takenDoses
  - double rate                       // takenDoses / expectedDoses (0 if expected is 0, never NaN)
  - Map<DateTime, double> byDay       // date-only key → rate per day for calendar markers

Used by AdherenceSummaryCard and by the calendar dots.

STEP 8: Dose focus deep-link from notifications

In main.dart (or app.dart router init), register an onDidReceiveNotificationResponse handler that:
  - Parses payload JSON.
  - If type == "med_reminder":
    - appRouter.go('/medications?tab=schedule&focusDose=${scheduleId}:${scheduledAtIso}').

This ties together Prompt 6's scheduler with this prompt's UI. When a reminder fires at 14:00 and the patient taps the notification, they land directly on the focused dose, can tap the checkbox, and the adherence rate updates immediately.

STEP 9: Tests

Unit:
- deriveDosesForDate: covers all 5 DoseWindow states with time-frozen `now`.
- statsForRange: 0-expected returns rate=0 (not NaN); partial-week calculation; boundary conditions on inclusive/exclusive dates.
- Week strip renders 7 cells centered on today.

Widget:
- MedicationsScreen initial load shows TodayScheduleTab.
- Switching tabs via SegmentedButton preserves scroll position (IndexedStack).
- DoseRow: tapping the checkbox writes an AdherenceRecord and immediately flips to "taken" state (optimistic).
- DayDetailCard for a future date disables checkboxes.
- Deep-link /medications?tab=schedule&focusDose=... scrolls to and pulses the matching row.

COMMIT:
"feat(medications): unified hub with today schedule, calendar, adherence

- bottom-nav 'الأدوية' replaces 'الوصفات' (prescriptions now lives as a sub-tab)
- TodayScheduleTab: dose rows with 5-state window logic (upcoming/current/overdue/taken/missed)
- AdherenceSummaryCard with today progress + weekly rate
- CalendarTab: week strip + table_calendar (ar_SA locale) with adherence markers
- DayDetailCard: select any day to see scheduled doses (past = read-only)
- pure derivation layer: deriveDosesForDate + statsForRange (heavily unit-tested)
- notification tap → /medications?tab=schedule&focusDose=... with scroll-to-row + pulse
- all adherence data local-only via shared_preferences (forward-compatible to server sync)"

DO NOT:
- Do NOT send adherence data to the server in v1.
- Do NOT allow editing past adherence (marking a missed dose as taken retroactively) — medically this is a data-integrity risk. Future v2 can add retroactive marking with a separate "backfilled: true" flag.
- Do NOT auto-snooze reminders. A reminder fires once at its scheduled time. If the user ignores it, the system state moves from current → overdue → missed without further OS notifications (matches Medisafe's default behavior).

When done, flutter analyze + flutter test + flutter run on a real device with a 60-second-future reminder to verify end-to-end. Reply:
"Medications hub complete. Ready for prompt 7."
````

---

## 🎯 Prompt 7 of 11 — Lab results with PDF viewer and auto-mark-viewed

````
SCOPE — this prompt:
Build the Lab Results feature. List + 3-tab filter (all/pending/completed) + expandable card showing structured test results table + PDF open. Expanding a completed test auto-marks it viewed.

CONTEXT TO READ:
- PatientDashboard.jsx lines 2270–2550 (renderLabResults + lab card).
- patient360_db_final.js — collection "lab_tests" with testResults[] and testsOrdered[].
- services/api.js — patientAPI.getLabTests, markLabTestViewed.

STEP 1: Domain (lib/features/lab_results/domain/)
- test_ordered.dart freezed: testCode, testName, notes?.
- test_result_row.dart freezed: testCode?, testName, value, numericValue?, unit?, referenceRange?, isAbnormal, isCritical.
- lab_test.dart freezed: id, testNumber, String? patientPersonId/ChildId, String? orderedBy, String? visitId, String? laboratoryId.
  DateTime orderDate, DateTime? scheduledDate, List<TestOrdered> testsOrdered, testCategory, priority, sampleType?, sampleId?, DateTime? sampleCollectedAt.
  String status (enum: ordered | scheduled | sample_collected | in_progress | completed | cancelled | rejected), rejectionReason?.
  List<TestResultRow> testResults, String? resultPdfUrl, DateTime? resultPdfUploadedAt.
  String? labNotes, DateTime? completedAt.
  bool isCritical, bool isViewedByPatient, DateTime? patientViewedAt.
  double? totalCost.
  DateTime createdAt.
- Helpers: `int get abnormalCount` and `int get criticalCount` over testResults.

STEP 2: Arabic labels (extend arabic_labels.dart)
- labStatusLabels: ordered → "مجدول", sample_collected → "تم أخذ العينة", in_progress → "قيد التحليل", completed → "مكتمل", cancelled → "ملغى", rejected → "مرفوض".
- priorityLabels already exist — reuse.

STEP 3: Repository
- getLabTests() → GET /api/patient/lab-tests.
- markLabTestViewed(id) → POST /api/patient/lab-tests/{id}/viewed.

STEP 4: Providers
- labTestsProvider — AsyncNotifier with `grouped` getter for tabs:
  - all: all
  - pending: status != 'completed'
  - completed: status == 'completed'
- Action: markViewed(id) — optimistic UI update + API call. Resilient to failure (revert on error).

STEP 5: Lab results screen (lib/features/lab_results/presentation/lab_results_screen.dart)
- PageHeader title "نتائج المختبر", subtitle "نتائج الفحوصات المخبرية".
- 3-tab row: "الكل" / "بانتظار النتائج" / "مكتملة".
- Body: list of LabTestCard.

LabTestCard:
- Collapsed:
  - Leading: FlaskConical in warning tint (when pending) or success tint (when completed).
  - Title: testNumber (LTR).
  - Meta row: order date (LTR), status chip, unread dot (•) if status==completed && !isViewedByPatient. Abnormal/critical flag chips (AlertTriangle or AlertOctagon) when abnormalCount>0 / criticalCount>0.
- Tap → toggles expanded AND, on first expand of a completed+unviewed test, calls markViewed optimistically.
- Expanded:
  - **Tests ordered section** — if testsOrdered.isNotEmpty: small chip list of "<testCode>: <testName>" (testCode LTR, testName auto-dir).
  - **Results table** (widgets/results_table.dart):
    - DataTable with 3 columns: "الفحص" / "القيمة" / "المعدل الطبيعي".
    - Each row tinted:
      - isCritical → error tint background, alertOctagon leading icon in error color.
      - isAbnormal (not critical) → warning tint, alertTriangle icon.
      - normal → no tint.
    - Value cell: `{value} {unit}` with Inter for numeric, Cairo for alpha.
    - When no results yet, show "لم تصدر النتائج بعد.".
  - **PDF open button** (widgets/pdf_opener.dart):
    - Only when resultPdfUrl != null.
    - Label: "فتح التقرير الكامل (PDF)", icon Download.
    - Tap → launches `${API_BASE_URL}${resultPdfUrl}` via url_launcher externally. (We do NOT embed the PDF in v1 — that avoids adding flutter_pdfview and its size cost.)
  - **Lab notes** — if present.
  - **Sample info** — sampleType, sampleId (LTR), sampleCollectedAt (LTR date) — small muted text at bottom.

STEP 6: Critical result toast
- When the user opens a test that has criticalCount > 0, AFTER the card expands, also show a persistent SnackBar with:
  - AlertOctagon icon + "نتائج حرجة — يُرجى مراجعة الطبيب في أقرب وقت."
  - Action "اتصل بالطبيب" → disabled in v1 (we don't have a call flow yet), just shows the reminder.
- Only show this once per session per test.

STEP 7: Tests
- markViewed optimistic + revert on 500.
- Critical results are visually distinct (widget golden-ish test — assert background color).

COMMIT:
"feat(lab-results): expandable list with PDF link, results table, auto-mark-viewed

- schema-exact LabTest / TestResultRow / TestOrdered models
- 3-tab filter: all/pending/completed
- results table with abnormal/critical tinting (warning/error)
- auto-markViewed on first expand of completed+unviewed test
- PDF opened externally via url_launcher (no in-app viewer in v1)
- critical-result SnackBar reminder on expand"

DO NOT:
- Do NOT embed the PDF viewer in-app in v1.
- Do NOT allow the patient to edit or comment on results.

When done, run flutter analyze + flutter test, then reply:
"Lab results complete. Ready for prompt 8."
````

---

## 🎯 Prompt 8 of 11 — AI Assistant (specialist recommender + emergency triage with geolocation)

````
SCOPE — this prompt:
Build the AI Assistant feature — the most complex screen in the app. Two sub-tabs: specialist recommender (text) and emergency triage (text OR image, with geolocation, and a history list). Deferred from v1: voice input.

CONTEXT TO READ:
- PatientDashboard.jsx lines 2550–2900 (renderAIAssistant + submitTriage + geolocation handling).
- patient360_db_final.js — collection "emergency_reports" with GeoJSON location.
- services/api.js — patientAPI.analyzeSymptoms, submitEmergencyReport, getEmergencyReports.
- The 8 reusable AI atoms under components/ai/ — reproduce them as Dart widgets in lib/features/ai_assistant/widgets/.

ADD DEPENDENCIES TO pubspec.yaml:
- geolocator: ^13.0.0  (for getCurrentPosition with timeout)
- image_picker: ^1.1.0  (for gallery/camera image input)
- permission_handler: ^11.3.0  (for location permission UX)

STEP 1: Domain models (lib/features/ai_assistant/domain/)
- specialist_result.dart: String specialization, String arabicSpecialization, String reasoning, double confidence, String? diseaseGuess, String? arabicDisease.
- severity_level.dart enum: low, moderate, high, critical — with Arabic labels, color, and icon getter.
- emergency_report.dart freezed mirroring the collection:
  - id, patientPersonId?/ChildId?, DateTime reportedAt.
  - String inputType (text | image | voice | combined), String? textDescription, String? imageUrl, String? voiceNoteUrl, String? voiceTranscript.
  - SeverityLevel aiRiskLevel, List<String> aiFirstAid, double? aiConfidence, String? aiRawResponse, String? aiModelVersion, DateTime? aiProcessedAt.
  - EmergencyLocation? location (lat, lng, accuracy, address?).
  - bool ambulanceCalled, DateTime? ambulanceCalledAt, String ambulanceStatus.
  - String status (active | resolved | false_alarm | referred_to_hospital), DateTime? resolvedAt.

STEP 2: 8 AI atom widgets (lib/features/ai_assistant/widgets/)
Port the web components at components/ai/*.jsx into Flutter. Each as its own file. Keep the visual rhythm from the web (padding, border radius, transition timings).

- input_mode_toggle.dart — a SegmentedButton with 2 choices: text / image (icons MessageSquare / Image). Accepts disabled.
- input_text.dart — TextField multi-line with character counter (three states: OK <75% / warning 75-90% / over >90%). Long-press primary Send button submits (since mobile has no Ctrl+Enter). Escape/Clear button clears.
- input_image.dart — wrapper around image_picker:
  - Two-button row: "من المعرض" (ImagePicker.pickImage source: gallery) / "التقاط صورة" (source: camera).
  - Preview below showing the picked file with remove button.
  - Validates MIME (jpg/png/webp) and size (max 10 MB) — rejects with an alert via the provided onAlert callback.
  - Submit button disabled until a valid image is picked.
- severity_badge.dart — pill with icon + Arabic label, color per severity:
  - low → success + CheckCircle.
  - moderate → warning + AlertTriangle.
  - high → error + AlertTriangle.
  - critical → error (darker) + AlertOctagon. Respect MediaQuery.of(ctx).accessibleNavigation / disableAnimations — if on, no pulse animation.
- first_aid_steps.dart — ordered list of numbered steps, each step animated in with a staggered fade+slide (200ms stagger × index). Respects prefers-reduced-motion (MediaQuery.disableAnimations).
- confidence_bar.dart — horizontal bar 0-100% with a gradient whose color shifts:
  - <50% → warning.
  - 50-75% → accent.
  - ≥75% → success.
- empty_state.dart — reuse the shared one from prompt 3 (don't duplicate).
- result_card.dart — a multi-variant card:
  - variant=empty → shows "ابدأ بإدخال أعراضك" or similar copy.
  - variant=specialist → specialty name (big), reasoning paragraph, ConfidenceBar.
  - variant=triage → SeverityBadge + FirstAidSteps + ConfidenceBar + timestamp + optional location pin.
  - loading skeleton + error state.

STEP 3: Geolocation helper (lib/features/ai_assistant/data/location_helper.dart)
`Future<EmergencyLocation?> getCurrentLocationWithTimeout({Duration timeout = const Duration(seconds: 3)})`:
1. Check permission_handler: if denied → request once. If permanently denied → return null.
2. Try geolocator.getCurrentPosition with timeout. On TimeoutException → return null.
3. Never throw to the caller — return null on any failure so the emergency submission never blocks on geolocation.

STEP 4: Repository (lib/features/ai_assistant/data/)
- analyzeSymptoms({required String symptoms}) → POST /api/patient/ai-symptom-analysis with JSON body.
- submitEmergencyReport({required String inputType, String? textDescription, XFile? imageFile, EmergencyLocation? location}) → multipart POST /api/patient/emergency-reports:
  - fields: inputType.
  - if inputType=='text': field textDescription.
  - if inputType=='image': MultipartFile.fromPath for 'image'.
  - if location!=null: field location = jsonEncode({lat, lng}) + field locationAccuracy = meters as string.
- getEmergencyReports() → GET /api/patient/emergency-reports (paginated, 20/page in v1).

STEP 5: Providers
- specialistControllerProvider — AsyncNotifier<SpecialistResult?>.
- triageControllerProvider — AsyncNotifier<EmergencyReport?> with submitText(text) and submitImage(XFile).
- emergencyReportsProvider — AsyncNotifier<List<EmergencyReport>>.

STEP 6: AI Assistant screen (lib/features/ai_assistant/presentation/ai_assistant_screen.dart)
- PageHeader title "المساعد الذكي", subtitle "استشارة الأخصائي والإسعاف الأولي".
- Top row: 2-button sub-tab "استشارة الأخصائي" (Stethoscope icon) / "الإسعاف الأولي" (Siren icon).

Sub-tab 1: Specialist
- Intro card: "اختر الأخصائي المناسب لأعراضك" + "هذه النتيجة للإرشاد فقط ولا تحل محل الاستشارة الطبية."
- InputText (maxLength 2000).
- Submit long-press Send → specialistController.submit.
- ResultCard variant=specialist.

Sub-tab 2: Triage
- Warning intro card (amber tint, AlertTriangle icon): "الإسعاف الأولي الذكي — في حالة الطوارئ الحقيقية، اتصل بالإسعاف فوراً. الرقم: 110." Include a tappable phone-number row using url_launcher tel:110.
- InputModeToggle (text / image).
- text → InputText maxLength 2000.
- image → InputImage maxSizeMB=10.
- Submit → triageController submits with geolocation (fire-and-forget; never waits more than 3s).
- Below: ResultCard variant=triage.
- **"السجل السابق"** section:
  - Header Clock icon + title.
  - Loading / empty / list of EmergencyReportTile:
    - Input-type icon (MessageSquare / Image / Mic / Sparkles).
    - Timestamp (LTR).
    - SeverityBadge.
    - First 2 aid steps preview.
    - Tap → opens report detail in a bottom sheet with the full FirstAidSteps + map chip of the recorded location (no actual map in v1 — just coordinates in LTR and an "فتح في الخرائط" button that launches google maps via `geo:lat,lng?q=...`).

STEP 7: Safety/UX rules
- If severity is critical after submission, show a persistent AlertDialog:
  - Title "حالة حرجة".
  - Body "الإسعاف الأولي بدأ الآن. اتصل بالإسعاف فوراً."
  - Primary button "اتصل بالإسعاف 110" → tel:110 launcher.
  - Secondary button "إغلاق".
- Do NOT auto-dial — that's illegal in many jurisdictions and bad UX. Give the patient the one-tap button.

STEP 8: Tests
- Geolocation helper returns null within 3s when permission denied — does not throw.
- triageController.submitText includes `location` + `locationAccuracy` fields when provided and omits them when null.
- InputImage rejects files > 10 MB.

COMMIT:
"feat(ai-assistant): specialist recommender + emergency triage with geolocation

- 8 reusable AI atoms ported from web components/ai/
- geolocator + permission_handler with 3s non-blocking timeout
- image_picker (gallery + camera) with size/type validation
- multipart submission to /api/patient/emergency-reports
- history list with report detail sheet + launch-maps action
- critical severity triggers one-tap 110 dialer prompt (never auto-dial)"

DO NOT:
- Do NOT add voice input. Deferred to v2.
- Do NOT auto-dial the ambulance — always require a user tap.

When done, flutter analyze + flutter test, reply:
"AI assistant complete. Ready for prompt 9."
````


---

## 🎯 Prompt 9 of 11 — Reviews, Notifications, Profile

````
SCOPE — this prompt:
Build the three remaining content screens: Reviews, Notifications (with deep-linking), and Profile (with edit modal).

CONTEXT TO READ:
- PatientDashboard.jsx lines 543–1000 (ReviewSubmitForm + ProfileEditForm).
- PatientDashboard.jsx lines 2850–3488 (renderReviews, renderNotifications, renderProfile).
- patient360_db_final.js — collections "reviews", "notifications", and the editable profile fields (persons + patients).
- services/api.js — patientAPI.getMyReviews, submitReview, getNotifications, markNotificationRead, updateMyProfile.

STEP 1: Reviews feature
Domain:
- review.dart freezed: id, reviewerPersonId?/ChildId?, doctorId?/dentistId?/laboratoryId?/pharmacyId?/hospitalId?, int rating (1-5), String? reviewText, status (pending/approved/rejected/flagged), bool isAnonymous, String? adminNote, DateTime createdAt.

Repository:
- getMyReviews() → GET /api/patient/reviews.
- submitReview(dto) → POST /api/patient/reviews.

Provider: reviewsProvider AsyncNotifier + submit action that invalidates the list.

Screen (reviews_screen.dart):
- PageHeader title "التقييمات", subtitle "تقييم الأطباء والمختبرات والصيدليات".
- Primary button top-right: "إضافة تقييم" → opens ReviewSubmitSheet.
- Body: list of ReviewCard.
- Empty state: EmptyState(icon: Star, title: "لا توجد تقييمات", subtitle: "شاركنا تجربتك مع الأطباء والمختبرات والصيدليات.", cta: {label: "إضافة أول تقييم"}).

ReviewCard:
- Target row: target type icon + label + ID chip (LTR, muted).
- Stars row: 5 filled/unfilled stars (LucideIcons.star).
- Optional review text.
- Footer: status chip (pending=warning, approved=success, rejected=error, flagged=warning), anonymous chip if isAnonymous, createdAt (LTR).
- Optional admin note block (muted background).

ReviewSubmitSheet:
- Target type radio row (5 options: doctor/dentist/lab/pharmacy/hospital with matching Lucide icons).
- Target ID TextField (LTR, hint "أدخل المعرّف..."). V1 hint: "ستتم إضافة اختيار مباشر من قائمة الأطباء/المراكز في إصدار لاحق."
- Star rating radiogroup (use a `StarRatingInput` widget — 5 interactive stars, keyboard-accessible via Focus/Shortcuts).
- Multiline text (maxLength 1000, optional).
- Anonymous checkbox "إرسال التقييم دون الكشف عن الهوية".
- Submit button disabled until targetId non-empty and rating >= 1.

STEP 2: Notifications feature
Domain:
- notification.dart freezed:
  - id, recipientId, recipientType
  - String type (14 values — see NOTIFICATION_TYPE_META from the web)
  - String title, String message, status (pending/sent/delivered/read/failed)
  - String priority (low/medium/high/urgent)
  - List<String> channels
  - String? relatedId, String? relatedType
  - DateTime? sentAt, DateTime? readAt, DateTime? expiresAt, DateTime createdAt.

Repository:
- getNotifications() → GET /api/patient/notifications.
- markNotificationRead(id) → POST /api/patient/notifications/{id}/read.

Provider: notificationsProvider AsyncNotifier with computed unreadCount. The unreadCount is ALSO exposed as a separate auto-updating provider the PageHeader reads to render the bell badge across every screen.

Type metadata — a Map<String, NotificationTypeMeta> keyed by the 14 values. Each entry has:
- icon (Lucide)
- arabicLabel
- defaultColor (info/success/warning/error/neutral)

(Port exactly from PatientDashboard.jsx's NOTIFICATION_TYPE_META.)

Deep-link map — RELATED_TYPE_TO_SECTION copied from web:
- appointments → /appointments
- visits → /visits
- prescriptions → /prescriptions
- lab_tests → /lab
- emergency_reports → /ai

Screen (notifications_screen.dart):
- PageHeader title "الإشعارات", subtitle "التنبيهات والتذكيرات".
- 2-tab filter: "غير المقروءة" / "الكل".
- List of NotificationItem:
  - Leading: type icon circle (tinted by type color).
  - Top row: type Arabic label + unread dot (•) when !isRead.
  - Title (auto-dir, bold).
  - Message (auto-dir).
  - Footer: timestamp (LTR) + "اضغط لعرض التفاصيل" (ChevronLeftDir) when relatedType is deep-linkable.
- Tap behavior:
  1. Optimistic: update notification to status='read', readAt=now in the provider cache.
  2. Fire-and-forget markNotificationRead(id) — ignore errors so a flaky network doesn't break UX.
  3. If RELATED_TYPE_TO_SECTION[relatedType] is defined, go_router.go to that route.

Priority affects left-border color:
- urgent → error border 4px
- high → warning border 3px
- medium/low → no border

STEP 3: Profile feature
Domain models already built in prompt 2 (Person / Child / PatientProfile). Extend domain with ProfileUpdateDto freezed containing the editable subset from PatientDashboard.jsx's ProfileEditForm.handleSubmit:
- phoneNumber, alternativePhoneNumber?
- address, governorate (14-value enum), city
- bloodType (9 values including unknown)
- height?, weight?
- smokingStatus
- List<String> allergies, List<String> chronicDiseases
- EmergencyContactDto? emergencyContact (name, relationship, phoneNumber)

Repository:
- updateMyProfile(ProfileUpdateDto) → PATCH /api/patient/profile. Returns updated AuthSession subset.

Screen (profile_screen.dart):
- PageHeader title "الملف الشخصي", subtitle "معلوماتك الشخصية والطبية".
- "تعديل الملف" primary button → opens ProfileEditSheet.
- Three cards:

Card 1 — "المعلومات الشخصية" (User icon):
- Full name (firstName fatherName lastName — bold, auto-dir).
- National ID or CRN (LTR, Inter, copyable with tap-to-copy).
- Gender + date of birth + computed age.
- Email with Lock icon + tooltip "لا يمكن تغيير البريد الإلكتروني في هذا الإصدار" — NOT editable.
- Phone + alt phone (LTR).
- Address: governorate label / city / full address.
- Occupation / education if present.

Card 2 — "المعلومات الطبية" (Stethoscope icon):
- Blood type chip (large, Inter).
- Height / weight / BMI row (LTR numbers).
- Smoking / alcohol / exercise chips.
- Allergies — tag pills list (rose tint).
- Chronic diseases — tag pills list (amber tint).
- Current medications — plain list.
- Previous surgeries — each row: surgery name + date + hospital + notes.
- Family history — list.

Card 3 — "جهة الاتصال في الطوارئ" (Phone icon):
- Name + relationship + phone + alt phone.
- If empty: EmptyState with CTA "إضافة جهة طوارئ" → opens ProfileEditSheet with focus on the emergency block.

ProfileEditSheet:
- Scrollable form with grouped sections matching the web's ProfileEditForm:
  - "معلومات التواصل": phone, alt phone, address, governorate dropdown (14), city.
  - "المعلومات الطبية": blood type dropdown (9), height, weight, smoking dropdown, allergies (chip input — type and press enter or Arabic comma ،), chronic diseases (chip input).
  - "جهة الاتصال في الطوارئ": name, relationship, phone.
- Save button: validates → submits → closes sheet → updates auth session + shows "تم الحفظ" snackbar.
- Cancel: confirms discard if form is dirty.

STEP 4: Logout
- Drawer item "تسجيل الخروج" (danger color).
- Tap → AlertDialog "تسجيل الخروج — هل أنت متأكد من رغبتك في تسجيل الخروج؟" with Cancel / Confirm.
- Confirm → authController.logout() → go_router.go('/login').

STEP 5: Tests
- Optimistic mark-read reverts on 500.
- ProfileEditSheet: empty phoneNumber disables Save.
- Deep-link from notification goes to the correct route.

COMMIT:
"feat(reviews+notifications+profile): complete three remaining screens

- reviews list + submit sheet with 5-target radio, 5-star rating, anonymous option
- notifications with optimistic mark-read, priority border, deep-linking
  (appointments/visits/prescriptions/lab/ai) matching web RELATED_TYPE_TO_SECTION
- profile 3-card view: personal / medical / emergency contact
- ProfileEditSheet: 14-governorate + 9-bloodType + 7-smoking dropdowns,
  chip inputs for allergies and chronic diseases
- logout flow from drawer with confirmation dialog"

DO NOT:
- Do NOT implement target entity picker in reviews (v2 — keep the manual ID input for now).
- Do NOT allow editing email, national ID, date of birth, or name in profile — the web doesn't.

When done, flutter analyze + flutter test, reply:
"Reviews/Notifications/Profile complete. Ready for prompt 10."
````

---

## 🎯 Prompt 10 of 11 — Firebase Cloud Messaging, build configs, release polish

````
SCOPE — this prompt:
Wire push notifications end-to-end, finalize build configs for iOS + Android, add app icons and splash screen, add release scripts.

CONTEXT TO READ:
- patient360_db_final.js — accounts.pushNotificationTokens[] structure.
- The Part B.2 new endpoints (POST/DELETE /api/auth/fcm-token) — the BACKEND team is responsible for implementing these. The mobile app just calls them.

STEP 1: Add Firebase to pubspec.yaml:
- firebase_core: ^3.6.0
- firebase_messaging: ^15.1.0
- flutter_local_notifications: ^17.2.0 (for foreground notification display)

STEP 2: Platform setup instructions (MUST BE DOCUMENTED IN lib/features/notifications/FIREBASE_SETUP.md)
- Create a Firebase project at console.firebase.google.com named "Patient 360".
- Add Android app with applicationId sy.gov.patient360.mobile → download google-services.json → drop at android/app/google-services.json.
- Add iOS app with bundle ID sy.gov.patient360.mobile → download GoogleService-Info.plist → drop at ios/Runner/GoogleService-Info.plist and add it via Xcode File → Add Files.
- android/build.gradle: add classpath 'com.google.gms:google-services:4.4.2' in dependencies.
- android/app/build.gradle: apply plugin 'com.google.gms.google-services' at the bottom.
- ios/Runner/AppDelegate.swift: add `FirebaseApp.configure()` in didFinishLaunchingWithOptions.
- ios capabilities: enable Push Notifications + Background Modes (Remote notifications).

Write this file — Claude Code cannot perform the Firebase console steps but must document them clearly. Add a TODO banner at the top saying "Anas must complete the Firebase console steps before this feature works."

STEP 3: FCM handler (lib/features/notifications/fcm_handler.dart)
- `class FcmHandler` with:
  - Future<void> initialize() — called from main.dart AFTER Firebase.initializeApp().
    - Request permissions (iOS: notification; Android 13+: POST_NOTIFICATIONS).
    - Get the token via FirebaseMessaging.instance.getToken().
    - If logged in (JWT present), POST it to /api/auth/fcm-token.
    - Listen to onTokenRefresh → re-POST to backend.
    - Set up three message handlers:
      - FirebaseMessaging.onMessage → show as flutter_local_notifications banner with deep-link in payload.
      - FirebaseMessaging.onMessageOpenedApp → navigate to the deep-link route (matches RELATED_TYPE_TO_SECTION from prompt 9).
      - FirebaseMessaging.onBackgroundMessage — a top-level function that simply awaits Firebase initialization so the OS can render the system-level notification.
- Call fcmHandler.initialize() inside the authControllerProvider's build() AFTER a successful session is found, and call fcmHandler.unregister() inside logout().

STEP 4: Backend integration hooks (already decided — just wire them):
- POST /api/auth/fcm-token with body { token, platform (ios/android), deviceName, appVersion } on:
  - app start when a session exists and token is available.
  - onTokenRefresh.
- DELETE /api/auth/fcm-token with body { token } on logout (before clearing JWT).
- Both requests: handle 404 gracefully (endpoint may not be live yet) — log warning but do not surface to the user.

STEP 5: Deep-linking from a tapped notification
- Payload convention: data.route = '/appointments' | '/visits' | '/prescriptions' | '/lab' | '/ai' | '/notifications'.
- Payload data.relatedId = the specific record ID (optional for v2 — v1 just routes to the section).
- On tap (onMessageOpenedApp), extract data.route and call appRouter.go(route).

STEP 6: App icon + splash
- Use `flutter_launcher_icons` and `flutter_native_splash` as dev_dependencies.
- flutter_launcher_icons.yaml with the brand logo (HeartPulse icon at 1024x1024 over Teal Medica primary background).
- flutter_native_splash.yaml:
  - color: #0D3B3E (Teal Medica primary)
  - image: logo at center.
  - android_12: { image: ..., icon_background_color: #0D3B3E }.
- Run generators and commit the generated assets.

STEP 7: Release configs
- android/app/build.gradle:
  - applicationId sy.gov.patient360.mobile
  - minSdkVersion 23, targetSdkVersion 34, compileSdkVersion 34.
  - signingConfigs.release — read keystore from a `key.properties` file which is gitignored; document how to create it in README.
- ios/Runner/Info.plist:
  - NSLocationWhenInUseUsageDescription = "نحتاج لموقعك لإرسال الإسعاف في حالات الطوارئ فقط."
  - NSCameraUsageDescription = "للسماح برفع صورة الإصابة لتحليل الإسعاف الأولي."
  - NSPhotoLibraryUsageDescription = "لاختيار صورة الإصابة من المعرض."
  - UIBackgroundModes includes remote-notification.
  - CFBundleLocalizations: ar, en. DevelopmentLocalization: ar.

STEP 8: Environment files + CI readiness
- Create .env.example with API_BASE_URL, FIREBASE_PROJECT_ID, APP_ENV=development.
- flutter_dotenv loads .env at app start (done in prompt 1; just confirm).
- Add a release flavor script in Makefile/scripts/release.sh — not required to be cross-platform; a Windows-friendly .bat equivalent is fine.

STEP 9: README.md (project root)
- A concise README covering:
  - What this project is and its relationship to patient360frontend and backend.
  - Prerequisites (Flutter 3.27+, Android Studio, Xcode for iOS).
  - Setup steps: clone → flutter pub get → copy .env.example to .env → add Firebase config files → build_runner.
  - Run: flutter run --flavor dev (or without flavor if kept simple).
  - Build: Android release and iOS release commands.
  - Backend endpoint contract: link to this brief (PATIENT360_MOBILE_APP_BRIEF.md) for the full list.
  - Project structure overview.

STEP 10: Final smoke test
- flutter analyze → 0 issues.
- flutter test → all pass.
- flutter build apk --debug → succeeds.
- If you have a connected device: flutter run → verify login, home loads, can navigate to every section (many will show empty states since backend test data is minimal).

COMMIT:
"feat(fcm+release): push notifications, deep-linking, build configs, launcher icon + splash

- Firebase Cloud Messaging: foreground/background/terminated message handling
- token registration/refresh/unregister wired to /api/auth/fcm-token (backend TODO)
- deep-link from notification tap → appRouter.go(data.route)
- flutter_local_notifications for foreground display
- iOS Info.plist Arabic permission strings (location/camera/photo library)
- Android minSdk 23, signing config from gitignored key.properties
- launcher icon + splash screen with Teal Medica primary background
- README covering setup, Firebase steps, run and build commands"

DO NOT:
- Do NOT auto-generate a keystore and commit it.
- Do NOT hardcode a Firebase sender ID — it comes from the google-services files.

When done, paste flutter analyze + flutter test + flutter build apk --debug output, then reply:
"Mobile app v1 complete. All 11 prompts shipped."
````

---

# Part F — Post-build checklist (for you, not Claude Code)

After all 11 prompts have shipped, before handing the app to anyone:

- [ ] Backend team ships `POST /api/auth/fcm-token` and `DELETE /api/auth/fcm-token` endpoints.
- [ ] Backend team verifies `/api/patient/*` routes work against a mobile client (no CORS issues on native — but auth header format matters).
- [ ] You upload `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) to the project.
- [ ] You create a release signing key for Android (`keytool -genkey -v -keystore ...`) and store credentials in gitignored `android/key.properties`.
- [ ] You create an Apple developer account + provisioning profile for iOS release (required for TestFlight).
- [ ] **Real-device test of end-to-end reminder flow:** set a 60-second-future reminder on a test prescription, close the app, observe the notification fire, tap it, verify the app opens to the focused dose in the Medications → Schedule tab with the pulse animation, tap the checkbox, verify the adherence rate updates from 0/1 to 1/1. This is the key committee-demo path — rehearse it.
- [ ] You run one end-to-end test per section against a seeded patient account — use the same `ss@gmail.com` adult account from your Stage 1.2 login tests, plus a minor account via CRN.
- [ ] You present the app to the committee alongside the web dashboard — same color palette, same Arabic copy, no jarring visual differences.

---

# Part G — Risk register (things to watch)

| Risk | Impact | Mitigation |
|---|---|---|
| Flutter RTL quirks with mixed-direction text | Medium — may look misaligned in cards with Arabic + LTR numbers | Always wrap LTR segments with `Directionality(textDirection: TextDirection.ltr, child: Text(...))`. Never rely on `auto`. |
| `localhost` doesn't resolve on physical phones | High — app can't reach backend from a real device | Use LAN IP or ngrok during dev. Document this in README. |
| FCM token expires or rotates | Medium — user stops receiving push | `onTokenRefresh` handler re-POSTs to backend (prompt 10). |
| iOS App Store rejection for Arabic-only app | Low | Store listing must include English metadata even for an Arabic-only app; the app itself can ship as ar-default. |
| Backend endpoint doesn't yet exist for some flow (e.g., mark-viewed) | Medium — silent failures | All providers use Promise.allSettled-style handling. UI degrades to "بانتظار دعم الخادم" toast, never crashes. |
| QR code rendering looks blurry at small sizes | Low | `qr_flutter` at 200×200 minimum with error-correction level M. |
| Geolocator requests timeout on Syria networks | Medium — emergency submission could stall | 3-second hard timeout + null fallback (prompt 8). Never blocks the form. |
| Emergency submission succeeds but user thinks it didn't | **High** — a real emergency where UX confusion costs time | Show submission confirmation immediately + big success badge + emergency number 110 always visible as a fallback. |
| iOS 64-notification pending cap exceeded | Medium — silent dropping of scheduled reminders | Sliding 7-day window (prompt 6) + on-resume rescheduling; log a warning if total approaches 60 and truncate farthest future first. |
| Local adherence data lost on app reinstall | Low — patient can re-open the app and restart tracking | Documented in the v1 scope: reminders and adherence are device-local. Future v2 ships server sync via the forward-compatible data shape. |
| Patient misses a reminder because the OS killed the app in the background (Android aggressive battery optimization) | Medium — reminder never fires | `exactAllowWhileIdle` scheduling mode + rationale dialog on first setup advising the user to disable battery optimization for the app; documented in FIREBASE_SETUP.md (even though this is local notifications, not FCM). |
| Frequency string parser fails to match an exotic phrasing | Low — falls back to single 08:00 dose | Parser returns a sensible default; the ReminderSetupSheet ALWAYS asks for user confirmation before saving, so the user corrects any wrong default before scheduling. |

---

# Part H — Credits & references

- Web dashboard source of truth: `patient360frontend/src/pages/PatientDashboard.jsx` + `PatientDashboard.css`
- Database schema source of truth: `patient360_db_final.js` (25 collections, locked)
- Riverpod 3.0 is "the modern default" for 2026 Flutter projects per multiple 2026 state-management reviews, with Bloc 9.0 remaining the enterprise choice for regulated-industry apps requiring strict audit trails
- `lucide_icons_flutter` provides Lucide Icons with built-in RTL `*Dir` variants, so `LucideIcons.chevronLeftDir` renders correctly in Arabic contexts

---

**End of brief.** Keep this file in the project root as `PATIENT360_MOBILE_APP_BRIEF.md`. Every prompt is self-contained; re-run a prompt any time you need to regenerate a feature.
