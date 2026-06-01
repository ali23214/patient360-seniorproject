import 'reminders/time_of_day_dto.dart';

/// Pure helpers that translate the doctor's free-text `frequency` and
/// `duration` strings into structured defaults the reminder UI can
/// pre-populate.
///
/// The patient is always free to override the result — the parser only
/// guesses sensible starting times and a duration cap so the patient isn't
/// staring at an empty form.

/// Best-effort `frequency` → list of daily reminder times.
///
/// Lookup is rule-based, ordered so that more specific patterns match
/// before more generic ones (e.g. "every 4 hours" before "4 times"). When
/// nothing matches, the fallback is a single 08:00 dose so the form has
/// something the user can immediately edit.
List<TimeOfDayDto> parseFrequencyToDefaults(String frequencyRaw) {
  final String s = frequencyRaw.toLowerCase().trim();
  if (s.isEmpty) return _t(<List<int>>[<int>[8, 0]]);

  for (final _Rule rule in _frequencyRules) {
    if (rule.pattern.hasMatch(s)) return rule.times;
  }
  return _t(<List<int>>[<int>[8, 0]]);
}

/// Best-effort `duration` → number of days. Capped at 365 days for
/// "ongoing" / "continuous" so we never schedule beyond a year.
Duration parseDurationToDays(String durationRaw) {
  final String s = durationRaw.toLowerCase().trim();
  if (s.isEmpty) return const Duration(days: 7);

  if (RegExp(r'ongoing|continuous|مستمر|دائم').hasMatch(s)) {
    return const Duration(days: 365);
  }

  final RegExpMatch? day = RegExp(r'(\d+)\s*(?:day|days|يوم|أيام)')
      .firstMatch(s);
  if (day != null) {
    return Duration(days: int.parse(day.group(1)!));
  }
  final RegExpMatch? week =
      RegExp(r'(\d+)\s*(?:week|weeks|أسبوع|أسابيع)').firstMatch(s);
  if (week != null) {
    return Duration(days: int.parse(week.group(1)!) * 7);
  }
  final RegExpMatch? month =
      RegExp(r'(\d+)\s*(?:month|months|شهر|أشهر)').firstMatch(s);
  if (month != null) {
    return Duration(days: int.parse(month.group(1)!) * 30);
  }
  return const Duration(days: 7);
}

// ───────── private rule table ─────────

class _Rule {
  const _Rule(this.pattern, this.times);
  final RegExp pattern;
  final List<TimeOfDayDto> times;
}

List<TimeOfDayDto> _t(List<List<int>> rows) => <TimeOfDayDto>[
      for (final List<int> r in rows) TimeOfDayDto(hour: r[0], minute: r[1]),
    ];

final List<_Rule> _frequencyRules = <_Rule>[
  // Specific intervals first — "every 12 hours" before "every 6 hours" etc.
  _Rule(
    RegExp(r'every\s*4\s*hours?|كل\s*4\s*ساعات?'),
    _t(<List<int>>[<int>[6, 0], <int>[10, 0], <int>[14, 0], <int>[18, 0], <int>[22, 0]]),
  ),
  _Rule(
    RegExp(r'every\s*6\s*hours?|كل\s*6\s*ساعات?'),
    _t(<List<int>>[<int>[8, 0], <int>[14, 0], <int>[20, 0], <int>[2, 0]]),
  ),
  _Rule(
    RegExp(r'every\s*8\s*hours?|كل\s*8\s*ساعات?'),
    _t(<List<int>>[<int>[8, 0], <int>[16, 0], <int>[0, 0]]),
  ),
  _Rule(
    RegExp(r'every\s*12\s*hours?|كل\s*12\s*ساعة?'),
    _t(<List<int>>[<int>[8, 0], <int>[20, 0]]),
  ),
  // Counted doses per day.
  _Rule(
    RegExp(r'4\s*times|four\s*times|أربع\s*مرات'),
    _t(<List<int>>[<int>[8, 0], <int>[12, 0], <int>[16, 0], <int>[20, 0]]),
  ),
  _Rule(
    RegExp(r'3\s*times|three\s*times|ثلاث\s*مرات|ثلاثة\s*مرات'),
    _t(<List<int>>[<int>[8, 0], <int>[14, 0], <int>[20, 0]]),
  ),
  _Rule(
    RegExp(r'twice|2\s*times|مرتين|مرتان'),
    _t(<List<int>>[<int>[8, 0], <int>[20, 0]]),
  ),
  _Rule(
    RegExp(r'once\b|1\s*time|مرة\s*واحدة|قبل\s*النوم|bedtime|ليلاً'),
    _t(<List<int>>[<int>[22, 0]]),
  ),
  // Time-of-day-only phrasings.
  _Rule(
    RegExp(r'morning|صباحاً|صباحا'),
    _t(<List<int>>[<int>[8, 0]]),
  ),
  _Rule(
    RegExp(r'evening|مساءً|مساء|مساءا'),
    _t(<List<int>>[<int>[20, 0]]),
  ),
];
