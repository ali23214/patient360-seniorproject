/// Arabic display labels for every enum value the backend returns.
///
/// Values come straight from `backend/models/*.js` (which mirror
/// `patient360_db_final.js`). Missing keys return the raw enum value so a
/// new backend value degrades to the English token rather than blank UI.
final class ArabicLabels {
  const ArabicLabels._();

  static const Map<String, String> appointmentStatus = <String, String>{
    'scheduled': 'مجدول',
    'confirmed': 'مؤكد',
    'checked_in': 'تم الحضور',
    'in_progress': 'قيد التنفيذ',
    'completed': 'مكتمل',
    'cancelled': 'ملغى',
    'no_show': 'لم يحضر',
    'rescheduled': 'أُعيد الجدولة',
  };

  static const Map<String, String> priority = <String, String>{
    'routine': 'روتيني',
    'urgent': 'عاجل',
    'emergency': 'طارئ',
  };

  static const Map<String, String> cancellationReason = <String, String>{
    'patient_request': 'طلب المريض',
    'doctor_unavailable': 'الطبيب غير متاح',
    'emergency': 'حالة طارئة',
    'duplicate': 'موعد مكرر',
    'other': 'سبب آخر',
  };

  static const Map<String, String> appointmentType = <String, String>{
    'doctor': 'موعد طبيب',
    'dentist': 'موعد أسنان',
    'lab_test': 'فحص مخبري',
    'follow_up': 'متابعة',
    'emergency': 'طوارئ',
  };

  /// Visit document — `visitType` enum on `visits` collection.
  static const Map<String, String> visitType = <String, String>{
    'regular': 'زيارة عادية',
    'follow_up': 'متابعة',
    'emergency': 'طارئة',
    'consultation': 'استشارة',
    'dental': 'أسنان',
    'lab_only': 'مختبر',
  };

  /// Visit document — `status` enum on `visits` collection.
  static const Map<String, String> visitStatus = <String, String>{
    'in_progress': 'جارية',
    'completed': 'مكتملة',
    'cancelled': 'ملغاة',
  };

  /// Blood type enum on the `patients` collection. The schema stores
  /// rhFactor separately; client-side we collapse them to one label.
  static const Map<String, String> bloodType = <String, String>{
    'A+': 'A+',
    'A-': 'A-',
    'B+': 'B+',
    'B-': 'B-',
    'AB+': 'AB+',
    'AB-': 'AB-',
    'O+': 'O+',
    'O-': 'O-',
    'unknown': 'غير معروف',
  };

  /// Smoking status enum on the `patients` collection.
  static const Map<String, String> smokingStatus = <String, String>{
    'never': 'غير مدخّن',
    'former': 'سابق',
    'current': 'حالياً',
    'occasional': 'أحياناً',
  };

  static const Map<String, String> alcoholConsumption = <String, String>{
    'none': 'لا يشرب',
    'occasional': 'نادراً',
    'moderate': 'معتدل',
    'frequent': 'كثير',
  };

  static const Map<String, String> exerciseFrequency = <String, String>{
    'sedentary': 'قليل الحركة',
    'occasional': 'أحياناً',
    'regular': 'منتظم',
    'athletic': 'رياضي',
  };

  static const Map<String, String> gender = <String, String>{
    'male': 'ذكر',
    'female': 'أنثى',
  };

  /// Lab test document — `status` enum on `lab_tests` collection.
  /// `ordered` and `scheduled` collapse to the same Arabic label because
  /// the patient cares about scheduling, not the internal lab handover.
  static const Map<String, String> labStatus = <String, String>{
    'ordered': 'مجدول',
    'scheduled': 'مجدول',
    'sample_collected': 'تم أخذ العينة',
    'in_progress': 'قيد التحليل',
    'completed': 'مكتمل',
    'cancelled': 'ملغى',
    'rejected': 'مرفوض',
  };

  /// Visit/Prescription `paymentStatus` enum (5 values).
  static const Map<String, String> paymentStatus = <String, String>{
    'pending': 'بانتظار الدفع',
    'paid': 'مدفوع',
    'partially_paid': 'مدفوع جزئياً',
    'cancelled': 'ملغى',
    'free': 'مجاني',
    'refunded': 'مُعاد',
  };

  /// Medication route enum (7 values, matches PatientDashboard.jsx
  /// `MED_ROUTE_LABELS`).
  static const Map<String, String> medicationRoute = <String, String>{
    'oral': 'عن طريق الفم',
    'topical': 'موضعي',
    'injection': 'حقنة',
    'inhalation': 'استنشاق',
    'sublingual': 'تحت اللسان',
    'rectal': 'شرجي',
    'other': 'أخرى',
  };

  static const Map<String, String> specialization = <String, String>{
    'cardiology': 'قلبية',
    'dermatology': 'جلدية',
    'endocrinology': 'غدد صماء',
    'gastroenterology': 'جهاز هضمي',
    'general_practice': 'طب عام',
    'gynecology': 'نسائية',
    'hematology': 'أمراض دم',
    'internal_medicine': 'باطنية',
    'nephrology': 'كلى',
    'neurology': 'عصبية',
    'oncology': 'أورام',
    'ophthalmology': 'عينية',
    'orthopedics': 'عظمية',
    'otolaryngology': 'أنف وأذن وحنجرة',
    'pediatrics': 'أطفال',
    'psychiatry': 'نفسية',
    'pulmonology': 'صدرية',
    'radiology': 'أشعة',
    'rheumatology': 'روماتيزم',
    'surgery': 'جراحة عامة',
    'urology': 'بولية',
    'vascular_surgery': 'جراحة أوعية',
    'emergency_medicine': 'طب طوارئ',
    'anesthesiology': 'تخدير',
  };

  static const Map<String, String> governorate = <String, String>{
    'damascus': 'دمشق',
    'aleppo': 'حلب',
    'homs': 'حمص',
    'hama': 'حماة',
    'latakia': 'اللاذقية',
    'tartus': 'طرطوس',
    'idlib': 'إدلب',
    'deir_ez_zor': 'دير الزور',
    'raqqa': 'الرقة',
    'hasakah': 'الحسكة',
    'daraa': 'درعا',
    'as_suwayda': 'السويداء',
    'quneitra': 'القنيطرة',
    'rif_dimashq': 'ريف دمشق',
  };

  /// Safe lookup that falls back to the raw value instead of returning null.
  static String lookup(Map<String, String> table, String? value) {
    if (value == null || value.isEmpty) return '';
    return table[value] ?? value;
  }
}
