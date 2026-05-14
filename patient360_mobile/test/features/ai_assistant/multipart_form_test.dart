import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:patient360_mobile/features/ai_assistant/data/ai_repository.dart';
import 'package:patient360_mobile/features/ai_assistant/domain/emergency_location.dart';

Map<String, String> _fieldMap(FormData form) {
  return <String, String>{
    for (final MapEntry<String, String> e in form.fields) e.key: e.value,
  };
}

void main() {
  test(
      'submitText form: includes location + locationAccuracy when provided',
      () async {
    final FormData form = await AiRepository.buildEmergencyFormData(
      inputType: 'text',
      textDescription: 'صعوبة تنفس مفاجئة',
      location: const EmergencyLocation(
        lat: 33.5138,
        lng: 36.2765,
        accuracy: 8.4,
      ),
    );

    final Map<String, String> fields = _fieldMap(form);
    expect(fields['inputType'], 'text');
    expect(fields['textDescription'], 'صعوبة تنفس مفاجئة');
    expect(fields.containsKey('location'), isTrue);
    expect(fields.containsKey('locationAccuracy'), isTrue);

    final Map<String, dynamic> loc =
        jsonDecode(fields['location']!) as Map<String, dynamic>;
    expect(loc['lat'], closeTo(33.5138, 1e-9));
    expect(loc['lng'], closeTo(36.2765, 1e-9));
    expect(double.parse(fields['locationAccuracy']!), closeTo(8.4, 1e-9));

    expect(form.files, isEmpty);
  });

  test(
      'submitText form: omits location/locationAccuracy when location is null',
      () async {
    final FormData form = await AiRepository.buildEmergencyFormData(
      inputType: 'text',
      textDescription: 'صداع',
    );
    final Map<String, String> fields = _fieldMap(form);
    expect(fields['inputType'], 'text');
    expect(fields['textDescription'], 'صداع');
    expect(fields.containsKey('location'), isFalse);
    expect(fields.containsKey('locationAccuracy'), isFalse);
  });

  test('submitText form: omits locationAccuracy when accuracy is null',
      () async {
    final FormData form = await AiRepository.buildEmergencyFormData(
      inputType: 'text',
      textDescription: 'إغماء',
      location: const EmergencyLocation(lat: 1, lng: 2),
    );
    final Map<String, String> fields = _fieldMap(form);
    expect(fields.containsKey('location'), isTrue);
    expect(
      fields.containsKey('locationAccuracy'),
      isFalse,
      reason: 'no accuracy → omit the field rather than send null',
    );
  });

  test('image-only submission omits textDescription', () async {
    final FormData form = await AiRepository.buildEmergencyFormData(
      inputType: 'image',
    );
    final Map<String, String> fields = _fieldMap(form);
    expect(fields['inputType'], 'image');
    expect(fields.containsKey('textDescription'), isFalse);
  });
}
