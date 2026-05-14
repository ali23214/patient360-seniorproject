import 'package:flutter/foundation.dart';

/// location
/// Captured GPS reading attached to an emergency submission. Mirrors the
/// schema's GeoJSON `location` document but flattens it into a value
/// type the UI can render directly.
@immutable
class EmergencyLocation {
  const EmergencyLocation({
    required this.lat,
    required this.lng,
    this.accuracy,
    this.address,
  });

  factory EmergencyLocation.fromJson(Map<String, dynamic> json) {
    // Schema stores GeoJSON: { type: 'Point', coordinates: [lng, lat] }.
    // Tolerate either flat `lat/lng` or the GeoJSON shape so the same model
    // can render the response from either backend version.
    if (json.containsKey('coordinates')) {
      final List<dynamic>? coords = json['coordinates'] as List<dynamic>?;
      final double? lng = coords != null && coords.length >= 2
          ? (coords[0] as num?)?.toDouble()
          : null;
      final double? lat = coords != null && coords.length >= 2
          ? (coords[1] as num?)?.toDouble()
          : null;
      return EmergencyLocation(
        lat: lat ?? 0,
        lng: lng ?? 0,
        accuracy: (json['accuracy'] as num?)?.toDouble(),
        address: json['address'] as String?,
      );
    }
    return EmergencyLocation(
      lat: (json['lat'] as num?)?.toDouble() ?? 0,
      lng: (json['lng'] as num?)?.toDouble() ?? 0,
      accuracy: (json['accuracy'] as num?)?.toDouble(),
      address: json['address'] as String?,
    );
  }

  final double lat;
  final double lng;

  /// Reported horizontal accuracy in meters, when available.
  final double? accuracy;
  final String? address;

  Map<String, dynamic> toCoordsJson() => <String, dynamic>{
    'lat': lat,
    'lng': lng,
  };
}
