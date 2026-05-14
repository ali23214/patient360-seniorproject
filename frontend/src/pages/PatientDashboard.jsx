/**
 * PatientDashboard
 *
 * The patient's primary interface in the Patient 360° platform.
 * Provides 9 sections (home, appointments, visits, prescriptions,
 * lab-results, AI assistant, reviews, notifications, profile) in a
 * sidebar + page-header + main-content layout styled with Teal Medica
 * tokens.
 *
 * Every data interaction flows through `patientAPI` from
 * services/api.js (23 stubs committed separately; most are backed by
 * backend-team TODOs at the moment). UI degrades gracefully via
 * openAlert-wrapped error states when the backend is unavailable.
 *
 * Dual-patient aware: reads `patientPersonId` and `patientChildId`
 * from the getMyProfile response and carries them implicitly. No
 * patient ID is passed in API call parameters — the backend resolves
 * identity from JWT.
 *
 * Arabic RTL; LTR inputs (email display, national ID, phone) get
 * dir="ltr" explicitly. All interactive elements keyboard-accessible;
 * modal dismissal via Escape or backdrop click.
 *
 * Styling: see frontend/src/styles/PatientDashboard.css — pd-*
 * namespace, var(--tm-*) tokens only.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  // Layout / nav
  Menu, X, Bell, LogOut, ChevronDown, ChevronLeft, ChevronRight,
  // Section icons
  Home, Calendar, FileText, Pill, FlaskConical, Sparkles, Star, MessageSquare, User,
  // Profile + medical
  HeartPulse, Heart, Lock, Edit, MapPin, Phone, Mail, Activity, Stethoscope,
  CreditCard, Droplet, Baby, GraduationCap, ShieldCheck, Hospital,
  // Actions / status
  Plus, Check, CheckCircle2, XCircle, AlertTriangle, AlertCircle, AlertOctagon, Info,
  Download, ExternalLink, Eye, Clock, RotateCcw, Filter, Search, Trash2,
  MapPinned, Siren,
  // Medication card fields
  Syringe, Repeat, Hash, Navigation,
  // Theme toggle
  Sun, Moon,
  // AI input modalities (Image aliased to avoid DOM Image clash)
  Image as ImageIcon, Mic,
} from 'lucide-react';

import { patientAPI, authAPI } from '../services/api';
import { useTheme } from '../context/ThemeProvider';

import InputModeToggle from '../components/ai/InputModeToggle';
import InputText from '../components/ai/InputText';
import InputImage from '../components/ai/InputImage';
import ResultCard from '../components/ai/ResultCard';
import SeverityBadge from '../components/ai/SeverityBadge';
import FirstAidSteps from '../components/ai/FirstAidSteps';
import InputAudio from '../components/ai/InputAudio';
import ConfidenceBar from '../components/ai/ConfidenceBar';
import EmptyState from '../components/ai/EmptyState';

import LoadingSpinner from '../components/LoadingSpinner';

import '../styles/PatientDashboard.css';


// ══════════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════════

const SECTION_META = {
  home: {
    key: 'home',
    title: 'الرئيسية',
    subtitle: 'نظرة عامة على حالتك الصحية',
    icon: Home,
  },
  appointments: {
    key: 'appointments',
    title: 'المواعيد',
    subtitle: 'إدارة المواعيد القادمة والسابقة',
    icon: Calendar,
  },
  visits: {
    key: 'visits',
    title: 'الزيارات الطبية',
    subtitle: 'سجل الزيارات والفحوصات السابقة',
    icon: FileText,
  },
  prescriptions: {
    key: 'prescriptions',
    title: 'الوصفات الطبية',
    subtitle: 'الوصفات النشطة والمصروفة',
    icon: Pill,
  },
  'lab-results': {
    key: 'lab-results',
    title: 'نتائج المختبر',
    subtitle: 'نتائج الفحوصات المخبرية',
    icon: FlaskConical,
  },
  'ai-assistant': {
    key: 'ai-assistant',
    title: 'المساعد الذكي',
    subtitle: 'استشارة الأخصائي والإسعاف الأولي',
    icon: Sparkles,
  },
  reviews: {
    key: 'reviews',
    title: 'التقييمات',
    subtitle: 'تقييم الأطباء والمختبرات والصيدليات',
    icon: Star,
  },
  notifications: {
    key: 'notifications',
    title: 'الإشعارات',
    subtitle: 'التنبيهات والتذكيرات',
    icon: Bell,
  },
  profile: {
    key: 'profile',
    title: 'الملف الشخصي',
    subtitle: 'معلوماتك الشخصية والطبية',
    icon: User,
  },
};

const SIDEBAR_GROUPS = [
  {
    label: 'الرئيسية',
    items: [SECTION_META.home],
  },
  {
    label: 'الرعاية',
    items: [
      SECTION_META.appointments,
      SECTION_META.visits,
      SECTION_META.prescriptions,
      SECTION_META['lab-results'],
    ],
  },
  {
    label: 'المساعد الذكي',
    items: [SECTION_META['ai-assistant']],
  },
  {
    label: 'حسابي',
    items: [
      SECTION_META.reviews,
      SECTION_META.notifications,
      SECTION_META.profile,
    ],
  },
];


// ══════════════════════════════════════════════════════════════════════
// Date / text helpers
// ══════════════════════════════════════════════════════════════════════

const ARABIC_DATE_LOCALE = 'ar-SY';

// ══════════════════════════════════════════════════════════════════
// Medication display helpers (used in prescriptions section)
// ══════════════════════════════════════════════════════════════════

// DB enum (from patient360_db_final.js → prescriptions.medications.route)
// mapped to user-facing Arabic labels.
const MED_ROUTE_LABELS = {
  oral:        'عن طريق الفم',
  topical:     'موضعي',
  injection:   'حقنة',
  inhalation:  'استنشاق',
  sublingual:  'تحت اللسان',
  rectal:      'شرجي',
  other:       'أخرى',
};

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(ARABIC_DATE_LOCALE, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(iso));
  } catch {
    return '—';
  }
}

function formatTime(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(ARABIC_DATE_LOCALE, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '—';
  }
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return `${formatDate(iso)} — ${formatTime(iso)}`;
}

function formatAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

function buildFullName(identity) {
  if (!identity) return '';
  return [identity.firstName, identity.fatherName, identity.lastName]
    .filter(Boolean)
    .join(' ');
}


// ══════════════════════════════════════════════════════════════════════
// Medical Records System (pdmr-*) — shared helpers
// ──────────────────────────────────────────────────────────────────────
// These power the new Search + Filter + Date-grouping pattern used by
// the appointments / visits / prescriptions / lab-results sections.
// All four sections share the same toolbar UX and grouping logic, so
// the helpers are kept generic (pass in the date field name + search
// field names per section).
// ══════════════════════════════════════════════════════════════════════

// Smart period filter — keep records whose date falls inside the window.
// Returns a millisecond cutoff or null for 'all'.
function getPeriodCutoff(period) {
  if (!period || period === 'all') return null;
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  switch (period) {
    case 'week':    return now - 7 * day;
    case 'month':   return now - 30 * day;
    case '3months': return now - 90 * day;
    case 'year':    return now - 365 * day;
    default:        return null;
  }
}

// Generic filter + sort. Pure function, safe inside useMemo.
//   items         — array
//   search        — user-typed query (case-insensitive, Arabic-aware)
//   searchFields  — list of property paths to scan inside each item
//                   e.g. ['reasonForVisit', 'doctor.firstName']
//   period        — 'all'|'week'|'month'|'3months'|'year'
//   dateField     — property name to read for date-based comparisons
//   sortOrder     — 'newest'|'oldest'
function filterAndSortItems({
  items,
  search,
  searchFields,
  period,
  dateField,
  sortOrder = 'newest',
}) {
  if (!Array.isArray(items)) return [];

  const q = (search || '').trim().toLowerCase();
  const cutoff = getPeriodCutoff(period);

  // Resolve a possibly-nested path like "a.b.c" off an object.
  const readPath = (obj, path) => {
    if (!obj || !path) return '';
    return path.split('.').reduce(
      (acc, key) => (acc == null ? acc : acc[key]),
      obj
    );
  };

  const filtered = items.filter((it) => {
    // Period gate
    if (cutoff && dateField) {
      const raw = it?.[dateField];
      const t = raw ? new Date(raw).getTime() : 0;
      if (!t || t < cutoff) return false;
    }

    // Search gate
    if (q && Array.isArray(searchFields) && searchFields.length > 0) {
      const hit = searchFields.some((field) => {
        const v = readPath(it, field);
        if (v == null) return false;
        return String(v).toLowerCase().includes(q);
      });
      if (!hit) return false;
    }

    return true;
  });

  // Sort by date (newest/oldest)
  if (dateField) {
    filtered.sort((a, b) => {
      const ta = a?.[dateField] ? new Date(a[dateField]).getTime() : 0;
      const tb = b?.[dateField] ? new Date(b[dateField]).getTime() : 0;
      return sortOrder === 'oldest' ? ta - tb : tb - ta;
    });
  }

  return filtered;
}

// Smart date bucketing. Returns ordered groups so the caller can render
// each one with its own header ("اليوم"، "غداً"، ...). Empty groups are
// dropped before return so the UI never renders an empty section.
function groupByDate(items, dateField) {
  const buckets = {
    today:     [],
    tomorrow:  [],
    thisWeek:  [],
    thisMonth: [],
    older:     [],
  };

  if (!Array.isArray(items)) return [];

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTomorrow = startOfToday + 24 * 60 * 60 * 1000;
  const startOfDayAfter = startOfTomorrow + 24 * 60 * 60 * 1000;
  const startOfWeekAhead = startOfToday + 7 * 24 * 60 * 60 * 1000;
  const startOfMonthAhead = startOfToday + 30 * 24 * 60 * 60 * 1000;

  items.forEach((it) => {
    const raw = it?.[dateField];
    const t = raw ? new Date(raw).getTime() : 0;
    if (!t) {
      buckets.older.push(it);
      return;
    }
    if (t >= startOfToday && t < startOfTomorrow)       buckets.today.push(it);
    else if (t >= startOfTomorrow && t < startOfDayAfter) buckets.tomorrow.push(it);
    else if (t >= startOfDayAfter && t < startOfWeekAhead) buckets.thisWeek.push(it);
    else if (t >= startOfWeekAhead && t < startOfMonthAhead) buckets.thisMonth.push(it);
    else                                                  buckets.older.push(it);
  });

  // Order matters — present soonest first.
  const order = ['today', 'tomorrow', 'thisWeek', 'thisMonth', 'older'];
  return order
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({ key, items: buckets[key] }));
}

// Human-facing Arabic labels for the smart date buckets.
const DATE_GROUP_LABELS = {
  today:     'اليوم',
  tomorrow:  'غداً',
  thisWeek:  'هذا الأسبوع',
  thisMonth: 'هذا الشهر',
  older:     'سابق',
};


// ══════════════════════════════════════════════════════════════════════
// Modal primitive
// ══════════════════════════════════════════════════════════════════════

function Modal({ isOpen, onClose, size = 'md', children }) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="pd-modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`pd-modal pd-modal--${size}`}>
        {children}
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════
// Module-scope form components
// ══════════════════════════════════════════════════════════════════════

const CANCELLATION_REASONS = [
  { value: 'patient_request',    label: 'طلب المريض'      },
  { value: 'doctor_unavailable', label: 'الطبيب غير متاح' },
  { value: 'emergency',          label: 'حالة طارئة'       },
  { value: 'duplicate',          label: 'موعد مكرر'        },
  { value: 'other',              label: 'سبب آخر'           },
];

function AppointmentCancelForm({ appointment, onCancel, onConfirm, submitting }) {
  const [reason, setReason] = useState('patient_request');

  return (
    <>
      <div className="pd-modal-header pd-modal-header--warning">
        <AlertTriangle size={20} aria-hidden="true" />
        <h3 className="pd-modal-title">إلغاء الموعد</h3>
        <button type="button" className="pd-modal-close" onClick={onCancel} aria-label="إغلاق">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="pd-modal-body">
        <p className="pd-modal-message">
          هل أنت متأكد من إلغاء موعد{' '}
          <strong dir="auto">{appointment?.reasonForVisit || 'الزيارة'}</strong>؟
        </p>
        <fieldset className="pd-form-group">
          <legend className="pd-form-label">سبب الإلغاء</legend>
          <div className="pd-radio-group">
            {CANCELLATION_REASONS.map((opt) => (
              <label key={opt.value} className="pd-radio">
                <input
                  type="radio"
                  name="cancellationReason"
                  value={opt.value}
                  checked={reason === opt.value}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={submitting}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="pd-modal-footer">
        <button type="button" className="pd-btn pd-btn--ghost" onClick={onCancel} disabled={submitting}>
          تراجع
        </button>
        <button
          type="button"
          className="pd-btn pd-btn--danger"
          onClick={() => onConfirm({ cancellationReason: reason })}
          disabled={submitting}
        >
          {submitting ? '...' : 'تأكيد الإلغاء'}
        </button>
      </div>
    </>
  );
}


function AppointmentBookingFlow({ openAlert, onSuccess, onClose }) {
  const [step, setStep] = useState('search');
  const [specialization, setSpecialization] = useState('');
  const [doctors, setDoctors] = useState([]);
  const [doctorsLoading, setDoctorsLoading] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [reasonForVisit, setReasonForVisit] = useState('');
  const [priority, setPriority] = useState('routine');
  const [submitting, setSubmitting] = useState(false);

  const handleSearch = async (e) => {
    e?.preventDefault();
    setDoctorsLoading(true);
    try {
      const res = await patientAPI.searchDoctors(
        specialization ? { specialization } : {}
      );
      if (res?.success) {
        setDoctors(Array.isArray(res.doctors) ? res.doctors : []);
      }
    } catch (err) {
      openAlert('error', 'تعذر البحث عن الأطباء', err?.message || 'حدث خطأ');
    } finally {
      setDoctorsLoading(false);
    }
  };

  const handlePickDoctor = async (doctor) => {
    setSelectedDoctor(doctor);
    setSlotsLoading(true);
    setStep('slots');
    try {
      const res = await patientAPI.getDoctorSlots(doctor._id);
      if (res?.success) {
        setSlots(
          Array.isArray(res.slots) ? res.slots.filter((s) => !s.isBooked) : []
        );
      }
    } catch (err) {
      openAlert('error', 'تعذر تحميل المواعيد المتاحة', err?.message || 'حدث خطأ');
    } finally {
      setSlotsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedSlot || !reasonForVisit.trim()) return;
    setSubmitting(true);
    try {
      const res = await patientAPI.bookAppointment({
        slotId: selectedSlot._id,
        appointmentType: 'doctor',
        reasonForVisit: reasonForVisit.trim(),
        priority,
      });
      if (res?.success) {
        onSuccess();
      } else {
        openAlert('error', 'فشل الحجز', res?.message || 'حدث خطأ غير متوقع');
      }
    } catch (err) {
      openAlert('error', 'فشل الحجز', err?.message || 'حدث خطأ في الاتصال');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="pd-modal-header pd-modal-header--info">
        <Plus size={20} aria-hidden="true" />
        <h3 className="pd-modal-title">حجز موعد جديد</h3>
        <button type="button" className="pd-modal-close" onClick={onClose} aria-label="إغلاق">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="pd-modal-body">
        <ol className="pd-booking-steps" aria-label="خطوات الحجز">
          <li className={`pd-booking-step${step === 'search' ? ' is-active' : ''}`}>
            <span>1</span> اختيار الطبيب
          </li>
          <li className={`pd-booking-step${step === 'slots' ? ' is-active' : ''}`}>
            <span>2</span> اختيار الموعد
          </li>
          <li className={`pd-booking-step${step === 'confirm' ? ' is-active' : ''}`}>
            <span>3</span> التأكيد
          </li>
        </ol>

        {step === 'search' && (
          <form className="pd-booking-search" onSubmit={handleSearch}>
            <div className="pd-form-group">
              <label htmlFor="pd-booking-spec" className="pd-form-label">التخصص</label>
              <input
                id="pd-booking-spec"
                type="text"
                className="pd-form-input"
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
                placeholder="قلبية، عصبية، جلدية..."
                dir="auto"
              />
            </div>
            <button type="submit" className="pd-btn pd-btn--primary" disabled={doctorsLoading}>
              <Search size={16} aria-hidden="true" />
              <span>{doctorsLoading ? '...' : 'بحث'}</span>
            </button>
            {!doctorsLoading && doctors.length > 0 && (
              <ul className="pd-booking-doctors">
                {doctors.map((d) => (
                  <li key={d._id}>
                    <button type="button" className="pd-booking-doctor" onClick={() => handlePickDoctor(d)}>
                      <Stethoscope size={18} aria-hidden="true" />
                      <div>
                        <strong dir="auto">{d.firstName} {d.lastName}</strong>
                        <span dir="auto">{d.specialization}</span>
                      </div>
                      <ChevronLeft size={16} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </form>
        )}

        {step === 'slots' && (
          <div className="pd-booking-slots">
            {slotsLoading ? (
              <LoadingSpinner message="جاري تحميل المواعيد..." />
            ) : slots.length === 0 ? (
              <EmptyState icon={Clock} title="لا توجد مواعيد متاحة" subtitle="جرّب اختيار طبيب آخر." />
            ) : (
              <ul className="pd-booking-slot-list">
                {slots.map((slot) => (
                  <li key={slot._id}>
                    <button
                      type="button"
                      className="pd-booking-slot"
                      onClick={() => { setSelectedSlot(slot); setStep('confirm'); }}
                    >
                      <Calendar size={16} aria-hidden="true" />
                      <span dir="ltr">{formatDate(slot.date)}</span>
                      <span dir="ltr">{slot.startTime} — {slot.endTime}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="pd-btn pd-btn--ghost" onClick={() => setStep('search')}>
              <ChevronRight size={16} aria-hidden="true" />
              <span>العودة للبحث</span>
            </button>
          </div>
        )}

        {step === 'confirm' && (
          <div className="pd-booking-confirm">
            <div className="pd-booking-summary">
              <p><strong>الطبيب:</strong> <span dir="auto">{selectedDoctor?.firstName} {selectedDoctor?.lastName}</span></p>
              <p><strong>التاريخ:</strong> <span dir="ltr">{formatDate(selectedSlot?.date)}</span></p>
              <p><strong>الوقت:</strong> <span dir="ltr">{selectedSlot?.startTime}</span></p>
            </div>
            <div className="pd-form-group">
              <label htmlFor="pd-booking-reason" className="pd-form-label">
                سبب الزيارة <span aria-hidden="true">*</span>
              </label>
              <textarea
                id="pd-booking-reason"
                className="pd-form-input"
                value={reasonForVisit}
                onChange={(e) => setReasonForVisit(e.target.value)}
                rows={3}
                dir="auto"
                required
              />
            </div>
            <div className="pd-form-group">
              <label htmlFor="pd-booking-priority" className="pd-form-label">الأولوية</label>
              <select
                id="pd-booking-priority"
                className="pd-form-input"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="routine">روتيني</option>
                <option value="urgent">عاجل</option>
                <option value="emergency">طارئ</option>
              </select>
            </div>
          </div>
        )}
      </div>
      <div className="pd-modal-footer">
        <button type="button" className="pd-btn pd-btn--ghost" onClick={onClose} disabled={submitting}>
          إلغاء
        </button>
        {step === 'confirm' && (
          <button
            type="button"
            className="pd-btn pd-btn--primary"
            onClick={handleSubmit}
            disabled={submitting || !reasonForVisit.trim()}
          >
            {submitting ? '...' : 'تأكيد الحجز'}
          </button>
        )}
      </div>
    </>
  );
}


const REVIEW_TARGETS = [
  { key: 'doctorId',     label: 'طبيب',       icon: Stethoscope  },
  { key: 'dentistId',    label: 'طبيب أسنان', icon: User         },
  { key: 'laboratoryId', label: 'مختبر',       icon: FlaskConical },
  { key: 'pharmacyId',   label: 'صيدلية',      icon: Pill         },
  { key: 'hospitalId',   label: 'مستشفى',      icon: Hospital     },
];

function ReviewSubmitForm({ onCancel, onConfirm, submitting }) {
  const [targetType, setTargetType] = useState('doctorId');
  const [targetId, setTargetId] = useState('');
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);

  const canSubmit = targetId.trim() && rating >= 1 && rating <= 5;

  const handleSubmit = () => {
    if (!canSubmit || submitting) return;
    onConfirm({
      rating,
      reviewText: reviewText.trim() || undefined,
      isAnonymous,
      [targetType]: targetId.trim(),
    });
  };

  return (
    <>
      <div className="pd-modal-header pd-modal-header--info">
        <Star size={20} aria-hidden="true" />
        <h3 className="pd-modal-title">إضافة تقييم جديد</h3>
        <button type="button" className="pd-modal-close" onClick={onCancel} aria-label="إغلاق">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="pd-modal-body">
        <fieldset className="pd-form-group">
          <legend className="pd-form-label">الجهة المُقَيَّمة</legend>
          <div className="pd-review-target-row">
            {REVIEW_TARGETS.map(({ key, label, icon: TIcon }) => (
              <label
                key={key}
                className={`pd-review-target${targetType === key ? ' is-active' : ''}`}
              >
                <input
                  type="radio"
                  name="reviewTarget"
                  value={key}
                  checked={targetType === key}
                  onChange={(e) => setTargetType(e.target.value)}
                  disabled={submitting}
                />
                <TIcon size={16} aria-hidden="true" />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="pd-form-group">
          <label htmlFor="pd-review-target-id" className="pd-form-label">
            معرّف الجهة <span aria-hidden="true">*</span>
          </label>
          <input
            id="pd-review-target-id"
            type="text"
            className="pd-form-input"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            dir="ltr"
            placeholder="أدخل المعرّف..."
            required
            disabled={submitting}
          />
          <p className="pd-form-hint">
            ستتم إضافة اختيار مباشر من قائمة الأطباء/المراكز في إصدار لاحق.
          </p>
        </div>

        <fieldset className="pd-form-group">
          <legend className="pd-form-label">التقييم</legend>
          <div
            className="pd-review-stars"
            role="radiogroup"
            aria-label="التقييم بالنجوم"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} من 5`}
                className={`pd-review-star${n <= rating ? ' is-filled' : ''}`}
                onClick={() => setRating(n)}
                disabled={submitting}
              >
                <Star
                  size={24}
                  fill={n <= rating ? 'currentColor' : 'none'}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </fieldset>

        <div className="pd-form-group">
          <label htmlFor="pd-review-text" className="pd-form-label">
            تعليق (اختياري)
          </label>
          <textarea
            id="pd-review-text"
            className="pd-form-input"
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            maxLength={1000}
            rows={3}
            dir="auto"
            placeholder="شاركنا تجربتك..."
            disabled={submitting}
          />
        </div>

        <label className="pd-checkbox">
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
            disabled={submitting}
          />
          <span>إرسال التقييم دون الكشف عن الهوية</span>
        </label>
      </div>
      <div className="pd-modal-footer">
        <button type="button" className="pd-btn pd-btn--ghost" onClick={onCancel} disabled={submitting}>
          إلغاء
        </button>
        <button
          type="button"
          className="pd-btn pd-btn--primary"
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
        >
          {submitting ? '...' : 'إرسال التقييم'}
        </button>
      </div>
    </>
  );
}


function ProfileEditForm({ profile, onCancel, onConfirm, submitting }) {
  const ident   = profile?.person || profile?.child || {};
  const patient = profile?.patient || {};
  const ec      = patient?.emergencyContact || {};

  const [form, setForm] = useState({
    phoneNumber:            ident.phoneNumber || '',
    alternativePhoneNumber: ident.alternativePhoneNumber || '',
    address:                ident.address || '',
    governorate:            ident.governorate || '',
    city:                   ident.city || '',
    bloodType:              patient.bloodType || '',
    height:                 patient.height || '',
    weight:                 patient.weight || '',
    smokingStatus:          patient.smokingStatus || 'non-smoker',
    allergies:              (patient.allergies || []).join('، '),
    chronicDiseases:        (patient.chronicDiseases || []).join('، '),
    ecName:                 ec.name || '',
    ecRelationship:         ec.relationship || '',
    ecPhone:                ec.phoneNumber || '',
  });

  const bind = (field) => ({
    value: form[field],
    onChange: (e) => setForm((p) => ({ ...p, [field]: e.target.value })),
    disabled: submitting,
  });

  const parseTagList = (s) =>
    s
      .split(/[،,]/)
      .map((t) => t.trim())
      .filter(Boolean);

  const handleSubmit = () => {
    onConfirm({
      phoneNumber:            form.phoneNumber,
      alternativePhoneNumber: form.alternativePhoneNumber || undefined,
      address:                form.address,
      governorate:            form.governorate,
      city:                   form.city,
      bloodType:              form.bloodType || undefined,
      height:                 form.height ? Number(form.height) : undefined,
      weight:                 form.weight ? Number(form.weight) : undefined,
      smokingStatus:          form.smokingStatus,
      allergies:              parseTagList(form.allergies),
      chronicDiseases:        parseTagList(form.chronicDiseases),
      emergencyContact:
        form.ecName && form.ecRelationship && form.ecPhone
          ? {
              name: form.ecName,
              relationship: form.ecRelationship,
              phoneNumber: form.ecPhone,
            }
          : undefined,
    });
  };

  const GOVS = [
    'damascus', 'aleppo', 'homs', 'hama', 'latakia', 'tartus',
    'idlib', 'deir_ez_zor', 'raqqa', 'hasakah', 'daraa',
    'as_suwayda', 'quneitra', 'rif_dimashq',
  ];
  const GOV_LABELS = {
    damascus: 'دمشق', aleppo: 'حلب', homs: 'حمص', hama: 'حماة',
    latakia: 'اللاذقية', tartus: 'طرطوس', idlib: 'إدلب',
    deir_ez_zor: 'دير الزور', raqqa: 'الرقة', hasakah: 'الحسكة',
    daraa: 'درعا', as_suwayda: 'السويداء', quneitra: 'القنيطرة',
    rif_dimashq: 'ريف دمشق',
  };

  return (
    <>
      <div className="pd-modal-header pd-modal-header--info">
        <Edit size={20} aria-hidden="true" />
        <h3 className="pd-modal-title">تعديل الملف الشخصي</h3>
        <button type="button" className="pd-modal-close" onClick={onCancel} aria-label="إغلاق">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="pd-modal-body">
        <h4 className="pd-profile-edit-section-title">معلومات التواصل</h4>
        <div className="pd-form-row">
          <div className="pd-form-group">
            <label htmlFor="pd-edit-phone" className="pd-form-label">رقم الهاتف</label>
            <input id="pd-edit-phone" type="tel" className="pd-form-input" dir="ltr" {...bind('phoneNumber')} />
          </div>
          <div className="pd-form-group">
            <label htmlFor="pd-edit-phone-alt" className="pd-form-label">رقم بديل (اختياري)</label>
            <input id="pd-edit-phone-alt" type="tel" className="pd-form-input" dir="ltr" {...bind('alternativePhoneNumber')} />
          </div>
        </div>

        <div className="pd-form-group">
          <label htmlFor="pd-edit-address" className="pd-form-label">العنوان</label>
          <input id="pd-edit-address" type="text" className="pd-form-input" dir="auto" {...bind('address')} />
        </div>

        <div className="pd-form-row">
          <div className="pd-form-group">
            <label htmlFor="pd-edit-governorate" className="pd-form-label">المحافظة</label>
            <select id="pd-edit-governorate" className="pd-form-input" {...bind('governorate')}>
              <option value="">اختر المحافظة</option>
              {GOVS.map((g) => (
                <option key={g} value={g}>{GOV_LABELS[g] || g}</option>
              ))}
            </select>
          </div>
          <div className="pd-form-group">
            <label htmlFor="pd-edit-city" className="pd-form-label">المدينة</label>
            <input id="pd-edit-city" type="text" className="pd-form-input" dir="auto" {...bind('city')} />
          </div>
        </div>

        <h4 className="pd-profile-edit-section-title">المعلومات الطبية</h4>
        <div className="pd-form-row">
          <div className="pd-form-group">
            <label htmlFor="pd-edit-blood" className="pd-form-label">فصيلة الدم</label>
            <select id="pd-edit-blood" className="pd-form-input" {...bind('bloodType')}>
              <option value="">—</option>
              {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'].map((b) => (
                <option key={b} value={b}>{b === 'unknown' ? 'غير معروفة' : b}</option>
              ))}
            </select>
          </div>
          <div className="pd-form-group">
            <label htmlFor="pd-edit-height" className="pd-form-label">الطول (سم)</label>
            <input id="pd-edit-height" type="number" min="0" max="300" className="pd-form-input" dir="ltr" {...bind('height')} />
          </div>
          <div className="pd-form-group">
            <label htmlFor="pd-edit-weight" className="pd-form-label">الوزن (كغ)</label>
            <input id="pd-edit-weight" type="number" min="0" max="500" className="pd-form-input" dir="ltr" {...bind('weight')} />
          </div>
        </div>

        <div className="pd-form-group">
          <label htmlFor="pd-edit-smoking" className="pd-form-label">التدخين</label>
          <select id="pd-edit-smoking" className="pd-form-input" {...bind('smokingStatus')}>
            <option value="non-smoker">غير مدخن</option>
            <option value="current_smoker">مدخن حالياً</option>
            <option value="former_smoker">مدخن سابقاً</option>
          </select>
        </div>

        <div className="pd-form-group">
          <label htmlFor="pd-edit-allergies" className="pd-form-label">الحساسية (افصل بفواصل)</label>
          <input id="pd-edit-allergies" type="text" className="pd-form-input" dir="auto" placeholder="مثال: بنسلين، فول سوداني" {...bind('allergies')} />
        </div>

        <div className="pd-form-group">
          <label htmlFor="pd-edit-chronic" className="pd-form-label">الأمراض المزمنة (افصل بفواصل)</label>
          <input id="pd-edit-chronic" type="text" className="pd-form-input" dir="auto" placeholder="مثال: ضغط الدم، السكري" {...bind('chronicDiseases')} />
        </div>

        <h4 className="pd-profile-edit-section-title">جهة الاتصال في حالة الطوارئ</h4>
        <div className="pd-form-row">
          <div className="pd-form-group">
            <label htmlFor="pd-edit-ec-name" className="pd-form-label">الاسم</label>
            <input id="pd-edit-ec-name" type="text" className="pd-form-input" dir="auto" {...bind('ecName')} />
          </div>
          <div className="pd-form-group">
            <label htmlFor="pd-edit-ec-rel" className="pd-form-label">صلة القرابة</label>
            <input id="pd-edit-ec-rel" type="text" className="pd-form-input" dir="auto" {...bind('ecRelationship')} />
          </div>
          <div className="pd-form-group">
            <label htmlFor="pd-edit-ec-phone" className="pd-form-label">الهاتف</label>
            <input id="pd-edit-ec-phone" type="tel" className="pd-form-input" dir="ltr" {...bind('ecPhone')} />
          </div>
        </div>
      </div>
      <div className="pd-modal-footer">
        <button type="button" className="pd-btn pd-btn--ghost" onClick={onCancel} disabled={submitting}>إلغاء</button>
        <button type="button" className="pd-btn pd-btn--primary" onClick={handleSubmit} disabled={submitting}>
          {submitting ? '...' : 'حفظ التعديلات'}
        </button>
      </div>
    </>
  );
}


// ══════════════════════════════════════════════════════════════════════
// Main component
// ══════════════════════════════════════════════════════════════════════

export default function PatientDashboard() {
  const navigate = useNavigate();

  // ── Layout state ────────────────────────────────────────────────────
  // activeSection is persisted in sessionStorage so that:
  //   1. The back button from detail pages (visit / appointment / Rx / lab)
  //      lands back on the SAME section the patient was browsing, not on
  //      'home'. Without this, React remounts the dashboard fresh on the
  //      browser-back and resets activeSection to the default.
  //   2. A page refresh within the same tab keeps the user in place.
  //   3. Logout clears sessionStorage, so the next login starts on 'home'.
  const [activeSection, setActiveSection] = useState(() => {
    try {
      const saved = sessionStorage.getItem('pd-active-section');
      if (saved && SECTION_META[saved]) return saved;
    } catch {
      /* sessionStorage may be unavailable in some private-browsing modes */
    }
    return 'home';
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Theme ───────────────────────────────────────────────────────────
  // Uses the global ThemeProvider — single source of truth across all
  // pages. Do NOT add local theme state here; it conflicts with the
  // provider and breaks dark mode on navigation. (Same pattern as
  // DoctorDashboard.) The provider exposes:
  //   theme       → 'light' | 'dark'
  //   toggleTheme → flips theme + persists to localStorage('p360-theme')
  //   isDark      → boolean convenience flag
  const { theme, toggleTheme, isDark } = useTheme();

  // Persist the section so the back-button + page-refresh both restore it.
  useEffect(() => {
    try {
      sessionStorage.setItem('pd-active-section', activeSection);
    } catch {
      /* silent — section restoration is a nice-to-have */
    }
  }, [activeSection]);

  // ── Profile + overview (loaded on mount, in parallel) ───────────────
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  // ── Per-section lazy-loaded data + section-local UI state ───────────
  const [appointments, setAppointments] = useState([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [appointmentsLoaded, setAppointmentsLoaded] = useState(false);
  const [appointmentTab, setAppointmentTab] = useState('upcoming');
  // ── Universal Medical Records System (pdmr-*) — per-section filter state
  // search:  user-typed query
  // view:    'list' | 'cards'  (Hybrid Toggle simplified to 2 views)
  // period:  'all' | 'week' | 'month' | '3months' | 'year'
  // sort:    'newest' | 'oldest'
  const [apptSearch, setApptSearch] = useState('');
  const [apptView,   setApptView]   = useState('list');
  const [apptPeriod, setApptPeriod] = useState('all');
  const [apptSort,   setApptSort]   = useState('newest');

  const [visits, setVisits] = useState([]);
  const [visitsLoading, setVisitsLoading] = useState(false);
  const [visitsLoaded, setVisitsLoaded] = useState(false);
  // Universal Medical Records System (pdmr-*) state — same shape as appointments.
  const [visitTab,    setVisitTab]    = useState('all');
  const [visitSearch, setVisitSearch] = useState('');
  const [visitView,   setVisitView]   = useState('list');
  const [visitPeriod, setVisitPeriod] = useState('all');
  const [visitSort,   setVisitSort]   = useState('newest');

  const [prescriptions, setPrescriptions] = useState([]);
  const [prescriptionsLoading, setPrescriptionsLoading] = useState(false);
  const [prescriptionsLoaded, setPrescriptionsLoaded] = useState(false);
  // Universal Medical Records System state — same shape as visits/appointments.
  const [prescriptionTab,    setPrescriptionTab]    = useState('active');
  const [prescriptionSearch, setPrescriptionSearch] = useState('');
  const [prescriptionView,   setPrescriptionView]   = useState('list');
  const [prescriptionPeriod, setPrescriptionPeriod] = useState('all');
  const [prescriptionSort,   setPrescriptionSort]   = useState('newest');

  const [labTests, setLabTests] = useState([]);
  const [labTestsLoading, setLabTestsLoading] = useState(false);
  const [labTestsLoaded, setLabTestsLoaded] = useState(false);
  // Universal Medical Records System state — same shape as other sections.
  const [labTestTab,    setLabTestTab]    = useState('results');
  const [labTestSearch, setLabTestSearch] = useState('');
  const [labTestView,   setLabTestView]   = useState('list');
  const [labTestPeriod, setLabTestPeriod] = useState('all');
  const [labTestSort,   setLabTestSort]   = useState('newest');

  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsLoaded, setNotificationsLoaded] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState('unread');

  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsLoaded, setReviewsLoaded] = useState(false);

  const [emergencyReports, setEmergencyReports] = useState([]);
  const [emergencyReportsLoading, setEmergencyReportsLoading] = useState(false);
  const [emergencyReportsLoaded, setEmergencyReportsLoaded] = useState(false);

  // ── AI assistant state ──────────────────────────────────────────────
  const [aiActiveTab, setAiActiveTab] = useState('specialist');

  const [specialistInput, setSpecialistInput] = useState('');
  const [specialistResult, setSpecialistResult] = useState(null);
  const [specialistLoading, setSpecialistLoading] = useState(false);
  const [specialistError, setSpecialistError] = useState(null);

  const [triageMode, setTriageMode] = useState('text');
  const [triageText, setTriageText] = useState('');
  const [triageImageFile, setTriageImageFile] = useState(null);
  const [triageAudioFile, setTriageAudioFile] = useState(null);
  const [triageResult, setTriageResult] = useState(null);
  const [triageLoading, setTriageLoading] = useState(false);
  const [triageError, setTriageError] = useState(null);

  // ── Modal state ─────────────────────────────────────────────────────
  const [modal, setModal] = useState({
    isOpen: false,
    type: 'alert',
    variant: 'info',
    title: '',
    message: '',
    content: null,
    onConfirm: null,
    confirmLabel: 'حسناً',
    cancelLabel: 'إلغاء',
    size: 'md',
  });

  // NOTE: <html data-theme="..."> attribute and CSS variable injection
  // are managed by the global ThemeProvider. Do not duplicate that
  // logic here — it caused the previous dark-mode bug where the
  // attribute was toggled without updating the CSS custom properties.

  // ── Initial mount: load profile + overview in parallel ──────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [profileRes, overviewRes] = await Promise.allSettled([
        patientAPI.getMyProfile(),
        patientAPI.getDashboardOverview(),
      ]);

      if (cancelled) return;

      if (profileRes.status === 'fulfilled' && profileRes.value?.success) {
        setProfile(profileRes.value);
      }
      setProfileLoading(false);

      if (overviewRes.status === 'fulfilled' && overviewRes.value?.success) {
        setOverview(overviewRes.value);
      }
      setOverviewLoading(false);
    })();

    return () => { cancelled = true; };
  }, []);


  // ════════════════════════════════════════════════════════════════════
  // Modal helpers
  // ════════════════════════════════════════════════════════════════════

  const closeModal = useCallback(() => {
    setModal((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const openAlert = useCallback((variant, title, message) => {
    setModal({
      isOpen: true,
      type: 'alert',
      variant,
      title,
      message,
      content: null,
      onConfirm: null,
      confirmLabel: 'حسناً',
      cancelLabel: 'إلغاء',
      size: 'md',
    });
  }, []);

  const openConfirm = useCallback(
    (variant, title, message, onConfirm, confirmLabel = 'تأكيد') => {
      setModal({
        isOpen: true,
        type: 'confirm',
        variant,
        title,
        message,
        content: null,
        onConfirm,
        confirmLabel,
        cancelLabel: 'إلغاء',
        size: 'md',
      });
    },
    []
  );

  const openCustomModal = useCallback((title, content, size = 'md') => {
    setModal({
      isOpen: true,
      type: 'custom',
      variant: 'info',
      title,
      message: '',
      content,
      onConfirm: null,
      confirmLabel: 'حسناً',
      cancelLabel: 'إلغاء',
      size,
    });
  }, []);


  // ════════════════════════════════════════════════════════════════════
  // Per-section lazy loaders
  // ════════════════════════════════════════════════════════════════════

  const loadAppointments = useCallback(async (force = false) => {
    if (appointmentsLoaded && !force) return;
    setAppointmentsLoading(true);
    try {
      const res = await patientAPI.getAppointments();
      if (res?.success) {
        setAppointments(Array.isArray(res.appointments) ? res.appointments : []);
      }
    } catch (err) {
      openAlert('error', 'تعذر تحميل المواعيد', err?.message || 'حدث خطأ في الاتصال بالخادم');
    } finally {
      setAppointmentsLoading(false);
      setAppointmentsLoaded(true);
    }
  }, [appointmentsLoaded, openAlert]);

  const loadVisits = useCallback(async (force = false) => {
    if (visitsLoaded && !force) return;
    setVisitsLoading(true);
    try {
      const res = await patientAPI.getVisits();
      if (res?.success) {
        setVisits(Array.isArray(res.visits) ? res.visits : []);
      }
    } catch (err) {
      openAlert('error', 'تعذر تحميل الزيارات', err?.message || 'حدث خطأ في الاتصال بالخادم');
    } finally {
      setVisitsLoading(false);
      setVisitsLoaded(true);
    }
  }, [visitsLoaded, openAlert]);

  const loadPrescriptions = useCallback(async (force = false) => {
    if (prescriptionsLoaded && !force) return;
    setPrescriptionsLoading(true);
    try {
      const res = await patientAPI.getPrescriptions();
      if (res?.success) {
        setPrescriptions(Array.isArray(res.prescriptions) ? res.prescriptions : []);
      }
    } catch (err) {
      openAlert('error', 'تعذر تحميل الوصفات', err?.message || 'حدث خطأ في الاتصال بالخادم');
    } finally {
      setPrescriptionsLoading(false);
      setPrescriptionsLoaded(true);
    }
  }, [prescriptionsLoaded, openAlert]);

  const loadLabTests = useCallback(async (force = false) => {
    if (labTestsLoaded && !force) return;
    setLabTestsLoading(true);
    try {
      const res = await patientAPI.getLabTests();
      if (res?.success) {
        setLabTests(Array.isArray(res.labTests) ? res.labTests : []);
      }
    } catch (err) {
      openAlert('error', 'تعذر تحميل نتائج المختبر', err?.message || 'حدث خطأ في الاتصال بالخادم');
    } finally {
      setLabTestsLoading(false);
      setLabTestsLoaded(true);
    }
  }, [labTestsLoaded, openAlert]);

  const loadNotifications = useCallback(async (force = false) => {
    if (notificationsLoaded && !force) return;
    setNotificationsLoading(true);
    try {
      const res = await patientAPI.getNotifications();
      if (res?.success) {
        setNotifications(Array.isArray(res.notifications) ? res.notifications : []);
      }
    } catch (err) {
      openAlert('error', 'تعذر تحميل الإشعارات', err?.message || 'حدث خطأ في الاتصال بالخادم');
    } finally {
      setNotificationsLoading(false);
      setNotificationsLoaded(true);
    }
  }, [notificationsLoaded, openAlert]);

  const loadReviews = useCallback(async (force = false) => {
    if (reviewsLoaded && !force) return;
    setReviewsLoading(true);
    try {
      const res = await patientAPI.getMyReviews();
      if (res?.success) {
        setReviews(Array.isArray(res.reviews) ? res.reviews : []);
      }
    } catch (err) {
      openAlert('error', 'تعذر تحميل التقييمات', err?.message || 'حدث خطأ في الاتصال بالخادم');
    } finally {
      setReviewsLoading(false);
      setReviewsLoaded(true);
    }
  }, [reviewsLoaded, openAlert]);

  const loadEmergencyReports = useCallback(async (force = false) => {
    if (emergencyReportsLoaded && !force) return;
    setEmergencyReportsLoading(true);
    try {
      const res = await patientAPI.getEmergencyReports();
      if (res?.success) {
        setEmergencyReports(Array.isArray(res.reports) ? res.reports : []);
      }
    } catch (err) {
      openAlert('error', 'تعذر تحميل السجل', err?.message || 'حدث خطأ في الاتصال بالخادم');
    } finally {
      setEmergencyReportsLoading(false);
      setEmergencyReportsLoaded(true);
    }
  }, [emergencyReportsLoaded, openAlert]);

  useEffect(() => {
    switch (activeSection) {
      case 'appointments':   loadAppointments(); break;
      case 'visits':         loadVisits(); break;
      case 'prescriptions':  loadPrescriptions(); break;
      case 'lab-results':    loadLabTests(); break;
      case 'notifications':  loadNotifications(); break;
      case 'reviews':        loadReviews(); break;
      case 'ai-assistant':   loadEmergencyReports(); break;
      default: break;
    }
  }, [
    activeSection,
    loadAppointments,
    loadVisits,
    loadPrescriptions,
    loadLabTests,
    loadNotifications,
    loadReviews,
    loadEmergencyReports,
  ]);


  // ════════════════════════════════════════════════════════════════════
  // Auth / navigation
  // ════════════════════════════════════════════════════════════════════

const handleLogout = useCallback(() => {
  openConfirm(
    'warning',
    'تسجيل الخروج',
    'هل أنت متأكد من رغبتك في تسجيل الخروج؟',
    () => {
    
      try {
        authAPI.logout();
      } catch {
        
      }
      localStorage.clear();
      sessionStorage.clear();

      window.location.replace('/');
    },
    'تسجيل الخروج'
  );
}, [openConfirm]);


  // ════════════════════════════════════════════════════════════════════
  // Derived display data
  // ════════════════════════════════════════════════════════════════════

  const identity = useMemo(() => {
    if (!profile) return null;
    return profile.person || profile.child || null;
  }, [profile]);

  const fullName = useMemo(() => buildFullName(identity), [identity]);
  const age = useMemo(() => formatAge(identity?.dateOfBirth), [identity]);
  const isMinor = !!profile?.isMinor;

  const medicalCardNumber = profile?.patient?.medicalCardNumber || null;
  const bloodType = profile?.patient?.bloodType || null;

  const profileInitial = useMemo(() => {
    const first = identity?.firstName || '';
    return first.charAt(0) || 'م';
  }, [identity]);

  const unreadNotificationsCount = overview?.unreadNotifications ?? 0;


  // ════════════════════════════════════════════════════════════════════
  // Sidebar
  // ════════════════════════════════════════════════════════════════════

  const renderSidebar = () => (
    <>
      <div
        className={`pd-sidebar-backdrop${sidebarOpen ? ' is-open' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <aside
        className={`pd-sidebar${sidebarOpen ? ' is-open' : ''}`}
        aria-label="القائمة الجانبية"
      >
        <button
          type="button"
          className="pd-sidebar-close"
          onClick={() => setSidebarOpen(false)}
          aria-label="إغلاق القائمة"
        >
          <X size={20} aria-hidden="true" />
        </button>

        <div className="pd-sidebar-brand">
          <div className="pd-sidebar-brand-logo" aria-hidden="true">
            <HeartPulse size={24} />
          </div>
          <div className="pd-sidebar-brand-text">
            <h2 className="pd-sidebar-brand-title">مريض 360°</h2>
            <p className="pd-sidebar-brand-subtitle">لوحة المريض</p>
          </div>
        </div>

        <div className="pd-sidebar-user">
          <div className="pd-sidebar-user-avatar" aria-hidden="true">
            {identity?.profilePhoto?.url ? (
              <img
                src={identity.profilePhoto.url}
                alt=""
                className="pd-sidebar-user-avatar-img"
              />
            ) : (
              <span>{profileInitial}</span>
            )}
          </div>
          <div className="pd-sidebar-user-info">
            {profileLoading ? (
              <span
                className="pd-sidebar-user-name-placeholder"
                aria-hidden="true"
              >
                …
              </span>
            ) : (
              <>
                <h3 className="pd-sidebar-user-name" dir="auto">
                  {fullName || 'مريض'}
                </h3>
                {medicalCardNumber && (
                  <p className="pd-sidebar-user-card" dir="ltr">
                    <CreditCard size={12} aria-hidden="true" />
                    <span>{medicalCardNumber}</span>
                  </p>
                )}
                {isMinor && (
                  <span className="pd-sidebar-user-badge pd-sidebar-user-badge--minor">
                    <Baby size={12} aria-hidden="true" />
                    <span>قاصر</span>
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        <nav className="pd-sidebar-nav" aria-label="أقسام اللوحة">
          {SIDEBAR_GROUPS.map((group) => (
            <div key={group.label} className="pd-sidebar-group">
              <div className="pd-sidebar-group-label">{group.label}</div>
              <ul className="pd-sidebar-group-items">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.key === activeSection;
                  const showUnreadBadge =
                    item.key === 'notifications' && unreadNotificationsCount > 0;

                  return (
                    <li key={item.key}>
                      <button
                        type="button"
                        className={`pd-sidebar-item${isActive ? ' is-active' : ''}`}
                        onClick={() => {
                          setActiveSection(item.key);
                          setSidebarOpen(false);
                        }}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <Icon
                          className="pd-sidebar-item-icon"
                          size={18}
                          aria-hidden="true"
                        />
                        <span className="pd-sidebar-item-label">{item.title}</span>
                        {showUnreadBadge && (
                          <span
                            className="pd-sidebar-item-badge"
                            aria-label={`${unreadNotificationsCount} غير مقروءة`}
                          >
                            {unreadNotificationsCount > 99
                              ? '99+'
                              : unreadNotificationsCount}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="pd-sidebar-footer">
          <button
            type="button"
            className="pd-sidebar-item pd-sidebar-item--danger"
            onClick={handleLogout}
          >
            <LogOut
              className="pd-sidebar-item-icon"
              size={18}
              aria-hidden="true"
            />
            <span className="pd-sidebar-item-label">تسجيل الخروج</span>
          </button>
        </div>
      </aside>
    </>
  );


  // ════════════════════════════════════════════════════════════════════
  // Page header
  // ════════════════════════════════════════════════════════════════════

  const renderPageHeader = () => {
    const meta = SECTION_META[activeSection] || SECTION_META.home;
    const SectionIcon = meta.icon;

    return (
      <header className="pd-page-header">
        <div className="pd-page-header-left">
          <button
            type="button"
            className="pd-mobile-menu-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="فتح القائمة"
          >
            <Menu size={22} aria-hidden="true" />
          </button>

          <div className="pd-page-header-icon" aria-hidden="true">
            <SectionIcon size={24} />
          </div>

          <div className="pd-page-header-title">
            <h1>{meta.title}</h1>
            <p>{meta.subtitle}</p>
          </div>
        </div>

        <div className="pd-page-header-right">
          <button
            type="button"
            className="pd-theme-toggle"
            onClick={toggleTheme}
            aria-label={isDark ? 'الوضع النهاري' : 'الوضع الليلي'}
            title={isDark ? 'الوضع النهاري' : 'الوضع الليلي'}
          >
            {isDark ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
          </button>
          <button
            type="button"
            className="pd-page-header-bell"
            onClick={() => setActiveSection('notifications')}
            aria-label={
              unreadNotificationsCount > 0
                ? `الإشعارات (${unreadNotificationsCount} غير مقروءة)`
                : 'الإشعارات'
            }
          >
            <Bell size={20} aria-hidden="true" />
            {unreadNotificationsCount > 0 && (
              <span className="pd-page-header-bell-badge" aria-hidden="true">
                {unreadNotificationsCount > 99
                  ? '99+'
                  : unreadNotificationsCount}
              </span>
            )}
          </button>
        </div>
      </header>
    );
  };


  // ════════════════════════════════════════════════════════════════════
  // Home section
  // ════════════════════════════════════════════════════════════════════

  const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'صباح الخير';
    return 'مساء الخير';
  };

  const renderHome = () => {
    const firstName = identity?.firstName || null;
    const greeting = getTimeGreeting();

    const ACTIVITY_TYPE_META = {
      appointment:  { icon: Calendar,     label: 'موعد'          },
      visit:        { icon: Stethoscope,  label: 'زيارة'          },
      prescription: { icon: Pill,         label: 'وصفة طبية'      },
      lab_test:     { icon: FlaskConical, label: 'تحليل مخبري'    },
      notification: { icon: Bell,         label: 'إشعار'          },
    };

    const kpiTiles = [
      { key: 'upcoming-appts', icon: Calendar,     value: overview?.upcomingAppointments ?? 0, label: 'مواعيد قادمة',       navigateTo: 'appointments',  variant: 'info'    },
      { key: 'active-rx',      icon: Pill,         value: overview?.activePrescriptions ?? 0,  label: 'وصفات نشطة',         navigateTo: 'prescriptions', variant: 'success' },
      { key: 'pending-labs',   icon: FlaskConical, value: overview?.pendingLabResults ?? 0,    label: 'نتائج مختبر بانتظار', navigateTo: 'lab-results',   variant: 'warning' },
      { key: 'unread-notifs',  icon: Bell,         value: overview?.unreadNotifications ?? 0,  label: 'إشعارات غير مقروءة',  navigateTo: 'notifications', variant: 'accent'  },
    ];

    const quickActions = [
      { key: 'book-appt', icon: Plus,     label: 'حجز موعد جديد', target: 'appointments'  },
      { key: 'view-rx',   icon: Pill,     label: 'عرض الوصفات',   target: 'prescriptions' },
      { key: 'ai-assist', icon: Sparkles, label: 'المساعد الذكي', target: 'ai-assistant'  },
      { key: 'profile',   icon: User,     label: 'ملفي الشخصي',    target: 'profile'       },
    ];

    const recentActivity = Array.isArray(overview?.recentActivity)
      ? overview.recentActivity
      : [];

    return (
      <div className="pd-home">
        <section className="pd-hero" aria-label="ترحيب">
          <div className="pd-hero-text">
            {profileLoading ? (
              <span className="pd-hero-title-placeholder" aria-hidden="true">
                …
              </span>
            ) : (
              <h2 className="pd-hero-title" dir="auto">
                {greeting}
                {firstName && (
                  <>
                    ،{' '}
                    <span className="pd-hero-name" dir="auto">
                      {firstName}
                    </span>
                  </>
                )}
              </h2>
            )}
            <p className="pd-hero-subtitle">
              نتمنى لك يوماً صحياً. يمكنك متابعة مواعيدك ووصفاتك ونتائج الفحوصات من هنا.
            </p>
          </div>
          <div className="pd-hero-icon" aria-hidden="true">
            <HeartPulse size={48} />
          </div>
        </section>

        <section className="pd-kpi-grid" aria-label="مؤشرات سريعة">
          {kpiTiles.map(({ key, icon: Icon, value, label, navigateTo, variant }) => (
            <button
              key={key}
              type="button"
              className={`pd-kpi-tile pd-kpi-tile--${variant}`}
              onClick={() => setActiveSection(navigateTo)}
              aria-label={`${label}: ${value}`}
            >
              <div className="pd-kpi-tile-icon" aria-hidden="true">
                <Icon size={22} />
              </div>
              <div className="pd-kpi-tile-value">
                {overviewLoading ? '…' : value}
              </div>
              <div className="pd-kpi-tile-label">{label}</div>
            </button>
          ))}
        </section>

        <section className="pd-home-split">
          <div className="pd-card">
            <div className="pd-card-header">
              <h3 className="pd-card-title">
                <Clock size={18} aria-hidden="true" />
                <span>النشاط الأخير</span>
              </h3>
            </div>
            <div className="pd-card-body">
              {overviewLoading ? (
                <div className="pd-activity-loading" aria-busy="true">
                  <LoadingSpinner message="جاري التحميل..." />
                </div>
              ) : recentActivity.length === 0 ? (
                <EmptyState
                  icon={Clock}
                  title="لا يوجد نشاط حديث"
                  subtitle="سيظهر هنا آخر نشاطاتك الطبية."
                />
              ) : (
                <ol className="pd-activity-list">
                  {recentActivity.map((activity) => {
                    const meta =
                      ACTIVITY_TYPE_META[activity.type] ||
                      ACTIVITY_TYPE_META.notification;
                    const ItemIcon = meta.icon;
                    return (
                      <li key={activity._id} className="pd-activity-item">
                        <div
                          className={`pd-activity-item-icon pd-activity-item-icon--${activity.type || 'notification'}`}
                          aria-hidden="true"
                        >
                          <ItemIcon size={16} />
                        </div>
                        <div className="pd-activity-item-body">
                          <span className="pd-activity-item-type">
                            {meta.label}
                          </span>
                          <p className="pd-activity-item-title" dir="auto">
                            {activity.title || '—'}
                          </p>
                          {activity.subtitle && (
                            <p className="pd-activity-item-subtitle" dir="auto">
                              {activity.subtitle}
                            </p>
                          )}
                        </div>
                        <div className="pd-activity-item-time" dir="ltr">
                          <time dateTime={activity.occurredAt}>
                            {formatDateTime(activity.occurredAt)}
                          </time>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>

          <div className="pd-card">
            <div className="pd-card-header">
              <h3 className="pd-card-title">
                <Sparkles size={18} aria-hidden="true" />
                <span>إجراءات سريعة</span>
              </h3>
            </div>
            <div className="pd-card-body">
              <div className="pd-quick-actions">
                {quickActions.map(({ key, icon: Icon, label, target }) => (
                  <button
                    key={key}
                    type="button"
                    className="pd-quick-action"
                    onClick={() => setActiveSection(target)}
                  >
                    <Icon
                      className="pd-quick-action-icon"
                      size={22}
                      aria-hidden="true"
                    />
                    <span className="pd-quick-action-label">{label}</span>
                    <ChevronLeft
                      className="pd-quick-action-arrow"
                      size={16}
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  };


  // ════════════════════════════════════════════════════════════════════
  // Appointments section
  // ════════════════════════════════════════════════════════════════════

  const APPOINTMENT_STATUS_GROUPS = {
    upcoming:  ['scheduled', 'confirmed', 'checked_in', 'in_progress'],
    past:      ['completed'],
    cancelled: ['cancelled', 'no_show', 'rescheduled'],
  };

  // Maps backend enum → Arabic label. The old version showed raw
  // English enums in the status badge (visible bug in screenshot #1).
  const APPOINTMENT_STATUS_LABELS = {
    scheduled:    'مجدول',
    confirmed:    'مؤكد',
    checked_in:   'تم الحضور',
    in_progress:  'جارٍ',
    completed:    'مكتمل',
    cancelled:    'ملغى',
    no_show:      'لم يحضر',
    rescheduled:  'أُعيد جدولته',
  };

  // Maps appointment status → status-badge color variant (pdmr-status--*)
  const APPOINTMENT_STATUS_VARIANTS = {
    scheduled:    'info',
    confirmed:    'success',
    checked_in:   'info',
    in_progress:  'warning',
    completed:    'success',
    cancelled:    'danger',
    no_show:      'danger',
    rescheduled:  'muted',
  };

  const APPOINTMENT_TABS = [
    { key: 'upcoming',  label: 'القادمة' },
    { key: 'past',      label: 'السابقة' },
    { key: 'cancelled', label: 'الملغاة' },
  ];

  const APPOINTMENT_PERIODS = [
    { key: 'all',     label: 'كل الفترات' },
    { key: 'week',    label: 'آخر أسبوع' },
    { key: 'month',   label: 'آخر شهر' },
    { key: '3months', label: 'آخر 3 أشهر' },
    { key: 'year',    label: 'آخر سنة' },
  ];

  const renderAppointments = () => {
    // 1) Apply tab (status group) filter first.
    const inTab = appointments.filter((appt) =>
      APPOINTMENT_STATUS_GROUPS[appointmentTab]?.includes(appt.status)
    );

    // 2) Per-tab counts (rendered as small badges on each tab).
    const tabCounts = {
      upcoming:  appointments.filter((a) => APPOINTMENT_STATUS_GROUPS.upcoming.includes(a.status)).length,
      past:      appointments.filter((a) => APPOINTMENT_STATUS_GROUPS.past.includes(a.status)).length,
      cancelled: appointments.filter((a) => APPOINTMENT_STATUS_GROUPS.cancelled.includes(a.status)).length,
    };

    // 3) Then apply search + period + sort.
    const filtered = filterAndSortItems({
      items:        inTab,
      search:       apptSearch,
      searchFields: ['reasonForVisit', 'doctorName', 'doctor.firstName', 'doctor.lastName', 'doctor.specialization'],
      period:       apptPeriod,
      dateField:    'appointmentDate',
      sortOrder:    apptSort,
    });

    // 4) Group by date bucket for the list view header dividers.
    const grouped = groupByDate(filtered, 'appointmentDate');

    // 5) Active-filter chips ("Period: آخر شهر  ×") — show only when not default.
    const activeFilters = [];
    if (apptSearch.trim())            activeFilters.push({ key: 'search', label: `بحث: ${apptSearch.trim()}`, clear: () => setApptSearch('') });
    if (apptPeriod !== 'all')         activeFilters.push({ key: 'period', label: APPOINTMENT_PERIODS.find((p) => p.key === apptPeriod)?.label || apptPeriod, clear: () => setApptPeriod('all') });
    if (apptSort !== 'newest')        activeFilters.push({ key: 'sort',   label: 'الأقدم أولاً', clear: () => setApptSort('newest') });
    const clearAllFilters = () => { setApptSearch(''); setApptPeriod('all'); setApptSort('newest'); };

    // 6) Booking + cancellation handlers (unchanged from the original).
    const openBookingFlow = () => {
      openCustomModal('حجز موعد جديد', (
        <AppointmentBookingFlow
          openAlert={openAlert}
          onClose={closeModal}
          onSuccess={() => {
            closeModal();
            openAlert('success', 'تم الحجز بنجاح', 'سيصلك إشعار للتأكيد قريباً.');
            loadAppointments(true);
          }}
        />
      ), 'lg');
    };

    const openCancelFlow = (appointment) => {
      const submit = async (payload) => {
        try {
          const res = await patientAPI.cancelAppointment(appointment._id, payload);
          if (res?.success) {
            closeModal();
            openAlert('success', 'تم إلغاء الموعد', 'تم تحديث حالة الموعد بنجاح.');
            loadAppointments(true);
          } else {
            openAlert('error', 'تعذر الإلغاء', res?.message || 'حدث خطأ');
          }
        } catch (err) {
          openAlert('error', 'تعذر الإلغاء', err?.message || 'حدث خطأ في الاتصال');
        }
      };

      openCustomModal('إلغاء الموعد', (
        <AppointmentCancelForm
          appointment={appointment}
          onCancel={closeModal}
          onConfirm={submit}
          submitting={false}
        />
      ));
    };

    // 7) Open the detail page — pass the appointment via location.state
    //    so it renders instantly without an extra round-trip.
    const openDetail = (appt) => {
      navigate(`/patient-dashboard/appointments/${appt._id}`, { state: { appointment: appt } });
    };

    // 8) Single-card renderer. Used in both list and card views; the
    //    parent container's layout class (.pdmr-list / .pdmr-grid)
    //    controls grid vs vertical stack.
    const renderAppointmentCard = (appt) => {
      const isUpcoming = APPOINTMENT_STATUS_GROUPS.upcoming.includes(appt.status);
      const statusLabel  = APPOINTMENT_STATUS_LABELS[appt.status]   || appt.status;
      const statusVariant = APPOINTMENT_STATUS_VARIANTS[appt.status] || 'muted';
      const priorityLabel = appt.priority === 'emergency' ? 'طارئ' : appt.priority === 'urgent' ? 'عاجل' : null;

      return (
        <li key={appt._id} className="pdmr-card">
          <button
            type="button"
            className="pdmr-card-head"
            onClick={() => openDetail(appt)}
            aria-label={`عرض تفاصيل: ${appt.reasonForVisit || 'موعد طبي'}`}
          >
            <div className="pdmr-card-icon" aria-hidden="true">
              <Calendar size={20} />
            </div>

            <div className="pdmr-card-body">
              <div className="pdmr-card-title-row">
                <h3 className="pdmr-card-title" dir="auto">
                  {appt.reasonForVisit || 'موعد طبي'}
                </h3>
                <span className={`pdmr-status pdmr-status--${statusVariant}`}>
                  {statusLabel}
                </span>
              </div>

              <div className="pdmr-card-meta">
                <span className="pdmr-card-meta-item" dir="ltr">
                  <Calendar size={13} aria-hidden="true" />
                  <time dateTime={appt.appointmentDate}>{formatDate(appt.appointmentDate)}</time>
                </span>
                {appt.appointmentTime && (
                  <span className="pdmr-card-meta-item" dir="ltr">
                    <Clock size={13} aria-hidden="true" />
                    <span>{appt.appointmentTime}</span>
                  </span>
                )}
                {priorityLabel && (
                  <span className={`pdmr-priority pdmr-priority--${appt.priority}`}>
                    <AlertTriangle size={11} aria-hidden="true" />
                    <span>{priorityLabel}</span>
                  </span>
                )}
              </div>
            </div>

            <ChevronLeft className="pdmr-card-chevron" size={18} aria-hidden="true" />
          </button>

          {isUpcoming && (
            <div className="pdmr-card-actions">
              <button
                type="button"
                className="pdmr-action pdmr-action--danger"
                onClick={(e) => { e.stopPropagation(); openCancelFlow(appt); }}
              >
                <XCircle size={14} aria-hidden="true" />
                <span>إلغاء الموعد</span>
              </button>
            </div>
          )}
        </li>
      );
    };

    return (
      <div className="pd-appointments pdmr-section">

        {/* ── Universal toolbar — search + view + filters + sort ───── */}
        <div className="pdmr-toolbar" role="toolbar" aria-label="أدوات تصفية المواعيد">
          {/* Row 1: Search + view-toggle + sort + new-appointment CTA */}
          <div className="pdmr-toolbar-main">
            <div className="pdmr-search">
              <Search size={16} aria-hidden="true" className="pdmr-search-icon" />
              <input
                type="search"
                className="pdmr-search-input"
                placeholder="ابحث في المواعيد..."
                value={apptSearch}
                onChange={(e) => setApptSearch(e.target.value)}
                dir="auto"
                aria-label="بحث"
              />
              {apptSearch && (
                <button
                  type="button"
                  className="pdmr-search-clear"
                  onClick={() => setApptSearch('')}
                  aria-label="مسح البحث"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="pdmr-view-toggle" role="group" aria-label="طريقة العرض">
              <button
                type="button"
                className={`pdmr-view-btn${apptView === 'list' ? ' is-active' : ''}`}
                onClick={() => setApptView('list')}
                aria-pressed={apptView === 'list'}
                title="عرض قائمة"
              >
                <Menu size={15} aria-hidden="true" />
                <span>قائمة</span>
              </button>
              <button
                type="button"
                className={`pdmr-view-btn${apptView === 'cards' ? ' is-active' : ''}`}
                onClick={() => setApptView('cards')}
                aria-pressed={apptView === 'cards'}
                title="عرض بطاقات"
              >
                <FileText size={15} aria-hidden="true" />
                <span>بطاقات</span>
              </button>
            </div>

            <select
              className="pdmr-sort"
              value={apptSort}
              onChange={(e) => setApptSort(e.target.value)}
              aria-label="ترتيب"
            >
              <option value="newest">الأحدث أولاً</option>
              <option value="oldest">الأقدم أولاً</option>
            </select>

            <button type="button" className="pd-btn pd-btn--primary pdmr-cta" onClick={openBookingFlow}>
              <Plus size={16} aria-hidden="true" />
              <span>حجز موعد جديد</span>
            </button>
          </div>

          {/* Row 2: Status tabs (counts) */}
          <div className="pdmr-chips" role="tablist" aria-label="حالة الموعد">
            {APPOINTMENT_TABS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={appointmentTab === key}
                className={`pdmr-chip${appointmentTab === key ? ' is-active' : ''}`}
                onClick={() => setAppointmentTab(key)}
              >
                <span>{label}</span>
                <span className="pdmr-chip-count" aria-label={`${tabCounts[key]} موعد`}>
                  {tabCounts[key]}
                </span>
              </button>
            ))}
          </div>

          {/* Row 3: Period filter */}
          <div className="pdmr-chips pdmr-chips--secondary" role="group" aria-label="الفترة الزمنية">
            {APPOINTMENT_PERIODS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={`pdmr-chip pdmr-chip--ghost${apptPeriod === key ? ' is-active' : ''}`}
                onClick={() => setApptPeriod(key)}
                aria-pressed={apptPeriod === key}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Row 4: Active filters (only when non-default) */}
          {activeFilters.length > 0 && (
            <div className="pdmr-active-filters" aria-label="الفلاتر المُفعّلة">
              <span className="pdmr-active-filters-label">
                <Filter size={13} aria-hidden="true" />
                <span>الفلاتر:</span>
              </span>
              {activeFilters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className="pdmr-active-filter"
                  onClick={f.clear}
                  aria-label={`إزالة فلتر: ${f.label}`}
                >
                  <span>{f.label}</span>
                  <X size={12} aria-hidden="true" />
                </button>
              ))}
              <button
                type="button"
                className="pdmr-clear-all"
                onClick={clearAllFilters}
              >
                مسح الكل
              </button>
            </div>
          )}
        </div>

        {/* ── Content — loading / empty / grouped list / card grid ── */}
        {appointmentsLoading ? (
          <div className="pd-section-loading">
            <LoadingSpinner message="جاري تحميل المواعيد..." />
          </div>
        ) : filtered.length === 0 ? (
          inTab.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="لا توجد مواعيد"
              subtitle={
                appointmentTab === 'upcoming'
                  ? 'احجز موعدك الأول من الزر أعلاه.'
                  : 'ستظهر هنا عند توفرها.'
              }
              cta={appointmentTab === 'upcoming' ? { label: 'حجز موعد', onClick: openBookingFlow } : undefined}
            />
          ) : (
            <EmptyState
              icon={Search}
              title="لا نتائج مطابقة"
              subtitle="جرّب تغيير الفلاتر أو مصطلح البحث."
              cta={{ label: 'مسح الفلاتر', onClick: clearAllFilters }}
            />
          )
        ) : apptView === 'list' ? (
          // ── List view: grouped by smart date buckets ─────────────
          <div className="pdmr-groups">
            {grouped.map((group) => (
              <section key={group.key} className="pdmr-group">
                <h3 className="pdmr-group-header">
                  <Calendar size={14} aria-hidden="true" />
                  <span>{DATE_GROUP_LABELS[group.key]}</span>
                  <span className="pdmr-group-count">{group.items.length}</span>
                </h3>
                <ul className="pdmr-list">
                  {group.items.map(renderAppointmentCard)}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          // ── Cards view: simple grid, no grouping ────────────────
          <ul className="pdmr-grid">
            {filtered.map(renderAppointmentCard)}
          </ul>
        )}
      </div>
    );
  };


  // ════════════════════════════════════════════════════════════════════
  // Visits section
  // ════════════════════════════════════════════════════════════════════

  const VISIT_TYPE_LABELS = {
    regular:      'زيارة اعتيادية',
    follow_up:    'متابعة',
    emergency:    'طارئة',
    consultation: 'استشارة',
    dental:       'طب الأسنان',
    lab_only:     'فحوصات فقط',
  };

  const VISIT_STATUS_LABELS = {
    in_progress: 'جارية',
    completed:   'مكتملة',
    cancelled:   'ملغاة',
  };

  const VISIT_STATUS_VARIANTS = {
    in_progress: 'warning',
    completed:   'success',
    cancelled:   'danger',
  };

  // Visits tab groups — same shape as appointments. 'all' shows everything.
  const VISIT_STATUS_GROUPS = {
    all:         ['in_progress', 'completed', 'cancelled'],
    in_progress: ['in_progress'],
    completed:   ['completed'],
    cancelled:   ['cancelled'],
  };

  const VISIT_TABS = [
    { key: 'all',         label: 'الكل' },
    { key: 'in_progress', label: 'جارية' },
    { key: 'completed',   label: 'مكتملة' },
    { key: 'cancelled',   label: 'ملغاة' },
  ];

  const VISIT_PERIODS = [
    { key: 'all',     label: 'كل الفترات' },
    { key: 'week',    label: 'آخر أسبوع' },
    { key: 'month',   label: 'آخر شهر' },
    { key: '3months', label: 'آخر 3 أشهر' },
    { key: 'year',    label: 'آخر سنة' },
  ];

  const renderVisits = () => {
    // 1) Tab filter
    const inTab = visits.filter((v) =>
      VISIT_STATUS_GROUPS[visitTab]?.includes(v.status)
    );

    // 2) Per-tab counts
    const tabCounts = {
      all:         visits.length,
      in_progress: visits.filter((v) => v.status === 'in_progress').length,
      completed:   visits.filter((v) => v.status === 'completed').length,
      cancelled:   visits.filter((v) => v.status === 'cancelled').length,
    };

    // 3) Search + period + sort
    const filtered = filterAndSortItems({
      items:        inTab,
      search:       visitSearch,
      searchFields: ['chiefComplaint', 'diagnosis', 'doctorName', 'doctor.firstName', 'doctor.lastName', 'doctor.specialization'],
      period:       visitPeriod,
      dateField:    'visitDate',
      sortOrder:    visitSort,
    });

    // 4) Group by date for list view
    const grouped = groupByDate(filtered, 'visitDate');

    // 5) Active filter chips
    const activeFilters = [];
    if (visitSearch.trim())     activeFilters.push({ key: 'search', label: `بحث: ${visitSearch.trim()}`, clear: () => setVisitSearch('') });
    if (visitPeriod !== 'all')  activeFilters.push({ key: 'period', label: VISIT_PERIODS.find((p) => p.key === visitPeriod)?.label || visitPeriod, clear: () => setVisitPeriod('all') });
    if (visitSort !== 'newest') activeFilters.push({ key: 'sort',   label: 'الأقدم أولاً', clear: () => setVisitSort('newest') });
    const clearAllFilters = () => { setVisitSearch(''); setVisitPeriod('all'); setVisitSort('newest'); };

    // 6) Navigation to detail page — pass visit in state for fast render
    const openDetail = (visit) => {
      navigate(`/patient-dashboard/visits/${visit._id}`, { state: { visit } });
    };

    // 7) Single-card renderer (shared between list + cards views)
    const renderVisitCard = (visit) => {
      const typeLabel    = VISIT_TYPE_LABELS[visit.visitType] || 'زيارة';
      const statusLabel  = VISIT_STATUS_LABELS[visit.status]  || visit.status;
      const statusVariant = VISIT_STATUS_VARIANTS[visit.status] || 'muted';

      // Tiny doctor-name display — uses the same graceful fallback chain
      // as the appointment card.
      const doctorName =
        (visit.doctor && [visit.doctor.firstName, visit.doctor.lastName].filter(Boolean).join(' '))
        || visit.doctorName
        || null;

      return (
        <li key={visit._id} className="pdmr-card">
          <button
            type="button"
            className="pdmr-card-head"
            onClick={() => openDetail(visit)}
            aria-label={`عرض تفاصيل: ${visit.chiefComplaint || typeLabel}`}
          >
            <div className="pdmr-card-icon" aria-hidden="true">
              <Stethoscope size={20} />
            </div>

            <div className="pdmr-card-body">
              <div className="pdmr-card-title-row">
                <h3 className="pdmr-card-title" dir="auto">
                  {visit.chiefComplaint || typeLabel}
                </h3>
                <span className={`pdmr-status pdmr-status--${statusVariant}`}>
                  {statusLabel}
                </span>
              </div>

              <div className="pdmr-card-meta">
                <span className="pdmr-card-meta-item" dir="ltr">
                  <Calendar size={13} aria-hidden="true" />
                  <time dateTime={visit.visitDate}>{formatDate(visit.visitDate)}</time>
                </span>
                <span className="pdmr-card-meta-item">
                  <Activity size={13} aria-hidden="true" />
                  <span>{typeLabel}</span>
                </span>
                {doctorName && (
                  <span className="pdmr-card-meta-item" dir="auto">
                    <Stethoscope size={13} aria-hidden="true" />
                    <span>{doctorName}</span>
                  </span>
                )}
              </div>
            </div>

            <ChevronLeft className="pdmr-card-chevron" size={18} aria-hidden="true" />
          </button>
        </li>
      );
    };

    return (
      <div className="pd-visits pdmr-section">

        {/* ── Universal toolbar — search + view + tabs + period ───── */}
        <div className="pdmr-toolbar" role="toolbar" aria-label="أدوات تصفية الزيارات">
          {/* Row 1: Search + view-toggle + sort */}
          <div className="pdmr-toolbar-main">
            <div className="pdmr-search">
              <Search size={16} aria-hidden="true" className="pdmr-search-icon" />
              <input
                type="search"
                className="pdmr-search-input"
                placeholder="ابحث في الزيارات (تشخيص، طبيب، شكوى)..."
                value={visitSearch}
                onChange={(e) => setVisitSearch(e.target.value)}
                dir="auto"
                aria-label="بحث"
              />
              {visitSearch && (
                <button
                  type="button"
                  className="pdmr-search-clear"
                  onClick={() => setVisitSearch('')}
                  aria-label="مسح البحث"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="pdmr-view-toggle" role="group" aria-label="طريقة العرض">
              <button
                type="button"
                className={`pdmr-view-btn${visitView === 'list' ? ' is-active' : ''}`}
                onClick={() => setVisitView('list')}
                aria-pressed={visitView === 'list'}
                title="عرض قائمة"
              >
                <Menu size={15} aria-hidden="true" />
                <span>قائمة</span>
              </button>
              <button
                type="button"
                className={`pdmr-view-btn${visitView === 'cards' ? ' is-active' : ''}`}
                onClick={() => setVisitView('cards')}
                aria-pressed={visitView === 'cards'}
                title="عرض بطاقات"
              >
                <FileText size={15} aria-hidden="true" />
                <span>بطاقات</span>
              </button>
            </div>

            <select
              className="pdmr-sort"
              value={visitSort}
              onChange={(e) => setVisitSort(e.target.value)}
              aria-label="ترتيب"
            >
              <option value="newest">الأحدث أولاً</option>
              <option value="oldest">الأقدم أولاً</option>
            </select>
          </div>

          {/* Row 2: Status tabs */}
          <div className="pdmr-chips" role="tablist" aria-label="حالة الزيارة">
            {VISIT_TABS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={visitTab === key}
                className={`pdmr-chip${visitTab === key ? ' is-active' : ''}`}
                onClick={() => setVisitTab(key)}
              >
                <span>{label}</span>
                <span className="pdmr-chip-count" aria-label={`${tabCounts[key]} زيارة`}>
                  {tabCounts[key]}
                </span>
              </button>
            ))}
          </div>

          {/* Row 3: Period filter */}
          <div className="pdmr-chips pdmr-chips--secondary" role="group" aria-label="الفترة الزمنية">
            {VISIT_PERIODS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={`pdmr-chip pdmr-chip--ghost${visitPeriod === key ? ' is-active' : ''}`}
                onClick={() => setVisitPeriod(key)}
                aria-pressed={visitPeriod === key}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Row 4: Active filters */}
          {activeFilters.length > 0 && (
            <div className="pdmr-active-filters" aria-label="الفلاتر المُفعّلة">
              <span className="pdmr-active-filters-label">
                <Filter size={13} aria-hidden="true" />
                <span>الفلاتر:</span>
              </span>
              {activeFilters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className="pdmr-active-filter"
                  onClick={f.clear}
                  aria-label={`إزالة فلتر: ${f.label}`}
                >
                  <span>{f.label}</span>
                  <X size={12} aria-hidden="true" />
                </button>
              ))}
              <button
                type="button"
                className="pdmr-clear-all"
                onClick={clearAllFilters}
              >
                مسح الكل
              </button>
            </div>
          )}
        </div>

        {/* ── Content ──────────────────────────────────────────────── */}
        {visitsLoading ? (
          <div className="pd-section-loading">
            <LoadingSpinner message="جاري تحميل الزيارات..." />
          </div>
        ) : filtered.length === 0 ? (
          inTab.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="لا توجد زيارات مسجلة"
              subtitle="ستظهر هنا زياراتك الطبية بعد تسجيلها من قبل الطبيب."
            />
          ) : (
            <EmptyState
              icon={Search}
              title="لا نتائج مطابقة"
              subtitle="جرّب تغيير الفلاتر أو مصطلح البحث."
              cta={{ label: 'مسح الفلاتر', onClick: clearAllFilters }}
            />
          )
        ) : visitView === 'list' ? (
          <div className="pdmr-groups">
            {grouped.map((group) => (
              <section key={group.key} className="pdmr-group">
                <h3 className="pdmr-group-header">
                  <Calendar size={14} aria-hidden="true" />
                  <span>{DATE_GROUP_LABELS[group.key]}</span>
                  <span className="pdmr-group-count">{group.items.length}</span>
                </h3>
                <ul className="pdmr-list">
                  {group.items.map(renderVisitCard)}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <ul className="pdmr-grid">
            {filtered.map(renderVisitCard)}
          </ul>
        )}
      </div>
    );
  };


  // ════════════════════════════════════════════════════════════════════
  // Prescriptions section
  // ════════════════════════════════════════════════════════════════════

  const PRESCRIPTION_STATUS_GROUPS = {
    all:       ['active', 'partially_dispensed', 'dispensed', 'expired', 'cancelled'],
    active:    ['active', 'partially_dispensed'],
    dispensed: ['dispensed'],
    expired:   ['expired', 'cancelled'],
  };

  const PRESCRIPTION_STATUS_LABELS = {
    active:               'نشطة',
    dispensed:            'تم الصرف',
    partially_dispensed:  'صرف جزئي',
    expired:              'منتهية',
    cancelled:            'ملغاة',
  };

  // Map status → pdmr-status color variant
  const PRESCRIPTION_STATUS_VARIANTS = {
    active:               'info',
    partially_dispensed:  'warning',
    dispensed:            'success',
    expired:              'muted',
    cancelled:            'danger',
  };

  const PRESCRIPTION_TABS = [
    { key: 'all',       label: 'الكل' },
    { key: 'active',    label: 'النشطة' },
    { key: 'dispensed', label: 'تم صرفها' },
    { key: 'expired',   label: 'منتهية/ملغاة' },
  ];

  const PRESCRIPTION_PERIODS = [
    { key: 'all',     label: 'كل الفترات' },
    { key: 'week',    label: 'آخر أسبوع' },
    { key: 'month',   label: 'آخر شهر' },
    { key: '3months', label: 'آخر 3 أشهر' },
    { key: 'year',    label: 'آخر سنة' },
  ];

  const renderPrescriptions = () => {
    // 1) Tab filter
    const inTab = prescriptions.filter((rx) =>
      PRESCRIPTION_STATUS_GROUPS[prescriptionTab]?.includes(rx.status)
    );

    // 2) Per-tab counts
    const tabCounts = {
      all:       prescriptions.length,
      active:    prescriptions.filter((rx) => PRESCRIPTION_STATUS_GROUPS.active.includes(rx.status)).length,
      dispensed: prescriptions.filter((rx) => PRESCRIPTION_STATUS_GROUPS.dispensed.includes(rx.status)).length,
      expired:   prescriptions.filter((rx) => PRESCRIPTION_STATUS_GROUPS.expired.includes(rx.status)).length,
    };

    // 3) Search + period + sort
    const filtered = filterAndSortItems({
      items:        inTab,
      search:       prescriptionSearch,
      searchFields: ['prescriptionNumber', 'prescriptionNotes', 'doctorName',
                     'doctor.firstName', 'doctor.lastName',
                     // Medications array: synthetic searchable string via flatMap fallback
                     ],
      period:       prescriptionPeriod,
      dateField:    'prescriptionDate',
      sortOrder:    prescriptionSort,
    });

    // 3b) Extra search against medication names (since they're inside an
    //     array and filterAndSortItems only reads simple property paths).
    const q = prescriptionSearch.trim().toLowerCase();
    const finalFiltered = q
      ? filtered.filter((rx) => {
          // First pass already accepted the rx via top-level fields? Keep.
          const topLevelHit = ['prescriptionNumber', 'prescriptionNotes',
                               rx.doctorName, rx.doctor?.firstName, rx.doctor?.lastName]
            .some((v) => v && String(v).toLowerCase().includes(q));
          if (topLevelHit) return true;
          // Otherwise scan medication names.
          if (!Array.isArray(rx.medications)) return false;
          return rx.medications.some((m) => {
            const name = (m.medicationName || '') + ' ' + (m.arabicName || '');
            return name.toLowerCase().includes(q);
          });
        })
      : filtered;

    // 4) Group by date for list view
    const grouped = groupByDate(finalFiltered, 'prescriptionDate');

    // 5) Active filter chips
    const activeFilters = [];
    if (prescriptionSearch.trim())     activeFilters.push({ key: 'search', label: `بحث: ${prescriptionSearch.trim()}`, clear: () => setPrescriptionSearch('') });
    if (prescriptionPeriod !== 'all')  activeFilters.push({ key: 'period', label: PRESCRIPTION_PERIODS.find((p) => p.key === prescriptionPeriod)?.label || prescriptionPeriod, clear: () => setPrescriptionPeriod('all') });
    if (prescriptionSort !== 'newest') activeFilters.push({ key: 'sort',   label: 'الأقدم أولاً', clear: () => setPrescriptionSort('newest') });
    const clearAllFilters = () => { setPrescriptionSearch(''); setPrescriptionPeriod('all'); setPrescriptionSort('newest'); };

    // 6) Navigation to detail page
    const openDetail = (rx) => {
      navigate(`/patient-dashboard/prescriptions/${rx._id}`, { state: { prescription: rx } });
    };

    // 7) Single-card renderer
    const renderPrescriptionCard = (rx) => {
      const statusLabel   = PRESCRIPTION_STATUS_LABELS[rx.status]   || rx.status;
      const statusVariant = PRESCRIPTION_STATUS_VARIANTS[rx.status] || 'muted';
      const meds = Array.isArray(rx.medications) ? rx.medications : [];
      const dispensedCount = meds.filter((m) => m.isDispensed).length;

      // Compact medication summary — first 3 names, joined by Arabic comma.
      const medSummary = meds.length > 0
        ? meds.slice(0, 3).map((m) => m.arabicName || m.medicationName).filter(Boolean).join('، ')
          + (meds.length > 3 ? `، +${meds.length - 3}` : '')
        : null;

      return (
        <li key={rx._id} className="pdmr-card">
          <button
            type="button"
            className="pdmr-card-head"
            onClick={() => openDetail(rx)}
            aria-label={`عرض تفاصيل الوصفة: ${rx.prescriptionNumber}`}
          >
            <div className="pdmr-card-icon" aria-hidden="true">
              <Pill size={20} />
            </div>

            <div className="pdmr-card-body">
              <div className="pdmr-card-title-row">
                <h3 className="pdmr-card-title" dir="ltr">
                  {rx.prescriptionNumber || 'وصفة طبية'}
                </h3>
                <span className={`pdmr-status pdmr-status--${statusVariant}`}>
                  {statusLabel}
                </span>
              </div>

              {medSummary && (
                <p className="pdmr-card-summary" dir="auto">
                  {medSummary}
                </p>
              )}

              <div className="pdmr-card-meta">
                <span className="pdmr-card-meta-item" dir="ltr">
                  <Calendar size={13} aria-hidden="true" />
                  <time dateTime={rx.prescriptionDate}>{formatDate(rx.prescriptionDate)}</time>
                </span>
                <span className="pdmr-card-meta-item">
                  <Pill size={13} aria-hidden="true" />
                  <span>
                    {meds.length} دواء
                    {dispensedCount > 0 && dispensedCount < meds.length && ` · ${dispensedCount} مصروف`}
                  </span>
                </span>
              </div>
            </div>

            <ChevronLeft className="pdmr-card-chevron" size={18} aria-hidden="true" />
          </button>
        </li>
      );
    };

    return (
      <div className="pd-prescriptions pdmr-section">

        {/* ── Universal toolbar ────────────────────────────────────── */}
        <div className="pdmr-toolbar" role="toolbar" aria-label="أدوات تصفية الوصفات">
          {/* Row 1: Search + view-toggle + sort */}
          <div className="pdmr-toolbar-main">
            <div className="pdmr-search">
              <Search size={16} aria-hidden="true" className="pdmr-search-icon" />
              <input
                type="search"
                className="pdmr-search-input"
                placeholder="ابحث في الوصفات (رقم، دواء، طبيب)..."
                value={prescriptionSearch}
                onChange={(e) => setPrescriptionSearch(e.target.value)}
                dir="auto"
                aria-label="بحث"
              />
              {prescriptionSearch && (
                <button
                  type="button"
                  className="pdmr-search-clear"
                  onClick={() => setPrescriptionSearch('')}
                  aria-label="مسح البحث"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="pdmr-view-toggle" role="group" aria-label="طريقة العرض">
              <button
                type="button"
                className={`pdmr-view-btn${prescriptionView === 'list' ? ' is-active' : ''}`}
                onClick={() => setPrescriptionView('list')}
                aria-pressed={prescriptionView === 'list'}
                title="عرض قائمة"
              >
                <Menu size={15} aria-hidden="true" />
                <span>قائمة</span>
              </button>
              <button
                type="button"
                className={`pdmr-view-btn${prescriptionView === 'cards' ? ' is-active' : ''}`}
                onClick={() => setPrescriptionView('cards')}
                aria-pressed={prescriptionView === 'cards'}
                title="عرض بطاقات"
              >
                <FileText size={15} aria-hidden="true" />
                <span>بطاقات</span>
              </button>
            </div>

            <select
              className="pdmr-sort"
              value={prescriptionSort}
              onChange={(e) => setPrescriptionSort(e.target.value)}
              aria-label="ترتيب"
            >
              <option value="newest">الأحدث أولاً</option>
              <option value="oldest">الأقدم أولاً</option>
            </select>
          </div>

          {/* Row 2: Status tabs */}
          <div className="pdmr-chips" role="tablist" aria-label="حالة الوصفة">
            {PRESCRIPTION_TABS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={prescriptionTab === key}
                className={`pdmr-chip${prescriptionTab === key ? ' is-active' : ''}`}
                onClick={() => setPrescriptionTab(key)}
              >
                <span>{label}</span>
                <span className="pdmr-chip-count" aria-label={`${tabCounts[key]} وصفة`}>
                  {tabCounts[key]}
                </span>
              </button>
            ))}
          </div>

          {/* Row 3: Period filter */}
          <div className="pdmr-chips pdmr-chips--secondary" role="group" aria-label="الفترة الزمنية">
            {PRESCRIPTION_PERIODS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={`pdmr-chip pdmr-chip--ghost${prescriptionPeriod === key ? ' is-active' : ''}`}
                onClick={() => setPrescriptionPeriod(key)}
                aria-pressed={prescriptionPeriod === key}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Row 4: Active filters */}
          {activeFilters.length > 0 && (
            <div className="pdmr-active-filters" aria-label="الفلاتر المُفعّلة">
              <span className="pdmr-active-filters-label">
                <Filter size={13} aria-hidden="true" />
                <span>الفلاتر:</span>
              </span>
              {activeFilters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className="pdmr-active-filter"
                  onClick={f.clear}
                  aria-label={`إزالة فلتر: ${f.label}`}
                >
                  <span>{f.label}</span>
                  <X size={12} aria-hidden="true" />
                </button>
              ))}
              <button
                type="button"
                className="pdmr-clear-all"
                onClick={clearAllFilters}
              >
                مسح الكل
              </button>
            </div>
          )}
        </div>

        {/* ── Content ──────────────────────────────────────────────── */}
        {prescriptionsLoading ? (
          <div className="pd-section-loading">
            <LoadingSpinner message="جاري تحميل الوصفات..." />
          </div>
        ) : finalFiltered.length === 0 ? (
          inTab.length === 0 ? (
            <EmptyState
              icon={Pill}
              title="لا توجد وصفات"
              subtitle={
                prescriptionTab === 'active'
                  ? 'ستظهر هنا الوصفات النشطة بعد كتابتها من قبل الطبيب.'
                  : 'لا يوجد محتوى لعرضه في هذا التبويب.'
              }
            />
          ) : (
            <EmptyState
              icon={Search}
              title="لا نتائج مطابقة"
              subtitle="جرّب تغيير الفلاتر أو مصطلح البحث."
              cta={{ label: 'مسح الفلاتر', onClick: clearAllFilters }}
            />
          )
        ) : prescriptionView === 'list' ? (
          <div className="pdmr-groups">
            {grouped.map((group) => (
              <section key={group.key} className="pdmr-group">
                <h3 className="pdmr-group-header">
                  <Calendar size={14} aria-hidden="true" />
                  <span>{DATE_GROUP_LABELS[group.key]}</span>
                  <span className="pdmr-group-count">{group.items.length}</span>
                </h3>
                <ul className="pdmr-list">
                  {group.items.map(renderPrescriptionCard)}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <ul className="pdmr-grid">
            {finalFiltered.map(renderPrescriptionCard)}
          </ul>
        )}
      </div>
    );
  };



  // ════════════════════════════════════════════════════════════════════
  // Lab results section
  // ════════════════════════════════════════════════════════════════════

  const LAB_STATUS_GROUPS = {
    all:       ['ordered', 'scheduled', 'sample_collected', 'in_progress', 'completed', 'cancelled', 'rejected'],
    pending:   ['ordered', 'scheduled', 'sample_collected', 'in_progress'],
    results:   ['completed'],
    cancelled: ['cancelled', 'rejected'],
  };

  const LAB_STATUS_LABELS = {
    ordered:          'معلّقة',
    scheduled:        'مجدولة',
    sample_collected: 'تم سحب العينة',
    in_progress:      'قيد التنفيذ',
    completed:        'مكتملة',
    cancelled:        'ملغاة',
    rejected:         'مرفوضة',
  };

  // Map status → pdmr-status color variant
  const LAB_STATUS_VARIANTS = {
    ordered:          'info',
    scheduled:        'info',
    sample_collected: 'info',
    in_progress:      'warning',
    completed:        'success',
    cancelled:        'danger',
    rejected:         'danger',
  };

  const LAB_TABS = [
    { key: 'all',       label: 'الكل' },
    { key: 'results',   label: 'النتائج' },
    { key: 'pending',   label: 'قيد الإنتظار' },
    { key: 'cancelled', label: 'ملغاة' },
  ];

  const LAB_PERIODS = [
    { key: 'all',     label: 'كل الفترات' },
    { key: 'week',    label: 'آخر أسبوع' },
    { key: 'month',   label: 'آخر شهر' },
    { key: '3months', label: 'آخر 3 أشهر' },
    { key: 'year',    label: 'آخر سنة' },
  ];

  // Auto-mark as viewed when opening detail page (mirrors the previous
  // inline-expand behavior — fires the same API call so the doctor's
  // "unviewed" indicator gets cleared as soon as the patient looks).
  const markLabAsViewedOnOpen = async (lab) => {
    if (lab.status !== 'completed' || lab.isViewedByPatient) return;
    try {
      await patientAPI.markLabTestViewed(lab._id);
      setLabTests((prev) =>
        prev.map((t) =>
          t._id === lab._id ? { ...t, isViewedByPatient: true } : t
        )
      );
    } catch {
      // Silent — next page load reconciles.
    }
  };

  const renderLabTests = () => {
    // 1) Tab filter
    const inTab = labTests.filter((lab) =>
      LAB_STATUS_GROUPS[labTestTab]?.includes(lab.status)
    );

    // 2) Per-tab counts
    const tabCounts = {
      all:       labTests.length,
      results:   labTests.filter((l) => LAB_STATUS_GROUPS.results.includes(l.status)).length,
      pending:   labTests.filter((l) => LAB_STATUS_GROUPS.pending.includes(l.status)).length,
      cancelled: labTests.filter((l) => LAB_STATUS_GROUPS.cancelled.includes(l.status)).length,
    };

    // Bonus: unread completed results — counted across the WHOLE labTests
    // set (not just the active tab) so the patient is notified even when
    // looking at, say, the "Pending" tab.
    const unreadCount = labTests.filter(
      (l) => l.status === 'completed' && !l.isViewedByPatient
    ).length;

    // 3) Search + period + sort
    const filtered = filterAndSortItems({
      items:        inTab,
      search:       labTestSearch,
      searchFields: ['testNumber', 'labNotes', 'doctorName',
                     'doctor.firstName', 'doctor.lastName',
                     'laboratoryName', 'laboratory.name'],
      period:       labTestPeriod,
      dateField:    'orderDate',
      sortOrder:    labTestSort,
    });

    // 4) Group by date for list view
    const grouped = groupByDate(filtered, 'orderDate');

    // 5) Active filter chips
    const activeFilters = [];
    if (labTestSearch.trim())     activeFilters.push({ key: 'search', label: `بحث: ${labTestSearch.trim()}`, clear: () => setLabTestSearch('') });
    if (labTestPeriod !== 'all')  activeFilters.push({ key: 'period', label: LAB_PERIODS.find((p) => p.key === labTestPeriod)?.label || labTestPeriod, clear: () => setLabTestPeriod('all') });
    if (labTestSort !== 'newest') activeFilters.push({ key: 'sort',   label: 'الأقدم أولاً', clear: () => setLabTestSort('newest') });
    const clearAllFilters = () => { setLabTestSearch(''); setLabTestPeriod('all'); setLabTestSort('newest'); };

    // 6) Navigation — and auto-mark as viewed at the same time
    const openDetail = (lab) => {
      markLabAsViewedOnOpen(lab);
      navigate(`/patient-dashboard/lab-results/${lab._id}`, { state: { labTest: lab } });
    };

    // 7) Single-card renderer
    const renderLabCard = (lab) => {
      const statusLabel    = LAB_STATUS_LABELS[lab.status]   || lab.status;
      const statusVariant  = LAB_STATUS_VARIANTS[lab.status] || 'muted';
      const results = Array.isArray(lab.testResults) ? lab.testResults : [];
      const abnormalCount = results.filter((r) => r.isAbnormal || r.isCritical).length;
      const criticalCount = results.filter((r) => r.isCritical).length;
      const isUnread = lab.status === 'completed' && !lab.isViewedByPatient;

      return (
        <li key={lab._id} className={`pdmr-card${isUnread ? ' pdmr-card--unread' : ''}`}>
          <button
            type="button"
            className="pdmr-card-head"
            onClick={() => openDetail(lab)}
            aria-label={`عرض تفاصيل التحليل: ${lab.testNumber}`}
          >
            <div className="pdmr-card-icon" aria-hidden="true">
              <FlaskConical size={20} />
            </div>

            <div className="pdmr-card-body">
              <div className="pdmr-card-title-row">
                <h3 className="pdmr-card-title" dir="ltr">
                  {lab.testNumber || 'تحليل مخبري'}
                  {isUnread && (
                    <span className="pdmr-card-unread-dot" aria-label="نتيجة غير مقروءة" />
                  )}
                </h3>
                <span className={`pdmr-status pdmr-status--${statusVariant}`}>
                  {statusLabel}
                </span>
              </div>

              <div className="pdmr-card-meta">
                <span className="pdmr-card-meta-item" dir="ltr">
                  <Calendar size={13} aria-hidden="true" />
                  <time dateTime={lab.orderDate}>{formatDate(lab.orderDate)}</time>
                </span>
                {results.length > 0 && (
                  <span className="pdmr-card-meta-item">
                    <FlaskConical size={13} aria-hidden="true" />
                    <span>{results.length} فحص</span>
                  </span>
                )}
                {criticalCount > 0 && (
                  <span className="pdmr-priority pdmr-priority--emergency">
                    <AlertOctagon size={11} aria-hidden="true" />
                    <span>{criticalCount} حرجة</span>
                  </span>
                )}
                {criticalCount === 0 && abnormalCount > 0 && (
                  <span className="pdmr-priority pdmr-priority--urgent">
                    <AlertTriangle size={11} aria-hidden="true" />
                    <span>{abnormalCount} غير طبيعية</span>
                  </span>
                )}
              </div>
            </div>

            <ChevronLeft className="pdmr-card-chevron" size={18} aria-hidden="true" />
          </button>
        </li>
      );
    };

    return (
      <div className="pd-lab-tests pdmr-section">

        {/* ── Universal toolbar ────────────────────────────────────── */}
        <div className="pdmr-toolbar" role="toolbar" aria-label="أدوات تصفية التحاليل">
          <div className="pdmr-toolbar-main">
            <div className="pdmr-search">
              <Search size={16} aria-hidden="true" className="pdmr-search-icon" />
              <input
                type="search"
                className="pdmr-search-input"
                placeholder="ابحث في التحاليل (رقم، طبيب، مختبر)..."
                value={labTestSearch}
                onChange={(e) => setLabTestSearch(e.target.value)}
                dir="auto"
                aria-label="بحث"
              />
              {labTestSearch && (
                <button
                  type="button"
                  className="pdmr-search-clear"
                  onClick={() => setLabTestSearch('')}
                  aria-label="مسح البحث"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="pdmr-view-toggle" role="group" aria-label="طريقة العرض">
              <button
                type="button"
                className={`pdmr-view-btn${labTestView === 'list' ? ' is-active' : ''}`}
                onClick={() => setLabTestView('list')}
                aria-pressed={labTestView === 'list'}
                title="عرض قائمة"
              >
                <Menu size={15} aria-hidden="true" />
                <span>قائمة</span>
              </button>
              <button
                type="button"
                className={`pdmr-view-btn${labTestView === 'cards' ? ' is-active' : ''}`}
                onClick={() => setLabTestView('cards')}
                aria-pressed={labTestView === 'cards'}
                title="عرض بطاقات"
              >
                <FileText size={15} aria-hidden="true" />
                <span>بطاقات</span>
              </button>
            </div>

            <select
              className="pdmr-sort"
              value={labTestSort}
              onChange={(e) => setLabTestSort(e.target.value)}
              aria-label="ترتيب"
            >
              <option value="newest">الأحدث أولاً</option>
              <option value="oldest">الأقدم أولاً</option>
            </select>
          </div>

          {/* Status tabs */}
          <div className="pdmr-chips" role="tablist" aria-label="حالة التحليل">
            {LAB_TABS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={labTestTab === key}
                className={`pdmr-chip${labTestTab === key ? ' is-active' : ''}`}
                onClick={() => setLabTestTab(key)}
              >
                <span>{label}</span>
                <span className="pdmr-chip-count" aria-label={`${tabCounts[key]} تحليل`}>
                  {tabCounts[key]}
                </span>
              </button>
            ))}
            {unreadCount > 0 && (
              <span className="pdmr-chip pdmr-chip--alert" aria-label={`${unreadCount} نتيجة غير مقروءة`}>
                <AlertCircle size={12} aria-hidden="true" />
                <span>{unreadCount} غير مقروءة</span>
              </span>
            )}
          </div>

          {/* Period filter */}
          <div className="pdmr-chips pdmr-chips--secondary" role="group" aria-label="الفترة الزمنية">
            {LAB_PERIODS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={`pdmr-chip pdmr-chip--ghost${labTestPeriod === key ? ' is-active' : ''}`}
                onClick={() => setLabTestPeriod(key)}
                aria-pressed={labTestPeriod === key}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Active filters */}
          {activeFilters.length > 0 && (
            <div className="pdmr-active-filters" aria-label="الفلاتر المُفعّلة">
              <span className="pdmr-active-filters-label">
                <Filter size={13} aria-hidden="true" />
                <span>الفلاتر:</span>
              </span>
              {activeFilters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className="pdmr-active-filter"
                  onClick={f.clear}
                  aria-label={`إزالة فلتر: ${f.label}`}
                >
                  <span>{f.label}</span>
                  <X size={12} aria-hidden="true" />
                </button>
              ))}
              <button
                type="button"
                className="pdmr-clear-all"
                onClick={clearAllFilters}
              >
                مسح الكل
              </button>
            </div>
          )}
        </div>

        {/* ── Content ──────────────────────────────────────────────── */}
        {labTestsLoading ? (
          <div className="pd-section-loading">
            <LoadingSpinner message="جاري تحميل النتائج..." />
          </div>
        ) : filtered.length === 0 ? (
          inTab.length === 0 ? (
            <EmptyState
              icon={FlaskConical}
              title="لا توجد نتائج في هذا التبويب"
              subtitle="ستظهر هنا فور توفرها من المختبر."
            />
          ) : (
            <EmptyState
              icon={Search}
              title="لا نتائج مطابقة"
              subtitle="جرّب تغيير الفلاتر أو مصطلح البحث."
              cta={{ label: 'مسح الفلاتر', onClick: clearAllFilters }}
            />
          )
        ) : labTestView === 'list' ? (
          <div className="pdmr-groups">
            {grouped.map((group) => (
              <section key={group.key} className="pdmr-group">
                <h3 className="pdmr-group-header">
                  <Calendar size={14} aria-hidden="true" />
                  <span>{DATE_GROUP_LABELS[group.key]}</span>
                  <span className="pdmr-group-count">{group.items.length}</span>
                </h3>
                <ul className="pdmr-list">
                  {group.items.map(renderLabCard)}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <ul className="pdmr-grid">
            {filtered.map(renderLabCard)}
          </ul>
        )}
      </div>
    );
  };



  // ════════════════════════════════════════════════════════════════════
  // AI Assistant section
  // ════════════════════════════════════════════════════════════════════

  const INPUT_TYPE_ICONS = {
    text:     MessageSquare,
    image:    ImageIcon,
    voice:    Mic,
    combined: Sparkles,
  };

  const INPUT_TYPE_LABELS = {
    text:     'نص',
    image:    'صورة',
    voice:    'صوت',
    combined: 'مختلط',
  };

  const getLocationWithTimeout = (timeoutMs = 3000) => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }

      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      }, timeoutMs);

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
        },
        () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(null);
        },
        { timeout: timeoutMs, maximumAge: 60000 }
      );
    });
  };

  const handleSpecialistSubmit = async (symptoms) => {
    if (!symptoms?.trim()) return;
    setSpecialistLoading(true);
    setSpecialistError(null);
    try {
      const res = await patientAPI.analyzeSymptoms({ symptoms });
      if (res?.success) {
        setSpecialistResult(res.data || null);
      } else {
        setSpecialistError(res?.message || 'تعذر الحصول على النتيجة');
      }
    } catch (err) {
      setSpecialistError(err?.message || 'حدث خطأ في الاتصال بالخادم');
    } finally {
      setSpecialistLoading(false);
    }
  };

  const submitTriage = async (mode, payload) => {
    setTriageLoading(true);
    setTriageError(null);
    setTriageResult(null);

    const location = await getLocationWithTimeout();

    const formData = new FormData();

    // ── Field names match backend req.body / req.files contract ─────────
    if (mode === 'text') {
      formData.append('text', payload);
    } else if (mode === 'image') {
      formData.append('image', payload);
    } else if (mode === 'voice') {
      formData.append('audio', payload);
    }

    // ── Location as GeoJSON Point (backend validates [lng, lat] order) ──
    if (location) {
      formData.append('location', JSON.stringify({
        type: 'Point',
        coordinates: [location.lng, location.lat],
      }));
      if (Number.isFinite(location.accuracy)) {
        formData.append('locationAccuracy', String(location.accuracy));
      }
    }

    try {
      const res = await patientAPI.submitEmergencyReport(formData);
      if (res?.success) {
        setTriageResult(res.report || null);
        loadEmergencyReports(true);
      } else {
        setTriageError(res?.message || 'تعذر إرسال التقرير');
      }
    } catch (err) {
      setTriageError(err?.message || 'حدث خطأ في الاتصال بالخادم');
    } finally {
      setTriageLoading(false);
    }
  };

  const handleTriageTextSubmit  = (text) => submitTriage('text',  text);
  const handleTriageImageSubmit = (file) => submitTriage('image', file);
  const handleTriageVoiceSubmit = (file) => submitTriage('voice', file);

  const renderAIAssistant = () => (
    <div className="pd-ai-assistant">
      <div className="pd-ai-subtabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={aiActiveTab === 'specialist'}
          className={`pd-ai-subtab${aiActiveTab === 'specialist' ? ' is-active' : ''}`}
          onClick={() => setAiActiveTab('specialist')}
        >
          <Stethoscope size={16} aria-hidden="true" />
          <span>استشارة الأخصائي</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={aiActiveTab === 'triage'}
          className={`pd-ai-subtab${aiActiveTab === 'triage' ? ' is-active' : ''}`}
          onClick={() => setAiActiveTab('triage')}
        >
          <Siren size={16} aria-hidden="true" />
          <span>الإسعاف الأولي</span>
        </button>
      </div>

      {aiActiveTab === 'specialist' && (
        <div className="pd-ai-panel" role="tabpanel" aria-label="استشارة الأخصائي">
          <div className="pd-ai-panel-intro">
            <h3 className="pd-ai-panel-title">اختر الأخصائي المناسب لأعراضك</h3>
            <p>
              اكتب أعراضك وسيقترح لك المساعد الذكي نوع الطبيب المناسب
              لحالتك. هذه النتيجة للإرشاد فقط ولا تحل محل الاستشارة
              الطبية.
            </p>
          </div>

          <div className="pd-ai-panel-body">
            <div className="pd-ai-panel-input">
              <InputText
                value={specialistInput}
                onChange={setSpecialistInput}
                onSubmit={handleSpecialistSubmit}
                placeholder="صف أعراضك بلغة واضحة، مثل: ألم في الصدر وضيق في التنفس منذ يومين..."
                disabled={specialistLoading}
                maxLength={2000}
              />
            </div>

            <div className="pd-ai-panel-result">
              <ResultCard
                variant={specialistResult ? 'specialist' : 'empty'}
                result={specialistResult}
                loading={specialistLoading}
                error={specialistError}
              />
            </div>
          </div>
        </div>
      )}

      {aiActiveTab === 'triage' && (
        <div className="pd-ai-panel" role="tabpanel" aria-label="الإسعاف الأولي">
          <div className="pd-ai-panel-intro pd-ai-panel-intro--emergency">
            <AlertTriangle size={20} aria-hidden="true" />
            <div>
              <h3 className="pd-ai-panel-title">الإسعاف الأولي الذكي</h3>
              <p>
                صف حالتك أو ارفع صورة للإصابة وسنوفر لك إرشادات الإسعاف
                الأولي. في حالة الطوارئ الحقيقية، اتصل بالإسعاف فوراً.
              </p>
            </div>
          </div>

          <InputModeToggle
            mode={triageMode}
            onChange={setTriageMode}
            availableModes={['text', 'image', 'voice']}
          />

          <div className="pd-ai-panel-body">
            <div className="pd-ai-panel-input">
              {triageMode === 'text' && (
                <InputText
                  value={triageText}
                  onChange={setTriageText}
                  onSubmit={handleTriageTextSubmit}
                  placeholder="صف الحالة — مثال: جرح في اليد ينزف منذ 5 دقائق..."
                  disabled={triageLoading}
                  maxLength={2000}
                />
              )}
              {triageMode === 'image' && (
                <InputImage
                  onChange={setTriageImageFile}
                  onSubmit={handleTriageImageSubmit}
                  maxSizeMB={10}
                  disabled={triageLoading}
                  openAlert={openAlert}
                />
              )}
              {triageMode === 'voice' && (
                <InputAudio
                  onChange={setTriageAudioFile}
                  onSubmit={handleTriageVoiceSubmit}
                  maxSizeMB={15}
                  disabled={triageLoading}
                  openAlert={openAlert}
                />
              )}
            </div>

            <div className="pd-ai-panel-result">
              <ResultCard
                variant={triageResult ? 'triage' : 'empty'}
                result={triageResult}
                loading={triageLoading}
                error={triageError}
              />
            </div>
          </div>

          <section className="pd-ai-history" aria-label="السجل السابق">
            <h3 className="pd-ai-history-title">
              <Clock size={18} aria-hidden="true" />
              <span>السجل السابق</span>
            </h3>

            {emergencyReportsLoading ? (
              <LoadingSpinner message="جاري تحميل السجل..." />
            ) : emergencyReports.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="لا يوجد سجل"
                subtitle="ستظهر هنا تقاريرك السابقة بعد إرسال أول طلب."
              />
            ) : (
              <ol className="pd-ai-history-list">
                {emergencyReports.map((report) => {
                  const InputIcon = INPUT_TYPE_ICONS[report.inputType] || MessageSquare;
                  const typeLabel = INPUT_TYPE_LABELS[report.inputType] || report.inputType;
                  const steps = Array.isArray(report.aiFirstAid) ? report.aiFirstAid : [];
                  const timestamp = report.reportedAt || report.createdAt;

                  return (
                    <li key={report._id} className="pd-ai-history-item">
                      <div className="pd-ai-history-item-icon" aria-hidden="true">
                        <InputIcon size={18} />
                      </div>
                      <div className="pd-ai-history-item-body">
                        <div className="pd-ai-history-item-top">
                          <SeverityBadge severity={report.aiRiskLevel} />
                          <span
                            className="pd-ai-history-item-type"
                            aria-label={`نوع الإدخال: ${typeLabel}`}
                          >
                            {typeLabel}
                          </span>
                          <time
                            dateTime={timestamp}
                            className="pd-ai-history-item-time"
                            dir="ltr"
                          >
                            {formatDateTime(timestamp)}
                          </time>
                        </div>
                        {report.textDescription && (
                          <p className="pd-ai-history-item-desc" dir="auto">
                            {report.textDescription}
                          </p>
                        )}
                        {steps.length > 0 && (
                          <details className="pd-ai-history-item-details">
                            <summary>إظهار خطوات الإسعاف</summary>
                            <FirstAidSteps steps={steps} />
                          </details>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      )}
    </div>
  );


  // ════════════════════════════════════════════════════════════════════
  // Reviews section
  // ════════════════════════════════════════════════════════════════════

  const REVIEW_STATUS_LABELS = {
    pending:  'قيد المراجعة',
    approved: 'منشور',
    rejected: 'مرفوض',
    flagged:  'مُعلَّم',
  };

  const resolveReviewTarget = (review) => {
    for (const { key, label, icon } of REVIEW_TARGETS) {
      if (review[key]) {
        return { label, icon, id: review[key] };
      }
    }
    return { label: 'غير محدد', icon: Star, id: null };
  };

  const renderReviews = () => {
    const openReviewForm = () => {
      const submit = async (payload) => {
        try {
          const res = await patientAPI.submitReview(payload);
          if (res?.success) {
            closeModal();
            openAlert(
              'success',
              'تم إرسال التقييم',
              'شكراً لمشاركتك. سيتم مراجعة التقييم قبل نشره.'
            );
            loadReviews(true);
          } else {
            openAlert('error', 'تعذر إرسال التقييم', res?.message || 'حدث خطأ');
          }
        } catch (err) {
          openAlert('error', 'تعذر إرسال التقييم', err?.message || 'حدث خطأ في الاتصال');
        }
      };

      openCustomModal('إضافة تقييم', (
        <ReviewSubmitForm
          onCancel={closeModal}
          onConfirm={submit}
          submitting={false}
        />
      ));
    };

    return (
      <div className="pd-reviews">
        <div className="pd-section-toolbar">
          <button type="button" className="pd-btn pd-btn--primary" onClick={openReviewForm}>
            <Plus size={16} aria-hidden="true" />
            <span>إضافة تقييم</span>
          </button>
        </div>

        {reviewsLoading ? (
          <div className="pd-section-loading">
            <LoadingSpinner message="جاري تحميل التقييمات..." />
          </div>
        ) : reviews.length === 0 ? (
          <EmptyState
            icon={Star}
            title="لا توجد تقييمات"
            subtitle="شاركنا تجربتك مع الأطباء والمختبرات والصيدليات."
            cta={{ label: 'إضافة أول تقييم', onClick: openReviewForm }}
          />
        ) : (
          <ul className="pd-review-list">
            {reviews.map((review) => {
              const target = resolveReviewTarget(review);
              const TargetIcon = target.icon;
              const statusLabel = REVIEW_STATUS_LABELS[review.status] || review.status;

              return (
                <li key={review._id} className="pd-review-item">
                  <div className="pd-review-item-head">
                    <div className="pd-review-item-target">
                      <TargetIcon size={18} aria-hidden="true" />
                      <span>{target.label}</span>
                      {target.id && (
                        <span className="pd-review-item-target-id" dir="ltr">
                          {target.id}
                        </span>
                      )}
                    </div>
                    <div className="pd-review-item-rating" aria-label={`${review.rating} من 5`}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          size={14}
                          fill={n <= review.rating ? 'currentColor' : 'none'}
                          aria-hidden="true"
                        />
                      ))}
                    </div>
                  </div>
                  {review.reviewText && (
                    <p className="pd-review-item-text" dir="auto">{review.reviewText}</p>
                  )}
                  <div className="pd-review-item-foot">
                    <span className={`pd-review-status pd-review-status--${review.status}`}>
                      {statusLabel}
                    </span>
                    {review.isAnonymous && (
                      <span className="pd-review-anon">
                        <Eye size={12} aria-hidden="true" />
                        <span>مجهول الهوية</span>
                      </span>
                    )}
                    <time dateTime={review.createdAt} dir="ltr">
                      {formatDate(review.createdAt)}
                    </time>
                  </div>
                  {review.adminNote && (
                    <p className="pd-review-item-admin-note" dir="auto">
                      <strong>ملاحظة الإدارة: </strong>
                      {review.adminNote}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  };


  // ════════════════════════════════════════════════════════════════════
  // Notifications section
  // ════════════════════════════════════════════════════════════════════

  const NOTIFICATION_TYPE_META = {
    appointment_reminder:    { icon: Calendar,      label: 'تذكير بموعد'          },
    appointment_confirmed:   { icon: CheckCircle2,  label: 'تأكيد موعد'            },
    appointment_cancelled:   { icon: XCircle,       label: 'إلغاء موعد'            },
    prescription_ready:      { icon: Pill,          label: 'الوصفة جاهزة'          },
    prescription_dispensed:  { icon: Pill,          label: 'تم صرف الوصفة'        },
    lab_results_ready:       { icon: FlaskConical,  label: 'نتائج المختبر'         },
    lab_results_critical:    { icon: AlertOctagon,  label: 'نتائج حرجة'            },
    emergency_alert:         { icon: Siren,         label: 'تنبيه طارئ'             },
    doctor_request_approved: { icon: CheckCircle2,  label: 'قُبل الطلب'            },
    doctor_request_rejected: { icon: XCircle,       label: 'رُفض الطلب'            },
    account_deactivated:     { icon: AlertTriangle, label: 'إلغاء تفعيل الحساب'  },
    payment_due:             { icon: AlertCircle,   label: 'دفعة مستحقة'           },
    system_alert:            { icon: Info,          label: 'تنبيه النظام'           },
    general:                 { icon: Bell,          label: 'إشعار'                  },
  };

  const RELATED_TYPE_TO_SECTION = {
    appointments:      'appointments',
    visits:            'visits',
    prescriptions:     'prescriptions',
    lab_tests:         'lab-results',
    emergency_reports: 'ai-assistant',
  };

  const handleNotificationClick = (notification) => {
    if (notification.status !== 'read') {
      setNotifications((prev) =>
        prev.map((n) =>
          n._id === notification._id
            ? { ...n, status: 'read', readAt: new Date().toISOString() }
            : n
        )
      );
      patientAPI.markNotificationRead(notification._id).catch(() => {});
    }

    const targetSection = RELATED_TYPE_TO_SECTION[notification.relatedType];
    if (targetSection) {
      setActiveSection(targetSection);
    }
  };

  const renderNotifications = () => {
    const filtered = notifications.filter((n) =>
      notificationFilter === 'unread' ? n.status !== 'read' : true
    );

    return (
      <div className="pd-notifications">
        <div className="pd-section-toolbar">
          <div className="pd-tabs" role="tablist">
            {[
              { key: 'unread', label: 'غير المقروءة' },
              { key: 'all',    label: 'الكل'          },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={notificationFilter === key}
                className={`pd-tab${notificationFilter === key ? ' is-active' : ''}`}
                onClick={() => setNotificationFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {notificationsLoading ? (
          <div className="pd-section-loading">
            <LoadingSpinner message="جاري تحميل الإشعارات..." />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={
              notificationFilter === 'unread'
                ? 'لا توجد إشعارات غير مقروءة'
                : 'لا توجد إشعارات'
            }
            subtitle="ستظهر هنا التنبيهات والتذكيرات."
          />
        ) : (
          <ul className="pd-notification-list">
            {filtered.map((n) => {
              const meta = NOTIFICATION_TYPE_META[n.type] || NOTIFICATION_TYPE_META.general;
              const MetaIcon = meta.icon;
              const isUnread = n.status !== 'read';
              const isDeepLinkable = Boolean(RELATED_TYPE_TO_SECTION[n.relatedType]);

              return (
                <li
                  key={n._id}
                  className={`pd-notification-item${isUnread ? ' is-unread' : ''} pd-notification-item--${n.priority || 'medium'}`}
                >
                  <button
                    type="button"
                    className="pd-notification-item-btn"
                    onClick={() => handleNotificationClick(n)}
                  >
                    <div
                      className={`pd-notification-item-icon pd-notification-item-icon--${n.type || 'general'}`}
                      aria-hidden="true"
                    >
                      <MetaIcon size={18} />
                    </div>
                    <div className="pd-notification-item-body">
                      <div className="pd-notification-item-top">
                        <span className="pd-notification-item-type">{meta.label}</span>
                        {isUnread && (
                          <span className="pd-notification-item-dot" aria-label="غير مقروءة">
                            •
                          </span>
                        )}
                      </div>
                      <h4 className="pd-notification-item-title" dir="auto">{n.title}</h4>
                      <p className="pd-notification-item-message" dir="auto">{n.message}</p>
                      <div className="pd-notification-item-foot">
                        <time dateTime={n.sentAt || n.createdAt} dir="ltr">
                          {formatDateTime(n.sentAt || n.createdAt)}
                        </time>
                        {isDeepLinkable && (
                          <span className="pd-notification-item-link-hint">
                            <ChevronLeft size={14} aria-hidden="true" />
                            <span>اضغط لعرض التفاصيل</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  };


  // ════════════════════════════════════════════════════════════════════
  // Profile section
  // ════════════════════════════════════════════════════════════════════

  const GOVERNORATE_LABELS = {
    damascus:    'دمشق',    aleppo:     'حلب',       homs:       'حمص',
    hama:        'حماة',    latakia:    'اللاذقية',  tartus:     'طرطوس',
    idlib:       'إدلب',    deir_ez_zor:'دير الزور',  raqqa:      'الرقة',
    hasakah:     'الحسكة',  daraa:      'درعا',      as_suwayda: 'السويداء',
    quneitra:    'القنيطرة', rif_dimashq:'ريف دمشق',
  };

  const renderProfile = () => {
    const openEditForm = () => {
      const submit = async (payload) => {
        try {
          const res = await patientAPI.updateMyProfile(payload);
          if (res?.success) {
            setProfile((prev) => ({ ...(prev || {}), ...res }));
            closeModal();
            openAlert('success', 'تم الحفظ', 'تم تحديث ملفك الشخصي.');
          } else {
            openAlert('error', 'تعذر الحفظ', res?.message || 'حدث خطأ');
          }
        } catch (err) {
          openAlert('error', 'تعذر الحفظ', err?.message || 'حدث خطأ في الاتصال');
        }
      };

      openCustomModal('تعديل الملف', (
        <ProfileEditForm
          profile={profile}
          onCancel={closeModal}
          onConfirm={submit}
          submitting={false}
        />
      ), 'lg');
    };

    if (profileLoading) {
      return (
        <div className="pd-section-loading">
          <LoadingSpinner message="جاري تحميل الملف الشخصي..." />
        </div>
      );
    }
    if (!profile) {
      return (
        <EmptyState
          icon={User}
          title="تعذر تحميل الملف الشخصي"
          subtitle="يرجى إعادة المحاولة لاحقاً."
        />
      );
    }

    const ident   = identity || {};
    const patient = profile.patient || {};
    const ec      = patient.emergencyContact || {};
    const allergies         = Array.isArray(patient.allergies)         ? patient.allergies         : [];
    const chronicDiseases   = Array.isArray(patient.chronicDiseases)   ? patient.chronicDiseases   : [];
    const currentMedications = Array.isArray(patient.currentMedications) ? patient.currentMedications : [];
    const addressLine = [
      GOVERNORATE_LABELS[ident.governorate] || ident.governorate,
      ident.city,
      ident.address,
    ].filter(Boolean).join(' — ');

    return (
      <div className="pd-profile">
        <div className="pd-section-toolbar">
          <button type="button" className="pd-btn pd-btn--primary" onClick={openEditForm}>
            <Edit size={16} aria-hidden="true" />
            <span>تعديل الملف</span>
          </button>
        </div>

        <section className="pd-card pd-profile-card">
          <div className="pd-card-header">
            <h3 className="pd-card-title">
              <User size={18} aria-hidden="true" />
              <span>المعلومات الشخصية</span>
            </h3>
          </div>
          <div className="pd-card-body">
            <dl className="pd-profile-fields">
              <div className="pd-profile-field">
                <dt>الاسم الكامل</dt>
                <dd dir="auto">{fullName || '—'}</dd>
              </div>
              {ident.nationalId && (
                <div className="pd-profile-field">
                  <dt>الرقم الوطني</dt>
                  <dd dir="ltr">{ident.nationalId}</dd>
                </div>
              )}
              {ident.childRegistrationNumber && (
                <div className="pd-profile-field">
                  <dt>رقم تسجيل الطفل</dt>
                  <dd dir="ltr">{ident.childRegistrationNumber}</dd>
                </div>
              )}
              <div className="pd-profile-field">
                <dt>تاريخ الميلاد</dt>
                <dd dir="ltr">{ident.dateOfBirth ? formatDate(ident.dateOfBirth) : '—'}</dd>
              </div>
              <div className="pd-profile-field">
                <dt>العمر</dt>
                <dd dir="ltr">{age !== null ? `${age} سنة` : '—'}</dd>
              </div>
              <div className="pd-profile-field">
                <dt>الجنس</dt>
                <dd>{ident.gender === 'male' ? 'ذكر' : ident.gender === 'female' ? 'أنثى' : '—'}</dd>
              </div>
              <div className="pd-profile-field">
                <dt>رقم الهاتف</dt>
                <dd dir="ltr">{ident.phoneNumber || '—'}</dd>
              </div>
              <div className="pd-profile-field pd-profile-field--email">
                <dt>
                  <span>البريد الإلكتروني</span>
                  <Lock
                    className="pd-profile-email-lock"
                    size={12}
                    aria-label="لا يمكن تغيير البريد الإلكتروني في هذا الإصدار"
                  />
                </dt>
                <dd dir="ltr">{ident.email || '—'}</dd>
              </div>
              <div className="pd-profile-field">
                <dt>العنوان</dt>
                <dd dir="auto">{addressLine || '—'}</dd>
              </div>
            </dl>
          </div>
        </section>

        {isMinor && profile.child && (profile.child.guardianName || profile.child.schoolName) && (
          <section className="pd-card pd-profile-card">
            <div className="pd-card-header">
              <h3 className="pd-card-title">
                <Baby size={18} aria-hidden="true" />
                <span>معلومات الولي والمدرسة</span>
              </h3>
            </div>
            <div className="pd-card-body">
              <dl className="pd-profile-fields">
                {profile.child.guardianName && (
                  <div className="pd-profile-field">
                    <dt>اسم الوصي</dt>
                    <dd dir="auto">{profile.child.guardianName}</dd>
                  </div>
                )}
                {profile.child.guardianRelationship && (
                  <div className="pd-profile-field">
                    <dt>صلة القرابة</dt>
                    <dd dir="auto">{profile.child.guardianRelationship}</dd>
                  </div>
                )}
                {profile.child.schoolName && (
                  <div className="pd-profile-field">
                    <dt><GraduationCap size={14} aria-hidden="true" /> المدرسة</dt>
                    <dd dir="auto">{profile.child.schoolName}</dd>
                  </div>
                )}
                {profile.child.grade && (
                  <div className="pd-profile-field">
                    <dt>الصف</dt>
                    <dd dir="auto">{profile.child.grade}</dd>
                  </div>
                )}
              </dl>
            </div>
          </section>
        )}

        <section className="pd-card pd-profile-card">
          <div className="pd-card-header">
            <h3 className="pd-card-title">
              <HeartPulse size={18} aria-hidden="true" />
              <span>المعلومات الطبية</span>
            </h3>
          </div>
          <div className="pd-card-body">
            <dl className="pd-profile-fields">
              <div className="pd-profile-field">
                <dt><Droplet size={14} aria-hidden="true" /> فصيلة الدم</dt>
                <dd dir="ltr">
                  {bloodType === 'unknown' ? 'غير معروفة' : (bloodType || '—')}
                </dd>
              </div>
              {patient.height && (
                <div className="pd-profile-field">
                  <dt>الطول</dt>
                  <dd dir="ltr">{patient.height} سم</dd>
                </div>
              )}
              {patient.weight && (
                <div className="pd-profile-field">
                  <dt>الوزن</dt>
                  <dd dir="ltr">{patient.weight} كغ</dd>
                </div>
              )}
              {patient.bmi && (
                <div className="pd-profile-field">
                  <dt>مؤشر الكتلة</dt>
                  <dd dir="ltr">{Number(patient.bmi).toFixed(1)}</dd>
                </div>
              )}
              {medicalCardNumber && (
                <div className="pd-profile-field">
                  <dt><CreditCard size={14} aria-hidden="true" /> البطاقة الطبية</dt>
                  <dd dir="ltr">{medicalCardNumber}</dd>
                </div>
              )}
            </dl>
            {allergies.length > 0 && (
              <div className="pd-profile-tags">
                <h4>الحساسية</h4>
                <ul>
                  {allergies.map((a, i) => (
                    <li key={i} className="pd-profile-tag pd-profile-tag--warning" dir="auto">{a}</li>
                  ))}
                </ul>
              </div>
            )}
            {chronicDiseases.length > 0 && (
              <div className="pd-profile-tags">
                <h4>الأمراض المزمنة</h4>
                <ul>
                  {chronicDiseases.map((d, i) => (
                    <li key={i} className="pd-profile-tag" dir="auto">{d}</li>
                  ))}
                </ul>
              </div>
            )}
            {currentMedications.length > 0 && (
              <div className="pd-profile-tags">
                <h4>الأدوية الحالية</h4>
                <ul>
                  {currentMedications.map((m, i) => (
                    <li key={i} className="pd-profile-tag" dir="auto">{m}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        <section className="pd-card pd-profile-card">
          <div className="pd-card-header">
            <h3 className="pd-card-title">
              <Phone size={18} aria-hidden="true" />
              <span>جهة الاتصال في حالة الطوارئ</span>
            </h3>
          </div>
          <div className="pd-card-body">
            {ec.name || ec.phoneNumber ? (
              <dl className="pd-profile-fields">
                {ec.name && (
                  <div className="pd-profile-field"><dt>الاسم</dt><dd dir="auto">{ec.name}</dd></div>
                )}
                {ec.relationship && (
                  <div className="pd-profile-field"><dt>صلة القرابة</dt><dd dir="auto">{ec.relationship}</dd></div>
                )}
                {ec.phoneNumber && (
                  <div className="pd-profile-field"><dt>الهاتف</dt><dd dir="ltr">{ec.phoneNumber}</dd></div>
                )}
                {ec.alternativePhoneNumber && (
                  <div className="pd-profile-field"><dt>هاتف بديل</dt><dd dir="ltr">{ec.alternativePhoneNumber}</dd></div>
                )}
              </dl>
            ) : (
              <p className="pd-profile-empty-contact">
                لم تتم إضافة جهة اتصال للطوارئ بعد. اضغط "تعديل الملف" لإضافتها.
              </p>
            )}
          </div>
        </section>
      </div>
    );
  };


  // ════════════════════════════════════════════════════════════════════
  // Section dispatcher + modal content renderer + shell
  // ════════════════════════════════════════════════════════════════════

  const renderActiveSection = () => {
    switch (activeSection) {
      case 'home':          return renderHome();
      case 'appointments':  return renderAppointments();
      case 'visits':        return renderVisits();
      case 'prescriptions': return renderPrescriptions();
      case 'lab-results':   return renderLabTests();
      case 'ai-assistant':  return renderAIAssistant();
      case 'reviews':       return renderReviews();
      case 'notifications': return renderNotifications();
      case 'profile':       return renderProfile();
      default:              return renderHome();
    }
  };

  const renderModalContent = () => {
    if (modal.type === 'custom') return modal.content;

    const VariantIcon =
      modal.variant === 'success' ? CheckCircle2
      : modal.variant === 'error'   ? XCircle
      : modal.variant === 'warning' ? AlertTriangle
      : Info;

    const confirmClass =
      modal.type === 'confirm' && (modal.variant === 'warning' || modal.variant === 'error')
        ? 'pd-btn pd-btn--danger'
        : 'pd-btn pd-btn--primary';

    return (
      <>
        <div className={`pd-modal-header pd-modal-header--${modal.variant}`}>
          <VariantIcon size={20} aria-hidden="true" />
          <h3 className="pd-modal-title" dir="auto">{modal.title}</h3>
          <button type="button" className="pd-modal-close" onClick={closeModal} aria-label="إغلاق">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="pd-modal-body">
          <p className="pd-modal-message" dir="auto">{modal.message}</p>
        </div>
        <div className="pd-modal-footer">
          {modal.type === 'confirm' && (
            <button type="button" className="pd-btn pd-btn--ghost" onClick={closeModal}>
              {modal.cancelLabel}
            </button>
          )}
          <button
            type="button"
            className={confirmClass}
            onClick={() => {
              if (modal.type === 'confirm' && typeof modal.onConfirm === 'function') {
                modal.onConfirm();
              }
              closeModal();
            }}
          >
            {modal.confirmLabel}
          </button>
        </div>
      </>
    );
  };

  return (
    <div className="pd-layout" dir="rtl">
      {renderSidebar()}

      <div className="pd-main-wrap">
        {renderPageHeader()}

        <main className="pd-main" role="main">
          {renderActiveSection()}
        </main>
      </div>

      <Modal isOpen={modal.isOpen} onClose={closeModal} size={modal.size}>
        {renderModalContent()}
      </Modal>
    </div>
  );
}