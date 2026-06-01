// lib/features/ai_assistant/data/governorate_coordinates.dart
//
// ═══════════════════════════════════════════════════════════════════════════
//  GovernorateCoordinates — Patient 360°
//  ─────────────────────────────────────────────────────────────────────────
//  Approximate centroid coordinates for each Syrian governorate. Used as a
//  fallback when real GPS is unavailable (emulators with no GPS provider,
//  denied location permission, indoor with no signal, etc.).
//
//  The patient's registered governorate is the natural fallback source —
//  every adult patient has it required in their `persons.governorate`
//  field at signup, so we can route emergencies to a regional center
//  even without a precise GPS fix.
//
//  Coordinates: administrative center of each governorate (verified
//  against Syria's official administrative divisions). All points fall
//  within validateSyriaLocation() bounds (lng 35.5–42.5, lat 32.0–37.5).
// ═══════════════════════════════════════════════════════════════════════════

import '../domain/emergency_location.dart';

final class GovernorateCoordinates {
  const GovernorateCoordinates._();

  /// Governorate enum (matches schema's `governorate` field) → admin
  /// center coordinates. Same 14-value enum used in persons.governorate,
  /// children.governorate, pharmacies.governorate, etc.
  static const Map<String, ({double lat, double lng})> _coordinates =
      <String, ({double lat, double lng})>{
        'damascus': (lat: 33.5138, lng: 36.2765),
        'aleppo': (lat: 36.2021, lng: 37.1343),
        'homs': (lat: 34.7324, lng: 36.7137),
        'hama': (lat: 35.1318, lng: 36.7501),
        'latakia': (lat: 35.5316, lng: 35.7820),
        'tartus': (lat: 34.8896, lng: 35.8867),
        'idlib': (lat: 35.9306, lng: 36.6339),
        'deir_ez_zor': (lat: 35.3406, lng: 40.1467),
        'raqqa': (lat: 35.9594, lng: 39.0079),
        'hasakah': (lat: 36.4886, lng: 40.7434),
        'daraa': (lat: 32.6189, lng: 36.1021),
        'as_suwayda': (lat: 32.7090, lng: 36.5689),
        'quneitra': (lat: 33.1259, lng: 35.8243),
        'rif_dimashq': (lat: 33.5138, lng: 36.2765),
      };

  /// Last-resort default — Damascus center. Used when [governorate] is
  /// null (e.g. minor patient with no governorate, edge cases) or
  /// contains a value not in our map (future enum addition).
  static const ({double lat, double lng}) _damascusDefault = (
    lat: 33.5138,
    lng: 36.2765,
  );

  /// Returns the administrative center for [governorate].
  ///
  /// Falls back to Damascus when [governorate] is null/unknown.
  /// Accuracy is flagged as 5000m so the backend dispatcher can tell
  /// this is a coarse regional pin (not a precise GPS fix). The
  /// MongoDB schema accepts any double for accuracy.
  static EmergencyLocation locationFor(String? governorate) {
    final coords = _coordinates[governorate] ?? _damascusDefault;
    return EmergencyLocation(
      lat: coords.lat,
      lng: coords.lng,
      accuracy: 5000.0,
    );
  }
}
