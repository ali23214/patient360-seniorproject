import 'package:flutter_test/flutter_test.dart';

import 'package:patient360_mobile/features/prescriptions/domain/frequency_parser.dart';
import 'package:patient360_mobile/features/prescriptions/domain/reminders/time_of_day_dto.dart';

List<String> _labels(List<TimeOfDayDto> times) =>
    times.map((TimeOfDayDto t) => t.label).toList();

void main() {
  group('parseFrequencyToDefaults', () {
    test('Arabic: مرة واحدة → 22:00', () {
      expect(_labels(parseFrequencyToDefaults('مرة واحدة')), <String>['22:00']);
    });

    test('Arabic: قبل النوم → 22:00', () {
      expect(_labels(parseFrequencyToDefaults('قبل النوم')), <String>['22:00']);
    });

    test('English: bedtime → 22:00', () {
      expect(_labels(parseFrequencyToDefaults('bedtime')), <String>['22:00']);
    });

    test('Arabic: مرتين → 08:00 + 20:00', () {
      expect(_labels(parseFrequencyToDefaults('مرتين')),
          <String>['08:00', '20:00']);
    });

    test('English: twice daily → 08:00 + 20:00', () {
      expect(_labels(parseFrequencyToDefaults('twice daily')),
          <String>['08:00', '20:00']);
    });

    test('English: 3 times → 08/14/20', () {
      expect(_labels(parseFrequencyToDefaults('3 times daily')),
          <String>['08:00', '14:00', '20:00']);
    });

    test('Arabic: ثلاث مرات → 08/14/20', () {
      expect(_labels(parseFrequencyToDefaults('ثلاث مرات يوميا')),
          <String>['08:00', '14:00', '20:00']);
    });

    test('English: 4 times → 08/12/16/20', () {
      expect(_labels(parseFrequencyToDefaults('4 times a day')),
          <String>['08:00', '12:00', '16:00', '20:00']);
    });

    test('Arabic: أربع مرات → 08/12/16/20', () {
      expect(_labels(parseFrequencyToDefaults('أربع مرات')),
          <String>['08:00', '12:00', '16:00', '20:00']);
    });

    test('English: every 4 hours → 06/10/14/18/22', () {
      expect(_labels(parseFrequencyToDefaults('every 4 hours')),
          <String>['06:00', '10:00', '14:00', '18:00', '22:00']);
    });

    test('Arabic: كل 6 ساعات → 02/08/14/20 (sorted)', () {
      // Helper sorts; so the result will be ascending.
      final List<TimeOfDayDto> times =
          parseFrequencyToDefaults('كل 6 ساعات')..sort();
      expect(_labels(times), <String>['02:00', '08:00', '14:00', '20:00']);
    });

    test('English: every 8 hours → 00/08/16', () {
      final List<TimeOfDayDto> times =
          parseFrequencyToDefaults('every 8 hours')..sort();
      expect(_labels(times), <String>['00:00', '08:00', '16:00']);
    });

    test('Arabic: كل 12 ساعة → 08/20', () {
      expect(_labels(parseFrequencyToDefaults('كل 12 ساعة')),
          <String>['08:00', '20:00']);
    });

    test('Arabic: صباحاً → 08:00', () {
      expect(_labels(parseFrequencyToDefaults('صباحاً')), <String>['08:00']);
    });

    test('English: morning → 08:00', () {
      expect(_labels(parseFrequencyToDefaults('morning')), <String>['08:00']);
    });

    test('Arabic: مساءً → 20:00', () {
      expect(_labels(parseFrequencyToDefaults('مساءً')), <String>['20:00']);
    });

    test('Empty string falls back to single 08:00 dose', () {
      expect(_labels(parseFrequencyToDefaults('')), <String>['08:00']);
    });

    test('Garbled input falls back to single 08:00 dose', () {
      expect(_labels(parseFrequencyToDefaults('zzz nonsense')),
          <String>['08:00']);
    });
  });

  group('parseDurationToDays', () {
    test('"7 days" → 7', () {
      expect(parseDurationToDays('7 days').inDays, 7);
    });

    test('"14 يوم" → 14', () {
      expect(parseDurationToDays('14 يوم').inDays, 14);
    });

    test('"2 weeks" → 14', () {
      expect(parseDurationToDays('2 weeks').inDays, 14);
    });

    test('"3 أسابيع" → 21', () {
      expect(parseDurationToDays('3 أسابيع').inDays, 21);
    });

    test('"1 month" → 30', () {
      expect(parseDurationToDays('1 month').inDays, 30);
    });

    test('"2 شهر" → 60', () {
      expect(parseDurationToDays('2 شهر').inDays, 60);
    });

    test('"ongoing" → 365', () {
      expect(parseDurationToDays('ongoing').inDays, 365);
    });

    test('"مستمر" → 365', () {
      expect(parseDurationToDays('مستمر').inDays, 365);
    });

    test('Empty / garbled → 7', () {
      expect(parseDurationToDays('').inDays, 7);
      expect(parseDurationToDays('???').inDays, 7);
    });
  });
}
