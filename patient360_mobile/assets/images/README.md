# assets/images

Brand assets consumed by `flutter_launcher_icons.yaml` +
`flutter_native_splash.yaml`. **These PNGs are NOT committed yet** — Anas
must drop them in before the launcher-icon and splash-screen generators
will produce final platform resources. See `../../README.md` "Assets" for
exact dimensions.

| File | Required dimensions | Used by |
|------|---------------------|---------|
| `app_icon.png` | 1024×1024, full-bleed Teal Medica primary background, white HeartPulse mark | `flutter_launcher_icons` (Android `ic_launcher` + iOS) |
| `app_icon_foreground.png` | 1024×1024 transparent PNG with the HeartPulse mark only (≥18 % padding on each side) | Adaptive icon foreground (Android 8+) and `flutter_native_splash` |

After dropping both files:

```bash
flutter pub run flutter_launcher_icons
flutter pub run flutter_native_splash:create
```

The generators are idempotent. Re-running with the same PNGs is a no-op.
