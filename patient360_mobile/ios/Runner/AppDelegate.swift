import Flutter
import UIKit
// Conditional import — Firebase pods are added by `pod install` once
// firebase_core / firebase_messaging are pulled by `flutter pub get`.
// When the GoogleService-Info.plist is missing in dev, FirebaseApp.configure()
// raises a fatal exception; we look the resource up first so dev builds
// without Firebase set up locally still launch (FCM is degraded — see
// FIREBASE_SETUP.md).
import FirebaseCore

@main
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    if FirebaseApp.app() == nil {
      if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
        FirebaseApp.configure()
      } else {
        NSLog("[Patient360] GoogleService-Info.plist missing — push disabled.")
      }
    }
    GeneratedPluginRegistrant.register(with: self)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
