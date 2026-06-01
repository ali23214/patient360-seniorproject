# Patient 360 — mobile

Patient-facing companion to the [Patient 360 web dashboard][web] and
[Express backend][backend]. The mobile app is patient-only — doctors,
pharmacists, lab technicians, and admins continue using the web
dashboard. Targets Syrian Ministry of Health deployment.

[web]: ../frontend
[backend]: ../backend

## What's in here

| Path | Purpose |
|------|---------|
| `lib/core/` | Theme, networking, secure storage, env loading, logging. |
| `lib/router/` | go_router config + route name constants. |
| `lib/features/auth/` | Login, session restore, JWT lifecycle. |
| `lib/features/home/` | Dashboard overview + KPI grid + hero card. |
| `lib/features/appointments/` | Booking wizard + cancel flow. |
| `lib/features/medications/` | Today schedule, calendar, prescriptions tab. |
| `lib/features/prescriptions/` | Prescription list + reminder scheduler. |
| `lib/features/lab_results/` | Pending/completed list + PDF opener. |
| `lib/features/visits/` | Past visits timeline + ECG block. |
| `lib/features/ai_assistant/` | Specialist recommender + emergency triage. |
| `lib/features/reviews/` | Submit + list reviews of doctors/labs/pharmacies. |
| `lib/features/notifications/` | List + deep-link + push handler (FCM). |
| `lib/features/profile/` | 3-card view + edit sheet. |
| `lib/shared/widgets/` | App shell, page header, primary button, etc. |
| `assets/translations/` | Reserved for future intl bundles. |
| `assets/images/` | App icon source PNGs (see `assets/images/README.md`). |

The full mobile app brief is at `../PATIENT360_MOBILE_APP_BRIEF.md`.

## Prerequisites

- **Flutter 3.27+** (matches `environment.flutter` in `pubspec.yaml`).
- **Dart SDK 3.10+** (bundled with Flutter).
- **Android Studio** with the Android SDK (compileSdk 34, minSdk 23).
- **Xcode 15+** for iOS — Mac only.
- **Java 17** (Android Gradle Plugin 8 requires it).
- A running instance of the [Express backend][backend] reachable from the
  device. The default `API_BASE_URL` in `.env.example` points at
  `http://localhost:5000/api`. From the Android emulator, use
  `http://10.0.2.2:5000/api`.

## Setup

```bash
cd patient360_mobile
cp .env.example .env             # then fill in values
flutter pub get
```

### Firebase config

Push notifications use Firebase Cloud Messaging. Setup is documented in
detail at:

```
lib/features/notifications/FIREBASE_SETUP.md
```

The short version:

1. Create a Firebase project named **Patient 360**.
2. Add Android app with bundle ID `sy.gov.patient360.mobile` → drop
   `google-services.json` at `android/app/google-services.json`.
3. Add iOS app with the same bundle ID → add `GoogleService-Info.plist`
   to the Runner target via Xcode.
4. Both files are gitignored — they're per-deployment secrets.

The app **launches without these files** but FCM degrades to a
no-op (logged warning on startup). Local medication reminders still work.

### Backend FCM endpoints

The mobile app calls two backend-owned endpoints. The backend team is
responsible for implementing them per `PATIENT360_MOBILE_APP_BRIEF.md`
Part B.2:

```
POST   /api/auth/fcm-token   { token, platform, deviceName, appVersion }
DELETE /api/auth/fcm-token   { token }
```

If the endpoints aren't live yet the mobile app logs a warning and
continues — the patient still receives in-app notifications via the
existing `/api/patient/notifications` list.

### Brand assets

The launcher icon and splash screen need source PNGs:

```
assets/images/app_icon.png             1024×1024 full-bleed
assets/images/app_icon_foreground.png  1024×1024 transparent
```

Drop them in and run:

```bash
flutter pub run flutter_launcher_icons
flutter pub run flutter_native_splash:create
```

See `assets/images/README.md` for the visual spec.

## Run

```bash
# Default: connects to API_BASE_URL from .env.
flutter run

# Force device selection:
flutter devices
flutter run -d <device-id>

# Release-mode local sanity check (uses debug signing):
flutter run --release
```

Hot reload (`r`) and hot restart (`R`) work as in any Flutter app.

## Build

### Android — debug APK

```bash
flutter build apk --debug
# → build/app/outputs/flutter-apk/app-debug.apk
```

### Android — release APK / App Bundle

Requires `android/key.properties` (see [Release signing](#release-signing)).

```bash
flutter build apk --release
flutter build appbundle --release
```

On Windows, the helper script wraps the above with config checks:

```bat
scripts\release.bat
```

### iOS — release (Mac only)

```bash
flutter build ios --release
```

Open `ios/Runner.xcworkspace` in Xcode to archive + upload to TestFlight.

## Release signing

Generate a keystore once per environment (gitignored):

```bash
keytool -genkey -v -keystore android/app/patient360-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias patient360
```

Create `android/key.properties` (gitignored — see `.gitignore`):

```properties
storeFile=app/patient360-release.jks
storePassword=<your-keystore-password>
keyAlias=patient360
keyPassword=<your-key-password>
```

When `key.properties` is absent the release build falls back to the
debug signing config so `flutter run --release` keeps working in
development.

## Tests

```bash
flutter analyze        # 0 issues expected.
flutter test           # full unit + widget suite.
flutter test test/features/notifications   # narrow to one feature.
```

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| `Build failed: File google-services.json is missing.` | Drop the Firebase Android config — see `FIREBASE_SETUP.md`. |
| `FlutterError: dotenv is not initialized.` | `.env` not present. `cp .env.example .env`. |
| iOS: no push received on a real device | iOS simulator does **not** receive remote pushes. Test on hardware. |
| Android: notifications muted | Android 13+ → grant the runtime POST_NOTIFICATIONS permission via system settings. |
| `Connection refused` to `http://localhost:5000` from Android emulator | Emulator localhost is the emulator itself. Use `http://10.0.2.2:5000/api` in `.env`. |

## Project structure quick reference

```
patient360_mobile/
├── android/                  # AGP 8 + Kotlin 2.2 native shell
│   ├── app/build.gradle.kts  # signing + applicationId + Firebase plugin
│   └── settings.gradle.kts
├── ios/                      # Xcode project (open Runner.xcworkspace)
│   └── Runner/AppDelegate.swift   # FirebaseApp.configure() guarded
├── lib/                      # Dart source (see "What's in here").
├── test/                     # Unit + widget tests.
├── assets/
├── pubspec.yaml              # Single source of truth for deps.
├── flutter_launcher_icons.yaml
├── flutter_native_splash.yaml
├── Makefile                  # Convenience targets (Linux/Mac).
└── scripts/release.bat       # Windows release wrapper.
```

## Contact

| Role | Owner |
|------|-------|
| Frontend lead / mobile | Anas Nablsi |
| Backend lead | Ali Raei |
| Operations | Kinan Al-Majzoub |
| CEO | Muath Jabri |

Project: Arab International University, Damascus → Syrian Ministry of Health.
