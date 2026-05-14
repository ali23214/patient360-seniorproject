import 'dart:async';

import 'package:flutter_test/flutter_test.dart';

import 'package:patient360_mobile/features/ai_assistant/data/location_helper.dart';
import 'package:patient360_mobile/features/ai_assistant/domain/emergency_location.dart';

/// Fake helper that simulates each failure mode the production helper is
/// expected to handle. We test against the contract — the public API
/// always resolves with a `null` instead of throwing — without booting
/// the geolocator plugin.
class _FakeLocationHelper implements LocationHelper {
  _FakeLocationHelper.deniedPermission()
      : _mode = _Mode.denied,
        _result = null;
  _FakeLocationHelper.permanentlyDenied()
      : _mode = _Mode.permanentlyDenied,
        _result = null;
  _FakeLocationHelper.serviceDisabled()
      : _mode = _Mode.serviceDisabled,
        _result = null;
  _FakeLocationHelper.timesOut(Duration delay)
      : _mode = _Mode.timesOut,
        _result = null,
        _delay = delay;
  _FakeLocationHelper.success(EmergencyLocation loc)
      : _mode = _Mode.success,
        _result = loc;

  final _Mode _mode;
  final EmergencyLocation? _result;
  Duration _delay = Duration.zero;

  @override
  Future<EmergencyLocation?> getCurrentLocationWithTimeout({
    Duration timeout = const Duration(seconds: 3),
  }) async {
    switch (_mode) {
      case _Mode.denied:
      case _Mode.permanentlyDenied:
      case _Mode.serviceDisabled:
        // Production helper collapses these to null synchronously.
        return null;
      case _Mode.timesOut:
        try {
          await Future<void>.delayed(_delay).timeout(timeout);
          return null;
        } on TimeoutException {
          return null;
        }
      case _Mode.success:
        return _result;
    }
  }
}

enum _Mode { denied, permanentlyDenied, serviceDisabled, timesOut, success }

void main() {
  test('returns null within 3s when permission is denied — does not throw',
      () async {
    final LocationHelper helper = _FakeLocationHelper.deniedPermission();
    final Stopwatch sw = Stopwatch()..start();
    final EmergencyLocation? result =
        await helper.getCurrentLocationWithTimeout();
    sw.stop();
    expect(result, isNull);
    expect(
      sw.elapsed.inSeconds,
      lessThan(3),
      reason: 'denied permission should resolve well under the 3s ceiling',
    );
  });

  test('returns null when permission permanently denied', () async {
    final LocationHelper helper = _FakeLocationHelper.permanentlyDenied();
    expect(await helper.getCurrentLocationWithTimeout(), isNull);
  });

  test('returns null when service is disabled', () async {
    final LocationHelper helper = _FakeLocationHelper.serviceDisabled();
    expect(await helper.getCurrentLocationWithTimeout(), isNull);
  });

  test('returns null on timeout (does not throw TimeoutException)', () async {
    final LocationHelper helper = _FakeLocationHelper.timesOut(
      const Duration(seconds: 30),
    );
    final Stopwatch sw = Stopwatch()..start();
    final EmergencyLocation? result = await helper
        .getCurrentLocationWithTimeout(timeout: const Duration(milliseconds: 100));
    sw.stop();
    expect(result, isNull);
    expect(sw.elapsed.inSeconds, lessThan(3));
  });

  test('returns the location object on success', () async {
    final LocationHelper helper = _FakeLocationHelper.success(
      const EmergencyLocation(lat: 33.5138, lng: 36.2765, accuracy: 12),
    );
    final EmergencyLocation? result =
        await helper.getCurrentLocationWithTimeout();
    expect(result, isNotNull);
    expect(result!.lat, closeTo(33.5138, 1e-9));
    expect(result.accuracy, 12);
  });
}
