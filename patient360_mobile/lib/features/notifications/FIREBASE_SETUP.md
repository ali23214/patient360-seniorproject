# Firebase Cloud Messaging — setup

> **TODO (Anas):** the steps in this document MUST be completed in the
> Firebase console + Xcode + Android Studio before push notifications work.
> Until they are done the FCM handler boots in **degraded mode** — it logs a
> warning and silently no-ops; the rest of the app stays usable.

## 1. Create the Firebase project

1. Go to <https://console.firebase.google.com> and sign in with the
   Patient 360 Google account.
2. Click **Add project** → name it **`Patient 360`**.
3. Disable Google Analytics for now (we don't ship analytics in v1).

## 2. Add the Android app

1. In the Firebase console choose the project → **Add app → Android**.
2. **Android package name**: `sy.gov.patient360.mobile` (must match
   `android/app/build.gradle.kts` `applicationId`).
3. **App nickname**: `Patient 360 Mobile`.
4. SHA-1 / SHA-256: generate with
   ```bash
   cd android
   ./gradlew signingReport
   ```
   Paste the **debug SHA-1** for the development build. Add the release
   SHA-1 once a release keystore is created (see `README.md`).
5. Download **`google-services.json`** and drop it at:
   ```
   patient360_mobile/android/app/google-services.json
   ```
   This file is gitignored (see `.gitignore`).

## 3. Add the iOS app

1. In the Firebase console → **Add app → iOS**.
2. **iOS bundle ID**: `sy.gov.patient360.mobile` (must match Xcode →
   Runner → Signing & Capabilities → Bundle Identifier).
3. **App nickname**: `Patient 360 Mobile`.
4. Download **`GoogleService-Info.plist`** and add it via Xcode
   (**File → Add Files to "Runner"**, target = Runner). Final path:
   ```
   patient360_mobile/ios/Runner/GoogleService-Info.plist
   ```
   This file is gitignored.

## 4. Wire the Android Gradle plugin

`android/build.gradle.kts` has been updated to include the
`google-services` classpath. Verify the `dependencies` block looks like:

```kotlin
buildscript {
    dependencies {
        classpath("com.google.gms:google-services:4.4.2")
    }
}
```

`android/app/build.gradle.kts` applies the plugin at the bottom:

```kotlin
apply(plugin = "com.google.gms.google-services")
```

If the `google-services.json` file is missing the build will fail with
"File google-services.json is missing". That is the expected
fail-loud signal — the file must be in place before a release build.

## 5. Enable iOS push capability

1. Open `ios/Runner.xcworkspace` in Xcode.
2. Select the **Runner** target → **Signing & Capabilities**.
3. Click **+ Capability** twice and add:
   - **Push Notifications**
   - **Background Modes** → check **Remote notifications**.

`ios/Runner/AppDelegate.swift` calls `FirebaseApp.configure()` on launch
(see the file for the exact wiring).

## 6. Verify locally

1. Build a debug APK:
   ```bash
   flutter run --debug
   ```
2. Sign in. The mobile app calls
   `POST /api/auth/fcm-token` with `{ token, platform, deviceName, appVersion }`
   on first registration and on `onTokenRefresh`.
3. Send a test message from the Firebase console
   (**Engage → Cloud Messaging → New campaign**). Use one of the deep-link
   route values in the **Custom data** section:

   | Key   | Example value          |
   |-------|------------------------|
   | route | `/appointments`        |
   | route | `/visits`              |
   | route | `/medications?tab=prescriptions` |
   | route | `/lab`                 |
   | route | `/ai`                  |
   | route | `/notifications`       |

4. Tap the notification on the device → the app should open and navigate
   to the matching screen.

## 7. Backend contract

The mobile app talks to **two** auth endpoints (BACKEND OWNED — see
`PATIENT360_MOBILE_APP_BRIEF.md` Part B.2):

```
POST   /api/auth/fcm-token
DELETE /api/auth/fcm-token
```

- `POST` body: `{ token, platform: "ios"|"android", deviceName, appVersion }`.
  Response 200/201 = success. **404 is treated as "endpoint not yet live"** —
  the FCM handler logs a warning and keeps the local token cached for retry
  on next app start.
- `DELETE` body: `{ token }`. Called on logout *before* the JWT is wiped.

Token storage on the backend lands inside `accounts.pushNotificationTokens[]`
per the schema. Multiple tokens per account are expected (one per device).

## 8. Common pitfalls

- **Bundle IDs must match exactly**. A typo (`sy.gov.patient360.mobil`) makes
  iOS reject the APNs token silently — Firebase still hands you a token, but
  every push fails.
- **iOS simulator does not receive remote pushes.** Test on a real device.
- **Android 13+ requires runtime POST_NOTIFICATIONS permission.** The handler
  requests it on initialize.
- **Token refresh is asynchronous.** `getToken()` may return null for the
  first second on cold start; the handler retries via `onTokenRefresh`.
