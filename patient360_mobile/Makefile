# Patient 360 mobile — convenience targets. Run from the project root.
# On Windows without `make`, use `scripts/release.bat` instead.

FLUTTER ?= flutter

.PHONY: help bootstrap fmt analyze test build-apk build-apk-release build-aab build-ios icons splash clean

help:
	@echo "Targets:"
	@echo "  bootstrap         Fetch packages + clean stale build artifacts."
	@echo "  fmt               dart format ."
	@echo "  analyze           flutter analyze."
	@echo "  test              flutter test."
	@echo "  build-apk         Debug APK to build/app/outputs/flutter-apk/."
	@echo "  build-apk-release Release APK (requires android/key.properties)."
	@echo "  build-aab         App Bundle for Play upload."
	@echo "  build-ios         iOS release build (requires Mac + Xcode)."
	@echo "  icons             Regenerate launcher icons."
	@echo "  splash            Regenerate native splash screen."

bootstrap:
	$(FLUTTER) clean
	$(FLUTTER) pub get

fmt:
	dart format .

analyze:
	$(FLUTTER) analyze

test:
	$(FLUTTER) test

build-apk:
	$(FLUTTER) build apk --debug

build-apk-release:
	$(FLUTTER) build apk --release

build-aab:
	$(FLUTTER) build appbundle --release

build-ios:
	$(FLUTTER) build ios --release --no-codesign

icons:
	$(FLUTTER) pub run flutter_launcher_icons

splash:
	$(FLUTTER) pub run flutter_native_splash:create

clean:
	$(FLUTTER) clean
