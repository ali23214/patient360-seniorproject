// ════════════════════════════════════════════════════════════════════════════
//  detail_helpers.dart  —  Patient 360° (mobile)
//  ──────────────────────────────────────────────────────────────────────────
//  Single source of truth for translating raw backend payloads into the
//  human-readable bits the UI actually shows.
//
//  Mirrors `frontend/src/pages/PatientDashboard/detailHelpers.js` 1:1 so the
//  mobile and web surfaces always agree on labels, fallback chains, and the
//  em-dash convention. When the JS file changes, this one MUST follow.
//
//  WHY THIS EXISTS
//  ───────────────
//  The Patient 360° backend serialises the same logical reference in five
//  different shapes depending on which Mongoose `.populate()` call ran on
//  the server. The exact same `Appointment` document may arrive as:
//
//    Shape A: `{ doctor: { firstName, lastName, specialization } }`
//    Shape B: `{ doctorId: { firstName, lastName, ... } }`
//    Shape C: `{ doctorId: { personId: { firstName, lastName }, ... } }`
//    Shape D: `{ doctorName: "أحمد العلي" }`           (denormalised snapshot)
//    Shape E: `{ doctor: "65fae..." }`                 (string ObjectId, no populate)
//
//  The extractors below try every shape in order and return the first usable
//  value, or null. The rendering layer then prints an em-dash ("—") for any
//  missing field so the patient SEES what the schema says exists even when
//  the backend hasn't filled it in yet (rather than silently hiding it).
//
//  USAGE
//  ─────
//  Two equivalent styles are supported:
//
//    // Functional style — same shape as the JS module
//    final DoctorInfo? info = getDoctorInfo(visit.toJson());
//    final String? display  = formatDoctorDisplay(info);
//
//    // Extension style — idiomatic Dart, fewer parens
//    final String? display = visit.toJson().doctorDisplay;
//    final String hospital = visit.toJson().hospitalName.orDash;
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/foundation.dart' show immutable;
import 'package:intl/intl.dart';

/// The em-dash we render whenever a value is missing. Keep this constant —
/// every screen uses the same glyph for "nothing here yet".
const String kEmDash = '—';

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  1) Low-level path resolution                                            ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/// Try a list of dotted paths and return the first non-empty value.
///
/// Empty strings count as missing — they're treated identically to null. This
/// matches the JS behaviour and protects the UI from blank cells.
///
/// ```dart
/// pickFirst(visit, <String>['doctor.firstName', 'doctorName'])
///   // → 'أحمد' if visit['doctor']['firstName'] exists
///   // → visit['doctorName'] otherwise
///   // → null if neither
/// ```
Object? pickFirst(Map<String, dynamic>? obj, List<String> paths) {
  if (obj == null) return null;
  for (final String path in paths) {
    dynamic v = obj;
    for (final String part in path.split('.')) {
      if (v is Map) {
        v = v[part];
      } else {
        v = null;
        break;
      }
      if (v == null) break;
    }
    if (v == null) continue;
    if (v is String && v.isEmpty) continue;
    return v;
  }
  return null;
}

/// Typed convenience wrapper: same as [pickFirst] but always returns a
/// `String?`. Use this when the field is known to be a string (name, label,
/// id) — saves a cast at every call site.
String? pickFirstString(Map<String, dynamic>? obj, List<String> paths) {
  final Object? v = pickFirst(obj, paths);
  return v?.toString();
}

/// Return the first OBJECT value among the candidate field names.
///
/// Used to locate a populated reference regardless of which field name the
/// backend chose (e.g. `doctor` vs `doctorId`). Arrays are deliberately
/// rejected — populate never produces arrays at this layer.
Map<String, dynamic>? resolveRef(
  Map<String, dynamic>? item,
  List<String> names,
) {
  if (item == null) return null;
  for (final String name in names) {
    final Object? v = item[name];
    if (v is Map<String, dynamic>) return v;
    if (v is Map) return Map<String, dynamic>.from(v);
  }
  return null;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  2) Person / name formatting                                             ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/// Compose an Arabic full name from a person-shaped map.
///
/// Tries `firstName + fatherName + lastName` first (the Syrian convention),
/// then falls back to `fullName` or `name`. Returns null when no fragment
/// is usable.
///
/// Also accepts a bare `String` (the denormalised case where the backend
/// stored the name as a single field) — returns it unchanged.
String? formatArabicName(Object? person) {
  if (person == null) return null;
  if (person is String) {
    final String trimmed = person.trim();
    return trimmed.isEmpty ? null : trimmed;
  }
  if (person is! Map) return null;

  final Map<String, dynamic> p = person is Map<String, dynamic>
      ? person
      : Map<String, dynamic>.from(person);

  final List<String> parts = <String>[
    (p['firstName'] as String?)?.trim() ?? '',
    (p['fatherName'] as String?)?.trim() ?? '',
    (p['lastName'] as String?)?.trim() ?? '',
  ].where((String s) => s.isNotEmpty).toList(growable: false);

  if (parts.isNotEmpty) return parts.join(' ');

  final String? full = (p['fullName'] as String?)?.trim();
  if (full != null && full.isNotEmpty) return full;

  final String? name = (p['name'] as String?)?.trim();
  if (name != null && name.isNotEmpty) return name;

  return null;
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  3) Domain-specific helpers (doctor, dentist, hospital, lab)             ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/// Extracted display info for a doctor. Immutable so it's safe to cache
/// across rebuilds (e.g. inside a `useMemo`-equivalent or a Riverpod
/// `select`).
@immutable
final class DoctorInfo {
  const DoctorInfo({
    required this.name,
    required this.specialization,
    required this.license,
  });

  /// Arabic full name, or null when no name was discoverable on the record.
  final String? name;

  /// Backend enum (e.g. `'cardiology'`). Pipe through [localizeSpecialization]
  /// before showing to the user.
  final String? specialization;

  /// Syrian Medical Association license number, or null.
  final String? license;

  /// True iff this struct has any useful field at all. The extractor
  /// returns null in that case, so callers usually don't need this.
  bool get isEmpty => name == null && specialization == null;
}

/// Build a [DoctorInfo] from a record that may reference a doctor in any
/// of the five shapes documented at the top of this file. Returns null when
/// no doctor information is available at all.
DoctorInfo? getDoctorInfo(Map<String, dynamic>? item) {
  if (item == null) return null;

  // Denormalised string fields take priority — they're the cheapest path.
  final String? flatName = pickFirstString(item, const <String>[
    'doctorName',
    'doctor.fullName',
    'doctor.name',
  ]);

  // Locate the doctor object (under `doctor` or `doctorId`).
  final Map<String, dynamic>? doctor = resolveRef(item, const <String>[
    'doctor',
    'doctorId',
  ]);

  // The doctor may itself host a populated person under `person`/`personId`.
  final Map<String, dynamic>? person = doctor == null
      ? null
      : resolveRef(doctor, const <String>['person', 'personId']);

  final String? name =
      flatName ?? formatArabicName(person) ?? formatArabicName(doctor);
  final String? specialization = doctor?['specialization'] as String?;
  final String? license = doctor?['medicalLicenseNumber'] as String?;

  if (name == null && specialization == null) return null;
  return DoctorInfo(
    name: name,
    specialization: specialization,
    license: license,
  );
}

/// Same as [DoctorInfo] but without the medical-license field — dental
/// licenses live in a different collection and aren't usually populated.
@immutable
final class DentistInfo {
  const DentistInfo({required this.name, required this.specialization});

  final String? name;
  final String? specialization;
}

/// Build a [DentistInfo] from a record. Mirrors [getDoctorInfo].
DentistInfo? getDentistInfo(Map<String, dynamic>? item) {
  if (item == null) return null;

  final String? flatName = pickFirstString(item, const <String>[
    'dentistName',
    'dentist.fullName',
  ]);

  final Map<String, dynamic>? dentist = resolveRef(item, const <String>[
    'dentist',
    'dentistId',
  ]);
  final Map<String, dynamic>? person = dentist == null
      ? null
      : resolveRef(dentist, const <String>['person', 'personId']);

  final String? name =
      flatName ?? formatArabicName(person) ?? formatArabicName(dentist);
  final String? specialization = dentist?['specialization'] as String?;

  if (name == null && specialization == null) return null;
  return DentistInfo(name: name, specialization: specialization);
}

/// Hospital name (Arabic if available, English fallback, denormalised flat
/// field as last resort).
String? getHospitalName(Map<String, dynamic>? item) =>
    pickFirstString(item, const <String>[
      'hospital.arabicName',
      'hospital.name',
      'hospitalId.arabicName',
      'hospitalId.name',
      'hospitalName',
    ]);

/// Laboratory name. Same fallback strategy as [getHospitalName].
String? getLabName(Map<String, dynamic>? item) =>
    pickFirstString(item, const <String>[
      'laboratory.arabicName',
      'laboratory.name',
      'laboratoryId.arabicName',
      'laboratoryId.name',
      'laboratoryName',
    ]);

/// Hospital phone — falls back to the emergency number if a regular one
/// isn't available.
String? getHospitalPhone(Map<String, dynamic>? item) =>
    pickFirstString(item, const <String>[
      'hospital.phoneNumber',
      'hospital.emergencyPhoneNumber',
      'hospitalId.phoneNumber',
      'hospitalId.emergencyPhoneNumber',
    ]);

/// Hospital full address line. Prefers the explicit `address` field; falls
/// back to composing `city — district` so the UI always has something.
String? getHospitalAddress(Map<String, dynamic>? item) {
  final String? address = pickFirstString(item, const <String>[
    'hospital.address',
    'hospitalId.address',
  ]);
  if (address != null) return address;

  final String? city = pickFirstString(item, const <String>[
    'hospital.city',
    'hospitalId.city',
  ]);
  final String? district = pickFirstString(item, const <String>[
    'hospital.district',
    'hospitalId.district',
  ]);
  final List<String> parts = <String>[
    if (city != null) city,
    if (district != null) district,
  ];
  return parts.isEmpty ? null : parts.join(' — ');
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  4) Arabic labels for schema enums                                       ║
// ║                                                                          ║
// ║  Keep these in lockstep with detailHelpers.js. The enum keys must match  ║
// ║  the values stored in MongoDB (see patient360_db_final.js).              ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/// 24 medical specialisations as stored in `doctors.specialization`.
const Map<String, String> kSpecializationLabels = <String, String>{
  'cardiology': 'أمراض القلب',
  'dermatology': 'الجلدية',
  'endocrinology': 'الغدد الصماء',
  'gastroenterology': 'الجهاز الهضمي',
  'general_practice': 'طب عام',
  'gynecology': 'النسائية',
  'hematology': 'أمراض الدم',
  'internal_medicine': 'الطب الباطني',
  'nephrology': 'الكلى',
  'neurology': 'الأعصاب',
  'oncology': 'الأورام',
  'ophthalmology': 'العيون',
  'orthopedics': 'العظمية',
  'otolaryngology': 'الأنف والأذن والحنجرة',
  'pediatrics': 'الأطفال',
  'psychiatry': 'الطب النفسي',
  'pulmonology': 'الصدرية',
  'radiology': 'الأشعة',
  'rheumatology': 'الروماتيزم',
  'surgery': 'الجراحة',
  'urology': 'المسالك البولية',
  'vascular_surgery': 'جراحة الأوعية الدموية',
  'emergency_medicine': 'طب الطوارئ',
  'anesthesiology': 'التخدير',
};

/// Appointment / visit payment status — `appointments.paymentStatus` and
/// `visits.paymentStatus`.
const Map<String, String> kPaymentStatusLabels = <String, String>{
  'paid': 'مدفوع',
  'pending': 'بانتظار الدفع',
  'partially_paid': 'مدفوع جزئياً',
  'cancelled': 'ملغى',
  'free': 'مجاني',
  'refunded': 'مُرجَع',
};

/// `appointments.paymentMethod` and `visits.paymentMethod`.
const Map<String, String> kPaymentMethodLabels = <String, String>{
  'cash': 'نقداً',
  'card': 'بطاقة',
  'insurance': 'تأمين',
  'free': 'مجاني',
};

/// `appointments.priority` (also used by `lab_tests.priority`).
const Map<String, String> kPriorityLabels = <String, String>{
  'routine': 'اعتيادية',
  'urgent': 'عاجلة',
  'emergency': 'طارئة',
  'stat': 'فورية',
};

/// `appointments.bookingMethod`.
const Map<String, String> kBookingMethodLabels = <String, String>{
  'online': 'حجز إلكتروني',
  'phone': 'حجز هاتفي',
  'walk_in': 'حضور مباشر',
  'admin': 'حجز إداري',
  'mobile_app': 'تطبيق الجوال',
};

/// `appointments.appointmentType`.
const Map<String, String> kAppointmentTypeLabels = <String, String>{
  'doctor': 'طبيب',
  'dentist': 'طبيب أسنان',
  'lab_test': 'تحليل مخبري',
  'follow_up': 'متابعة',
  'emergency': 'طارئ',
};

/// `lab_tests.sampleType`.
const Map<String, String> kSampleTypeLabels = <String, String>{
  'blood': 'دم',
  'urine': 'بول',
  'stool': 'براز',
  'tissue': 'نسيج',
  'swab': 'مسحة',
  'saliva': 'لعاب',
  'other': 'أخرى',
};

/// `lab_tests.testCategory`.
const Map<String, String> kTestCategoryLabels = <String, String>{
  'blood': 'تحليل دم',
  'urine': 'تحليل بول',
  'stool': 'تحليل براز',
  'imaging': 'تصوير',
  'biopsy': 'خزعة',
  'microbiology': 'أحياء دقيقة',
  'molecular': 'بيولوجيا جزيئية',
  'other': 'أخرى',
};

/// `prescriptions.medications[].route` and `visits.prescribedMedications[].route`.
const Map<String, String> kMedRouteLabels = <String, String>{
  'oral': 'عن طريق الفم',
  'topical': 'موضعي',
  'injection': 'حقنة',
  'inhalation': 'استنشاق',
  'sublingual': 'تحت اللسان',
  'rectal': 'شرجي',
  'other': 'أخرى',
};

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  5) Date formatting (single source of truth)                             ║
// ║                                                                          ║
// ║  We use `intl` with the `ar` locale so we automatically get Arabic-Indic ║
// ║  digits (٢٠٢٦ instead of 2026) and Arabic month names.                   ║
// ║                                                                          ║
// ║  Every formatter is null-tolerant and try/catches the parse step so that ║
// ║  a malformed timestamp from the backend never crashes the UI — it just   ║
// ║  renders as an em-dash.                                                  ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/// Parse loose date input — accepts ISO strings, `DateTime` instances, or
/// millisecond epochs. Returns null on any failure.
DateTime? _parseDate(Object? raw) {
  if (raw == null) return null;
  if (raw is DateTime) return raw;
  if (raw is String) {
    if (raw.isEmpty) return null;
    return DateTime.tryParse(raw);
  }
  if (raw is int) {
    return DateTime.fromMillisecondsSinceEpoch(raw);
  }
  return null;
}

/// Long Arabic date — "الأحد، ٢٦ أيار ٢٠٢٦". Returns [kEmDash] on null/bad
/// input.
String formatLongDate(Object? raw) {
  final DateTime? dt = _parseDate(raw);
  if (dt == null) return kEmDash;
  try {
    return DateFormat.yMMMMEEEEd('ar').format(dt);
  } catch (_) {
    return kEmDash;
  }
}

/// Medium Arabic date — "٢٦ أيار ٢٠٢٦". Used in the card lists where the
/// long form would wrap awkwardly.
String formatDate(Object? raw) {
  final DateTime? dt = _parseDate(raw);
  if (dt == null) return kEmDash;
  try {
    return DateFormat.yMMMMd('ar').format(dt);
  } catch (_) {
    return kEmDash;
  }
}

/// Arabic date + 12-hour time — "٢٦ أيار ٢٠٢٦ — ٣:٤٢ م".
String formatDateTime(Object? raw) {
  final DateTime? dt = _parseDate(raw);
  if (dt == null) return kEmDash;
  try {
    final String d = DateFormat.yMMMMd('ar').format(dt);
    final String t = DateFormat.jm('ar').format(dt);
    return '$d — $t';
  } catch (_) {
    return kEmDash;
  }
}

/// Short Arabic time only — "٣:٤٢ م". Useful for appointment time cells
/// where the date is shown separately.
String formatTime(Object? raw) {
  final DateTime? dt = _parseDate(raw);
  if (dt == null) return kEmDash;
  try {
    return DateFormat.jm('ar').format(dt);
  } catch (_) {
    return kEmDash;
  }
}

/// Compact Arabic relative-time formatter:
///   `< 60s`     → "الآن"
///   `< 60m`     → "منذ ٣ دقائق"
///   `< 24h`     → "منذ ساعتين"
///   `< 7d`      → "منذ ٣ أيام"
///   otherwise   → falls back to [formatDate]
///
/// Used by the history lists where a "ago" feel is friendlier than a
/// numeric date. Matches the same algorithm used in the Drug Risk history
/// tile.
String formatRelativeTime(Object? raw) {
  final DateTime? dt = _parseDate(raw);
  if (dt == null) return kEmDash;

  final Duration diff = DateTime.now().difference(dt);
  if (diff.isNegative) return formatDate(dt);

  if (diff.inSeconds < 60) return 'الآن';
  if (diff.inMinutes < 60) {
    return diff.inMinutes == 1
        ? 'منذ دقيقة'
        : diff.inMinutes == 2
        ? 'منذ دقيقتين'
        : 'منذ ${diff.inMinutes} دقائق';
  }
  if (diff.inHours < 24) {
    return diff.inHours == 1
        ? 'منذ ساعة'
        : diff.inHours == 2
        ? 'منذ ساعتين'
        : 'منذ ${diff.inHours} ساعات';
  }
  if (diff.inDays < 7) {
    return diff.inDays == 1
        ? 'منذ يوم'
        : diff.inDays == 2
        ? 'منذ يومين'
        : 'منذ ${diff.inDays} أيام';
  }
  return formatDate(dt);
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  6) Misc display helpers                                                 ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/// Translate a specialisation enum to Arabic; falls back to the raw enum
/// when the value isn't in [kSpecializationLabels] (so a new backend enum
/// still surfaces something rather than disappearing).
String? localizeSpecialization(String? spec) {
  if (spec == null || spec.isEmpty) return null;
  return kSpecializationLabels[spec] ?? spec;
}

/// Compose `"Name — Specialization"` from a [DoctorInfo].
///   - both present → `"أحمد العلي — أمراض القلب"`
///   - name only    → `"أحمد العلي"`
///   - spec only    → `"أمراض القلب"`
///   - neither      → null
String? formatDoctorDisplay(DoctorInfo? info) {
  if (info == null) return null;
  final String? spec = localizeSpecialization(info.specialization);
  if (info.name != null && spec != null) return '${info.name} — $spec';
  return info.name ?? spec;
}

/// Same shape as [formatDoctorDisplay] for dentists.
String? formatDentistDisplay(DentistInfo? info) {
  if (info == null) return null;
  final String? spec = localizeSpecialization(info.specialization);
  if (info.name != null && spec != null) return '${info.name} — $spec';
  return info.name ?? spec;
}

/// Render `—` for any empty value. Use this on every detail row that may
/// legitimately be blank.
///
/// ```dart
/// Text(orDash(visit['diagnosis']))
/// ```
String orDash(Object? value) => _orDashImpl(value);

/// Private implementation shared by the top-level [orDash] function and the
/// [OrDashStringX] extension getter. Having a distinct symbol prevents the
/// `recursive_getters` analyser error that fires when an extension getter
/// references a top-level identifier of the same name from the same library.
String _orDashImpl(Object? value) {
  if (value == null) return kEmDash;
  if (value is String && value.isEmpty) return kEmDash;
  return value.toString();
}

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  7) Extension sugar — Dart-idiomatic access on a raw record map          ║
// ║                                                                          ║
// ║  These re-export the functional helpers above as instance methods so     ║
// ║  feature code can stay concise:                                          ║
// ║                                                                          ║
// ║    appointment.doctorInfo                                                ║
// ║    appointment.doctorDisplay                                             ║
// ║    appointment.hospitalAddress                                           ║
// ║                                                                          ║
// ║  Note: extension methods on String / Object? must live below — the      ║
// ║  Dart analyser disallows extending nullable types on the same target    ║
// ║  twice from the same library, so keep them disjoint by target type.    ║
// ╚══════════════════════════════════════════════════════════════════════════╝

extension PatientRecordX on Map<String, dynamic> {
  /// Pick the first non-empty value across a list of dotted paths.
  Object? pickFirst(List<String> paths) => pickFirstFromMap(this, paths);

  /// Same as [pickFirst] but typed as `String?`.
  String? pickFirstString(List<String> paths) =>
      pickFirstStringFromMap(this, paths);

  /// The first populated object reference among the candidate field names.
  Map<String, dynamic>? resolveRef(List<String> names) =>
      resolveRefFromMap(this, names);

  /// Extracted doctor info for this record, or null when nothing's there.
  DoctorInfo? get doctorInfo => getDoctorInfo(this);

  /// `"Dr. Name — Specialization"` for this record, or null.
  String? get doctorDisplay => formatDoctorDisplay(doctorInfo);

  /// Extracted dentist info for this record, or null.
  DentistInfo? get dentistInfo => getDentistInfo(this);

  /// `"Dr. Name — Specialization"` for the dentist on this record, or null.
  String? get dentistDisplay => formatDentistDisplay(dentistInfo);

  /// Resolved hospital name, or null.
  String? get hospitalName => getHospitalName(this);

  /// Resolved laboratory name, or null.
  String? get laboratoryName => getLabName(this);

  /// Resolved hospital phone, or null.
  String? get hospitalPhone => getHospitalPhone(this);

  /// Resolved hospital address line, or null.
  String? get hospitalAddress => getHospitalAddress(this);
}

/// Aliases that take a `Map<String, dynamic>?` (nullable). The extension
/// above is only valid on non-null receivers, so we expose these for use
/// inside the extension and for callers who hold a nullable map.
Object? pickFirstFromMap(Map<String, dynamic>? obj, List<String> paths) =>
    pickFirst(obj, paths);

String? pickFirstStringFromMap(Map<String, dynamic>? obj, List<String> paths) =>
    pickFirstString(obj, paths);

Map<String, dynamic>? resolveRefFromMap(
  Map<String, dynamic>? item,
  List<String> names,
) => resolveRef(item, names);

/// `String?` → `String` with `—` for null/empty. Use on display chains
/// where you want to drop into a `Text` widget directly.
///
/// ```dart
/// Text(visit['diagnosis']?.toString().orDash)
/// ```
extension OrDashStringX on String? {
  String get orDash => _orDashImpl(this);
}
