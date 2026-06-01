import 'dart:async';

import 'package:geolocator/geolocator.dart';

import '../../../core/utils/logger.dart';
import '../domain/emergency_location.dart';
import 'governorate_coordinates.dart';

/// Strategy contract over the geolocator + permission flow. Lets tests
/// inject deterministic fakes without fighting the platform plugins.
abstract class LocationHelper {
  /// Real GPS attempt. Returns `null` on any failure — caller decides
  /// whether to fall back to a coarse alternative.
  Future<EmergencyLocation?> getCurrentLocationWithTimeout({
    Duration timeout = const Duration(seconds: 3),
  });

  /// Resilient location resolution for the emergency triage flow.
  ///
  /// Tries real GPS first. If GPS fails for any reason (permission
  /// denied, location service disabled, emulator with no GPS provider,
  /// indoor with no signal, plugin exception), falls back to the
  /// patient's registered governorate center.
  ///
  /// Always returns a usable location — never null — so the emergency
  /// submission never fails for lack of coordinates. This is critical
  /// UX for a triage flow where a panicked patient typing symptoms
  /// should not be blocked by an unreachable GPS.
  Future<EmergencyLocation> getLocationOrGovernorateFallback({
    required String? governorate,
    Duration timeout = const Duration(seconds: 3),
  });
}

/// Production helper. Never throws — every GPS failure collapses to
/// `null` (from [getCurrentLocationWithTimeout]) or to a governorate
/// center fallback (from [getLocationOrGovernorateFallback]).
class GeolocatorLocationHelper implements LocationHelper {
  const GeolocatorLocationHelper();

  @override
  Future<EmergencyLocation?> getCurrentLocationWithTimeout({
    Duration timeout = const Duration(seconds: 3),
  }) async {
    try {
      final bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) return null;

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) return null;
      }
      if (permission == LocationPermission.deniedForever) return null;

      final Position position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      ).timeout(timeout);

      return EmergencyLocation(
        lat: position.latitude,
        lng: position.longitude,
        accuracy: position.accuracy,
      );
    } on TimeoutException {
      return null;
    } catch (e, st) {
      appLogger.w('location lookup failed', error: e, stackTrace: st);
      return null;
    }
  }

  @override
  Future<EmergencyLocation> getLocationOrGovernorateFallback({
    required String? governorate,
    Duration timeout = const Duration(seconds: 3),
  }) async {
    // ── 1. Real GPS first ───────────────────────────────────────────
    final EmergencyLocation? gps = await getCurrentLocationWithTimeout(
      timeout: timeout,
    );
    if (gps != null) {
      appLogger.i('📍 emergency location: GPS fix (${gps.lat}, ${gps.lng})');
      return gps;
    }

    // ── 2. Governorate fallback ─────────────────────────────────────
    // GPS unavailable. Use the patient's registered governorate center.
    // Always within Syria's bounding box → validateSyriaLocation passes.
    final EmergencyLocation fallback = GovernorateCoordinates.locationFor(
      governorate,
    );
    appLogger.w(
      '📍 emergency location: GPS unavailable, using governorate '
      '"${governorate ?? 'damascus(default)'}" '
      '→ (${fallback.lat}, ${fallback.lng})',
    );
    return fallback;
  }
}
