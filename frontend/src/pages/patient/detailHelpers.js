/**
 * detailHelpers.js
 *
 * Shared utilities for the 4 patient detail pages.
 * Their job is to extract human-readable display data from raw API
 * responses, regardless of how the backend chose to populate references.
 *
 * Why this is needed
 * ──────────────────
 * The Patient360 backend may serialize the same logical reference in
 * MULTIPLE shapes depending on the Mongoose .populate() call:
 *
 *   Shape A: `{ doctor: { firstName, lastName, specialization } }`
 *   Shape B: `{ doctorId: { firstName, lastName, ... } }`              ← populate into ID field
 *   Shape C: `{ doctorId: { personId: { firstName, lastName }, ... } }`  ← deep populate
 *   Shape D: `{ doctorName: "أحمد العلي" }`                            ← denormalized snapshot
 *   Shape E: `{ doctor: "65fae..." }`                                  ← not populated (string ObjectId)
 *
 * The helpers below try each shape in order and return the first usable
 * value, OR null when nothing is found.
 *
 * Display rule: when a field returns null we render an em-dash ("—")
 * rather than hiding the row entirely — that way the patient SEES the
 * field exists in the schema and can ask their care team to fill it in.
 */


// ════════════════════════════════════════════════════════════════════
// 1) Low-level path resolution
// ════════════════════════════════════════════════════════════════════

/**
 * Try a list of dotted paths and return the first non-empty value.
 *
 * pickFirst(visit, ['doctor.firstName', 'doctorName'])
 *   → 'أحمد' if visit.doctor.firstName exists,
 *     or visit.doctorName if it doesn't,
 *     or null if neither does.
 */
export function pickFirst(obj, paths) {
  if (!obj) return null;
  for (const path of paths) {
    let v = obj;
    for (const part of path.split('.')) {
      v = v?.[part];
      if (v == null) break;
    }
    if (v != null && v !== '') return v;
  }
  return null;
}

/**
 * Return the first OBJECT value among the candidate field names.
 * Used to find a populated reference regardless of which field name
 * the backend used (e.g. `doctor` vs `doctorId`).
 */
export function resolveRef(item, names) {
  if (!item) return null;
  for (const name of names) {
    const v = item[name];
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  }
  return null;
}


// ════════════════════════════════════════════════════════════════════
// 2) Person / name formatting
// ════════════════════════════════════════════════════════════════════

/**
 * Format an Arabic full name from a person-shaped object.
 * Falls back to `fullName` or `name` if individual parts aren't there.
 */
export function formatArabicName(person) {
  if (!person) return null;
  if (typeof person === 'string') return person;
  const parts = [person.firstName, person.fatherName, person.lastName].filter(Boolean);
  if (parts.length) return parts.join(' ');
  return person.fullName || person.name || null;
}


// ════════════════════════════════════════════════════════════════════
// 3) Domain-specific helpers (doctor, dentist, hospital, lab, patient)
// ════════════════════════════════════════════════════════════════════

/**
 * Extract { name, specialization } for the doctor on a record.
 * Handles populate shapes A-D from the file header.
 */
export function getDoctorInfo(item) {
  if (!item) return null;

  // Denormalized string fields take priority.
  const flatName = pickFirst(item, ['doctorName', 'doctor.fullName', 'doctor.name']);

  // Find the doctor object (under .doctor or .doctorId).
  const doctor = resolveRef(item, ['doctor', 'doctorId']);

  // The doctor may itself have a populated person under .person or .personId.
  const person = doctor ? resolveRef(doctor, ['person', 'personId']) : null;

  const name = flatName || formatArabicName(person) || formatArabicName(doctor);
  const specialization = doctor?.specialization || null;
  const license = doctor?.medicalLicenseNumber || null;

  if (!name && !specialization) return null;
  return { name: name || null, specialization, license };
}

/** Same as getDoctorInfo, but for dentists. */
export function getDentistInfo(item) {
  if (!item) return null;
  const flatName = pickFirst(item, ['dentistName', 'dentist.fullName']);
  const dentist = resolveRef(item, ['dentist', 'dentistId']);
  const person = dentist ? resolveRef(dentist, ['person', 'personId']) : null;
  const name = flatName || formatArabicName(person) || formatArabicName(dentist);
  const specialization = dentist?.specialization || null;
  if (!name && !specialization) return null;
  return { name: name || null, specialization };
}

/** Hospital name (Arabic if available, English fallback). */
export function getHospitalName(item) {
  return pickFirst(item, [
    'hospital.arabicName',  'hospital.name',
    'hospitalId.arabicName', 'hospitalId.name',
    'hospitalName',
  ]);
}

/** Laboratory name (Arabic if available, English fallback). */
export function getLabName(item) {
  return pickFirst(item, [
    'laboratory.arabicName',  'laboratory.name',
    'laboratoryId.arabicName', 'laboratoryId.name',
    'laboratoryName',
  ]);
}

/** Hospital phone (emergency or regular). */
export function getHospitalPhone(item) {
  return pickFirst(item, [
    'hospital.phoneNumber', 'hospital.emergencyPhoneNumber',
    'hospitalId.phoneNumber', 'hospitalId.emergencyPhoneNumber',
  ]);
}

/** Hospital full address line. */
export function getHospitalAddress(item) {
  const city = pickFirst(item, ['hospital.city', 'hospitalId.city']);
  const district = pickFirst(item, ['hospital.district', 'hospitalId.district']);
  const address = pickFirst(item, ['hospital.address', 'hospitalId.address']);
  return address || [city, district].filter(Boolean).join(' — ') || null;
}


// ════════════════════════════════════════════════════════════════════
// 4) Arabic labels for schema enums
// ════════════════════════════════════════════════════════════════════

export const SPECIALIZATION_LABELS = {
  cardiology:         'أمراض القلب',
  dermatology:        'الجلدية',
  endocrinology:      'الغدد الصماء',
  gastroenterology:   'الجهاز الهضمي',
  general_practice:   'طب عام',
  gynecology:         'النسائية',
  hematology:         'أمراض الدم',
  internal_medicine:  'الطب الباطني',
  nephrology:         'الكلى',
  neurology:          'الأعصاب',
  oncology:           'الأورام',
  ophthalmology:      'العيون',
  orthopedics:        'العظمية',
  otolaryngology:     'الأنف والأذن والحنجرة',
  pediatrics:         'الأطفال',
  psychiatry:         'الطب النفسي',
  pulmonology:        'الصدرية',
  radiology:          'الأشعة',
  rheumatology:       'الروماتيزم',
  surgery:            'الجراحة',
  urology:            'المسالك البولية',
  vascular_surgery:   'جراحة الأوعية الدموية',
  emergency_medicine: 'طب الطوارئ',
  anesthesiology:     'التخدير',
};

export const PAYMENT_STATUS_LABELS = {
  paid:           'مدفوع',
  pending:        'بانتظار الدفع',
  partially_paid: 'مدفوع جزئياً',
  cancelled:      'ملغى',
  free:           'مجاني',
  refunded:       'مُرجَع',
};

export const PAYMENT_METHOD_LABELS = {
  cash:      'نقداً',
  card:      'بطاقة',
  insurance: 'تأمين',
  free:      'مجاني',
};

export const PRIORITY_LABELS = {
  routine:   'اعتيادية',
  urgent:    'عاجلة',
  emergency: 'طارئة',
  stat:      'فورية',
};

export const BOOKING_METHOD_LABELS = {
  online:     'حجز إلكتروني',
  phone:      'حجز هاتفي',
  walk_in:    'حضور مباشر',
  admin:      'حجز إداري',
  mobile_app: 'تطبيق الجوال',
};

export const APPOINTMENT_TYPE_LABELS = {
  doctor:    'طبيب',
  dentist:   'طبيب أسنان',
  lab_test:  'تحليل مخبري',
  follow_up: 'متابعة',
  emergency: 'طارئ',
};

export const SAMPLE_TYPE_LABELS = {
  blood:   'دم',
  urine:   'بول',
  stool:   'براز',
  tissue:  'نسيج',
  swab:    'مسحة',
  saliva:  'لعاب',
  other:   'أخرى',
};

export const TEST_CATEGORY_LABELS = {
  blood:        'تحليل دم',
  urine:        'تحليل بول',
  stool:        'تحليل براز',
  imaging:      'تصوير',
  biopsy:       'خزعة',
  microbiology: 'أحياء دقيقة',
  molecular:    'بيولوجيا جزيئية',
  other:        'أخرى',
};

export const MED_ROUTE_LABELS = {
  oral:       'عن طريق الفم',
  topical:    'موضعي',
  injection:  'حقنة',
  inhalation: 'استنشاق',
  sublingual: 'تحت اللسان',
  rectal:     'شرجي',
  other:      'أخرى',
};


// ════════════════════════════════════════════════════════════════════
// 5) Date formatting (single source of truth)
// ════════════════════════════════════════════════════════════════════

/** Format an ISO date as long Arabic ("الأحد، ١ آذار ٢٠٢٥"). */
export function formatLongDate(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('ar-SY', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
    }).format(new Date(iso));
  } catch {
    return '—';
  }
}

/** Format an ISO date + time as Arabic. */
export function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('ar-SY', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(new Date(iso));
  } catch {
    return '—';
  }
}


// ════════════════════════════════════════════════════════════════════
// 6) Misc display helpers
// ════════════════════════════════════════════════════════════════════

/** Translate a specialization enum to Arabic, fall back to raw value. */
export function localizeSpecialization(spec) {
  if (!spec) return null;
  return SPECIALIZATION_LABELS[spec] || spec;
}

/** Compose "Dr. Name — Specialization" from getDoctorInfo() output. */
export function formatDoctorDisplay(doctorInfo) {
  if (!doctorInfo) return null;
  const spec = localizeSpecialization(doctorInfo.specialization);
  if (doctorInfo.name && spec) return `${doctorInfo.name} — ${spec}`;
  return doctorInfo.name || spec || null;
}

/** Render `—` if the value is empty/null. Use for any DD that may be missing. */
export function orDash(value) {
  return (value === null || value === undefined || value === '') ? '—' : value;
}
