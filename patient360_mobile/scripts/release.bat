@echo off
rem Patient 360 mobile — Windows release helper.
rem
rem Builds a signed Android release APK + App Bundle. Verifies the keystore
rem and Firebase config are in place before running so the build fails loud
rem instead of producing an unsigned artifact.

setlocal ENABLEDELAYEDEXPANSION

cd /d "%~dp0\.."

if not exist "android\key.properties" (
  echo [release] android\key.properties is missing.
  echo            See README "Release signing" for instructions.
  exit /b 1
)

if not exist "android\app\google-services.json" (
  echo [release] android\app\google-services.json is missing.
  echo            See lib\features\notifications\FIREBASE_SETUP.md.
  exit /b 1
)

echo [release] Cleaning previous build...
flutter clean || exit /b 1

echo [release] Fetching packages...
flutter pub get || exit /b 1

echo [release] Running tests...
flutter test || exit /b 1

echo [release] Building release APK...
flutter build apk --release || exit /b 1

echo [release] Building App Bundle (.aab) for Play...
flutter build appbundle --release || exit /b 1

echo.
echo [release] Done.
echo            APK: build\app\outputs\flutter-apk\app-release.apk
echo            AAB: build\app\outputs\bundle\release\app-release.aab

endlocal
