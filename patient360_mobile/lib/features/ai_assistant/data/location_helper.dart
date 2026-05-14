import 'dart:async';

import 'package:geolocator/geolocator.dart';

import '../../../core/utils/logger.dart';
import '../domain/emergency_location.dart';

/// Strategy contract over the geolocator + permission flow. Lets tests
/// inject deterministic fakes without fighting the platform plugins.
abstract class LocationHelper {
  Future<EmergencyLocation?> getCurrentLocationWithTimeout({
    Duration timeout = const Duration(seconds: 3),
  });
}

/// Production helper. Never throws — every failure (denied permission,
/// disabled service, plugin exception, timeout) collapses to `null` so the
/// emergency flow can still submit. The patient typing in distress should
/// not be blocked by an unreachable GPS.
class GeolocatorLocationHelper implements LocationHelper {
  const GeolocatorLocationHelper();

  @override
  Future<EmergencyLocation?> getCurrentLocationWithTimeout({
    Duration timeout = const Duration(seconds: 3),
  }) async {
    try {
      final bool serviceEnabled =
          await Geolocator.isLocationServiceEnabled();
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
}
