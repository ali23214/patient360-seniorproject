/**
 * ═══════════════════════════════════════════════════════════════════════
 *  Patient 360° — SignUp Page  (v2 — 4 account types)
 *  ─────────────────────────────────────────────────────────────────────
 *  Stack       : React 18 + React Router v6 + Lucide React
 *  Design      : Teal Medica (Light + Dark via [data-theme])
 *  Direction   : RTL (Arabic primary)
 *  Backend     : authAPI from src/services/api.js
 *  DB enums    : All values match patient360_db_final.js (persons, children,
 *                doctor_requests, pharmacists, lab_technicians, pharmacies,
 *                laboratories, accounts collections)
 *
 *  Architecture:
 *  ┌─ Stage 1 (Role Selection) ─────────────────────────────────────────┐
 *  │  Two cards: Patient | Healthcare Professional                       │
 *  └─────────────────────────────────────────────────────────────────────┘
 *              │                                │
 *              ▼                                ▼
 *     Patient Wizard (4 steps)      Stage 2 (Professional Sub-Selection)
 *                                   ┌───────────────────────────────────┐
 *                                   │  Doctor | Pharmacist | Lab Tech   │
 *                                   └───────────────────────────────────┘
 *                                              │
 *                                              ▼
 *                                   Role-specific 4-step wizard
 *                                   (Personal → Professional → Docs → Review)
 *
 *  Patient flow    → POST /auth/register   → creates person/child+patient+account
 *  Doctor flow     → POST /auth/register-doctor     → doctor_requests (pending)
 *  Pharmacist flow → POST /auth/register-pharmacist → doctor_requests (pending, type=pharmacist)
 *  LabTech flow    → POST /auth/register-lab-tech   → doctor_requests (pending, type=lab_technician)
 *
 *  NOTE ON BACKEND: Since patient360_db_final.js is frozen and doctor_requests
 *  uses additionalProperties:true, we reuse that collection for all professional
 *  requests with a `requestType` discriminator field. Required fields that
 *  don't apply to pharmacist/lab-tech (consultationFee, specialization enum)
 *  must be made conditional in the backend controller — see docstring of
 *  authAPI.registerPharmacist / authAPI.registerLabTechnician.
 * ═══════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  // Identity & user types
  User,
  Users,
  Stethoscope,
  UserPlus,
  Baby,

  // Form & inputs
  Mail,
  Lock,
  Eye,
  EyeOff,
  Phone,
  Calendar,
  MapPin,
  Building2,
  IdCard,
  Search,

  // Medical
  Heart,
  Brain,
  Bone,
  Activity,
  Droplet,
  Pill,
  Scissors,
  TestTube,
  TestTubes,
  Stethoscope as StethIcon,
  Syringe,
  Wind,
  ScanLine,
  Smile,
  Microscope,
  FlaskConical,
  Dna,

  // Files & uploads
  FileText,
  GraduationCap,
  Camera,
  Upload,
  Paperclip,

  // Actions
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Loader2,
  Copy,
  Plus,

  // Status
  CheckCircle2,
  AlertCircle,
  Info,
  Clock,
  XCircle,
  ShieldCheck,
  Shield,
  Sparkles,
  Briefcase,
  ClipboardList,
  ClipboardCheck,
  Building,
  Award,
  Hospital,
  AlertTriangle,
  Send,
  LogIn,
  HeartPulse,
  Bell,
  Beaker,
} from 'lucide-react';

import Navbar from '../components/common/Navbar';
import { authAPI } from '../services/api';
import {
  calculateAge,
  getTodayDate,
  validateSyrianPhone,
  validateNationalId,
} from '../utils/ageCalculator';
import LoadingSpinner from '../components/LoadingSpinner';
import WeeklyScheduleEditor, { createDefaultScheduleTemplate } from '../components/WeeklyScheduleEditor';
import '../styles/SignUp.css';


/* ═══════════════════════════════════════════════════════════════════════
   CONSTANTS — module-scoped (stable references, not recreated on render)
   All enum values mirror patient360_db_final.js exactly.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Medical specializations — IDs match the doctors.specialization enum
 * in patient360_db_final.js. Each gets a Lucide icon for the card-based picker.
 */
const MEDICAL_SPECIALIZATIONS = [
  { id: 'cardiology',         nameAr: 'طب القلب',           Icon: Heart,        hasECG: true  },
  { id: 'pulmonology',        nameAr: 'أمراض الرئة',         Icon: Wind,         hasECG: false },
  { id: 'general_practice',   nameAr: 'طب عام',              Icon: StethIcon,    hasECG: false },
  { id: 'rheumatology',       nameAr: 'الروماتيزم',          Icon: Bone,         hasECG: false },
  { id: 'orthopedics',        nameAr: 'جراحة العظام',        Icon: Bone,         hasECG: false },
  { id: 'neurology',          nameAr: 'طب الأعصاب',          Icon: Brain,        hasECG: false },
  { id: 'endocrinology',      nameAr: 'الغدد الصماء',        Icon: TestTube,     hasECG: false },
  { id: 'dermatology',        nameAr: 'الجلدية',             Icon: Sparkles,     hasECG: false },
  { id: 'gastroenterology',   nameAr: 'الجهاز الهضمي',       Icon: Activity,     hasECG: false },
  { id: 'surgery',            nameAr: 'الجراحة العامة',       Icon: Scissors,     hasECG: false },
  { id: 'urology',            nameAr: 'المسالك البولية',     Icon: Droplet,      hasECG: false },
  { id: 'gynecology',         nameAr: 'النساء والتوليد',     Icon: Baby,         hasECG: false },
  { id: 'psychiatry',         nameAr: 'الطب النفسي',         Icon: Brain,        hasECG: false },
  { id: 'hematology',         nameAr: 'أمراض الدم',          Icon: Droplet,      hasECG: false },
  { id: 'oncology',           nameAr: 'الأورام',             Icon: Microscope,   hasECG: false },
  { id: 'otolaryngology',     nameAr: 'أنف أذن حنجرة',       Icon: Activity,     hasECG: false },
  { id: 'ophthalmology',      nameAr: 'طب العيون',           Icon: Eye,          hasECG: false },
  { id: 'pediatrics',         nameAr: 'طب الأطفال',          Icon: Baby,         hasECG: false },
  { id: 'nephrology',         nameAr: 'طب الكلى',            Icon: Droplet,      hasECG: false },
  { id: 'internal_medicine',  nameAr: 'الطب الباطني',        Icon: Hospital,     hasECG: false },
  { id: 'emergency_medicine', nameAr: 'طب الطوارئ',          Icon: HeartPulse,   hasECG: false },
  { id: 'vascular_surgery',   nameAr: 'جراحة الأوعية',       Icon: HeartPulse,   hasECG: false },
  { id: 'anesthesiology',     nameAr: 'التخدير',             Icon: Syringe,      hasECG: false },
  { id: 'radiology',          nameAr: 'الأشعة',              Icon: ScanLine,     hasECG: false },
];

/**
 * Pharmacist specializations — matches pharmacists.specialization enum
 * in patient360_db_final.js.
 */
const PHARMACIST_SPECIALIZATIONS = [
  { id: 'Clinical Pharmacy',   nameAr: 'صيدلة سريرية',        Icon: Stethoscope, description: 'العمل ضمن فريق طبي في العيادات والمستشفيات' },
  { id: 'Hospital Pharmacy',   nameAr: 'صيدلة مستشفيات',      Icon: Hospital,    description: 'إدارة الأدوية داخل المستشفيات' },
  { id: 'Community Pharmacy',  nameAr: 'صيدلية مجتمعية',      Icon: Building,    description: 'الصيدليات العامة وخدمة المرضى مباشرة' },
  { id: 'Industrial Pharmacy', nameAr: 'صيدلة صناعية',        Icon: FlaskConical,description: 'تصنيع وتطوير الأدوية' },
  { id: 'Pharmacology',        nameAr: 'علم الأدوية',         Icon: Dna,         description: 'البحث العلمي وآلية عمل الأدوية' },
];

/**
 * Pharmacist degrees — matches pharmacists.degree enum.
 */
const PHARMACIST_DEGREES = [
  { id: 'PharmD',        nameAr: 'دكتور صيدلة',             hint: 'Doctor of Pharmacy' },
  { id: 'BSc Pharmacy',  nameAr: 'بكالوريوس صيدلة',         hint: 'Bachelor of Science' },
  { id: 'MSc Pharmacy',  nameAr: 'ماجستير صيدلة',           hint: 'Master of Science' },
];

/**
 * Lab technician specializations — matches lab_technicians.specialization enum.
 */
const LAB_TECH_SPECIALIZATIONS = [
  { id: 'Clinical Chemistry', nameAr: 'الكيمياء السريرية',    Icon: TestTubes,    description: 'تحاليل الكيمياء الحيوية والأيضية' },
  { id: 'Hematology',         nameAr: 'علم الدم',             Icon: Droplet,      description: 'تحاليل الدم وأمراضه' },
  { id: 'Microbiology',       nameAr: 'علم الأحياء الدقيقة',  Icon: Microscope,   description: 'تحاليل البكتيريا والفيروسات' },
  { id: 'Immunology',         nameAr: 'علم المناعة',          Icon: ShieldCheck,  description: 'تحاليل الجهاز المناعي' },
  { id: 'Molecular Biology',  nameAr: 'البيولوجيا الجزيئية',  Icon: Dna,          description: 'تحاليل PCR والحمض النووي' },
  { id: 'Histopathology',     nameAr: 'علم الأنسجة المرضية',  Icon: Beaker,       description: 'فحص العينات النسيجية' },
];

/**
 * Lab technician degrees — matches lab_technicians.degree enum.
 */
const LAB_TECH_DEGREES = [
  { id: 'Diploma',                    nameAr: 'دبلوم',                          hint: 'معهد فني' },
  { id: 'BSc Medical Laboratory',     nameAr: 'بكالوريوس مختبرات طبية',         hint: 'Bachelor' },
  { id: 'MSc Medical Laboratory',     nameAr: 'ماجستير مختبرات طبية',           hint: 'Master' },
];

/**
 * Lab technician positions — matches lab_technicians.position enum.
 */
const LAB_TECH_POSITIONS = [
  { id: 'senior_technician', nameAr: 'فني مختبر أول' },
  { id: 'technician',        nameAr: 'فني مختبر' },
  { id: 'assistant',         nameAr: 'مساعد فني' },
];

/**
 * Employment types — shared between pharmacists.employmentType (includes
 * 'shift-based' per DB) and doctors.employmentType. We expose all four here
 * and let the UI context decide which to show.
 */
const PHARMACIST_EMPLOYMENT_TYPES = [
  { id: 'full-time',   nameAr: 'دوام كامل' },
  { id: 'part-time',   nameAr: 'دوام جزئي' },
  { id: 'shift-based', nameAr: 'بنظام الورديات' },
];

/**
 * Syrian governorates — matches the governorate enum in persons, children,
 * doctor_requests, hospitals, pharmacies, laboratories collections.
 */
const SYRIAN_GOVERNORATES = [
  { id: 'damascus',     nameAr: 'دمشق' },
  { id: 'rif_dimashq',  nameAr: 'ريف دمشق' },
  { id: 'aleppo',       nameAr: 'حلب' },
  { id: 'homs',         nameAr: 'حمص' },
  { id: 'hama',         nameAr: 'حماة' },
  { id: 'latakia',      nameAr: 'اللاذقية' },
  { id: 'tartus',       nameAr: 'طرطوس' },
  { id: 'idlib',        nameAr: 'إدلب' },
  { id: 'deir_ez_zor',  nameAr: 'دير الزور' },
  { id: 'hasakah',      nameAr: 'الحسكة' },
  { id: 'raqqa',        nameAr: 'الرقة' },
  { id: 'daraa',        nameAr: 'درعا' },
  { id: 'as_suwayda',   nameAr: 'السويداء' },
  { id: 'quneitra',     nameAr: 'القنيطرة' },
];

const WEEKDAYS = [
  { id: 'Sunday',    nameAr: 'الأحد' },
  { id: 'Monday',    nameAr: 'الإثنين' },
  { id: 'Tuesday',   nameAr: 'الثلاثاء' },
  { id: 'Wednesday', nameAr: 'الأربعاء' },
  { id: 'Thursday',  nameAr: 'الخميس' },
  { id: 'Friday',    nameAr: 'الجمعة' },
  { id: 'Saturday',  nameAr: 'السبت' },
];

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const SMOKING_STATUSES = [
  { value: 'non-smoker',      label: 'غير مدخن' },
  { value: 'former_smoker',   label: 'مدخن سابق' },
  { value: 'current_smoker',  label: 'مدخن حالي' },
];

/** Step counts per flow (all professional flows use the same 4-step structure). */
const PATIENT_TOTAL_STEPS       = 4;
const DOCTOR_TOTAL_STEPS        = 4;
const PHARMACIST_TOTAL_STEPS    = 4;
const LAB_TECH_TOTAL_STEPS      = 4;

/** Accepted mime/extensions for uploaded documents. */
const DOC_ACCEPT   = '.pdf,.jpg,.jpeg,.png';
const IMAGE_ACCEPT = '.jpg,.jpeg,.png';
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB


/* ═══════════════════════════════════════════════════════════════════════
   VALIDATION HELPERS — pure functions
   ═══════════════════════════════════════════════════════════════════════ */

const isValidEmail = (email) =>
  /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);

const isValidName = (name) =>
  /^[a-zA-Z\u0600-\u06FF\s]+$/.test(name);

const isDateInPast = (dateString) => {
  if (!dateString) return false;
  const selected = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return selected < today;
};

/**
 * Password strength evaluator — returns granular requirement booleans
 * plus an overall score (0-4) for the strength meter.
 */
const evaluatePassword = (password) => {
  const minLength  = password.length >= 8;
  const hasUpper   = /[A-Z]/.test(password);
  const hasLower   = /[a-z]/.test(password);
  const hasNumber  = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*]/.test(password);

  const requirements = [minLength, hasUpper, hasNumber, hasSpecial];
  const score = requirements.filter(Boolean).length;

  return {
    minLength, hasUpper, hasLower, hasNumber, hasSpecial,
    score,
    isValid: minLength && hasUpper && hasNumber && hasSpecial,
  };
};

const STRENGTH_LABELS = {
  0: { label: 'ضعيفة جداً',  className: 'weak' },
  1: { label: 'ضعيفة',       className: 'weak' },
  2: { label: 'متوسطة',      className: 'medium' },
  3: { label: 'قوية',        className: 'strong' },
  4: { label: 'ممتازة',      className: 'excellent' },
};

/**
 * Debounce helper for the FacilityAutocomplete search. Pure module-level
 * helper so it doesn't get re-created on every render.
 */
const debounce = (fn, ms = 300) => {
  let handle;
  const debounced = (...args) => {
    clearTimeout(handle);
    handle = setTimeout(() => fn(...args), ms);
  };
  debounced.cancel = () => clearTimeout(handle);
  return debounced;
};

/* ═══════════════════════════════════════════════════════════════════════
   REUSABLE PRESENTATIONAL COMPONENTS
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Modal — generic alert modal with bouncing icon and pulse ring.
 * Used for success/error/info messages throughout the signup flow.
 */
const Modal = ({ isOpen, type, title, message, onClose, buttonLabel = 'حسناً' }) => {
  // Lock body scroll while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, [isOpen]);

  // ESC key closes modal
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const IconComponent = type === 'success' ? CheckCircle2
                      : type === 'error'   ? XCircle
                      :                       Info;

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-icon-wrapper">
            <div className={`modal-icon ${type}`}>
              <IconComponent size={40} strokeWidth={2} />
            </div>
            <div className={`modal-icon-pulse ${type}`} />
          </div>
          <h2 className="modal-title">{title}</h2>
        </div>
        <div className="modal-body">
          <p className="modal-message">{message}</p>
        </div>
        <div className="modal-footer">
          <button type="button" className="modal-button" onClick={onClose} autoFocus>
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * PasswordStrengthMeter — visual 4-bar meter + checklist of requirements.
 */
const PasswordStrengthMeter = ({ password }) => {
  if (!password) return null;
  const v = evaluatePassword(password);
  const strength = STRENGTH_LABELS[v.score];

  return (
    <div className="password-strength">
      <div className="strength-header">
        <span className="strength-label">قوة كلمة المرور</span>
        <span className={`strength-score ${strength.className}`}>{strength.label}</span>
      </div>
      <div className="strength-bars">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`strength-bar ${i < v.score ? `active ${strength.className}` : ''}`}
          />
        ))}
      </div>
      <div className="strength-checklist">
        <span className={v.minLength ? 'valid' : ''}>
          {v.minLength ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={2.5} />}
          8 أحرف على الأقل
        </span>
        <span className={v.hasUpper ? 'valid' : ''}>
          {v.hasUpper ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={2.5} />}
          حرف كبير (A-Z)
        </span>
        <span className={v.hasNumber ? 'valid' : ''}>
          {v.hasNumber ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={2.5} />}
          رقم (0-9)
        </span>
        <span className={v.hasSpecial ? 'valid' : ''}>
          {v.hasSpecial ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={2.5} />}
          رمز خاص (!@#$%)
        </span>
      </div>
    </div>
  );
};

/**
 * FileUploadField — modern drop-zone style upload with success state
 * and remove button. Replaces the old "click to upload" plain box.
 */
const FileUploadField = ({
  id,
  label,
  hint,
  required,
  accept,
  Icon,
  file,
  error,
  onFileChange,
  onFileRemove,
}) => {
  const inputRef = useRef(null);

  const handleChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) onFileChange(selected);
  };

  const handleRemove = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (inputRef.current) inputRef.current.value = '';
    onFileRemove();
  };

  return (
    <div className="form-group">
      <label className="form-label">
        {label}
        {required && <span className="required-mark">*</span>}
      </label>
      <div className="file-upload-box">
        <input
          ref={inputRef}
          type="file"
          id={id}
          accept={accept}
          onChange={handleChange}
          className="file-input"
          aria-label={label}
        />
        <label
          htmlFor={id}
          className={`file-upload-label ${error ? 'error' : ''} ${file ? 'has-file' : ''}`}
        >
          <div className="upload-icon">
            {file ? <Check size={22} strokeWidth={2.5} /> : <Icon size={22} strokeWidth={2} />}
          </div>
          <div className="upload-content">
            <span className="upload-title">
              {file ? 'تم رفع الملف' : 'اضغط لاختيار ملف'}
            </span>
            <span className="upload-subtitle">
              {file ? file.name : (hint || 'PDF, JPG, PNG حتى 5MB')}
            </span>
          </div>
          {file && (
            <button
              type="button"
              className="file-remove-btn"
              onClick={handleRemove}
              aria-label="إزالة الملف"
            >
              <X size={16} strokeWidth={2.5} />
            </button>
          )}
        </label>
      </div>
      {error && (
        <span className="error-message">
          <AlertCircle size={14} strokeWidth={2.2} />
          {error}
        </span>
      )}
    </div>
  );
};


/**
 * FacilityAutocomplete — searchable pharmacy/laboratory picker with a
 * "register new facility" fallback. This drives a valid ObjectId reference
 * to pharmacies._id / laboratories._id (per patient360_db_final.js) OR
 * produces a payload the admin can use to create a new facility on approval.
 *
 * Integration contract:
 *  • `searchFn(query)` must return Promise<Array<{
 *       _id, name, arabicName?, governorate?, city?, address?
 *    }>>. It should be a debounced API hit against:
 *       GET /api/pharmacies/search?q={query}
 *       GET /api/laboratories/search?q={query}
 *  • Selection state is controlled — `value` and `newFacility` come in from
 *    the parent, and changes bubble up via `onSelect(doc|null)` and
 *    `onNewFacilityChange(data|null)`.
 *
 * UX states (mutually exclusive):
 *   (A) No selection    → user types → dropdown shows matches
 *   (B) Existing chosen → compact card with "change" button
 *   (C) New facility    → inline mini-form (name, license, governorate, city, address)
 *                         plus "back to search" button
 */
const FacilityAutocomplete = ({
  label,
  placeholder,
  searchFn,
  value,                 // { _id, name, ... } — existing selection, or null
  newFacility,           // { name, license, governorate, city, address } — new, or null
  onSelect,              // (doc|null) => void
  onNewFacilityChange,   // (data|null) => void
  error,
  facilityType,          // 'pharmacy' | 'laboratory' — controls Arabic copy + license label
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [hasQueried, setHasQueried] = useState(false);
  const wrapperRef = useRef(null);

  // Arabic copy varies by facility type
  const copy = facilityType === 'pharmacy'
    ? {
        licenseLabel:     'رقم ترخيص الصيدلية',
        licensePlaceholder: 'رقم الترخيص من نقابة الصيادلة',
        emptyResult:      'لم يتم العثور على صيدليات مطابقة',
        newTitle:         'تسجيل صيدلية جديدة',
        newDescription:   'سيتم مراجعة بيانات الصيدلية من قبل الإدارة',
      }
    : {
        licenseLabel:     'رقم ترخيص المختبر',
        licensePlaceholder: 'رقم الترخيص من وزارة الصحة',
        emptyResult:      'لم يتم العثور على مختبرات مطابقة',
        newTitle:         'تسجيل مختبر جديد',
        newDescription:   'سيتم مراجعة بيانات المختبر من قبل الإدارة',
      };

  /* ---- Debounced search ---- */
  const runSearch = useMemo(
    () => debounce(async (q) => {
      if (!q || q.trim().length < 2) {
        setResults([]);
        setIsLoading(false);
        setHasQueried(false);
        return;
      }
      setIsLoading(true);
      try {
        const data = await searchFn(q.trim());
        setResults(Array.isArray(data) ? data : []);
        setHasQueried(true);
      } catch (err) {
        console.error('[FacilityAutocomplete] search error:', err);
        setResults([]);
        setHasQueried(true);
      } finally {
        setIsLoading(false);
      }
    }, 350),
    [searchFn]
  );

  useEffect(() => () => runSearch.cancel(), [runSearch]);

  /* ---- Close dropdown on outside click ---- */
  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleQueryChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    setIsOpen(true);
    runSearch(q);
  };

  const handlePickExisting = (doc) => {
    onSelect(doc);
    onNewFacilityChange(null);
    setQuery('');
    setIsOpen(false);
  };

  const handleClearExisting = () => {
    onSelect(null);
    setQuery('');
    setResults([]);
    setHasQueried(false);
  };

  const handleStartNew = () => {
    onSelect(null);
    onNewFacilityChange({
      name: query.trim(),
      license: '',
      governorate: '',
      city: '',
      address: '',
    });
    setIsOpen(false);
  };

  const handleNewFieldChange = (field, val) => {
    onNewFacilityChange({ ...newFacility, [field]: val });
  };

  const handleCancelNew = () => {
    onNewFacilityChange(null);
  };

  /* ---- STATE B: Existing facility selected ---- */
  if (value && value._id) {
    return (
      <div className="form-group">
        <label className="form-label">
          {label} <span className="required-mark">*</span>
        </label>
        <div className="facility-selected-card">
          <div className="facility-selected-icon">
            {facilityType === 'pharmacy'
              ? <Pill size={22} strokeWidth={2} />
              : <Microscope size={22} strokeWidth={2} />}
          </div>
          <div className="facility-selected-info">
            <span className="facility-selected-name">
              {value.arabicName || value.name}
            </span>
            <span className="facility-selected-address">
              <MapPin size={12} strokeWidth={2.2} />
              {[
                SYRIAN_GOVERNORATES.find((g) => g.id === value.governorate)?.nameAr,
                value.city,
                value.address,
              ].filter(Boolean).join(' — ')}
            </span>
          </div>
          <button
            type="button"
            className="facility-selected-change"
            onClick={handleClearExisting}
            aria-label="تغيير المؤسسة"
          >
            <X size={14} strokeWidth={2.5} />
            <span>تغيير</span>
          </button>
        </div>
      </div>
    );
  }

  /* ---- STATE C: New facility form ---- */
  if (newFacility) {
    return (
      <div className="form-group">
        <label className="form-label">
          {label} <span className="required-mark">*</span>
        </label>
        <div className="new-facility-form">
          <div className="new-facility-header">
            <div className="new-facility-header-icon">
              <Plus size={18} strokeWidth={2.2} />
            </div>
            <div className="new-facility-header-text">
              <strong>{copy.newTitle}</strong>
              <span>{copy.newDescription}</span>
            </div>
            <button
              type="button"
              className="new-facility-cancel"
              onClick={handleCancelNew}
              aria-label="إلغاء"
            >
              <X size={16} strokeWidth={2.5} />
            </button>
          </div>

          <div className="new-facility-fields">
            <div className="form-group">
              <label className="form-label" htmlFor="nf-name">
                {facilityType === 'pharmacy' ? 'اسم الصيدلية' : 'اسم المختبر'}
                <span className="required-mark">*</span>
              </label>
              <div className="form-input-wrapper">
                <span className="form-input-icon" aria-hidden="true">
                  <Building size={18} strokeWidth={2} />
                </span>
                <input
                  id="nf-name"
                  type="text"
                  className="form-input"
                  value={newFacility.name}
                  onChange={(e) => handleNewFieldChange('name', e.target.value)}
                  placeholder={facilityType === 'pharmacy' ? 'مثال: صيدلية الشفاء' : 'مثال: مختبر الحياة'}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="nf-license">
                {copy.licenseLabel} <span className="required-mark">*</span>
              </label>
              <div className="form-input-wrapper">
                <span className="form-input-icon" aria-hidden="true">
                  <Award size={18} strokeWidth={2} />
                </span>
                <input
                  id="nf-license"
                  type="text"
                  className="form-input"
                  value={newFacility.license}
                  onChange={(e) => handleNewFieldChange('license', e.target.value)}
                  placeholder={copy.licensePlaceholder}
                  dir="ltr"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="nf-gov">
                  المحافظة <span className="required-mark">*</span>
                </label>
                <select
                  id="nf-gov"
                  className="form-input"
                  value={newFacility.governorate}
                  onChange={(e) => handleNewFieldChange('governorate', e.target.value)}
                >
                  <option value="">اختر المحافظة</option>
                  {SYRIAN_GOVERNORATES.map((g) => (
                    <option key={g.id} value={g.id}>{g.nameAr}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="nf-city">
                  المدينة <span className="required-mark">*</span>
                </label>
                <div className="form-input-wrapper">
                  <span className="form-input-icon" aria-hidden="true">
                    <MapPin size={18} strokeWidth={2} />
                  </span>
                  <input
                    id="nf-city"
                    type="text"
                    className="form-input"
                    value={newFacility.city}
                    onChange={(e) => handleNewFieldChange('city', e.target.value)}
                    placeholder="مثال: دمشق"
                  />
                </div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="nf-address">
                العنوان التفصيلي <span className="required-mark">*</span>
              </label>
              <div className="form-input-wrapper">
                <span className="form-input-icon" aria-hidden="true">
                  <Building size={18} strokeWidth={2} />
                </span>
                <input
                  id="nf-address"
                  type="text"
                  className="form-input"
                  value={newFacility.address}
                  onChange={(e) => handleNewFieldChange('address', e.target.value)}
                  placeholder="الحي، الشارع، رقم البناء"
                />
              </div>
            </div>
          </div>
        </div>

        {error && (
          <span className="error-message">
            <AlertCircle size={14} strokeWidth={2.2} />
            {error}
          </span>
        )}
      </div>
    );
  }

  /* ---- STATE A: Search mode (default) ---- */
  return (
    <div className="form-group" ref={wrapperRef}>
      <label className="form-label">
        {label} <span className="required-mark">*</span>
      </label>

      <div className={`facility-autocomplete ${isOpen ? 'open' : ''}`}>
        <div className="form-input-wrapper">
          <span className="form-input-icon" aria-hidden="true">
            <Search size={18} strokeWidth={2} />
          </span>
          <input
            type="text"
            className={`form-input ${error ? 'error' : ''}`}
            placeholder={placeholder}
            value={query}
            onChange={handleQueryChange}
            onFocus={() => setIsOpen(true)}
            autoComplete="off"
          />
          {isLoading && (
            <span className="facility-loading" aria-hidden="true">
              <Loader2 size={16} className="btn-spin" strokeWidth={2.2} />
            </span>
          )}
        </div>

        {isOpen && (
          <div className="facility-dropdown" role="listbox">
            {!query || query.trim().length < 2 ? (
              <div className="facility-dropdown-hint">
                <Info size={14} strokeWidth={2.2} />
                <span>اكتب حرفين على الأقل للبحث</span>
              </div>
            ) : isLoading ? (
              <div className="facility-dropdown-loading">
                <Loader2 size={16} className="btn-spin" strokeWidth={2.2} />
                <span>جاري البحث...</span>
              </div>
            ) : results.length === 0 && hasQueried ? (
              <div className="facility-dropdown-empty">
                <div className="facility-empty-icon">
                  <Search size={22} strokeWidth={1.8} />
                </div>
                <p className="facility-empty-title">{copy.emptyResult}</p>
                <p className="facility-empty-sub">
                  لم نجد نتائج لـ "<strong>{query}</strong>"
                </p>
                <button
                  type="button"
                  className="facility-register-btn"
                  onClick={handleStartNew}
                >
                  <Plus size={16} strokeWidth={2.5} />
                  <span>{copy.newTitle}</span>
                </button>
              </div>
            ) : (
              <>
                <div className="facility-dropdown-list">
                  {results.map((doc) => (
                    <button
                      key={doc._id}
                      type="button"
                      className="facility-dropdown-item"
                      onClick={() => handlePickExisting(doc)}
                      role="option"
                    >
                      <div className="facility-item-icon">
                        {facilityType === 'pharmacy'
                          ? <Pill size={18} strokeWidth={2} />
                          : <Microscope size={18} strokeWidth={2} />}
                      </div>
                      <div className="facility-item-info">
                        <span className="facility-item-name">
                          {doc.arabicName || doc.name}
                        </span>
                        <span className="facility-item-address">
                          <MapPin size={11} strokeWidth={2.2} />
                          {[
                            SYRIAN_GOVERNORATES.find((g) => g.id === doc.governorate)?.nameAr,
                            doc.city,
                          ].filter(Boolean).join(' — ')}
                        </span>
                      </div>
                      <ChevronLeft size={16} strokeWidth={2.2} className="facility-item-chevron" />
                    </button>
                  ))}
                </div>
                <div className="facility-dropdown-footer">
                  <span>لم تجد {facilityType === 'pharmacy' ? 'الصيدلية' : 'المختبر'}؟</span>
                  <button
                    type="button"
                    className="facility-register-link"
                    onClick={handleStartNew}
                  >
                    <Plus size={14} strokeWidth={2.5} />
                    <span>تسجيل {facilityType === 'pharmacy' ? 'صيدلية' : 'مختبر'} جديد</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {error && (
        <span className="error-message">
          <AlertCircle size={14} strokeWidth={2.2} />
          {error}
        </span>
      )}
      <span className="form-hint">
        <Info size={12} strokeWidth={2.2} />
        ابحث عن {facilityType === 'pharmacy' ? 'صيدليتك' : 'مختبرك'} بالاسم، أو سجّل {facilityType === 'pharmacy' ? 'صيدلية' : 'مختبراً'} جديداً إذا لم تكن مسجلة
      </span>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT — SignUp
   ═══════════════════════════════════════════════════════════════════════ */

const SignUp = () => {
  const navigate = useNavigate();

  /* ─────────────────────────────────────────────────────────────────
     STATE — FLOW CONTROL
     ─────────────────────────────────────────────────────────────────
     Two-stage role selection:
       Stage 1: userType           → 'patient' | 'professional' | null
       Stage 2: professionalType   → 'doctor' | 'pharmacist' | 'lab_technician' | null
                                     (only meaningful when userType === 'professional')
     ───────────────────────────────────────────────────────────────── */

  const [userType, setUserType] = useState(null);
  const [professionalType, setProfessionalType] = useState(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Patient age detection (drives the children/persons branching)
  const [age, setAge] = useState(0);
  const [isMinor, setIsMinor] = useState(false);

  // Modal state
  const [modal, setModal] = useState({
    isOpen: false, type: '', title: '', message: '', onClose: null,
  });

  // Professional request status (after submission) — type-agnostic
  const [requestStatus, setRequestStatus] = useState(null);
  const [requestId, setRequestId] = useState(null);
  const [submittedRequestType, setSubmittedRequestType] = useState(null); // for success screen copy

  // Existing request lookup result (from "check status" feature)
  const [existingRequest, setExistingRequest] = useState(null);

  // Status check modal
  const [statusCheckModal, setStatusCheckModal] = useState({
    isOpen: false, email: '', isLoading: false, error: '',
  });

  // Password visibility toggles (one per form flow)
  const [showPatientPassword, setShowPatientPassword] = useState(false);
  const [showPatientConfirm, setShowPatientConfirm] = useState(false);
  const [showDoctorPassword, setShowDoctorPassword] = useState(false);
  const [showDoctorConfirm, setShowDoctorConfirm] = useState(false);
  const [showPharmPassword, setShowPharmPassword] = useState(false);
  const [showPharmConfirm, setShowPharmConfirm] = useState(false);
  const [showLabPassword, setShowLabPassword] = useState(false);
  const [showLabConfirm, setShowLabConfirm] = useState(false);

  // Specialization picker search (doctor form)
  const [specSearch, setSpecSearch] = useState('');

  /* ─────────────────────────────────────────────────────────────────
     STATE — PATIENT FORM DATA
     ───────────────────────────────────────────────────────────────── */

  const [patientFormData, setPatientFormData] = useState({
    nationalId: '',
    parentNationalId: '',
    firstName: '',
    fatherName: '',
    lastName: '',
    motherName: '',
    dateOfBirth: '',
    gender: '',
    phoneNumber: '',
    governorate: '',
    city: '',
    address: '',
    email: '',
    password: '',
    confirmPassword: '',
    bloodType: '',
    height: '',
    weight: '',
    smokingStatus: '',
    allergies: '',
    chronicDiseases: '',
    familyHistory: '',
    emergencyContactName: '',
    emergencyContactRelationship: '',
    emergencyContactPhone: '',
  });

  /* ─────────────────────────────────────────────────────────────────
     STATE — DOCTOR FORM DATA
     ───────────────────────────────────────────────────────────────── */

  const [doctorFormData, setDoctorFormData] = useState({
    firstName: '', fatherName: '', lastName: '', motherName: '',
    nationalId: '', dateOfBirth: '', gender: 'male',
    phoneNumber: '', email: '',
    password: '', confirmPassword: '',
    address: '', governorate: '', city: '',
    medicalLicenseNumber: '',
    specialization: '',
    subSpecialization: '',
    yearsOfExperience: '',
    hospitalAffiliation: '',
    availableDays: [],
    // ── Calendly-style weekly schedule (v2) ──────────────────────────────
    // Source of truth for the doctor's working hours. The backend uses this
    // to auto-generate availability_slots on admin approval. The legacy
    // `availableDays` array above is kept in sync (derived from this
    // template's weeklyPattern keys) for backward compatibility.
    scheduleTemplate: createDefaultScheduleTemplate(),
    consultationFee: '',
    licenseDocument: null,
    medicalCertificate: null,
    profilePhoto: null,
    additionalNotes: '',
  });

  /* ─────────────────────────────────────────────────────────────────
     STATE — PHARMACIST FORM DATA
     Fields map 1:1 to pharmacists collection schema (see DB file):
       personId            → created by backend on approval
       pharmacyLicenseNumber (required)
       pharmacyId          → resolved from selectedPharmacy._id OR newPharmacy
       degree              → PharmD | BSc Pharmacy | MSc Pharmacy
       specialization      → Clinical Pharmacy | Hospital Pharmacy | ...
       yearsOfExperience   → int >= 0
       employmentType      → full-time | part-time | shift-based
     ───────────────────────────────────────────────────────────────── */

  const [pharmacistFormData, setPharmacistFormData] = useState({
    firstName: '', fatherName: '', lastName: '', motherName: '',
    nationalId: '', dateOfBirth: '', gender: 'male',
    phoneNumber: '', email: '',
    password: '', confirmPassword: '',
    address: '', governorate: '', city: '',

    pharmacyLicenseNumber: '',
    degree: '',
    specialization: '',
    yearsOfExperience: '',
    employmentType: 'full-time',

    // Facility linkage (one of these two is populated)
    selectedPharmacy: null,   // { _id, name, arabicName, governorate, city, address }
    newPharmacy: null,        // { name, license, governorate, city, address }

    licenseDocument: null,
    degreeDocument: null,
    profilePhoto: null,
    additionalNotes: '',
  });

  /* ─────────────────────────────────────────────────────────────────
     STATE — LAB TECHNICIAN FORM DATA
     Fields map 1:1 to lab_technicians collection schema:
       personId            → created by backend on approval
       licenseNumber       (required) — note: DB field is `licenseNumber`
       laboratoryId        → resolved from selectedLaboratory._id OR newLaboratory
       degree              → Diploma | BSc Medical Laboratory | MSc Medical Laboratory
       specialization      → Clinical Chemistry | Hematology | ...
       position            → senior_technician | technician | assistant
       yearsOfExperience   → int >= 0
     ───────────────────────────────────────────────────────────────── */

  const [labTechFormData, setLabTechFormData] = useState({
    firstName: '', fatherName: '', lastName: '', motherName: '',
    nationalId: '', dateOfBirth: '', gender: 'male',
    phoneNumber: '', email: '',
    password: '', confirmPassword: '',
    address: '', governorate: '', city: '',

    licenseNumber: '',
    degree: '',
    specialization: '',
    position: 'technician',
    yearsOfExperience: '',

    selectedLaboratory: null,
    newLaboratory: null,

    licenseDocument: null,
    degreeDocument: null,
    profilePhoto: null,
    additionalNotes: '',
  });

  const [errors, setErrors] = useState({});

  /* ─────────────────────────────────────────────────────────────────
     MEMOIZED LOOKUPS
     ───────────────────────────────────────────────────────────────── */

  const filteredSpecializations = useMemo(() => {
    if (!specSearch.trim()) return MEDICAL_SPECIALIZATIONS;
    const q = specSearch.trim().toLowerCase();
    return MEDICAL_SPECIALIZATIONS.filter((s) =>
      s.nameAr.toLowerCase().includes(q) || s.id.includes(q)
    );
  }, [specSearch]);

  const selectedSpecialization = useMemo(
    () => MEDICAL_SPECIALIZATIONS.find((s) => s.id === doctorFormData.specialization),
    [doctorFormData.specialization]
  );

  const selectedPharmSpecialization = useMemo(
    () => PHARMACIST_SPECIALIZATIONS.find((s) => s.id === pharmacistFormData.specialization),
    [pharmacistFormData.specialization]
  );

  const selectedLabSpecialization = useMemo(
    () => LAB_TECH_SPECIALIZATIONS.find((s) => s.id === labTechFormData.specialization),
    [labTechFormData.specialization]
  );

  /* ─────────────────────────────────────────────────────────────────
     MODAL HELPERS
     ───────────────────────────────────────────────────────────────── */

  const openModal = useCallback((type, title, message, onClose = null) => {
    setModal({ isOpen: true, type, title, message, onClose });
  }, []);

  const closeModal = useCallback(() => {
    if (modal.onClose) modal.onClose();
    setModal({ isOpen: false, type: '', title: '', message: '', onClose: null });
  }, [modal]);

  /* ─────────────────────────────────────────────────────────────────
     GENERIC FIELD-CHANGE HELPER
     Reused by every form to (a) update the target state and (b) clear
     any previous error for the field being edited.
     ───────────────────────────────────────────────────────────────── */

  const makeChangeHandler = useCallback((setFn) => (e) => {
    const { name, value } = e.target;
    setFn((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const handlePatientChange    = useMemo(() => makeChangeHandler(setPatientFormData), [makeChangeHandler]);
  const handleDoctorChange     = useMemo(() => makeChangeHandler(setDoctorFormData), [makeChangeHandler]);
  const handlePharmacistChange = useMemo(() => makeChangeHandler(setPharmacistFormData), [makeChangeHandler]);
  const handleLabTechChange    = useMemo(() => makeChangeHandler(setLabTechFormData), [makeChangeHandler]);

  const handleFileUpload = useCallback((fieldName, file) => {
    setDoctorFormData((prev) => ({ ...prev, [fieldName]: file }));
  }, []);

  const handleFileRemove = useCallback((fieldName) => {
    setDoctorFormData((prev) => ({ ...prev, [fieldName]: null }));
  }, []);

  /* ─────────────────────────────────────────────────────────────────
     PATIENT — date-of-birth handler (age branching)
     ───────────────────────────────────────────────────────────────── */

  const handlePatientDateOfBirthChange = useCallback((e) => {
    const dob = e.target.value;
    setPatientFormData((prev) => ({ ...prev, dateOfBirth: dob }));

    const calculatedAge = calculateAge(dob);
    setAge(calculatedAge);
    const minor = calculatedAge < 14;
    setIsMinor(minor);

    if (minor) {
      setPatientFormData((prev) => ({ ...prev, nationalId: '' }));
      setErrors((prev) => {
        if (!prev.nationalId) return prev;
        const next = { ...prev };
        delete next.nationalId;
        return next;
      });
    } else {
      setPatientFormData((prev) => ({ ...prev, parentNationalId: '' }));
      setErrors((prev) => {
        if (!prev.parentNationalId) return prev;
        const next = { ...prev };
        delete next.parentNationalId;
        return next;
      });
    }
  }, []);

  /* ─────────────────────────────────────────────────────────────────
     DOCTOR — specialization picker & weekday toggles
     ───────────────────────────────────────────────────────────────── */

  const handleSpecializationSelect = useCallback((specId) => {
    setDoctorFormData((prev) => ({ ...prev, specialization: specId }));
    setErrors((prev) => {
      if (!prev.specialization) return prev;
      const next = { ...prev };
      delete next.specialization;
      return next;
    });
  }, []);

  const handleDayToggle = useCallback((day) => {
    setDoctorFormData((prev) => ({
      ...prev,
      availableDays: prev.availableDays.includes(day)
        ? prev.availableDays.filter((d) => d !== day)
        : [...prev.availableDays, day],
    }));
    setErrors((prev) => {
      if (!prev.availableDays) return prev;
      const next = { ...prev };
      delete next.availableDays;
      return next;
    });
  }, []);

  /**
   * Handler for the WeeklyScheduleEditor component. Updates the structured
   * scheduleTemplate AND derives the legacy `availableDays` array from it
   * (any day with at least one period is considered "available").
   *
   * Also clears any related validation errors so the user sees immediate
   * feedback as they edit the schedule.
   */
  const handleScheduleTemplateChange = useCallback((nextTemplate) => {
    const WEEKDAY_IDS = [
      'Sunday', 'Monday', 'Tuesday', 'Wednesday',
      'Thursday', 'Friday', 'Saturday',
    ];
    const derivedDays = WEEKDAY_IDS.filter((day) => {
      const periods = nextTemplate?.weeklyPattern?.[day];
      return Array.isArray(periods) && periods.length > 0;
    });

    setDoctorFormData((prev) => ({
      ...prev,
      scheduleTemplate: nextTemplate,
      availableDays: derivedDays,
    }));

    setErrors((prev) => {
      if (!prev.scheduleTemplate && !prev.availableDays) return prev;
      const next = { ...prev };
      delete next.scheduleTemplate;
      delete next.availableDays;
      return next;
    });
  }, []);

  /* ─────────────────────────────────────────────────────────────────
     PHARMACIST — specialization / degree / employment selectors
     ───────────────────────────────────────────────────────────────── */

  const handlePharmSpecSelect = useCallback((specId) => {
    setPharmacistFormData((prev) => ({ ...prev, specialization: specId }));
    setErrors((prev) => {
      if (!prev.specialization) return prev;
      const next = { ...prev };
      delete next.specialization;
      return next;
    });
  }, []);

  const handlePharmacySelect = useCallback((doc) => {
    setPharmacistFormData((prev) => ({
      ...prev,
      selectedPharmacy: doc,
      newPharmacy: doc ? null : prev.newPharmacy,
    }));
    setErrors((prev) => {
      if (!prev.pharmacy) return prev;
      const next = { ...prev };
      delete next.pharmacy;
      return next;
    });
  }, []);

  const handleNewPharmacyChange = useCallback((data) => {
    setPharmacistFormData((prev) => ({ ...prev, newPharmacy: data }));
    setErrors((prev) => {
      if (!prev.pharmacy) return prev;
      const next = { ...prev };
      delete next.pharmacy;
      return next;
    });
  }, []);

  /* ─────────────────────────────────────────────────────────────────
     LAB TECH — specialization / degree / position selectors
     ───────────────────────────────────────────────────────────────── */

  const handleLabSpecSelect = useCallback((specId) => {
    setLabTechFormData((prev) => ({ ...prev, specialization: specId }));
    setErrors((prev) => {
      if (!prev.specialization) return prev;
      const next = { ...prev };
      delete next.specialization;
      return next;
    });
  }, []);

  const handleLaboratorySelect = useCallback((doc) => {
    setLabTechFormData((prev) => ({
      ...prev,
      selectedLaboratory: doc,
      newLaboratory: doc ? null : prev.newLaboratory,
    }));
    setErrors((prev) => {
      if (!prev.laboratory) return prev;
      const next = { ...prev };
      delete next.laboratory;
      return next;
    });
  }, []);

  const handleNewLaboratoryChange = useCallback((data) => {
    setLabTechFormData((prev) => ({ ...prev, newLaboratory: data }));
    setErrors((prev) => {
      if (!prev.laboratory) return prev;
      const next = { ...prev };
      delete next.laboratory;
      return next;
    });
  }, []);


  /* ─────────────────────────────────────────────────────────────────
     FILE UPLOAD HELPERS — factory makes one set of handlers per form
     ───────────────────────────────────────────────────────────────── */

     
  const makeFileHandlers = useCallback((setFn) => {
    const upload = (fieldName, file) => {
      if (file.size > MAX_FILE_BYTES) {
        openModal('error', 'حجم الملف كبير', 'حجم الملف يجب أن لا يتجاوز 5 ميجابايت');
        return;
      }
      setFn((prev) => ({ ...prev, [fieldName]: file }));
      setErrors((prev) => {
        if (!prev[fieldName]) return prev;
        const next = { ...prev };
        delete next[fieldName];
        return next;
      });
    };
    const remove = (fieldName) => {
      setFn((prev) => ({ ...prev, [fieldName]: null }));
    };
    return { upload, remove };
  }, [openModal]);

  const doctorFiles     = useMemo(() => makeFileHandlers(setDoctorFormData), [makeFileHandlers]);
  const pharmacistFiles = useMemo(() => makeFileHandlers(setPharmacistFormData), [makeFileHandlers]);
  const labTechFiles    = useMemo(() => makeFileHandlers(setLabTechFormData), [makeFileHandlers]);

  /* ─────────────────────────────────────────────────────────────────
     PATIENT VALIDATION — per-step
     ───────────────────────────────────────────────────────────────── */

  const validatePatientStep = useCallback(() => {
    const e = {};

    if (currentStep === 1) {
      if (!patientFormData.firstName.trim()) e.firstName = 'الاسم الأول مطلوب';
      else if (patientFormData.firstName.trim().length < 2) e.firstName = 'الاسم الأول يجب أن يكون حرفين على الأقل';
      else if (!isValidName(patientFormData.firstName)) e.firstName = 'الاسم يجب أن يحتوي على أحرف فقط';

      if (!patientFormData.fatherName.trim()) e.fatherName = 'اسم الأب مطلوب';
      else if (patientFormData.fatherName.trim().length < 2) e.fatherName = 'اسم الأب يجب أن يكون حرفين على الأقل';
      else if (!isValidName(patientFormData.fatherName)) e.fatherName = 'الاسم يجب أن يحتوي على أحرف فقط';

      if (!patientFormData.lastName.trim()) e.lastName = 'اسم العائلة مطلوب';
      else if (patientFormData.lastName.trim().length < 2) e.lastName = 'اسم العائلة يجب أن يكون حرفين على الأقل';
      else if (!isValidName(patientFormData.lastName)) e.lastName = 'الاسم يجب أن يحتوي على أحرف فقط';

      if (!patientFormData.motherName.trim()) e.motherName = 'اسم الأم مطلوب';
      else if (patientFormData.motherName.trim().length < 2) e.motherName = 'اسم الأم يجب أن يكون حرفين على الأقل';

      if (!patientFormData.email.trim()) e.email = 'البريد الإلكتروني مطلوب';
      else if (!isValidEmail(patientFormData.email)) e.email = 'البريد الإلكتروني غير صحيح';

      if (!patientFormData.phoneNumber.trim()) e.phoneNumber = 'رقم الهاتف مطلوب';
      else if (!validateSyrianPhone(patientFormData.phoneNumber)) e.phoneNumber = 'رقم الهاتف غير صحيح (يجب أن يبدأ بـ +963 أو 09)';

      if (!patientFormData.dateOfBirth) e.dateOfBirth = 'تاريخ الميلاد مطلوب';
      else if (!isDateInPast(patientFormData.dateOfBirth)) e.dateOfBirth = 'تاريخ الميلاد يجب أن يكون في الماضي';

      if (isMinor) {
        if (!patientFormData.parentNationalId.trim()) e.parentNationalId = 'رقم الهوية الوطنية للوالد/الوالدة مطلوب';
        else if (!validateNationalId(patientFormData.parentNationalId)) e.parentNationalId = 'رقم الهوية يجب أن يكون 11 رقم بالضبط';
      } else {
        if (!patientFormData.nationalId.trim()) e.nationalId = 'رقم الهوية الوطنية مطلوب';
        else if (!validateNationalId(patientFormData.nationalId)) e.nationalId = 'رقم الهوية يجب أن يكون 11 رقم بالضبط';
      }

      if (!patientFormData.gender) e.gender = 'يرجى اختيار الجنس';
      if (!patientFormData.governorate) e.governorate = 'المحافظة مطلوبة';
      if (!patientFormData.city.trim()) e.city = 'المدينة مطلوبة';
    }

    if (currentStep === 2) {
      if (patientFormData.height && (patientFormData.height < 50 || patientFormData.height > 300)) {
        e.height = 'الطول يجب أن يكون بين 50 و 300 سم';
      }
      if (patientFormData.weight && (patientFormData.weight < 2 || patientFormData.weight > 300)) {
        e.weight = 'الوزن يجب أن يكون بين 2 و 300 كجم';
      }
    }

    if (currentStep === 3) {
      if (!patientFormData.emergencyContactName.trim()) e.emergencyContactName = 'اسم جهة الاتصال للطوارئ مطلوب';
      if (!patientFormData.emergencyContactRelationship.trim()) e.emergencyContactRelationship = 'صلة القرابة مطلوبة';
      if (!patientFormData.emergencyContactPhone.trim()) e.emergencyContactPhone = 'رقم هاتف الطوارئ مطلوب';
      else if (!validateSyrianPhone(patientFormData.emergencyContactPhone)) e.emergencyContactPhone = 'رقم الهاتف غير صحيح';
    }

    if (currentStep === 4) {
      const v = evaluatePassword(patientFormData.password);
      if (!patientFormData.password) e.password = 'كلمة المرور مطلوبة';
      else if (!v.minLength) e.password = 'كلمة المرور يجب أن تكون 8 أحرف على الأقل';
      else if (!v.hasUpper) e.password = 'كلمة المرور يجب أن تحتوي على حرف كبير';
      else if (!v.hasNumber) e.password = 'كلمة المرور يجب أن تحتوي على رقم';
      else if (!v.hasSpecial) e.password = 'كلمة المرور يجب أن تحتوي على رمز خاص';

      if (!patientFormData.confirmPassword) e.confirmPassword = 'تأكيد كلمة المرور مطلوب';
      else if (patientFormData.password !== patientFormData.confirmPassword) e.confirmPassword = 'كلمات المرور غير متطابقة';
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }, [currentStep, patientFormData, isMinor]);

  /* ─────────────────────────────────────────────────────────────────
     SHARED PROFESSIONAL STEP-1 VALIDATOR
     All three professional flows have identical personal info fields,
     so we factor the rules once and take the data object as an argument.
     ───────────────────────────────────────────────────────────────── */

  const validateProfessionalStep1 = useCallback((data) => {
    const e = {};

    if (!data.firstName.trim()) e.firstName = 'الاسم الأول مطلوب';
    else if (!isValidName(data.firstName)) e.firstName = 'الاسم يجب أن يحتوي على أحرف فقط';

    if (!data.fatherName.trim()) e.fatherName = 'اسم الأب مطلوب';
    else if (!isValidName(data.fatherName)) e.fatherName = 'الاسم يجب أن يحتوي على أحرف فقط';

    if (!data.lastName.trim()) e.lastName = 'الكنية مطلوبة';
    else if (!isValidName(data.lastName)) e.lastName = 'الاسم يجب أن يحتوي على أحرف فقط';

    if (!data.motherName.trim()) e.motherName = 'اسم الأم مطلوب';

    if (!data.nationalId.trim()) e.nationalId = 'الرقم الوطني مطلوب';
    else if (!validateNationalId(data.nationalId)) e.nationalId = 'الرقم الوطني يجب أن يكون 11 رقم';

    if (!data.dateOfBirth) e.dateOfBirth = 'تاريخ الميلاد مطلوب';

    if (!data.phoneNumber.trim()) e.phoneNumber = 'رقم الهاتف مطلوب';
    else if (!validateSyrianPhone(data.phoneNumber)) e.phoneNumber = 'رقم الهاتف غير صحيح';

    if (!data.email.trim()) e.email = 'البريد الإلكتروني مطلوب';
    else if (!isValidEmail(data.email)) e.email = 'البريد الإلكتروني غير صحيح';

    if (!data.governorate) e.governorate = 'المحافظة مطلوبة';
    if (!data.city.trim()) e.city = 'المدينة مطلوبة';
    if (!data.address.trim()) e.address = 'العنوان مطلوب';

    const v = evaluatePassword(data.password);
    if (!data.password) e.password = 'كلمة المرور مطلوبة';
    else if (!v.minLength) e.password = 'كلمة المرور يجب أن تكون 8 أحرف على الأقل';
    else if (!v.hasUpper) e.password = 'كلمة المرور يجب أن تحتوي على حرف كبير';
    else if (!v.hasNumber) e.password = 'كلمة المرور يجب أن تحتوي على رقم';
    else if (!v.hasSpecial) e.password = 'كلمة المرور يجب أن تحتوي على رمز خاص';

    if (!data.confirmPassword) e.confirmPassword = 'تأكيد كلمة المرور مطلوب';
    else if (data.password !== data.confirmPassword) e.confirmPassword = 'كلمات المرور غير متطابقة';

    return e;
  }, []);

  /* ---- Doctor-specific step validator ---- */
  const validateDoctorStep = useCallback(() => {
    let e = {};

    if (currentStep === 1) {
      e = validateProfessionalStep1(doctorFormData);
    }

    if (currentStep === 2) {
      if (!doctorFormData.medicalLicenseNumber.trim()) {
        e.medicalLicenseNumber = 'رقم الترخيص الطبي مطلوب';
      } else if (!/^[A-Z0-9]{8,20}$/i.test(doctorFormData.medicalLicenseNumber.trim())) {
        e.medicalLicenseNumber = 'رقم الترخيص يجب أن يكون 8-20 حرف/رقم';
      }

      if (!doctorFormData.specialization) e.specialization = 'التخصص مطلوب';
      if (!doctorFormData.hospitalAffiliation.trim()) e.hospitalAffiliation = 'مكان العمل مطلوب';

      // ── Schedule template validation (v2) ─────────────────────────────
      // Must have at least one working period across the whole week.
      // We also check time-format and reversal errors at the controller
      // and model layers — this is a fast pre-flight client-side check.
      const WEEKDAY_IDS = [
        'Sunday', 'Monday', 'Tuesday', 'Wednesday',
        'Thursday', 'Friday', 'Saturday',
      ];
      const totalPeriods = doctorFormData.scheduleTemplate
        ? WEEKDAY_IDS.reduce((sum, day) => {
            const periods = doctorFormData.scheduleTemplate.weeklyPattern?.[day];
            return sum + (Array.isArray(periods) ? periods.length : 0);
          }, 0)
        : 0;
      if (totalPeriods === 0) {
        e.scheduleTemplate = 'يجب تحديد فترة عمل واحدة على الأقل في جدول العمل';
      }

      const years = parseInt(doctorFormData.yearsOfExperience, 10);
      if (Number.isNaN(years) || years < 0 || years > 60) e.yearsOfExperience = 'سنوات الخبرة يجب أن تكون بين 0-60';

      if (!doctorFormData.consultationFee || parseFloat(doctorFormData.consultationFee) < 0) {
        e.consultationFee = 'رسوم الاستشارة مطلوبة';
      }
    }

    if (currentStep === 3) {
      if (!doctorFormData.licenseDocument) e.licenseDocument = 'صورة الترخيص الطبي مطلوبة';
      if (!doctorFormData.medicalCertificate) e.medicalCertificate = 'صورة شهادة الطب مطلوبة';
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }, [currentStep, doctorFormData, validateProfessionalStep1]);

  /* ---- Pharmacist-specific step validator ---- */
  const validatePharmacistStep = useCallback(() => {
    let e = {};

    if (currentStep === 1) {
      e = validateProfessionalStep1(pharmacistFormData);
    }

    if (currentStep === 2) {
      if (!pharmacistFormData.pharmacyLicenseNumber.trim()) {
        e.pharmacyLicenseNumber = 'رقم ترخيص الصيدلة مطلوب';
      } else if (!/^[A-Z0-9-]{6,20}$/i.test(pharmacistFormData.pharmacyLicenseNumber.trim())) {
        e.pharmacyLicenseNumber = 'رقم الترخيص يجب أن يكون 6-20 حرف/رقم';
      }

      if (!pharmacistFormData.degree) e.degree = 'الدرجة العلمية مطلوبة';
      if (!pharmacistFormData.specialization) e.specialization = 'مجال العمل مطلوب';
      if (!pharmacistFormData.employmentType) e.employmentType = 'نوع الدوام مطلوب';

      const years = parseInt(pharmacistFormData.yearsOfExperience, 10);
      if (Number.isNaN(years) || years < 0 || years > 60) e.yearsOfExperience = 'سنوات الخبرة يجب أن تكون بين 0-60';

      // Facility: must have either existing OR a fully-filled new facility
      const { selectedPharmacy, newPharmacy } = pharmacistFormData;
      if (!selectedPharmacy && !newPharmacy) {
        e.pharmacy = 'يجب اختيار الصيدلية أو تسجيل صيدلية جديدة';
      } else if (newPharmacy) {
        if (!newPharmacy.name?.trim()) e.pharmacy = 'اسم الصيدلية مطلوب';
        else if (!newPharmacy.license?.trim()) e.pharmacy = 'رقم ترخيص الصيدلية مطلوب';
        else if (!newPharmacy.governorate) e.pharmacy = 'محافظة الصيدلية مطلوبة';
        else if (!newPharmacy.city?.trim()) e.pharmacy = 'مدينة الصيدلية مطلوبة';
        else if (!newPharmacy.address?.trim()) e.pharmacy = 'عنوان الصيدلية مطلوب';
      }
    }

    if (currentStep === 3) {
      if (!pharmacistFormData.licenseDocument) e.licenseDocument = 'صورة الترخيص المهني مطلوبة';
      if (!pharmacistFormData.degreeDocument) e.degreeDocument = 'صورة الشهادة العلمية مطلوبة';
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }, [currentStep, pharmacistFormData, validateProfessionalStep1]);

  /* ---- Lab technician-specific step validator ---- */
  const validateLabTechStep = useCallback(() => {
    let e = {};

    if (currentStep === 1) {
      e = validateProfessionalStep1(labTechFormData);
    }

    if (currentStep === 2) {
      if (!labTechFormData.licenseNumber.trim()) {
        e.licenseNumber = 'رقم الترخيص المهني مطلوب';
      } else if (!/^[A-Z0-9-]{6,20}$/i.test(labTechFormData.licenseNumber.trim())) {
        e.licenseNumber = 'رقم الترخيص يجب أن يكون 6-20 حرف/رقم';
      }

      if (!labTechFormData.degree) e.degree = 'الدرجة العلمية مطلوبة';
      if (!labTechFormData.specialization) e.specialization = 'مجال التخصص مطلوب';
      if (!labTechFormData.position) e.position = 'المسمى الوظيفي مطلوب';

      const years = parseInt(labTechFormData.yearsOfExperience, 10);
      if (Number.isNaN(years) || years < 0 || years > 60) e.yearsOfExperience = 'سنوات الخبرة يجب أن تكون بين 0-60';

      // Facility: must have either existing OR a fully-filled new facility
      const { selectedLaboratory, newLaboratory } = labTechFormData;
      if (!selectedLaboratory && !newLaboratory) {
        e.laboratory = 'يجب اختيار المختبر أو تسجيل مختبر جديد';
      } else if (newLaboratory) {
        if (!newLaboratory.name?.trim()) e.laboratory = 'اسم المختبر مطلوب';
        else if (!newLaboratory.license?.trim()) e.laboratory = 'رقم ترخيص المختبر مطلوب';
        else if (!newLaboratory.governorate) e.laboratory = 'محافظة المختبر مطلوبة';
        else if (!newLaboratory.city?.trim()) e.laboratory = 'مدينة المختبر مطلوبة';
        else if (!newLaboratory.address?.trim()) e.laboratory = 'عنوان المختبر مطلوب';
      }
    }

    if (currentStep === 3) {
      if (!labTechFormData.licenseDocument) e.licenseDocument = 'صورة الترخيص المهني مطلوبة';
      if (!labTechFormData.degreeDocument) e.degreeDocument = 'صورة الشهادة العلمية مطلوبة';
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }, [currentStep, labTechFormData, validateProfessionalStep1]);

  /* ─────────────────────────────────────────────────────────────────
     NAVIGATION
     ───────────────────────────────────────────────────────────────── */

  const validateCurrentStep = useCallback(() => {
    if (userType === 'patient') return validatePatientStep();
    if (professionalType === 'doctor') return validateDoctorStep();
    if (professionalType === 'pharmacist') return validatePharmacistStep();
    if (professionalType === 'lab_technician') return validateLabTechStep();
    return true;
  }, [
    userType, professionalType,
    validatePatientStep, validateDoctorStep,
    validatePharmacistStep, validateLabTechStep,
  ]);

  const handleNext = useCallback(() => {
    if (validateCurrentStep()) {
      setCurrentStep((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [validateCurrentStep]);

  const handlePrev = useCallback(() => {
    setCurrentStep((prev) => prev - 1);
    setErrors({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleBackToSelection = useCallback(() => {
    setUserType(null);
    setProfessionalType(null);
    setCurrentStep(1);
    setErrors({});
  }, []);

  const handleBackToProfessionalSelection = useCallback(() => {
    setProfessionalType(null);
    setCurrentStep(1);
    setErrors({});
  }, []);

  /* ─────────────────────────────────────────────────────────────────
     PATIENT SUBMISSION
     ───────────────────────────────────────────────────────────────── */

  const handlePatientSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!validatePatientStep()) return;

    setLoading(true);
    try {
      const registrationData = {
        firstName: patientFormData.firstName.trim(),
        fatherName: patientFormData.fatherName.trim(),
        lastName: patientFormData.lastName.trim(),
        motherName: patientFormData.motherName.trim(),
        dateOfBirth: patientFormData.dateOfBirth,
        nationalId: isMinor ? null : patientFormData.nationalId.trim(),
        parentNationalId: isMinor ? patientFormData.parentNationalId.trim() : null,
        isMinor,
        gender: patientFormData.gender,
        phoneNumber: patientFormData.phoneNumber.trim(),
        governorate: patientFormData.governorate,
        city: patientFormData.city.trim(),
        address: patientFormData.address.trim() || null,
        email: patientFormData.email.trim().toLowerCase(),
        password: patientFormData.password,
        bloodType: patientFormData.bloodType || null,
        height: patientFormData.height ? parseFloat(patientFormData.height) : null,
        weight: patientFormData.weight ? parseFloat(patientFormData.weight) : null,
        smokingStatus: patientFormData.smokingStatus || null,
        allergies: patientFormData.allergies.trim()
          ? patientFormData.allergies.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
        chronicDiseases: patientFormData.chronicDiseases.trim()
          ? patientFormData.chronicDiseases.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
        familyHistory: patientFormData.familyHistory.trim()
          ? patientFormData.familyHistory.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
        emergencyContact: {
          name: patientFormData.emergencyContactName.trim(),
          relationship: patientFormData.emergencyContactRelationship.trim(),
          phoneNumber: patientFormData.emergencyContactPhone.trim(),
        },
      };

      const response = await authAPI.register(registrationData);
      setLoading(false);

      const successMessage = isMinor
          ? `مرحباً ${patientFormData.firstName} ${patientFormData.lastName}\n\nتم تسجيلك كمريض في منصة Patient 360° بنجاح.\n\nرقم تسجيل الطفل: ${response.user?.childRegistrationNumber || '—'}\n\nيمكنك الآن تسجيل الدخول.`
        : `مرحباً ${patientFormData.firstName} ${patientFormData.lastName}\n\nتم تسجيلك كمريض في منصة Patient 360° بنجاح.\n\nيمكنك الآن تسجيل الدخول.`;

      openModal('success', 'تم إنشاء الحساب بنجاح', successMessage, () => navigate('/'));
    } catch (error) {
      console.error('[SignUp] Patient registration error:', error);
      setLoading(false);
      openModal('error', 'خطأ في التسجيل', error.message || 'حدث خطأ أثناء إنشاء الحساب');
    }
  }, [validatePatientStep, patientFormData, isMinor, openModal, navigate]);

  /* ─────────────────────────────────────────────────────────────────
     DOCTOR SUBMISSION
     ───────────────────────────────────────────────────────────────── */

  const handleDoctorSubmit = useCallback(async (e) => {
    e.preventDefault();

    if (doctorFormData.password !== doctorFormData.confirmPassword) {
      openModal('error', 'خطأ', 'كلمات المرور غير متطابقة');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();

      formData.append('firstName', doctorFormData.firstName.trim());
      formData.append('fatherName', doctorFormData.fatherName.trim());
      formData.append('lastName', doctorFormData.lastName.trim());
      formData.append('motherName', doctorFormData.motherName.trim());
      formData.append('nationalId', doctorFormData.nationalId.trim());
      formData.append('dateOfBirth', doctorFormData.dateOfBirth);
      formData.append('gender', doctorFormData.gender);
      formData.append('phoneNumber', doctorFormData.phoneNumber.trim());
      formData.append('email', doctorFormData.email.trim().toLowerCase());
      formData.append('password', doctorFormData.password);
      formData.append('address', doctorFormData.address.trim());
      formData.append('governorate', doctorFormData.governorate);
      formData.append('city', doctorFormData.city.trim());

      formData.append('medicalLicenseNumber', doctorFormData.medicalLicenseNumber.toUpperCase().trim());
      formData.append('specialization', doctorFormData.specialization);
      formData.append('subSpecialization', doctorFormData.subSpecialization.trim());
      formData.append('yearsOfExperience', doctorFormData.yearsOfExperience);
      formData.append('hospitalAffiliation', doctorFormData.hospitalAffiliation.trim());
      formData.append('availableDays', JSON.stringify(doctorFormData.availableDays));
      // ── Schedule template (v2 Calendly-style) ────────────────────────
      // Sent as a JSON string because multipart/form-data can't carry
      // nested objects natively. The backend's registerDoctorRequest
      // parses this back into an object and validates it.
      if (doctorFormData.scheduleTemplate) {
        formData.append(
          'scheduleTemplate',
          JSON.stringify(doctorFormData.scheduleTemplate),
        );
      }
      formData.append('consultationFee', doctorFormData.consultationFee || '0');

      if (doctorFormData.medicalCertificate) formData.append('medicalCertificate', doctorFormData.medicalCertificate);
      if (doctorFormData.licenseDocument)    formData.append('licenseDocument', doctorFormData.licenseDocument);
      if (doctorFormData.profilePhoto)       formData.append('profilePhoto', doctorFormData.profilePhoto);

      const data = await authAPI.registerDoctor(formData);
      setLoading(false);

      setRequestStatus('pending');
      setRequestId(data.requestId);
      setSubmittedRequestType('doctor');
    } catch (error) {
      console.error('[SignUp] Doctor request error:', error);
      setLoading(false);
      openModal('error', 'خطأ في تقديم الطلب',
        error.message || 'حدث خطأ في الاتصال بالخادم. الرجاء المحاولة مرة أخرى.');
    }
  }, [doctorFormData, openModal]);

  /* ─────────────────────────────────────────────────────────────────
     PHARMACIST SUBMISSION
     Expected backend endpoint:
       POST /api/auth/register-pharmacist (multipart/form-data)
     Persists into doctor_requests with requestType='pharmacist'.
     On admin approval, backend creates:
       (1) persons document
       (2) accounts document with role='pharmacist'
       (3) pharmacies document IF newPharmacyData provided (first time)
       (4) pharmacists document with pharmacyId linked
     ───────────────────────────────────────────────────────────────── */

  const handlePharmacistSubmit = useCallback(async (e) => {
    e.preventDefault();

    if (pharmacistFormData.password !== pharmacistFormData.confirmPassword) {
      openModal('error', 'خطأ', 'كلمات المرور غير متطابقة');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();

      // Personal information
      formData.append('firstName', pharmacistFormData.firstName.trim());
      formData.append('fatherName', pharmacistFormData.fatherName.trim());
      formData.append('lastName', pharmacistFormData.lastName.trim());
      formData.append('motherName', pharmacistFormData.motherName.trim());
      formData.append('nationalId', pharmacistFormData.nationalId.trim());
      formData.append('dateOfBirth', pharmacistFormData.dateOfBirth);
      formData.append('gender', pharmacistFormData.gender);
      formData.append('phoneNumber', pharmacistFormData.phoneNumber.trim());
      formData.append('email', pharmacistFormData.email.trim().toLowerCase());
      formData.append('password', pharmacistFormData.password);
      formData.append('address', pharmacistFormData.address.trim());
      formData.append('governorate', pharmacistFormData.governorate);
      formData.append('city', pharmacistFormData.city.trim());

      // Professional information (matches pharmacists collection)
      formData.append('pharmacyLicenseNumber', pharmacistFormData.pharmacyLicenseNumber.toUpperCase().trim());
      formData.append('degree', pharmacistFormData.degree);
      formData.append('specialization', pharmacistFormData.specialization);
      formData.append('yearsOfExperience', pharmacistFormData.yearsOfExperience);
      formData.append('employmentType', pharmacistFormData.employmentType);

      // Facility linkage — exactly one of these is set (enforced by validation)
      if (pharmacistFormData.selectedPharmacy) {
        formData.append('pharmacyId', pharmacistFormData.selectedPharmacy._id);
      } else if (pharmacistFormData.newPharmacy) {
        formData.append('newPharmacyData', JSON.stringify(pharmacistFormData.newPharmacy));
      }

      // Additional notes
      if (pharmacistFormData.additionalNotes.trim()) {
        formData.append('additionalNotes', pharmacistFormData.additionalNotes.trim());
      }

      // Documents
      if (pharmacistFormData.licenseDocument) formData.append('licenseDocument', pharmacistFormData.licenseDocument);
      if (pharmacistFormData.degreeDocument)  formData.append('degreeDocument', pharmacistFormData.degreeDocument);
      if (pharmacistFormData.profilePhoto)    formData.append('profilePhoto', pharmacistFormData.profilePhoto);

      const data = await authAPI.registerPharmacist(formData);
      setLoading(false);

      setRequestStatus('pending');
      setRequestId(data.requestId);
      setSubmittedRequestType('pharmacist');
    } catch (error) {
      console.error('[SignUp] Pharmacist request error:', error);
      setLoading(false);
      openModal('error', 'خطأ في تقديم الطلب',
        error.message || 'حدث خطأ في الاتصال بالخادم. الرجاء المحاولة مرة أخرى.');
    }
  }, [pharmacistFormData, openModal]);

  /* ─────────────────────────────────────────────────────────────────
     LAB TECHNICIAN SUBMISSION
     Expected backend endpoint:
       POST /api/auth/register-lab-technician (multipart/form-data)
     Persists into doctor_requests with requestType='lab_technician'.
     On admin approval, backend creates:
       (1) persons document
       (2) accounts document with role='lab_technician'
       (3) laboratories document IF newLaboratoryData provided
       (4) lab_technicians document with laboratoryId linked
     ───────────────────────────────────────────────────────────────── */

  const handleLabTechSubmit = useCallback(async (e) => {
    e.preventDefault();

    if (labTechFormData.password !== labTechFormData.confirmPassword) {
      openModal('error', 'خطأ', 'كلمات المرور غير متطابقة');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();

      // Personal information
      formData.append('firstName', labTechFormData.firstName.trim());
      formData.append('fatherName', labTechFormData.fatherName.trim());
      formData.append('lastName', labTechFormData.lastName.trim());
      formData.append('motherName', labTechFormData.motherName.trim());
      formData.append('nationalId', labTechFormData.nationalId.trim());
      formData.append('dateOfBirth', labTechFormData.dateOfBirth);
      formData.append('gender', labTechFormData.gender);
      formData.append('phoneNumber', labTechFormData.phoneNumber.trim());
      formData.append('email', labTechFormData.email.trim().toLowerCase());
      formData.append('password', labTechFormData.password);
      formData.append('address', labTechFormData.address.trim());
      formData.append('governorate', labTechFormData.governorate);
      formData.append('city', labTechFormData.city.trim());

      // Professional information (matches lab_technicians collection)
      formData.append('licenseNumber', labTechFormData.licenseNumber.toUpperCase().trim());
      formData.append('degree', labTechFormData.degree);
      formData.append('specialization', labTechFormData.specialization);
      formData.append('position', labTechFormData.position);
      formData.append('yearsOfExperience', labTechFormData.yearsOfExperience);

      // Facility linkage
      if (labTechFormData.selectedLaboratory) {
        formData.append('laboratoryId', labTechFormData.selectedLaboratory._id);
      } else if (labTechFormData.newLaboratory) {
        formData.append('newLaboratoryData', JSON.stringify(labTechFormData.newLaboratory));
      }

      if (labTechFormData.additionalNotes.trim()) {
        formData.append('additionalNotes', labTechFormData.additionalNotes.trim());
      }

      // Documents
      if (labTechFormData.licenseDocument) formData.append('licenseDocument', labTechFormData.licenseDocument);
      if (labTechFormData.degreeDocument)  formData.append('degreeDocument', labTechFormData.degreeDocument);
      if (labTechFormData.profilePhoto)    formData.append('profilePhoto', labTechFormData.profilePhoto);

      const data = await authAPI.registerLabTechnician(formData);
      setLoading(false);

      setRequestStatus('pending');
      setRequestId(data.requestId);
      setSubmittedRequestType('lab_technician');
    } catch (error) {
      console.error('[SignUp] Lab technician request error:', error);
      setLoading(false);
      openModal('error', 'خطأ في تقديم الطلب',
        error.message || 'حدث خطأ في الاتصال بالخادم. الرجاء المحاولة مرة أخرى.');
    }
  }, [labTechFormData, openModal]);

  /* ─────────────────────────────────────────────────────────────────
     FACILITY SEARCH — wrapper functions passed to FacilityAutocomplete
     These defer to authAPI methods. Backend contract:
       authAPI.searchPharmacies(query)   →  GET /api/pharmacies/search?q=...
       authAPI.searchLaboratories(query) →  GET /api/laboratories/search?q=...
     Both return: Array<{ _id, name, arabicName, governorate, city, address, ... }>
     ───────────────────────────────────────────────────────────────── */

  const searchPharmacies = useCallback(async (q) => {
    try {
      const results = await authAPI.searchPharmacies(q);
      return Array.isArray(results) ? results : (results?.data || []);
    } catch (err) {
      console.error('[SignUp] searchPharmacies error:', err);
      return [];
    }
  }, []);

  const searchLaboratories = useCallback(async (q) => {
    try {
      const results = await authAPI.searchLaboratories(q);
      return Array.isArray(results) ? results : (results?.data || []);
    } catch (err) {
      console.error('[SignUp] searchLaboratories error:', err);
      return [];
    }
  }, []);

  /* ─────────────────────────────────────────────────────────────────
     STATUS CHECK MODAL
     Unified check endpoint (works for doctor, pharmacist, lab tech).
     Backend: authAPI.checkProfessionalStatus(email)
              (alias falls back to authAPI.checkDoctorStatus for compat)
     ───────────────────────────────────────────────────────────────── */

  const openStatusCheckModal = useCallback(() => {
    setStatusCheckModal({ isOpen: true, email: '', isLoading: false, error: '' });
  }, []);

  const closeStatusCheckModal = useCallback(() => {
    setStatusCheckModal({ isOpen: false, email: '', isLoading: false, error: '' });
  }, []);

  const handleStatusCheckSubmit = useCallback(async () => {
    const email = statusCheckModal.email.trim();

    if (!email) {
      setStatusCheckModal((p) => ({ ...p, error: 'الرجاء إدخال البريد الإلكتروني' }));
      return;
    }
    if (!isValidEmail(email)) {
      setStatusCheckModal((p) => ({ ...p, error: 'البريد الإلكتروني غير صحيح' }));
      return;
    }

    setStatusCheckModal((p) => ({ ...p, isLoading: true, error: '' }));

    try {
      // Prefer the unified endpoint; fall back for backwards compatibility
      const lookup = authAPI.checkProfessionalStatus || authAPI.checkDoctorStatus;
      const data = await lookup(email);

      closeStatusCheckModal();
      setExistingRequest({
        status: data.status,
        requestType: data.requestType || data.type || 'doctor',
        email: data.credentials?.email || email,
        password: data.credentials?.password,
        name: data.credentials?.name,
        submittedAt: data.submittedAt,
        reviewedAt: data.reviewedAt,
        rejectionReason: data.rejectionReason,
        message: data.message,
      });
    } catch (error) {
      console.error('[SignUp] Status check error:', error);
      setStatusCheckModal((p) => ({
        ...p,
        isLoading: false,
        error: error.message || 'لم يتم العثور على طلب بهذا البريد الإلكتروني',
      }));
    }
  }, [statusCheckModal.email, closeStatusCheckModal]);

  /* ─────────────────────────────────────────────────────────────────
     COPY TO CLIPBOARD HELPER
     ───────────────────────────────────────────────────────────────── */

  const copyToClipboard = useCallback((text) => {
    navigator.clipboard?.writeText(text).catch(() => { /* silent */ });
  }, []);

  /* ─────────────────────────────────────────────────────────────────
     LOADING STATE
     ───────────────────────────────────────────────────────────────── */

  if (loading) {
    const loadingMessage =
      userType === 'patient'                 ? 'جاري إنشاء حسابك...' :
      professionalType === 'doctor'          ? 'جاري تقديم طلب الطبيب...' :
      professionalType === 'pharmacist'      ? 'جاري تقديم طلب الصيدلي...' :
      professionalType === 'lab_technician'  ? 'جاري تقديم طلب فني المختبر...' :
                                               'جاري المعالجة...';
    return <LoadingSpinner message={loadingMessage} />;
  }

  /* ═════════════════════════════════════════════════════════════════
     REQUEST TYPE METADATA — used by status/success screens to vary copy
     ═════════════════════════════════════════════════════════════════ */

  const REQUEST_TYPE_META = {
    doctor: {
      titleAr: 'طلب تسجيل طبيب',
      roleAr:  'طبيب',
      Icon:    Stethoscope,
    },
    pharmacist: {
      titleAr: 'طلب تسجيل صيدلي',
      roleAr:  'صيدلي',
      Icon:    Pill,
    },
    lab_technician: {
      titleAr: 'طلب تسجيل فني مختبر',
      roleAr:  'فني مختبر',
      Icon:    Microscope,
    },
  };

  /* ═════════════════════════════════════════════════════════════════
     RENDER — REQUEST STATUS PAGE (after successful professional submission)
     ═════════════════════════════════════════════════════════════════ */

  if (requestStatus) {
    const meta = REQUEST_TYPE_META[submittedRequestType] || REQUEST_TYPE_META.doctor;
    const submittedEmail =
      submittedRequestType === 'pharmacist'     ? pharmacistFormData.email :
      submittedRequestType === 'lab_technician' ? labTechFormData.email :
                                                  doctorFormData.email;

    return (
      <div className="signup-page">
        <Navbar />
        <Modal
          isOpen={modal.isOpen}
          type={modal.type}
          title={modal.title}
          message={modal.message}
          onClose={closeModal}
        />

        <div className="signup-container">
          <div className="request-status-container">
            <div className="status-card">
              <div className="status-icon pending">
                <Clock size={48} strokeWidth={2} />
                <div className="status-pulse" />
              </div>

              <h1>تم تقديم طلبك بنجاح</h1>
              <p className="status-subtitle">{meta.titleAr} جديد في منصة Patient 360°</p>

              <div className="status-details">
                <div className="status-detail-row">
                  <span className="detail-label">رقم الطلب</span>
                  <span className="detail-value" dir="ltr">{requestId}</span>
                </div>
                <div className="status-detail-row">
                  <span className="detail-label">نوع الطلب</span>
                  <span className="detail-value">{meta.roleAr}</span>
                </div>
                <div className="status-detail-row highlight">
                  <span className="detail-label">حالة الطلب</span>
                  <span className="detail-value">
                    <span className="status-badge pending">
                      <Clock size={12} strokeWidth={2.5} />
                      قيد المراجعة
                    </span>
                  </span>
                </div>
                <div className="status-detail-row">
                  <span className="detail-label">تاريخ التقديم</span>
                  <span className="detail-value">
                    {new Date().toLocaleDateString('ar-EG')}
                  </span>
                </div>
              </div>

              <div className="status-info-box">
                <Info size={20} strokeWidth={2} />
                <div className="info-text">
                  <p>سيتم مراجعة طلبك من قبل وزارة الصحة السورية.</p>
                  <p>عند قبول الطلب، سيتم إرسال بيانات الدخول إلى بريدك الإلكتروني:</p>
                  <span className="email-highlight">{submittedEmail}</span>
                </div>
              </div>

              <div className="status-timeline">
                <div className="timeline-item completed">
                  <div className="timeline-dot" />
                  <div className="timeline-content">
                    <span className="timeline-title">تقديم الطلب</span>
                    <span className="timeline-date">تم</span>
                  </div>
                </div>
                <div className="timeline-item active">
                  <div className="timeline-dot" />
                  <div className="timeline-content">
                    <span className="timeline-title">مراجعة الوثائق</span>
                    <span className="timeline-date">جاري...</span>
                  </div>
                </div>
                <div className="timeline-item">
                  <div className="timeline-dot" />
                  <div className="timeline-content">
                    <span className="timeline-title">قرار القبول</span>
                    <span className="timeline-date">قريباً</span>
                  </div>
                </div>
                <div className="timeline-item">
                  <div className="timeline-dot" />
                  <div className="timeline-content">
                    <span className="timeline-title">تفعيل الحساب</span>
                    <span className="timeline-date">بانتظار القبول</span>
                  </div>
                </div>
              </div>

              <button type="button" className="btn-primary" onClick={() => navigate('/')}>
                <ArrowLeft size={18} strokeWidth={2.2} />
                <span>العودة للصفحة الرئيسية</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ═════════════════════════════════════════════════════════════════
     RENDER — EXISTING REQUEST LOOKUP PAGE
     Works for all 3 professional request types.
     ═════════════════════════════════════════════════════════════════ */

  if (existingRequest) {
    const statusConfig = {
      pending:  { Icon: Clock,        label: 'قيد المراجعة', className: 'pending' },
      approved: { Icon: CheckCircle2, label: 'تم القبول',     className: 'approved' },
      rejected: { Icon: XCircle,      label: 'مرفوض',         className: 'rejected' },
    };
    const status = statusConfig[existingRequest.status] || statusConfig.pending;
    const StatusIcon = status.Icon;
    const meta = REQUEST_TYPE_META[existingRequest.requestType] || REQUEST_TYPE_META.doctor;

    return (
      <div className="signup-page">
        <Navbar />
        <Modal
          isOpen={modal.isOpen}
          type={modal.type}
          title={modal.title}
          message={modal.message}
          onClose={closeModal}
        />

        <div className="signup-container">
          <div className="request-status-container">
            <div className="status-card">
              <div className={`status-icon ${existingRequest.status}`}>
                <StatusIcon size={48} strokeWidth={2} />
                {existingRequest.status === 'pending' && <div className="status-pulse" />}
              </div>

              <h1>حالة طلب التسجيل</h1>
              <p className="status-subtitle">{meta.titleAr}</p>

              <div className="status-details">
                {existingRequest.name && (
                  <div className="status-detail-row">
                    <span className="detail-label">الاسم</span>
                    <span className="detail-value">{existingRequest.name}</span>
                  </div>
                )}
                <div className="status-detail-row">
                  <span className="detail-label">البريد الإلكتروني</span>
                  <span className="detail-value" dir="ltr">{existingRequest.email}</span>
                </div>
                <div className="status-detail-row">
                  <span className="detail-label">نوع الطلب</span>
                  <span className="detail-value">{meta.roleAr}</span>
                </div>
                <div className="status-detail-row highlight">
                  <span className="detail-label">حالة الطلب</span>
                  <span className="detail-value">
                    <span className={`status-badge ${status.className}`}>
                      <StatusIcon size={12} strokeWidth={2.5} />
                      {status.label}
                    </span>
                  </span>
                </div>
                {existingRequest.submittedAt && (
                  <div className="status-detail-row">
                    <span className="detail-label">تاريخ التقديم</span>
                    <span className="detail-value">
                      {new Date(existingRequest.submittedAt).toLocaleDateString('ar-EG')}
                    </span>
                  </div>
                )}
                {existingRequest.reviewedAt && (
                  <div className="status-detail-row">
                    <span className="detail-label">تاريخ المراجعة</span>
                    <span className="detail-value">
                      {new Date(existingRequest.reviewedAt).toLocaleDateString('ar-EG')}
                    </span>
                  </div>
                )}
              </div>

              {existingRequest.status === 'pending' && (
                <div className="status-info-box pending-info">
                  <Clock size={20} strokeWidth={2} />
                  <div className="info-text">
                    <p><strong>طلبك قيد المراجعة</strong></p>
                    <p>سيتم مراجعة طلبك من قبل فريق وزارة الصحة السورية. ستتلقى إشعاراً عند اتخاذ القرار.</p>
                  </div>
                </div>
              )}

              {existingRequest.status === 'rejected' && existingRequest.rejectionReason && (
                <div className="rejection-reason-box">
                  <AlertTriangle size={20} strokeWidth={2} />
                  <div className="info-text">
                    <p className="reason-title">سبب الرفض:</p>
                    <p>{existingRequest.rejectionReason}</p>
                  </div>
                </div>
              )}

              {existingRequest.status === 'approved' && existingRequest.password && (
                <div className="success-info-box">
                  <Sparkles size={20} strokeWidth={2} />
                  <div className="info-text">
                    <p><strong>تهانينا! تم قبول طلبك.</strong></p>
                    <p>يمكنك الآن تسجيل الدخول باستخدام البيانات التالية:</p>
                    <div className="credentials-box">
                      <div className="credential-item">
                        <span className="credential-label">البريد الإلكتروني</span>
                        <span className="credential-value">{existingRequest.email}</span>
                        <button
                          type="button"
                          className="copy-btn"
                          onClick={() => copyToClipboard(existingRequest.email)}
                          aria-label="نسخ البريد الإلكتروني"
                        >
                          <Copy size={14} strokeWidth={2.2} />
                        </button>
                      </div>
                      <div className="credential-item">
                        <span className="credential-label">كلمة المرور</span>
                        <span className="credential-value">{existingRequest.password}</span>
                        <button
                          type="button"
                          className="copy-btn"
                          onClick={() => copyToClipboard(existingRequest.password)}
                          aria-label="نسخ كلمة المرور"
                        >
                          <Copy size={14} strokeWidth={2.2} />
                        </button>
                      </div>
                    </div>
                    <p className="important-note">
                      <AlertTriangle size={14} strokeWidth={2.2} />
                      احفظ هذه البيانات في مكان آمن
                    </p>
                  </div>
                </div>
              )}

              <div className="status-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setExistingRequest(null)}
                >
                  <ArrowRight size={18} strokeWidth={2.2} />
                  <span>رجوع</span>
                </button>
                <button type="button" className="btn-primary" onClick={() => navigate('/')}>
                  {existingRequest.status === 'approved' ? (
                    <>
                      <LogIn size={18} strokeWidth={2.2} />
                      <span>تسجيل الدخول</span>
                    </>
                  ) : (
                    <>
                      <ArrowLeft size={18} strokeWidth={2.2} />
                      <span>الصفحة الرئيسية</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ═════════════════════════════════════════════════════════════════
     RENDER — STATUS CHECK MODAL  (shared JSX)
     Rendered inside both role-selection screens.
     ═════════════════════════════════════════════════════════════════ */

  const renderStatusCheckModal = () => {
    if (!statusCheckModal.isOpen) return null;
    return (
      <div
        className="modal-overlay"
        onClick={closeStatusCheckModal}
        role="dialog"
        aria-modal="true"
      >
        <div className="status-check-modal" onClick={(e) => e.stopPropagation()}>
          <div className="scm-header">
            <div className="scm-icon-wrapper">
              <div className="scm-icon">
                <Search size={36} strokeWidth={2} />
              </div>
              <div className="scm-icon-pulse" />
            </div>
            <h2>التحقق من حالة الطلب</h2>
            <p>أدخل البريد الإلكتروني المستخدم عند التسجيل للتحقق من حالة طلبك</p>
          </div>

          <div className="scm-body">
            {statusCheckModal.error && (
              <div className="scm-error">
                <AlertCircle size={18} strokeWidth={2.2} />
                <span>{statusCheckModal.error}</span>
              </div>
            )}

            <div className="scm-form-group">
              <label htmlFor="status-check-email">البريد الإلكتروني</label>
              <div className="form-input-wrapper">
                <span className="form-input-icon" aria-hidden="true">
                  <Mail size={18} strokeWidth={2} />
                </span>
                <input
                  id="status-check-email"
                  type="email"
                  className="form-input"
                  placeholder="example@domain.com"
                  value={statusCheckModal.email}
                  onChange={(e) => setStatusCheckModal((p) => ({
                    ...p,
                    email: e.target.value,
                    error: '',
                  }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !statusCheckModal.isLoading) {
                      handleStatusCheckSubmit();
                    }
                  }}
                  disabled={statusCheckModal.isLoading}
                  dir="ltr"
                  autoComplete="email"
                  autoFocus
                />
              </div>
              <span className="scm-input-hint">
                <Info size={12} strokeWidth={2.2} />
                يعمل مع طلبات الأطباء، الصيادلة، وفنيي المختبر
              </span>
            </div>

            <button
              type="button"
              className="scm-submit-btn"
              onClick={handleStatusCheckSubmit}
              disabled={statusCheckModal.isLoading || !statusCheckModal.email}
            >
              {statusCheckModal.isLoading ? (
                <span className="btn-loading">
                  <Loader2 size={18} className="btn-spin" />
                  جارٍ البحث...
                </span>
              ) : (
                <>
                  <Search size={18} strokeWidth={2.2} />
                  <span>التحقق من الحالة</span>
                </>
              )}
            </button>
          </div>

          <div className="scm-footer">
            <button type="button" className="scm-close-btn" onClick={closeStatusCheckModal}>
              إلغاء
            </button>
          </div>

          <div className="scm-security-note">
            <Shield size={14} strokeWidth={2.2} />
            <span>بياناتك محمية ومشفرة</span>
          </div>
        </div>
      </div>
    );
  };

  /* ═════════════════════════════════════════════════════════════════
     RENDER — STAGE 1: USER TYPE SELECTION (Patient | Professional)
     ═════════════════════════════════════════════════════════════════ */

  if (!userType) {
    return (
      <div className="signup-page">
        <Navbar />
        <Modal
          isOpen={modal.isOpen}
          type={modal.type}
          title={modal.title}
          message={modal.message}
          onClose={closeModal}
        />
        {renderStatusCheckModal()}

        <div className="signup-container">
          <div className="user-type-selection">
            {/* Header */}
            <div className="selection-header">
              <div className="selection-icon-main">
                <Hospital size={40} strokeWidth={1.6} />
              </div>
              <h1>مرحباً بك في Patient 360°</h1>
              <p>منصة الرعاية الصحية الموحدة — وزارة الصحة السورية</p>
            </div>

            {/* Subtitle */}
            <div className="selection-subtitle">
              <h2>اختر نوع الحساب</h2>
              <p>حدد نوع المستخدم للمتابعة في عملية التسجيل</p>
            </div>

            {/* Cards — 2 cards */}
            <div className="user-type-cards">
              {/* Patient card */}
              <button
                type="button"
                className="user-type-card"
                onClick={() => setUserType('patient')}
              >
                <div className="type-card-icon">
                  <User size={32} strokeWidth={1.8} />
                </div>
                <h3>تسجيل كمريض</h3>
                <p>إنشاء حساب للوصول إلى خدمات الرعاية الصحية الشاملة</p>
                <ul className="type-features">
                  <li>
                    <Check size={16} strokeWidth={2.5} />
                    سجل طبي إلكتروني شامل
                  </li>
                  <li>
                    <Check size={16} strokeWidth={2.5} />
                    حجز المواعيد بسهولة
                  </li>
                  <li>
                    <Check size={16} strokeWidth={2.5} />
                    متابعة الوصفات الطبية
                  </li>
                  <li>
                    <Check size={16} strokeWidth={2.5} />
                    التواصل مع الأطباء
                  </li>
                </ul>
                <div className="type-card-action">
                  <span>ابدأ التسجيل</span>
                  <ArrowLeft size={18} strokeWidth={2.5} />
                </div>
              </button>

              {/* Professional card (Doctor / Pharmacist / Lab Tech) */}
              <button
                type="button"
                className="user-type-card professional-card"
                onClick={() => setUserType('professional')}
              >
                <div className="approval-badge">
                  <ShieldCheck size={12} strokeWidth={2.5} />
                  <span>يتطلب موافقة الوزارة</span>
                </div>
                <div className="type-card-icon">
                  <Briefcase size={32} strokeWidth={1.8} />
                </div>
                <h3>كادر طبي</h3>
                <p>تقديم طلب انضمام للمنصة كطبيب، صيدلي، أو فني مختبر</p>

                {/* Mini-chips showing the 3 sub-roles */}
                <div className="professional-roles-preview">
                  <span className="role-chip">
                    <Stethoscope size={12} strokeWidth={2.2} />
                    طبيب
                  </span>
                  <span className="role-chip">
                    <Pill size={12} strokeWidth={2.2} />
                    صيدلي
                  </span>
                  <span className="role-chip">
                    <Microscope size={12} strokeWidth={2.2} />
                    فني مختبر
                  </span>
                </div>

                <ul className="type-features">
                  <li>
                    <Check size={16} strokeWidth={2.5} />
                    أدوات مهنية متقدمة
                  </li>
                  <li>
                    <Check size={16} strokeWidth={2.5} />
                    تكامل مع السجلات الإلكترونية
                  </li>
                  <li>
                    <Check size={16} strokeWidth={2.5} />
                    توثيق رسمي من الوزارة
                  </li>
                </ul>
                <div className="type-card-action">
                  <span>اختر مهنتك</span>
                  <ArrowLeft size={18} strokeWidth={2.5} />
                </div>
              </button>
            </div>

            {/* Check status section */}
            <div className="check-status-section">
              <div className="check-status-divider">
                <span>أو</span>
              </div>
              <div className="check-status-card">
                <h4>لديك طلب تسجيل سابق؟</h4>
                <p>تحقق من حالة طلبك باستخدام البريد الإلكتروني المسجل</p>
                <button
                  type="button"
                  className="check-status-btn"
                  onClick={openStatusCheckModal}
                >
                  <Search size={16} strokeWidth={2.2} />
                  <span>تحقق من الحالة</span>
                </button>
              </div>
            </div>

            <div className="login-link">
              لديك حساب بالفعل؟
              <Link to="/">تسجيل الدخول</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ═════════════════════════════════════════════════════════════════
     RENDER — STAGE 2: PROFESSIONAL SUB-SELECTION
     (Shown when userType='professional' but no professionalType picked yet)
     ═════════════════════════════════════════════════════════════════ */

  if (userType === 'professional' && !professionalType) {
    return (
      <div className="signup-page">
        <Navbar />
        <Modal
          isOpen={modal.isOpen}
          type={modal.type}
          title={modal.title}
          message={modal.message}
          onClose={closeModal}
        />
        {renderStatusCheckModal()}

        <div className="signup-container">
          <div className="professional-sub-selection">
            {/* Back button */}
            <button
              type="button"
              className="back-to-selection"
              onClick={handleBackToSelection}
            >
              <ArrowRight size={16} strokeWidth={2.2} />
              <span>العودة لاختيار نوع الحساب</span>
            </button>

            {/* Header */}
            <div className="selection-header">
              <div className="selection-icon-main professional-icon">
                <Briefcase size={40} strokeWidth={1.6} />
              </div>
              <h1>الكادر الطبي</h1>
              <p>اختر مهنتك للمتابعة في تقديم الطلب</p>
            </div>

            {/* Approval notice banner */}
            <div className="professional-notice">
              <div className="professional-notice-icon">
                <ShieldCheck size={22} strokeWidth={2.2} />
              </div>
              <div className="professional-notice-text">
                <strong>طلبك سيُراجع من قبل وزارة الصحة</strong>
                <span>سيتم التحقق من وثائقك المهنية قبل تفعيل الحساب. تستغرق المراجعة عادةً 2-5 أيام عمل.</span>
              </div>
            </div>

            {/* Sub-role cards — 3 cards */}
            <div className="sub-role-cards">
              {/* Doctor */}
              <button
                type="button"
                className="sub-role-card"
                onClick={() => { setProfessionalType('doctor'); setCurrentStep(1); }}
                style={{ animationDelay: '0.1s' }}
              >
                <div className="sub-role-icon doctor-icon">
                  <Stethoscope size={28} strokeWidth={1.8} />
                </div>
                <h3>طبيب</h3>
                <p>تقديم طلب كطبيب معتمد في جميع التخصصات الطبية</p>
                <ul className="sub-role-features">
                  <li>
                    <Check size={14} strokeWidth={2.5} />
                    إدارة المرضى والمواعيد
                  </li>
                  <li>
                    <Check size={14} strokeWidth={2.5} />
                    إصدار الوصفات الطبية
                  </li>
                  <li>
                    <Check size={14} strokeWidth={2.5} />
                    <span>نظام <strong>ECG AI</strong> لأطباء القلب</span>
                  </li>
                  <li>
                    <Check size={14} strokeWidth={2.5} />
                    طلب التحاليل المخبرية
                  </li>
                </ul>
                <div className="sub-role-cta">
                  <span>تقديم طلب كطبيب</span>
                  <ArrowLeft size={16} strokeWidth={2.5} />
                </div>
              </button>

              {/* Pharmacist */}
              <button
                type="button"
                className="sub-role-card"
                onClick={() => { setProfessionalType('pharmacist'); setCurrentStep(1); }}
                style={{ animationDelay: '0.2s' }}
              >
                <div className="sub-role-icon pharmacist-icon">
                  <Pill size={28} strokeWidth={1.8} />
                </div>
                <h3>صيدلي</h3>
                <p>تقديم طلب كصيدلي للعمل في إحدى الصيدليات المسجلة</p>
                <ul className="sub-role-features">
                  <li>
                    <Check size={14} strokeWidth={2.5} />
                    صرف الوصفات الطبية
                  </li>
                  <li>
                    <Check size={14} strokeWidth={2.5} />
                    إدارة مخزون الأدوية
                  </li>
                  <li>
                    <Check size={14} strokeWidth={2.5} />
                    بيع الأدوية بدون وصفة (OTC)
                  </li>
                  <li>
                    <Check size={14} strokeWidth={2.5} />
                    قاعدة بيانات الأدوية السورية
                  </li>
                </ul>
                <div className="sub-role-cta">
                  <span>تقديم طلب كصيدلي</span>
                  <ArrowLeft size={16} strokeWidth={2.5} />
                </div>
              </button>

              {/* Lab Technician */}
              <button
                type="button"
                className="sub-role-card"
                onClick={() => { setProfessionalType('lab_technician'); setCurrentStep(1); }}
                style={{ animationDelay: '0.3s' }}
              >
                <div className="sub-role-icon lab-icon">
                  <Microscope size={28} strokeWidth={1.8} />
                </div>
                <h3>فني مختبر</h3>
                <p>تقديم طلب كفني مختبر للعمل في أحد المختبرات الطبية</p>
                <ul className="sub-role-features">
                  <li>
                    <Check size={14} strokeWidth={2.5} />
                    معالجة طلبات التحاليل
                  </li>
                  <li>
                    <Check size={14} strokeWidth={2.5} />
                    رفع نتائج التحاليل (PDF)
                  </li>
                  <li>
                    <Check size={14} strokeWidth={2.5} />
                    إدارة العينات والتتبع
                  </li>
                  <li>
                    <Check size={14} strokeWidth={2.5} />
                    تنبيهات النتائج الحرجة
                  </li>
                </ul>
                <div className="sub-role-cta">
                  <span>تقديم طلب كفني مختبر</span>
                  <ArrowLeft size={16} strokeWidth={2.5} />
                </div>
              </button>
            </div>

            {/* Check status section */}
            <div className="check-status-section">
              <div className="check-status-divider">
                <span>أو</span>
              </div>
              <div className="check-status-card">
                <h4>لديك طلب تسجيل سابق؟</h4>
                <p>تحقق من حالة طلبك باستخدام البريد الإلكتروني المسجل</p>
                <button
                  type="button"
                  className="check-status-btn"
                  onClick={openStatusCheckModal}
                >
                  <Search size={16} strokeWidth={2.2} />
                  <span>تحقق من الحالة</span>
                </button>
              </div>
            </div>

            <div className="login-link">
              لديك حساب بالفعل؟
              <Link to="/">تسجيل الدخول</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (userType === 'patient') {
    const progressPercent = ((currentStep - 1) / (PATIENT_TOTAL_STEPS - 1)) * 100;

    return (
      <div className="signup-page">
        <Navbar />
        <Modal
          isOpen={modal.isOpen}
          type={modal.type}
          title={modal.title}
          message={modal.message}
          onClose={closeModal}
          buttonLabel={modal.type === 'success' ? 'تسجيل الدخول' : 'حسناً'}
        />

        <div className="signup-container">
          <div className="signup-wrapper">
            {/* Back button */}
            <button
              type="button"
              className="back-to-selection"
              onClick={handleBackToSelection}
            >
              <ArrowRight size={16} strokeWidth={2.2} />
              <span>العودة لاختيار نوع الحساب</span>
            </button>

            {/* Progress bar */}
            <div className="progress-bar">
              <div className="progress-track" />
              <div
                className="progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
              <div className="progress-steps">
                {[1, 2, 3, 4].map((step) => (
                  <div
                    key={step}
                    className={`progress-step ${
                      currentStep === step ? 'active' : ''
                    } ${currentStep > step ? 'completed' : ''}`}
                  >
                    {currentStep > step ? <Check size={18} strokeWidth={3} /> : step}
                  </div>
                ))}
              </div>
            </div>

            {/* Form header */}
            <div className="form-header">
              <h1 className="form-title">تسجيل مريض جديد</h1>
              <p className="form-subtitle">
                {currentStep === 1 && 'الخطوة 1 من 4 — المعلومات الشخصية'}
                {currentStep === 2 && 'الخطوة 2 من 4 — المعلومات الطبية'}
                {currentStep === 3 && 'الخطوة 3 من 4 — التاريخ الصحي وجهة الاتصال'}
                {currentStep === 4 && 'الخطوة 4 من 4 — كلمة المرور'}
              </p>
            </div>

            {/* Form */}
            <form className="signup-form" onSubmit={handlePatientSubmit} noValidate>
              {/* ═══ STEP 1: Personal Information ═══ */}
              {currentStep === 1 && (
                <div className="form-step">
                  {/* Age indicator */}
                  {patientFormData.dateOfBirth && (
                    <div className={`age-indicator ${isMinor ? 'minor' : 'adult'}`}>
                      {isMinor ? (
                        <Baby size={20} strokeWidth={2} />
                      ) : (
                        <User size={20} strokeWidth={2} />
                      )}
                      <span>
                        العمر: {age} سنة — {isMinor ? 'قاصر (أقل من 14)' : 'بالغ'}
                      </span>
                    </div>
                  )}

                  {/* Names row 1 */}
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="patient-firstName">
                        الاسم الأول <span className="required-mark">*</span>
                      </label>
                      <div className="form-input-wrapper">
                        <span className="form-input-icon" aria-hidden="true">
                          <User size={18} strokeWidth={2} />
                        </span>
                        <input
                          id="patient-firstName"
                          type="text"
                          name="firstName"
                          className={`form-input ${errors.firstName ? 'error' : ''}`}
                          value={patientFormData.firstName}
                          onChange={handlePatientChange}
                          placeholder="أدخل الاسم الأول"
                          maxLength={50}
                          autoComplete="given-name"
                        />
                      </div>
                      {errors.firstName && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.firstName}
                        </span>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="patient-fatherName">
                        اسم الأب <span className="required-mark">*</span>
                      </label>
                      <div className="form-input-wrapper">
                        <span className="form-input-icon" aria-hidden="true">
                          <User size={18} strokeWidth={2} />
                        </span>
                        <input
                          id="patient-fatherName"
                          type="text"
                          name="fatherName"
                          className={`form-input ${errors.fatherName ? 'error' : ''}`}
                          value={patientFormData.fatherName}
                          onChange={handlePatientChange}
                          placeholder="أدخل اسم الأب"
                          maxLength={50}
                          autoComplete="additional-name"
                        />
                      </div>
                      {errors.fatherName && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.fatherName}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Names row 2 */}
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="patient-lastName">
                        اسم العائلة <span className="required-mark">*</span>
                      </label>
                      <div className="form-input-wrapper">
                        <span className="form-input-icon" aria-hidden="true">
                          <User size={18} strokeWidth={2} />
                        </span>
                        <input
                          id="patient-lastName"
                          type="text"
                          name="lastName"
                          className={`form-input ${errors.lastName ? 'error' : ''}`}
                          value={patientFormData.lastName}
                          onChange={handlePatientChange}
                          placeholder="أدخل اسم العائلة"
                          maxLength={50}
                          autoComplete="family-name"
                        />
                      </div>
                      {errors.lastName && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.lastName}
                        </span>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="patient-motherName">
                        اسم الأم الكامل <span className="required-mark">*</span>
                      </label>
                      <div className="form-input-wrapper">
                        <span className="form-input-icon" aria-hidden="true">
                          <User size={18} strokeWidth={2} />
                        </span>
                        <input
                          id="patient-motherName"
                          type="text"
                          name="motherName"
                          className={`form-input ${errors.motherName ? 'error' : ''}`}
                          value={patientFormData.motherName}
                          onChange={handlePatientChange}
                          placeholder="أدخل اسم الأم الكامل"
                          maxLength={100}
                        />
                      </div>
                      {errors.motherName && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.motherName}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Email */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="patient-email">
                      البريد الإلكتروني <span className="required-mark">*</span>
                    </label>
                    <div className="form-input-wrapper">
                      <span className="form-input-icon" aria-hidden="true">
                        <Mail size={18} strokeWidth={2} />
                      </span>
                      <input
                        id="patient-email"
                        type="email"
                        name="email"
                        className={`form-input ${errors.email ? 'error' : ''}`}
                        value={patientFormData.email}
                        onChange={handlePatientChange}
                        placeholder="example@email.com"
                        dir="ltr"
                        autoComplete="email"
                      />
                    </div>
                    {errors.email && (
                      <span className="error-message">
                        <AlertCircle size={14} strokeWidth={2.2} />
                        {errors.email}
                      </span>
                    )}
                  </div>

                  {/* Date of birth */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="patient-dateOfBirth">
                      تاريخ الميلاد <span className="required-mark">*</span>
                    </label>
                    <div className="form-input-wrapper">
                      <span className="form-input-icon" aria-hidden="true">
                        <Calendar size={18} strokeWidth={2} />
                      </span>
                      <input
                        id="patient-dateOfBirth"
                        type="date"
                        name="dateOfBirth"
                        className={`form-input ${errors.dateOfBirth ? 'error' : ''}`}
                        value={patientFormData.dateOfBirth}
                        onChange={handlePatientDateOfBirthChange}
                        max={getTodayDate()}
                        autoComplete="bday"
                      />
                    </div>
                    {errors.dateOfBirth && (
                      <span className="error-message">
                        <AlertCircle size={14} strokeWidth={2.2} />
                        {errors.dateOfBirth}
                      </span>
                    )}
                  </div>

                  {/* National ID — branches by age */}
                  <div className="form-group">
                    {isMinor ? (
                      <>
                        <label className="form-label" htmlFor="patient-parentNationalId">
                          الرقم الوطني للوالد/الوالدة <span className="required-mark">*</span>
                           <span className="label-hint">(الطفل أقل من 14 سنة)</span>
                        </label>
                        <div className="form-input-wrapper">
                          <span className="form-input-icon" aria-hidden="true">
                            <IdCard size={18} strokeWidth={2} />
                          </span>
                          <input
                            id="patient-parentNationalId"
                            type="text"
                            name="parentNationalId"
                            className={`form-input ${errors.parentNationalId ? 'error' : ''}`}
                            value={patientFormData.parentNationalId}
                            onChange={(e) => setPatientFormData({
                              ...patientFormData,
                              parentNationalId: e.target.value.replace(/\D/g, '').slice(0, 11),
                            })}
                            placeholder="11 رقم"
                            maxLength={11}
                            dir="ltr"
                            inputMode="numeric"
                          />
                        </div>
                        {errors.parentNationalId && (
                          <span className="error-message">
                            <AlertCircle size={14} strokeWidth={2.2} />
                            {errors.parentNationalId}
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <label className="form-label" htmlFor="patient-nationalId">
                          الرقم الوطني <span className="required-mark">*</span>
                        </label>
                        <div className="form-input-wrapper">
                          <span className="form-input-icon" aria-hidden="true">
                            <IdCard size={18} strokeWidth={2} />
                          </span>
                          <input
                            id="patient-nationalId"
                            type="text"
                            name="nationalId"
                            className={`form-input ${errors.nationalId ? 'error' : ''}`}
                            value={patientFormData.nationalId}
                            onChange={(e) => setPatientFormData({
                              ...patientFormData,
                              nationalId: e.target.value.replace(/\D/g, '').slice(0, 11),
                            })}
                            placeholder="11 رقم"
                            maxLength={11}
                            dir="ltr"
                            inputMode="numeric"
                          />
                        </div>
                        {errors.nationalId && (
                          <span className="error-message">
                            <AlertCircle size={14} strokeWidth={2.2} />
                            {errors.nationalId}
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {/* Gender */}
                  <div className="form-group">
                    <label className="form-label">
                      الجنس <span className="required-mark">*</span>
                    </label>
                    <div className="radio-group">
                      <label className="radio-label">
                        <input
                          type="radio"
                          name="gender"
                          value="male"
                          checked={patientFormData.gender === 'male'}
                          onChange={handlePatientChange}
                        />
                        <span className="radio-custom" />
                        <span>ذكر</span>
                      </label>
                      <label className="radio-label">
                        <input
                          type="radio"
                          name="gender"
                          value="female"
                          checked={patientFormData.gender === 'female'}
                          onChange={handlePatientChange}
                        />
                        <span className="radio-custom" />
                        <span>أنثى</span>
                      </label>
                    </div>
                    {errors.gender && (
                      <span className="error-message">
                        <AlertCircle size={14} strokeWidth={2.2} />
                        {errors.gender}
                      </span>
                    )}
                  </div>

                  {/* Phone */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="patient-phoneNumber">
                      رقم الهاتف <span className="required-mark">*</span>
                    </label>
                    <div className="form-input-wrapper">
                      <span className="form-input-icon" aria-hidden="true">
                        <Phone size={18} strokeWidth={2} />
                      </span>
                      <input
                        id="patient-phoneNumber"
                        type="tel"
                        name="phoneNumber"
                        className={`form-input ${errors.phoneNumber ? 'error' : ''}`}
                        value={patientFormData.phoneNumber}
                        onChange={handlePatientChange}
                        placeholder="+963 9X XXX XXXX"
                        dir="ltr"
                        autoComplete="tel"
                      />
                    </div>
                    {errors.phoneNumber && (
                      <span className="error-message">
                        <AlertCircle size={14} strokeWidth={2.2} />
                        {errors.phoneNumber}
                      </span>
                    )}
                  </div>

                  {/* Governorate + city */}
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="patient-governorate">
                        المحافظة <span className="required-mark">*</span>
                      </label>
                      <select
                        id="patient-governorate"
                        name="governorate"
                        className={`form-input ${errors.governorate ? 'error' : ''}`}
                        value={patientFormData.governorate}
                        onChange={handlePatientChange}
                      >
                        <option value="">اختر المحافظة</option>
                        {SYRIAN_GOVERNORATES.map((gov) => (
                          <option key={gov.id} value={gov.id}>{gov.nameAr}</option>
                        ))}
                      </select>
                      {errors.governorate && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.governorate}
                        </span>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="patient-city">
                        المدينة <span className="required-mark">*</span>
                      </label>
                      <div className="form-input-wrapper">
                        <span className="form-input-icon" aria-hidden="true">
                          <MapPin size={18} strokeWidth={2} />
                        </span>
                        <input
                          id="patient-city"
                          type="text"
                          name="city"
                          className={`form-input ${errors.city ? 'error' : ''}`}
                          value={patientFormData.city}
                          onChange={handlePatientChange}
                          placeholder="أدخل المدينة"
                          autoComplete="address-level2"
                        />
                      </div>
                      {errors.city && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.city}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Address (optional) */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="patient-address">
                      العنوان التفصيلي
                      <span className="label-hint">(اختياري)</span>
                    </label>
                    <div className="form-input-wrapper">
                      <span className="form-input-icon" aria-hidden="true">
                        <MapPin size={18} strokeWidth={2} />
                      </span>
                      <input
                        id="patient-address"
                        type="text"
                        name="address"
                        className="form-input"
                        value={patientFormData.address}
                        onChange={handlePatientChange}
                        placeholder="الحي، الشارع، رقم المبنى"
                        autoComplete="street-address"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ═══ STEP 2: Medical Information ═══ */}
              {currentStep === 2 && (
                <div className="form-step">
                  <div className="form-group">
                    <label className="form-label" htmlFor="patient-bloodType">
                      فصيلة الدم
                      <span className="label-hint">(اختياري)</span>
                    </label>
                    <select
                      id="patient-bloodType"
                      name="bloodType"
                      className="form-input"
                      value={patientFormData.bloodType}
                      onChange={handlePatientChange}
                    >
                      <option value="">اختر فصيلة الدم</option>
                      {BLOOD_TYPES.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="patient-height">
                        الطول (سم)
                        <span className="label-hint">(اختياري)</span>
                      </label>
                      <div className="form-input-wrapper">
                        <span className="form-input-icon" aria-hidden="true">
                          <Activity size={18} strokeWidth={2} />
                        </span>
                        <input
                          id="patient-height"
                          type="number"
                          name="height"
                          className={`form-input ${errors.height ? 'error' : ''}`}
                          value={patientFormData.height}
                          onChange={handlePatientChange}
                          placeholder="مثال: 175"
                          min="50"
                          max="300"
                        />
                      </div>
                      {errors.height && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.height}
                        </span>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="patient-weight">
                        الوزن (كجم)
                        <span className="label-hint">(اختياري)</span>
                      </label>
                      <div className="form-input-wrapper">
                        <span className="form-input-icon" aria-hidden="true">
                          <Activity size={18} strokeWidth={2} />
                        </span>
                        <input
                          id="patient-weight"
                          type="number"
                          name="weight"
                          className={`form-input ${errors.weight ? 'error' : ''}`}
                          value={patientFormData.weight}
                          onChange={handlePatientChange}
                          placeholder="مثال: 70"
                          min="2"
                          max="300"
                        />
                      </div>
                      {errors.weight && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.weight}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="patient-smokingStatus">
                      حالة التدخين
                      <span className="label-hint">(اختياري)</span>
                    </label>
                    <select
                      id="patient-smokingStatus"
                      name="smokingStatus"
                      className="form-input"
                      value={patientFormData.smokingStatus}
                      onChange={handlePatientChange}
                    >
                      <option value="">اختر حالة التدخين</option>
                      {SMOKING_STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* ═══ STEP 3: Health History & Emergency ═══ */}
              {currentStep === 3 && (
                <div className="form-step">
                  <div className="form-group">
                    <label className="form-label" htmlFor="patient-allergies">
                      الحساسية
                      <span className="label-hint">(اختياري)</span>
                    </label>
                    <textarea
                      id="patient-allergies"
                      name="allergies"
                      className="form-input"
                      value={patientFormData.allergies}
                      onChange={handlePatientChange}
                      placeholder="أدخل أي حساسية، مفصولة بفواصل"
                      rows="2"
                    />
                    <span className="form-hint">
                      <Info size={12} strokeWidth={2.2} />
                      افصل بين الحساسيات بفاصلة (,)
                    </span>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="patient-chronicDiseases">
                      الأمراض المزمنة
                      <span className="label-hint">(اختياري)</span>
                    </label>
                    <textarea
                      id="patient-chronicDiseases"
                      name="chronicDiseases"
                      className="form-input"
                      value={patientFormData.chronicDiseases}
                      onChange={handlePatientChange}
                      placeholder="أدخل أي أمراض مزمنة، مفصولة بفواصل"
                      rows="2"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="patient-familyHistory">
                      التاريخ العائلي المرضي
                      <span className="label-hint">(اختياري)</span>
                    </label>
                    <textarea
                      id="patient-familyHistory"
                      name="familyHistory"
                      className="form-input"
                      value={patientFormData.familyHistory}
                      onChange={handlePatientChange}
                      placeholder="أدخل أي أمراض وراثية أو عائلية"
                      rows="2"
                    />
                  </div>

                  {/* Emergency contact section */}
                  <div className="emergency-section">
                    <h3>
                      <AlertTriangle size={18} strokeWidth={2.2} />
                      جهة الاتصال للطوارئ
                    </h3>

                    <div className="form-group">
                      <label className="form-label" htmlFor="patient-emergencyName">
                        اسم جهة الاتصال <span className="required-mark">*</span>
                      </label>
                      <div className="form-input-wrapper">
                        <span className="form-input-icon" aria-hidden="true">
                          <User size={18} strokeWidth={2} />
                        </span>
                        <input
                          id="patient-emergencyName"
                          type="text"
                          name="emergencyContactName"
                          className={`form-input ${errors.emergencyContactName ? 'error' : ''}`}
                          value={patientFormData.emergencyContactName}
                          onChange={handlePatientChange}
                          placeholder="الاسم الكامل"
                        />
                      </div>
                      {errors.emergencyContactName && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.emergencyContactName}
                        </span>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="patient-emergencyRelationship">
                        صلة القرابة <span className="required-mark">*</span>
                      </label>
                      <div className="form-input-wrapper">
                        <span className="form-input-icon" aria-hidden="true">
                          <Users size={18} strokeWidth={2} />
                        </span>
                        <input
                          id="patient-emergencyRelationship"
                          type="text"
                          name="emergencyContactRelationship"
                          className={`form-input ${errors.emergencyContactRelationship ? 'error' : ''}`}
                          value={patientFormData.emergencyContactRelationship}
                          onChange={handlePatientChange}
                          placeholder="مثال: أب، أم، أخ، زوجة"
                        />
                      </div>
                      {errors.emergencyContactRelationship && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.emergencyContactRelationship}
                        </span>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="patient-emergencyPhone">
                        رقم هاتف الطوارئ <span className="required-mark">*</span>
                      </label>
                      <div className="form-input-wrapper">
                        <span className="form-input-icon" aria-hidden="true">
                          <Phone size={18} strokeWidth={2} />
                        </span>
                        <input
                          id="patient-emergencyPhone"
                          type="tel"
                          name="emergencyContactPhone"
                          className={`form-input ${errors.emergencyContactPhone ? 'error' : ''}`}
                          value={patientFormData.emergencyContactPhone}
                          onChange={handlePatientChange}
                          placeholder="+963 9X XXX XXXX"
                          dir="ltr"
                        />
                      </div>
                      {errors.emergencyContactPhone && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.emergencyContactPhone}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ═══ STEP 4: Password ═══ */}
              {currentStep === 4 && (
                <div className="form-step">
                  <div className="form-group">
                    <label className="form-label" htmlFor="patient-password">
                      كلمة المرور <span className="required-mark">*</span>
                    </label>
                    <div className="form-input-wrapper has-toggle">
                      <span className="form-input-icon" aria-hidden="true">
                        <Lock size={18} strokeWidth={2} />
                      </span>
                      <input
                        id="patient-password"
                        type={showPatientPassword ? 'text' : 'password'}
                        name="password"
                        className={`form-input ${errors.password ? 'error' : ''}`}
                        value={patientFormData.password}
                        onChange={handlePatientChange}
                        placeholder="أدخل كلمة مرور قوية"
                        autoComplete="new-password"
                        dir="ltr"
                      />
                      <button
                        type="button"
                        className="password-toggle-btn"
                        onClick={() => setShowPatientPassword((p) => !p)}
                        aria-label={showPatientPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                      >
                        {showPatientPassword
                          ? <EyeOff size={18} strokeWidth={2} />
                          : <Eye size={18} strokeWidth={2} />}
                      </button>
                    </div>
                    {errors.password && (
                      <span className="error-message">
                        <AlertCircle size={14} strokeWidth={2.2} />
                        {errors.password}
                      </span>
                    )}
                  </div>

                  <PasswordStrengthMeter password={patientFormData.password} />

                  <div className="form-group">
                    <label className="form-label" htmlFor="patient-confirmPassword">
                      تأكيد كلمة المرور <span className="required-mark">*</span>
                    </label>
                    <div className="form-input-wrapper has-toggle">
                      <span className="form-input-icon" aria-hidden="true">
                        <Lock size={18} strokeWidth={2} />
                      </span>
                      <input
                        id="patient-confirmPassword"
                        type={showPatientConfirm ? 'text' : 'password'}
                        name="confirmPassword"
                        className={`form-input ${errors.confirmPassword ? 'error' : ''}`}
                        value={patientFormData.confirmPassword}
                        onChange={handlePatientChange}
                        placeholder="أعد إدخال كلمة المرور"
                        autoComplete="new-password"
                        dir="ltr"
                      />
                      <button
                        type="button"
                        className="password-toggle-btn"
                        onClick={() => setShowPatientConfirm((p) => !p)}
                        aria-label={showPatientConfirm ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                      >
                        {showPatientConfirm
                          ? <EyeOff size={18} strokeWidth={2} />
                          : <Eye size={18} strokeWidth={2} />}
                      </button>
                    </div>
                    {errors.confirmPassword && (
                      <span className="error-message">
                        <AlertCircle size={14} strokeWidth={2.2} />
                        {errors.confirmPassword}
                      </span>
                    )}
                  </div>

                  <div className="terms-checkbox">
                    <label className="checkbox-label">
                      <input type="checkbox" required />
                      <span className="checkbox-custom" />
                      <span>
                        أوافق على
                        <Link to="/terms" target="_blank" style={{ color: 'var(--tm-action)', fontWeight: 700, margin: '0 4px' }}>الشروط والأحكام</Link>
                        و
                        <Link to="/privacy" target="_blank" style={{ color: 'var(--tm-action)', fontWeight: 700, marginRight: 4 }}>سياسة الخصوصية</Link>
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* Form actions */}
              <div className="form-actions">
                {currentStep > 1 && (
                  <button type="button" className="btn-secondary" onClick={handlePrev}>
                    <ArrowRight size={18} strokeWidth={2.2} />
                    <span>السابق</span>
                  </button>
                )}

                {currentStep < PATIENT_TOTAL_STEPS ? (
                  <button type="button" className="btn-primary" onClick={handleNext}>
                    <span>التالي</span>
                    <ArrowLeft size={18} strokeWidth={2.2} />
                  </button>
                ) : (
                  <button type="submit" className="btn-primary">
                    <UserPlus size={18} strokeWidth={2.2} />
                    <span>إنشاء الحساب</span>
                  </button>
                )}
              </div>

              <div className="login-link">
                لديك حساب بالفعل؟
                <Link to="/">تسجيل الدخول</Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }
  /* ═════════════════════════════════════════════════════════════════
     RENDER — DOCTOR REGISTRATION FORM (4 steps)
     ═════════════════════════════════════════════════════════════════ */

  if (userType === 'professional' && professionalType === 'doctor') {
    const progressPercent = ((currentStep - 1) / (DOCTOR_TOTAL_STEPS - 1)) * 100;

    return (
    <div className="signup-page">
      <Navbar />
      <Modal
        isOpen={modal.isOpen}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        onClose={closeModal}
      />

      <div className="signup-container">
        <div className="signup-wrapper">
          {/* Back button — returns to sub-role selection */}
          <button
            type="button"
            className="back-to-selection"
            onClick={handleBackToProfessionalSelection}
          >
            <ArrowRight size={16} strokeWidth={2.2} />
            <span>العودة لاختيار المهنة</span>
          </button>

          {/* Progress bar */}
          <div className="progress-bar">
            <div className="progress-track" />
            <div
              className="progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
            <div className="progress-steps">
              {[1, 2, 3, 4].map((step) => (
                <div
                  key={step}
                  className={`progress-step ${
                    currentStep === step ? 'active' : ''
                  } ${currentStep > step ? 'completed' : ''}`}
                >
                  {currentStep > step ? <Check size={18} strokeWidth={3} /> : step}
                </div>
              ))}
            </div>
          </div>

          {/* Form header with ministry badge */}
          <div className="form-header doctor">
            <div className="doctor-header-badge">
              <ShieldCheck size={14} strokeWidth={2.5} />
              <span>وزارة الصحة السورية</span>
            </div>
            <h1 className="form-title">طلب تسجيل طبيب</h1>
            <p className="form-subtitle">
              {currentStep === 1 && 'الخطوة 1 من 4 — المعلومات الشخصية'}
              {currentStep === 2 && 'الخطوة 2 من 4 — المعلومات المهنية'}
              {currentStep === 3 && 'الخطوة 3 من 4 — الوثائق المطلوبة'}
              {currentStep === 4 && 'الخطوة 4 من 4 — مراجعة وتقديم الطلب'}
            </p>
          </div>

          {/* Notice banner */}
          <div className="doctor-notice">
            <Info size={20} strokeWidth={2} />
            <div>
              <strong>ملاحظة هامة</strong>
              <p>
                سيتم مراجعة طلبك من قبل وزارة الصحة. عند القبول، ستتلقى بيانات
                الدخول عبر البريد الإلكتروني.
              </p>
            </div>
          </div>

          {/* Form */}
          <form className="signup-form" onSubmit={handleDoctorSubmit} noValidate>
            {/* ═══ STEP 1: Personal Information ═══ */}
            {currentStep === 1 && (
              <div className="form-step">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="doctor-firstName">
                      الاسم الأول <span className="required-mark">*</span>
                    </label>
                    <div className="form-input-wrapper">
                      <span className="form-input-icon" aria-hidden="true">
                        <User size={18} strokeWidth={2} />
                      </span>
                      <input
                        id="doctor-firstName"
                        type="text"
                        name="firstName"
                        className={`form-input ${errors.firstName ? 'error' : ''}`}
                        value={doctorFormData.firstName}
                        onChange={handleDoctorChange}
                        placeholder="أدخل الاسم الأول"
                        autoComplete="given-name"
                      />
                    </div>
                    {errors.firstName && (
                      <span className="error-message">
                        <AlertCircle size={14} strokeWidth={2.2} />
                        {errors.firstName}
                      </span>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="doctor-fatherName">
                      اسم الأب <span className="required-mark">*</span>
                    </label>
                    <div className="form-input-wrapper">
                      <span className="form-input-icon" aria-hidden="true">
                        <User size={18} strokeWidth={2} />
                      </span>
                      <input
                        id="doctor-fatherName"
                        type="text"
                        name="fatherName"
                        className={`form-input ${errors.fatherName ? 'error' : ''}`}
                        value={doctorFormData.fatherName}
                        onChange={handleDoctorChange}
                        placeholder="أدخل اسم الأب"
                        autoComplete="additional-name"
                      />
                    </div>
                    {errors.fatherName && (
                      <span className="error-message">
                        <AlertCircle size={14} strokeWidth={2.2} />
                        {errors.fatherName}
                      </span>
                    )}
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="doctor-lastName">
                      الكنية <span className="required-mark">*</span>
                    </label>
                    <div className="form-input-wrapper">
                      <span className="form-input-icon" aria-hidden="true">
                        <User size={18} strokeWidth={2} />
                      </span>
                      <input
                        id="doctor-lastName"
                        type="text"
                        name="lastName"
                        className={`form-input ${errors.lastName ? 'error' : ''}`}
                        value={doctorFormData.lastName}
                        onChange={handleDoctorChange}
                        placeholder="أدخل الكنية"
                        autoComplete="family-name"
                      />
                    </div>
                    {errors.lastName && (
                      <span className="error-message">
                        <AlertCircle size={14} strokeWidth={2.2} />
                        {errors.lastName}
                      </span>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="doctor-motherName">
                      اسم الأم الكامل <span className="required-mark">*</span>
                    </label>
                    <div className="form-input-wrapper">
                      <span className="form-input-icon" aria-hidden="true">
                        <User size={18} strokeWidth={2} />
                      </span>
                      <input
                        id="doctor-motherName"
                        type="text"
                        name="motherName"
                        className={`form-input ${errors.motherName ? 'error' : ''}`}
                        value={doctorFormData.motherName}
                        onChange={handleDoctorChange}
                        placeholder="أدخل اسم الأم الكامل"
                      />
                    </div>
                    {errors.motherName && (
                      <span className="error-message">
                        <AlertCircle size={14} strokeWidth={2.2} />
                        {errors.motherName}
                      </span>
                    )}
                  </div>
                </div>

                {/* National ID */}
                <div className="form-group">
                  <label className="form-label" htmlFor="doctor-nationalId">
                    الرقم الوطني <span className="required-mark">*</span>
                  </label>
                  <div className="form-input-wrapper">
                    <span className="form-input-icon" aria-hidden="true">
                      <IdCard size={18} strokeWidth={2} />
                    </span>
                    <input
                      id="doctor-nationalId"
                      type="text"
                      name="nationalId"
                      className={`form-input ${errors.nationalId ? 'error' : ''}`}
                      value={doctorFormData.nationalId}
                      onChange={(e) => setDoctorFormData({
                        ...doctorFormData,
                        nationalId: e.target.value.replace(/\D/g, '').slice(0, 11),
                      })}
                      placeholder="11 رقم"
                      maxLength={11}
                      dir="ltr"
                      inputMode="numeric"
                    />
                  </div>
                  {errors.nationalId && (
                    <span className="error-message">
                      <AlertCircle size={14} strokeWidth={2.2} />
                      {errors.nationalId}
                    </span>
                  )}
                </div>

                {/* DOB + Gender */}
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="doctor-dateOfBirth">
                      تاريخ الميلاد <span className="required-mark">*</span>
                    </label>
                    <div className="form-input-wrapper">
                      <span className="form-input-icon" aria-hidden="true">
                        <Calendar size={18} strokeWidth={2} />
                      </span>
                      <input
                        id="doctor-dateOfBirth"
                        type="date"
                        name="dateOfBirth"
                        className={`form-input ${errors.dateOfBirth ? 'error' : ''}`}
                        value={doctorFormData.dateOfBirth}
                        onChange={handleDoctorChange}
                        max={getTodayDate()}
                        autoComplete="bday"
                      />
                    </div>
                    {errors.dateOfBirth && (
                      <span className="error-message">
                        <AlertCircle size={14} strokeWidth={2.2} />
                        {errors.dateOfBirth}
                      </span>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="doctor-gender">
                      الجنس <span className="required-mark">*</span>
                    </label>
                    <select
                      id="doctor-gender"
                      name="gender"
                      className="form-input"
                      value={doctorFormData.gender}
                      onChange={handleDoctorChange}
                    >
                      <option value="male">ذكر</option>
                      <option value="female">أنثى</option>
                    </select>
                  </div>
                </div>

                {/* Email */}
                <div className="form-group">
                  <label className="form-label" htmlFor="doctor-email">
                    البريد الإلكتروني <span className="required-mark">*</span>
                  </label>
                  <div className="form-input-wrapper">
                    <span className="form-input-icon" aria-hidden="true">
                      <Mail size={18} strokeWidth={2} />
                    </span>
                    <input
                      id="doctor-email"
                      type="email"
                      name="email"
                      className={`form-input ${errors.email ? 'error' : ''}`}
                      value={doctorFormData.email}
                      onChange={handleDoctorChange}
                      placeholder="example@email.com"
                      dir="ltr"
                      autoComplete="email"
                    />
                  </div>
                  {errors.email && (
                    <span className="error-message">
                      <AlertCircle size={14} strokeWidth={2.2} />
                      {errors.email}
                    </span>
                  )}
                  <span className="form-hint">
                    <Info size={12} strokeWidth={2.2} />
                    سيتم إرسال بيانات الدخول إلى هذا البريد عند القبول
                  </span>
                </div>

                {/* Passwords */}
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="doctor-password">
                      كلمة المرور <span className="required-mark">*</span>
                    </label>
                    <div className="form-input-wrapper has-toggle">
                      <span className="form-input-icon" aria-hidden="true">
                        <Lock size={18} strokeWidth={2} />
                      </span>
                      <input
                        id="doctor-password"
                        type={showDoctorPassword ? 'text' : 'password'}
                        name="password"
                        className={`form-input ${errors.password ? 'error' : ''}`}
                        value={doctorFormData.password}
                        onChange={handleDoctorChange}
                        placeholder="8 أحرف على الأقل"
                        dir="ltr"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="password-toggle-btn"
                        onClick={() => setShowDoctorPassword((p) => !p)}
                        aria-label={showDoctorPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                      >
                        {showDoctorPassword
                          ? <EyeOff size={18} strokeWidth={2} />
                          : <Eye size={18} strokeWidth={2} />}
                      </button>
                    </div>
                    {errors.password && (
                      <span className="error-message">
                        <AlertCircle size={14} strokeWidth={2.2} />
                        {errors.password}
                      </span>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="doctor-confirmPassword">
                      تأكيد كلمة المرور <span className="required-mark">*</span>
                    </label>
                    <div className="form-input-wrapper has-toggle">
                      <span className="form-input-icon" aria-hidden="true">
                        <Lock size={18} strokeWidth={2} />
                      </span>
                      <input
                        id="doctor-confirmPassword"
                        type={showDoctorConfirm ? 'text' : 'password'}
                        name="confirmPassword"
                        className={`form-input ${errors.confirmPassword ? 'error' : ''}`}
                        value={doctorFormData.confirmPassword}
                        onChange={handleDoctorChange}
                        placeholder="أعد إدخال كلمة المرور"
                        dir="ltr"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="password-toggle-btn"
                        onClick={() => setShowDoctorConfirm((p) => !p)}
                        aria-label={showDoctorConfirm ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                      >
                        {showDoctorConfirm
                          ? <EyeOff size={18} strokeWidth={2} />
                          : <Eye size={18} strokeWidth={2} />}
                      </button>
                    </div>
                    {errors.confirmPassword && (
                      <span className="error-message">
                        <AlertCircle size={14} strokeWidth={2.2} />
                        {errors.confirmPassword}
                      </span>
                    )}
                  </div>
                </div>

                <PasswordStrengthMeter password={doctorFormData.password} />

                {/* Phone */}
                <div className="form-group">
                  <label className="form-label" htmlFor="doctor-phoneNumber">
                    رقم الهاتف <span className="required-mark">*</span>
                  </label>
                  <div className="form-input-wrapper">
                    <span className="form-input-icon" aria-hidden="true">
                      <Phone size={18} strokeWidth={2} />
                    </span>
                    <input
                      id="doctor-phoneNumber"
                      type="tel"
                      name="phoneNumber"
                      className={`form-input ${errors.phoneNumber ? 'error' : ''}`}
                      value={doctorFormData.phoneNumber}
                      onChange={handleDoctorChange}
                      placeholder="+963 9X XXX XXXX"
                      dir="ltr"
                      autoComplete="tel"
                    />
                  </div>
                  {errors.phoneNumber && (
                    <span className="error-message">
                      <AlertCircle size={14} strokeWidth={2.2} />
                      {errors.phoneNumber}
                    </span>
                  )}
                </div>

                {/* Governorate + city */}
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="doctor-governorate">
                      المحافظة <span className="required-mark">*</span>
                    </label>
                    <select
                      id="doctor-governorate"
                      name="governorate"
                      className={`form-input ${errors.governorate ? 'error' : ''}`}
                      value={doctorFormData.governorate}
                      onChange={handleDoctorChange}
                    >
                      <option value="">اختر المحافظة</option>
                      {SYRIAN_GOVERNORATES.map((gov) => (
                        <option key={gov.id} value={gov.id}>{gov.nameAr}</option>
                      ))}
                    </select>
                    {errors.governorate && (
                      <span className="error-message">
                        <AlertCircle size={14} strokeWidth={2.2} />
                        {errors.governorate}
                      </span>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="doctor-city">
                      المدينة <span className="required-mark">*</span>
                    </label>
                    <div className="form-input-wrapper">
                      <span className="form-input-icon" aria-hidden="true">
                        <MapPin size={18} strokeWidth={2} />
                      </span>
                      <input
                        id="doctor-city"
                        type="text"
                        name="city"
                        className={`form-input ${errors.city ? 'error' : ''}`}
                        value={doctorFormData.city}
                        onChange={handleDoctorChange}
                        placeholder="أدخل المدينة"
                        autoComplete="address-level2"
                      />
                    </div>
                    {errors.city && (
                      <span className="error-message">
                        <AlertCircle size={14} strokeWidth={2.2} />
                        {errors.city}
                      </span>
                    )}
                  </div>
                </div>

                {/* Address */}
                <div className="form-group">
                  <label className="form-label" htmlFor="doctor-address">
                    عنوان العيادة <span className="required-mark">*</span>
                  </label>
                  <div className="form-input-wrapper">
                    <span className="form-input-icon" aria-hidden="true">
                      <Building size={18} strokeWidth={2} />
                    </span>
                    <input
                      id="doctor-address"
                      type="text"
                      name="address"
                      className={`form-input ${errors.address ? 'error' : ''}`}
                      value={doctorFormData.address}
                      onChange={handleDoctorChange}
                      placeholder="العنوان التفصيلي للعيادة"
                      autoComplete="street-address"
                    />
                  </div>
                  {errors.address && (
                    <span className="error-message">
                      <AlertCircle size={14} strokeWidth={2.2} />
                      {errors.address}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* ═══ STEP 2: Professional Information ═══ */}
            {currentStep === 2 && (
              <div className="form-step">
                {/* Medical license number */}
                <div className="form-group">
                  <label className="form-label" htmlFor="doctor-licenseNumber">
                    رقم الترخيص الطبي <span className="required-mark">*</span>
                  </label>
                  <div className="form-input-wrapper">
                    <span className="form-input-icon" aria-hidden="true">
                      <Award size={18} strokeWidth={2} />
                    </span>
                    <input
                      id="doctor-licenseNumber"
                      type="text"
                      name="medicalLicenseNumber"
                      className={`form-input ${errors.medicalLicenseNumber ? 'error' : ''}`}
                      value={doctorFormData.medicalLicenseNumber}
                      onChange={handleDoctorChange}
                      placeholder="مثال: SY12345678"
                      dir="ltr"
                      style={{ textTransform: 'uppercase' }}
                    />
                  </div>
                  {errors.medicalLicenseNumber && (
                    <span className="error-message">
                      <AlertCircle size={14} strokeWidth={2.2} />
                      {errors.medicalLicenseNumber}
                    </span>
                  )}
                  <span className="form-hint">
                    <Info size={12} strokeWidth={2.2} />
                    8-20 حرف/رقم (أحرف إنجليزية كبيرة وأرقام)
                  </span>
                </div>

                {/* Specialization picker — searchable card grid (replaces <select>) */}
                <div className="form-group">
                  <label className="form-label">
                    التخصص الطبي <span className="required-mark">*</span>
                  </label>
                  <div className="spec-picker">
                    <div className="spec-search">
                      <input
                        type="text"
                        className="form-input"
                        placeholder="ابحث عن التخصص..."
                        value={specSearch}
                        onChange={(e) => setSpecSearch(e.target.value)}
                      />
                      <span className="spec-search-icon" aria-hidden="true">
                        <Search size={16} strokeWidth={2} />
                      </span>
                    </div>
                    <div className="spec-grid" role="radiogroup" aria-label="التخصصات الطبية">
                      {filteredSpecializations.map((spec) => {
                        const SpecIcon = spec.Icon;
                        const isSelected = doctorFormData.specialization === spec.id;
                        return (
                          <button
                            key={spec.id}
                            type="button"
                            className={`spec-card ${isSelected ? 'selected' : ''}`}
                            onClick={() => handleSpecializationSelect(spec.id)}
                            role="radio"
                            aria-checked={isSelected}
                          >
                            {spec.hasECG && (
                              <span className="spec-card-ecg">ECG AI</span>
                            )}
                            <div className="spec-card-icon">
                              <SpecIcon size={20} strokeWidth={2} />
                            </div>
                            <span className="spec-card-name">{spec.nameAr}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {errors.specialization && (
                    <span className="error-message">
                      <AlertCircle size={14} strokeWidth={2.2} />
                      {errors.specialization}
                    </span>
                  )}

                  {/* ECG notice for cardiologists */}
                  {doctorFormData.specialization === 'cardiology' && (
                    <div className="ecg-notice">
                      <Sparkles size={18} strokeWidth={2} />
                      <span>كطبيب قلب، ستتمكن من استخدام نظام AI لتحليل تخطيط القلب (ECG)</span>
                    </div>
                  )}
                </div>

                {/* Sub-specialization */}
                <div className="form-group">
                  <label className="form-label" htmlFor="doctor-subSpec">
                    التخصص الفرعي
                    <span className="label-hint">(اختياري)</span>
                  </label>
                  <div className="form-input-wrapper">
                    <span className="form-input-icon" aria-hidden="true">
                      <Briefcase size={18} strokeWidth={2} />
                    </span>
                    <input
                      id="doctor-subSpec"
                      type="text"
                      name="subSpecialization"
                      className="form-input"
                      value={doctorFormData.subSpecialization}
                      onChange={handleDoctorChange}
                      placeholder="مثال: جراحة القلب المفتوح"
                    />
                  </div>
                </div>

                {/* Hospital affiliation */}
                <div className="form-group">
                  <label className="form-label" htmlFor="doctor-hospital">
                    مكان العمل / المستشفى <span className="required-mark">*</span>
                  </label>
                  <div className="form-input-wrapper">
                    <span className="form-input-icon" aria-hidden="true">
                      <Hospital size={18} strokeWidth={2} />
                    </span>
                    <input
                      id="doctor-hospital"
                      type="text"
                      name="hospitalAffiliation"
                      className={`form-input ${errors.hospitalAffiliation ? 'error' : ''}`}
                      value={doctorFormData.hospitalAffiliation}
                      onChange={handleDoctorChange}
                      placeholder="اسم المستشفى أو المركز الصحي"
                    />
                  </div>
                  {errors.hospitalAffiliation && (
                    <span className="error-message">
                      <AlertCircle size={14} strokeWidth={2.2} />
                      {errors.hospitalAffiliation}
                    </span>
                  )}
                </div>

                {/* Years + fee */}
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="doctor-years">
                      سنوات الخبرة <span className="required-mark">*</span>
                    </label>
                    <div className="form-input-wrapper">
                      <span className="form-input-icon" aria-hidden="true">
                        <Clock size={18} strokeWidth={2} />
                      </span>
                      <input
                        id="doctor-years"
                        type="number"
                        name="yearsOfExperience"
                        className={`form-input ${errors.yearsOfExperience ? 'error' : ''}`}
                        value={doctorFormData.yearsOfExperience}
                        onChange={handleDoctorChange}
                        placeholder="0-60"
                        min="0"
                        max="60"
                      />
                    </div>
                    {errors.yearsOfExperience && (
                      <span className="error-message">
                        <AlertCircle size={14} strokeWidth={2.2} />
                        {errors.yearsOfExperience}
                      </span>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="doctor-fee">
                      رسوم الكشف (ل.س) <span className="required-mark">*</span>
                    </label>
                    <div className="form-input-wrapper">
                      <span className="form-input-icon" aria-hidden="true">
                        <Briefcase size={18} strokeWidth={2} />
                      </span>
                      <input
                        id="doctor-fee"
                        type="number"
                        name="consultationFee"
                        className={`form-input ${errors.consultationFee ? 'error' : ''}`}
                        value={doctorFormData.consultationFee}
                        onChange={handleDoctorChange}
                        placeholder="مثال: 50000"
                        min="0"
                      />
                    </div>
                    {errors.consultationFee && (
                      <span className="error-message">
                        <AlertCircle size={14} strokeWidth={2.2} />
                        {errors.consultationFee}
                      </span>
                    )}
                  </div>
                </div>

                {/* ═══ Calendly-style weekly schedule editor ═══ */}
                {/* Replaces the legacy 7-button weekday grid.
                    The doctor now defines exact working hours per day with
                    multi-period support (morning + afternoon shifts), slot
                    duration, and booking window. The backend auto-generates
                    availability_slots from this template on admin approval. */}
                <div className="form-group form-group-schedule">
                  <WeeklyScheduleEditor
                    mode="signup"
                    value={doctorFormData.scheduleTemplate}
                    onChange={handleScheduleTemplateChange}
                    errors={{
                      weeklyPattern: errors.scheduleTemplate || errors.availableDays,
                    }}
                  />
                  {(errors.scheduleTemplate || errors.availableDays) && (
                    <span className="error-message">
                      <AlertCircle size={14} strokeWidth={2.2} />
                      {errors.scheduleTemplate || errors.availableDays}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* ═══ STEP 3: Documents ═══ */}
            {currentStep === 3 && (
              <div className="form-step">
                <div className="documents-intro">
                  <div className="documents-intro-icon">
                    <Paperclip size={22} strokeWidth={2} />
                  </div>
                  <div>
                    <h3>الوثائق المطلوبة</h3>
                    <p>يرجى رفع الوثائق التالية للتحقق من هويتك المهنية. الحد الأقصى لحجم الملف: 5 ميجابايت.</p>
                  </div>
                </div>

                <FileUploadField
                  id="licenseDocument"
                  label="صورة الترخيص الطبي"
                  hint="PDF, JPG, PNG حتى 5MB"
                  required
                  accept=".pdf,.jpg,.jpeg,.png"
                  Icon={FileText}
                  file={doctorFormData.licenseDocument}
                  error={errors.licenseDocument}
                  onFileChange={(file) => handleFileUpload('licenseDocument', file)}
                  onFileRemove={() => handleFileRemove('licenseDocument')}
                />

                <FileUploadField
                  id="medicalCertificate"
                  label="صورة شهادة الطب"
                  hint="PDF, JPG, PNG حتى 5MB"
                  required
                  accept=".pdf,.jpg,.jpeg,.png"
                  Icon={GraduationCap}
                  file={doctorFormData.medicalCertificate}
                  error={errors.medicalCertificate}
                  onFileChange={(file) => handleFileUpload('medicalCertificate', file)}
                  onFileRemove={() => handleFileRemove('medicalCertificate')}
                />

                <FileUploadField
                  id="profilePhoto"
                  label="صورة شخصية"
                  hint="اختياري — JPG, PNG حتى 5MB"
                  required={false}
                  accept=".jpg,.jpeg,.png"
                  Icon={Camera}
                  file={doctorFormData.profilePhoto}
                  error={errors.profilePhoto}
                  onFileChange={(file) => handleFileUpload('profilePhoto', file)}
                  onFileRemove={() => handleFileRemove('profilePhoto')}
                />

                <div className="form-group">
                  <label className="form-label" htmlFor="doctor-notes">
                    ملاحظات إضافية
                    <span className="label-hint">(اختياري)</span>
                  </label>
                  <textarea
                    id="doctor-notes"
                    name="additionalNotes"
                    className="form-input"
                    value={doctorFormData.additionalNotes}
                    onChange={handleDoctorChange}
                    placeholder="أي معلومات إضافية تريد إضافتها للطلب"
                    rows="3"
                  />
                </div>
              </div>
            )}

            {/* ═══ STEP 4: Review ═══ */}
            {currentStep === 4 && (
              <div className="form-step review-step">
                <div className="review-header">
                  <div className="review-header-icon">
                    <ClipboardCheck size={28} strokeWidth={2} />
                  </div>
                  <h3>مراجعة البيانات</h3>
                  <p>تأكد من صحة جميع البيانات قبل تقديم الطلب</p>
                </div>

                <div className="review-sections">
                  {/* Personal Info */}
                  <div className="review-section">
                    <h4>
                      <User size={16} strokeWidth={2.2} />
                      المعلومات الشخصية
                    </h4>
                    <div className="review-grid">
                      <div className="review-item full-width">
                        <span className="review-label">الاسم الكامل</span>
                        <span className="review-value">
                          {doctorFormData.firstName} {doctorFormData.fatherName} {doctorFormData.lastName}
                        </span>
                      </div>
                      <div className="review-item">
                        <span className="review-label">اسم الأم</span>
                        <span className="review-value">{doctorFormData.motherName}</span>
                      </div>
                      <div className="review-item">
                        <span className="review-label">الرقم الوطني</span>
                        <span className="review-value" dir="ltr">{doctorFormData.nationalId}</span>
                      </div>
                      <div className="review-item">
                        <span className="review-label">البريد الإلكتروني</span>
                        <span className="review-value" dir="ltr">{doctorFormData.email}</span>
                      </div>
                      <div className="review-item">
                        <span className="review-label">رقم الهاتف</span>
                        <span className="review-value" dir="ltr">{doctorFormData.phoneNumber}</span>
                      </div>
                      <div className="review-item">
                        <span className="review-label">المحافظة</span>
                        <span className="review-value">
                          {SYRIAN_GOVERNORATES.find((g) => g.id === doctorFormData.governorate)?.nameAr}
                        </span>
                      </div>
                      <div className="review-item">
                        <span className="review-label">المدينة</span>
                        <span className="review-value">{doctorFormData.city}</span>
                      </div>
                    </div>
                  </div>

                  {/* Professional Info */}
                  <div className="review-section">
                    <h4>
                      <Briefcase size={16} strokeWidth={2.2} />
                      المعلومات المهنية
                    </h4>
                    <div className="review-grid">
                      <div className="review-item">
                        <span className="review-label">رقم الترخيص</span>
                        <span className="review-value" dir="ltr">
                          {doctorFormData.medicalLicenseNumber.toUpperCase()}
                        </span>
                      </div>
                      <div className="review-item">
                        <span className="review-label">التخصص</span>
                        <span className="review-value">
                          {selectedSpecialization?.nameAr}
                          {selectedSpecialization?.hasECG && ' (ECG AI)'}
                        </span>
                      </div>
                      <div className="review-item">
                        <span className="review-label">مكان العمل</span>
                        <span className="review-value">{doctorFormData.hospitalAffiliation}</span>
                      </div>
                      <div className="review-item">
                        <span className="review-label">سنوات الخبرة</span>
                        <span className="review-value">{doctorFormData.yearsOfExperience} سنة</span>
                      </div>
                      <div className="review-item">
                        <span className="review-label">رسوم الكشف</span>
                        <span className="review-value">{doctorFormData.consultationFee} ل.س</span>
                      </div>
                      <div className="review-item full-width">
                        <span className="review-label">أيام العمل</span>
                        <span className="review-value">
                          {doctorFormData.availableDays
                            .map((d) => WEEKDAYS.find((w) => w.id === d)?.nameAr)
                            .join(' • ') || 'لم يتم تحديد أيام'}
                        </span>
                      </div>
                      {/* ── Schedule template review (v2) ─────────────────── */}
                      {doctorFormData.scheduleTemplate && (
                        <>
                          <div className="review-item">
                            <span className="review-label">مدة الموعد</span>
                            <span className="review-value">
                              {doctorFormData.scheduleTemplate.slotDuration} دقيقة
                            </span>
                          </div>
                          <div className="review-item">
                            <span className="review-label">نافذة الحجز</span>
                            <span className="review-value">
                              {doctorFormData.scheduleTemplate.bookingWindowDays} يوم
                            </span>
                          </div>
                          <div className="review-item full-width">
                            <span className="review-label">إجمالي ساعات العمل الأسبوعية</span>
                            <span className="review-value">
                              {(() => {
                                const WEEKDAY_IDS = [
                                  'Sunday', 'Monday', 'Tuesday', 'Wednesday',
                                  'Thursday', 'Friday', 'Saturday',
                                ];
                                let totalMin = 0;
                                WEEKDAY_IDS.forEach((day) => {
                                  const periods = doctorFormData.scheduleTemplate
                                    .weeklyPattern?.[day] || [];
                                  periods.forEach((p) => {
                                    const [sh, sm] = (p.startTime || '0:0').split(':').map(Number);
                                    const [eh, em] = (p.endTime || '0:0').split(':').map(Number);
                                    const startMin = (sh * 60) + (sm || 0);
                                    const endMin = (eh * 60) + (em || 0);
                                    if (endMin > startMin) totalMin += (endMin - startMin);
                                  });
                                });
                                const h = Math.floor(totalMin / 60);
                                const m = totalMin % 60;
                                if (h === 0 && m === 0) return '—';
                                if (m === 0) return `${h} ساعة`;
                                if (h === 0) return `${m} دقيقة`;
                                return `${h} ساعة ${m} دقيقة`;
                              })()}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Documents */}
                  <div className="review-section">
                    <h4>
                      <Paperclip size={16} strokeWidth={2.2} />
                      الوثائق المرفقة
                    </h4>
                    <div className="review-docs">
                      <div className={`review-doc ${doctorFormData.licenseDocument ? 'attached' : 'missing'}`}>
                        {doctorFormData.licenseDocument
                          ? <Check size={16} strokeWidth={2.5} />
                          : <X size={16} strokeWidth={2.5} />}
                        <span>
                          الترخيص الطبي: {doctorFormData.licenseDocument?.name || 'غير مرفق'}
                        </span>
                      </div>
                      <div className={`review-doc ${doctorFormData.medicalCertificate ? 'attached' : 'missing'}`}>
                        {doctorFormData.medicalCertificate
                          ? <Check size={16} strokeWidth={2.5} />
                          : <X size={16} strokeWidth={2.5} />}
                        <span>
                          شهادة الطب: {doctorFormData.medicalCertificate?.name || 'غير مرفق'}
                        </span>
                      </div>
                      <div className={`review-doc ${doctorFormData.profilePhoto ? 'attached' : 'missing'}`}>
                        {doctorFormData.profilePhoto
                          ? <Check size={16} strokeWidth={2.5} />
                          : <X size={16} strokeWidth={2.5} />}
                        <span>
                          الصورة الشخصية: {doctorFormData.profilePhoto?.name || 'غير مرفقة'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="review-agreement">
                  <label className="checkbox-label">
                    <input type="checkbox" required />
                    <span className="checkbox-custom" />
                    <span>
                      أقر بأن جميع المعلومات المقدمة صحيحة وأوافق على
                      <Link to="/terms" target="_blank" style={{ color: 'var(--tm-action)', fontWeight: 700, margin: '0 4px' }}>
                        الشروط والأحكام
                      </Link>
                      وسياسة الخصوصية
                    </span>
                  </label>
                </div>
              </div>
            )}

            {/* Form actions */}
            <div className="form-actions">
              {currentStep > 1 && (
                <button type="button" className="btn-secondary" onClick={handlePrev}>
                  <ArrowRight size={18} strokeWidth={2.2} />
                  <span>السابق</span>
                </button>
              )}

              {currentStep < DOCTOR_TOTAL_STEPS ? (
                <button type="button" className="btn-primary" onClick={handleNext}>
                  <span>التالي</span>
                  <ArrowLeft size={18} strokeWidth={2.2} />
                </button>
              ) : (
                <button type="submit" className="btn-primary">
                  <Send size={18} strokeWidth={2.2} />
                  <span>تقديم الطلب</span>
                </button>
              )}
            </div>

            <div className="login-link">
              لديك حساب بالفعل؟
              <Link to="/">تسجيل الدخول</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
    );
  }

  /* ═════════════════════════════════════════════════════════════════
     RENDER — PHARMACIST REGISTRATION FORM (4 steps)
     Steps : Personal → Professional → Documents → Review
     ═════════════════════════════════════════════════════════════════ */

  if (userType === 'professional' && professionalType === 'pharmacist') {
    const progressPercent = ((currentStep - 1) / (PHARMACIST_TOTAL_STEPS - 1)) * 100;

    return (
      <div className="signup-page">
        <Navbar />
        <Modal
          isOpen={modal.isOpen}
          type={modal.type}
          title={modal.title}
          message={modal.message}
          onClose={closeModal}
        />

        <div className="signup-container">
          <div className="signup-wrapper">
            {/* Back button */}
            <button
              type="button"
              className="back-to-selection"
              onClick={handleBackToProfessionalSelection}
            >
              <ArrowRight size={16} strokeWidth={2.2} />
              <span>العودة لاختيار المهنة</span>
            </button>

            {/* Progress bar */}
            <div className="progress-bar">
              <div className="progress-track" />
              <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
              <div className="progress-steps">
                {[1, 2, 3, 4].map((step) => (
                  <div
                    key={step}
                    className={`progress-step ${
                      currentStep === step ? 'active' : ''
                    } ${currentStep > step ? 'completed' : ''}`}
                  >
                    {currentStep > step ? <Check size={18} strokeWidth={3} /> : step}
                  </div>
                ))}
              </div>
            </div>

            {/* Form header with ministry badge */}
            <div className="form-header pharmacist">
              <div className="pharmacist-header-badge">
                <Pill size={14} strokeWidth={2.5} />
                <span>طلب تسجيل صيدلي</span>
              </div>
              <h1 className="form-title">انضم إلى الكادر الصيدلاني</h1>
              <p className="form-subtitle">
                {currentStep === 1 && 'الخطوة 1 من 4 — المعلومات الشخصية'}
                {currentStep === 2 && 'الخطوة 2 من 4 — المعلومات المهنية والصيدلية'}
                {currentStep === 3 && 'الخطوة 3 من 4 — الوثائق المطلوبة'}
                {currentStep === 4 && 'الخطوة 4 من 4 — مراجعة الطلب'}
              </p>
            </div>

            {/* Form */}
            <form className="signup-form" onSubmit={handlePharmacistSubmit} noValidate>

              {/* ═══ STEP 1: Personal Information ═══ */}
              {currentStep === 1 && (
                <div className="form-step">
                  {/* Names row 1 */}
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="pharm-firstName">
                        الاسم الأول <span className="required-mark">*</span>
                      </label>
                      <div className="form-input-wrapper">
                        <span className="form-input-icon" aria-hidden="true">
                          <User size={18} strokeWidth={2} />
                        </span>
                        <input
                          id="pharm-firstName"
                          type="text"
                          name="firstName"
                          className={`form-input ${errors.firstName ? 'error' : ''}`}
                          value={pharmacistFormData.firstName}
                          onChange={handlePharmacistChange}
                          placeholder="أدخل الاسم الأول"
                          maxLength={50}
                          autoComplete="given-name"
                        />
                      </div>
                      {errors.firstName && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.firstName}
                        </span>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="pharm-fatherName">
                        اسم الأب <span className="required-mark">*</span>
                      </label>
                      <div className="form-input-wrapper">
                        <span className="form-input-icon" aria-hidden="true">
                          <User size={18} strokeWidth={2} />
                        </span>
                        <input
                          id="pharm-fatherName"
                          type="text"
                          name="fatherName"
                          className={`form-input ${errors.fatherName ? 'error' : ''}`}
                          value={pharmacistFormData.fatherName}
                          onChange={handlePharmacistChange}
                          placeholder="أدخل اسم الأب"
                          maxLength={50}
                        />
                      </div>
                      {errors.fatherName && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.fatherName}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Names row 2 */}
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="pharm-lastName">
                        الكنية <span className="required-mark">*</span>
                      </label>
                      <div className="form-input-wrapper">
                        <span className="form-input-icon" aria-hidden="true">
                          <User size={18} strokeWidth={2} />
                        </span>
                        <input
                          id="pharm-lastName"
                          type="text"
                          name="lastName"
                          className={`form-input ${errors.lastName ? 'error' : ''}`}
                          value={pharmacistFormData.lastName}
                          onChange={handlePharmacistChange}
                          placeholder="أدخل الكنية"
                          maxLength={50}
                          autoComplete="family-name"
                        />
                      </div>
                      {errors.lastName && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.lastName}
                        </span>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="pharm-motherName">
                        اسم الأم الكامل <span className="required-mark">*</span>
                      </label>
                      <div className="form-input-wrapper">
                        <span className="form-input-icon" aria-hidden="true">
                          <User size={18} strokeWidth={2} />
                        </span>
                        <input
                          id="pharm-motherName"
                          type="text"
                          name="motherName"
                          className={`form-input ${errors.motherName ? 'error' : ''}`}
                          value={pharmacistFormData.motherName}
                          onChange={handlePharmacistChange}
                          placeholder="أدخل اسم الأم الكامل"
                          maxLength={100}
                        />
                      </div>
                      {errors.motherName && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.motherName}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* National ID */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="pharm-nationalId">
                      الرقم الوطني <span className="required-mark">*</span>
                    </label>
                    <div className="form-input-wrapper">
                      <span className="form-input-icon" aria-hidden="true">
                        <IdCard size={18} strokeWidth={2} />
                      </span>
                      <input
                        id="pharm-nationalId"
                        type="text"
                        name="nationalId"
                        className={`form-input ${errors.nationalId ? 'error' : ''}`}
                        value={pharmacistFormData.nationalId}
                        onChange={handlePharmacistChange}
                        placeholder="11 رقم"
                        maxLength={11}
                        dir="ltr"
                      />
                    </div>
                    {errors.nationalId && (
                      <span className="error-message">
                        <AlertCircle size={14} strokeWidth={2.2} />
                        {errors.nationalId}
                      </span>
                    )}
                  </div>

                  {/* DOB + Gender */}
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="pharm-dateOfBirth">
                        تاريخ الميلاد <span className="required-mark">*</span>
                      </label>
                      <div className="form-input-wrapper">
                        <span className="form-input-icon" aria-hidden="true">
                          <Calendar size={18} strokeWidth={2} />
                        </span>
                        <input
                          id="pharm-dateOfBirth"
                          type="date"
                          name="dateOfBirth"
                          className={`form-input ${errors.dateOfBirth ? 'error' : ''}`}
                          value={pharmacistFormData.dateOfBirth}
                          onChange={handlePharmacistChange}
                          max={getTodayDate()}
                        />
                      </div>
                      {errors.dateOfBirth && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.dateOfBirth}
                        </span>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="pharm-gender">
                        الجنس <span className="required-mark">*</span>
                      </label>
                      <select
                        id="pharm-gender"
                        name="gender"
                        className="form-input"
                        value={pharmacistFormData.gender}
                        onChange={handlePharmacistChange}
                      >
                        <option value="male">ذكر</option>
                        <option value="female">أنثى</option>
                      </select>
                    </div>
                  </div>

                  {/* Email */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="pharm-email">
                      البريد الإلكتروني <span className="required-mark">*</span>
                    </label>
                    <div className="form-input-wrapper">
                      <span className="form-input-icon" aria-hidden="true">
                        <Mail size={18} strokeWidth={2} />
                      </span>
                      <input
                        id="pharm-email"
                        type="email"
                        name="email"
                        className={`form-input ${errors.email ? 'error' : ''}`}
                        value={pharmacistFormData.email}
                        onChange={handlePharmacistChange}
                        placeholder="example@email.com"
                        dir="ltr"
                        autoComplete="email"
                      />
                    </div>
                    {errors.email && (
                      <span className="error-message">
                        <AlertCircle size={14} strokeWidth={2.2} />
                        {errors.email}
                      </span>
                    )}
                    <span className="form-hint">
                      <Info size={12} strokeWidth={2.2} />
                      سيتم إرسال بيانات الدخول إلى هذا البريد عند القبول
                    </span>
                  </div>

                  {/* Passwords */}
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="pharm-password">
                        كلمة المرور <span className="required-mark">*</span>
                      </label>
                      <div className="form-input-wrapper has-toggle">
                        <span className="form-input-icon" aria-hidden="true">
                          <Lock size={18} strokeWidth={2} />
                        </span>
                        <input
                          id="pharm-password"
                          type={showPharmPassword ? 'text' : 'password'}
                          name="password"
                          className={`form-input ${errors.password ? 'error' : ''}`}
                          value={pharmacistFormData.password}
                          onChange={handlePharmacistChange}
                          placeholder="8 أحرف على الأقل"
                          dir="ltr"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          className="password-toggle-btn"
                          onClick={() => setShowPharmPassword((p) => !p)}
                          aria-label={showPharmPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                        >
                          {showPharmPassword
                            ? <EyeOff size={18} strokeWidth={2} />
                            : <Eye size={18} strokeWidth={2} />}
                        </button>
                      </div>
                      {errors.password && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.password}
                        </span>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="pharm-confirmPassword">
                        تأكيد كلمة المرور <span className="required-mark">*</span>
                      </label>
                      <div className="form-input-wrapper has-toggle">
                        <span className="form-input-icon" aria-hidden="true">
                          <Lock size={18} strokeWidth={2} />
                        </span>
                        <input
                          id="pharm-confirmPassword"
                          type={showPharmConfirm ? 'text' : 'password'}
                          name="confirmPassword"
                          className={`form-input ${errors.confirmPassword ? 'error' : ''}`}
                          value={pharmacistFormData.confirmPassword}
                          onChange={handlePharmacistChange}
                          placeholder="أعد إدخال كلمة المرور"
                          dir="ltr"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          className="password-toggle-btn"
                          onClick={() => setShowPharmConfirm((p) => !p)}
                          aria-label={showPharmConfirm ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                        >
                          {showPharmConfirm
                            ? <EyeOff size={18} strokeWidth={2} />
                            : <Eye size={18} strokeWidth={2} />}
                        </button>
                      </div>
                      {errors.confirmPassword && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.confirmPassword}
                        </span>
                      )}
                    </div>
                  </div>

                  <PasswordStrengthMeter password={pharmacistFormData.password} />

                  {/* Phone */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="pharm-phoneNumber">
                      رقم الهاتف <span className="required-mark">*</span>
                    </label>
                    <div className="form-input-wrapper">
                      <span className="form-input-icon" aria-hidden="true">
                        <Phone size={18} strokeWidth={2} />
                      </span>
                      <input
                        id="pharm-phoneNumber"
                        type="tel"
                        name="phoneNumber"
                        className={`form-input ${errors.phoneNumber ? 'error' : ''}`}
                        value={pharmacistFormData.phoneNumber}
                        onChange={handlePharmacistChange}
                        placeholder="+963 9XX XXX XXX"
                        dir="ltr"
                        autoComplete="tel"
                      />
                    </div>
                    {errors.phoneNumber && (
                      <span className="error-message">
                        <AlertCircle size={14} strokeWidth={2.2} />
                        {errors.phoneNumber}
                      </span>
                    )}
                  </div>

                  {/* Governorate + City */}
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="pharm-governorate">
                        المحافظة <span className="required-mark">*</span>
                      </label>
                      <select
                        id="pharm-governorate"
                        name="governorate"
                        className={`form-input ${errors.governorate ? 'error' : ''}`}
                        value={pharmacistFormData.governorate}
                        onChange={handlePharmacistChange}
                      >
                        <option value="">اختر المحافظة</option>
                        {SYRIAN_GOVERNORATES.map((g) => (
                          <option key={g.id} value={g.id}>{g.nameAr}</option>
                        ))}
                      </select>
                      {errors.governorate && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.governorate}
                        </span>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="pharm-city">
                        المدينة <span className="required-mark">*</span>
                      </label>
                      <div className="form-input-wrapper">
                        <span className="form-input-icon" aria-hidden="true">
                          <MapPin size={18} strokeWidth={2} />
                        </span>
                        <input
                          id="pharm-city"
                          type="text"
                          name="city"
                          className={`form-input ${errors.city ? 'error' : ''}`}
                          value={pharmacistFormData.city}
                          onChange={handlePharmacistChange}
                          placeholder="أدخل المدينة"
                        />
                      </div>
                      {errors.city && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.city}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Address */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="pharm-address">
                      عنوان السكن <span className="required-mark">*</span>
                    </label>
                    <div className="form-input-wrapper">
                      <span className="form-input-icon" aria-hidden="true">
                        <Building size={18} strokeWidth={2} />
                      </span>
                      <input
                        id="pharm-address"
                        type="text"
                        name="address"
                        className={`form-input ${errors.address ? 'error' : ''}`}
                        value={pharmacistFormData.address}
                        onChange={handlePharmacistChange}
                        placeholder="العنوان التفصيلي"
                      />
                    </div>
                    {errors.address && (
                      <span className="error-message">
                        <AlertCircle size={14} strokeWidth={2.2} />
                        {errors.address}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* ═══ STEP 2: Professional Information ═══ */}
              {currentStep === 2 && (
                <div className="form-step">
                  {/* License number */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="pharm-licenseNumber">
                      رقم الترخيص المهني <span className="required-mark">*</span>
                    </label>
                    <div className="form-input-wrapper">
                      <span className="form-input-icon" aria-hidden="true">
                        <Award size={18} strokeWidth={2} />
                      </span>
                      <input
                        id="pharm-licenseNumber"
                        type="text"
                        name="pharmacyLicenseNumber"
                        className={`form-input ${errors.pharmacyLicenseNumber ? 'error' : ''}`}
                        value={pharmacistFormData.pharmacyLicenseNumber}
                        onChange={handlePharmacistChange}
                        placeholder="مثال: PH-SY-12345"
                        dir="ltr"
                        style={{ textTransform: 'uppercase' }}
                      />
                    </div>
                    {errors.pharmacyLicenseNumber && (
                      <span className="error-message">
                        <AlertCircle size={14} strokeWidth={2.2} />
                        {errors.pharmacyLicenseNumber}
                      </span>
                    )}
                    <span className="form-hint">
                      <Info size={12} strokeWidth={2.2} />
                      رقم الترخيص من نقابة الصيادلة السورية (6-20 حرف/رقم)
                    </span>
                  </div>

                  {/* Degree picker */}
                  <div className="form-group">
                    <label className="form-label">
                      الدرجة العلمية <span className="required-mark">*</span>
                    </label>
                    <div className="degree-grid" role="radiogroup">
                      {PHARMACIST_DEGREES.map((deg) => {
                        const isSelected = pharmacistFormData.degree === deg.id;
                        return (
                          <button
                            key={deg.id}
                            type="button"
                            className={`degree-card ${isSelected ? 'selected' : ''}`}
                            onClick={() => setPharmacistFormData((prev) => ({ ...prev, degree: deg.id }))}
                            role="radio"
                            aria-checked={isSelected}
                          >
                            <div className="degree-card-icon">
                              <GraduationCap size={20} strokeWidth={2} />
                            </div>
                            <div className="degree-card-content">
                              <span className="degree-card-name">{deg.nameAr}</span>
                              <span className="degree-card-hint">{deg.hint}</span>
                            </div>
                            {isSelected && (
                              <div className="degree-card-check">
                                <Check size={14} strokeWidth={3} />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {errors.degree && (
                      <span className="error-message">
                        <AlertCircle size={14} strokeWidth={2.2} />
                        {errors.degree}
                      </span>
                    )}
                  </div>

                  {/* Specialization picker (card grid) */}
                  <div className="form-group">
                    <label className="form-label">
                      مجال العمل <span className="required-mark">*</span>
                    </label>
                    <div className="pharm-spec-grid" role="radiogroup">
                      {PHARMACIST_SPECIALIZATIONS.map((spec) => {
                        const SpecIcon = spec.Icon;
                        const isSelected = pharmacistFormData.specialization === spec.id;
                        return (
                          <button
                            key={spec.id}
                            type="button"
                            className={`pharm-spec-card ${isSelected ? 'selected' : ''}`}
                            onClick={() => handlePharmSpecSelect(spec.id)}
                            role="radio"
                            aria-checked={isSelected}
                          >
                            <div className="pharm-spec-icon">
                              <SpecIcon size={22} strokeWidth={2} />
                            </div>
                            <div className="pharm-spec-content">
                              <span className="pharm-spec-name">{spec.nameAr}</span>
                              <span className="pharm-spec-desc">{spec.description}</span>
                            </div>
                            {isSelected && (
                              <div className="pharm-spec-check">
                                <Check size={14} strokeWidth={3} />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {errors.specialization && (
                      <span className="error-message">
                        <AlertCircle size={14} strokeWidth={2.2} />
                        {errors.specialization}
                      </span>
                    )}
                  </div>

                  {/* Years of experience + Employment type */}
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="pharm-years">
                        سنوات الخبرة <span className="required-mark">*</span>
                      </label>
                      <div className="form-input-wrapper">
                        <span className="form-input-icon" aria-hidden="true">
                          <Clock size={18} strokeWidth={2} />
                        </span>
                        <input
                          id="pharm-years"
                          type="number"
                          name="yearsOfExperience"
                          className={`form-input ${errors.yearsOfExperience ? 'error' : ''}`}
                          value={pharmacistFormData.yearsOfExperience}
                          onChange={handlePharmacistChange}
                          placeholder="0-60"
                          min="0"
                          max="60"
                        />
                      </div>
                      {errors.yearsOfExperience && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.yearsOfExperience}
                        </span>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="pharm-employment">
                        نوع الدوام <span className="required-mark">*</span>
                      </label>
                      <select
                        id="pharm-employment"
                        name="employmentType"
                        className={`form-input ${errors.employmentType ? 'error' : ''}`}
                        value={pharmacistFormData.employmentType}
                        onChange={handlePharmacistChange}
                      >
                        {PHARMACIST_EMPLOYMENT_TYPES.map((et) => (
                          <option key={et.id} value={et.id}>{et.nameAr}</option>
                        ))}
                      </select>
                      {errors.employmentType && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.employmentType}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Facility autocomplete */}
                  <FacilityAutocomplete
                    label="الصيدلية التي تعمل بها"
                    placeholder="ابحث عن الصيدلية بالاسم..."
                    searchFn={searchPharmacies}
                    value={pharmacistFormData.selectedPharmacy}
                    newFacility={pharmacistFormData.newPharmacy}
                    onSelect={handlePharmacySelect}
                    onNewFacilityChange={handleNewPharmacyChange}
                    error={errors.pharmacy}
                    facilityType="pharmacy"
                  />
                </div>
              )}

              {/* ═══ STEP 3: Documents ═══ */}
              {currentStep === 3 && (
                <div className="form-step">
                  <div className="documents-intro">
                    <div className="documents-intro-icon">
                      <Paperclip size={22} strokeWidth={2} />
                    </div>
                    <div>
                      <h3>الوثائق المطلوبة</h3>
                      <p>يرجى رفع الوثائق التالية للتحقق من هويتك المهنية. الحد الأقصى لحجم الملف: 5 ميجابايت.</p>
                    </div>
                  </div>

                  <FileUploadField
                    id="pharm-licenseDocument"
                    label="صورة الترخيص المهني"
                    hint="PDF, JPG, PNG حتى 5MB"
                    required
                    accept={DOC_ACCEPT}
                    Icon={FileText}
                    file={pharmacistFormData.licenseDocument}
                    error={errors.licenseDocument}
                    onFileChange={(file) => pharmacistFiles.upload('licenseDocument', file)}
                    onFileRemove={() => pharmacistFiles.remove('licenseDocument')}
                  />

                  <FileUploadField
                    id="pharm-degreeDocument"
                    label="صورة الشهادة العلمية"
                    hint="PDF, JPG, PNG حتى 5MB"
                    required
                    accept={DOC_ACCEPT}
                    Icon={GraduationCap}
                    file={pharmacistFormData.degreeDocument}
                    error={errors.degreeDocument}
                    onFileChange={(file) => pharmacistFiles.upload('degreeDocument', file)}
                    onFileRemove={() => pharmacistFiles.remove('degreeDocument')}
                  />

                  <FileUploadField
                    id="pharm-profilePhoto"
                    label="صورة شخصية"
                    hint="اختياري — JPG, PNG حتى 5MB"
                    required={false}
                    accept={IMAGE_ACCEPT}
                    Icon={Camera}
                    file={pharmacistFormData.profilePhoto}
                    error={errors.profilePhoto}
                    onFileChange={(file) => pharmacistFiles.upload('profilePhoto', file)}
                    onFileRemove={() => pharmacistFiles.remove('profilePhoto')}
                  />

                  <div className="form-group">
                    <label className="form-label" htmlFor="pharm-notes">
                      ملاحظات إضافية
                      <span className="label-hint">(اختياري)</span>
                    </label>
                    <textarea
                      id="pharm-notes"
                      name="additionalNotes"
                      className="form-input"
                      value={pharmacistFormData.additionalNotes}
                      onChange={handlePharmacistChange}
                      placeholder="أي معلومات إضافية تريد إضافتها للطلب"
                      rows="3"
                    />
                  </div>
                </div>
              )}

              {/* ═══ STEP 4: Review ═══ */}
              {currentStep === 4 && (
                <div className="form-step review-step">
                  <div className="review-header">
                    <div className="review-header-icon">
                      <ClipboardCheck size={28} strokeWidth={2} />
                    </div>
                    <h3>مراجعة البيانات</h3>
                    <p>تأكد من صحة جميع البيانات قبل تقديم الطلب</p>
                  </div>

                  <div className="review-sections">
                    {/* Personal */}
                    <div className="review-section">
                      <h4>
                        <User size={16} strokeWidth={2.2} />
                        المعلومات الشخصية
                      </h4>
                      <div className="review-grid">
                        <div className="review-item full-width">
                          <span className="review-label">الاسم الكامل</span>
                          <span className="review-value">
                            {pharmacistFormData.firstName} {pharmacistFormData.fatherName} {pharmacistFormData.lastName}
                          </span>
                        </div>
                        <div className="review-item">
                          <span className="review-label">اسم الأم</span>
                          <span className="review-value">{pharmacistFormData.motherName}</span>
                        </div>
                        <div className="review-item">
                          <span className="review-label">الرقم الوطني</span>
                          <span className="review-value" dir="ltr">{pharmacistFormData.nationalId}</span>
                        </div>
                        <div className="review-item">
                          <span className="review-label">البريد الإلكتروني</span>
                          <span className="review-value" dir="ltr">{pharmacistFormData.email}</span>
                        </div>
                        <div className="review-item">
                          <span className="review-label">رقم الهاتف</span>
                          <span className="review-value" dir="ltr">{pharmacistFormData.phoneNumber}</span>
                        </div>
                        <div className="review-item">
                          <span className="review-label">المحافظة</span>
                          <span className="review-value">
                            {SYRIAN_GOVERNORATES.find((g) => g.id === pharmacistFormData.governorate)?.nameAr}
                          </span>
                        </div>
                        <div className="review-item">
                          <span className="review-label">المدينة</span>
                          <span className="review-value">{pharmacistFormData.city}</span>
                        </div>
                      </div>
                    </div>

                    {/* Professional */}
                    <div className="review-section">
                      <h4>
                        <Pill size={16} strokeWidth={2.2} />
                        المعلومات المهنية
                      </h4>
                      <div className="review-grid">
                        <div className="review-item">
                          <span className="review-label">رقم الترخيص</span>
                          <span className="review-value" dir="ltr">
                            {pharmacistFormData.pharmacyLicenseNumber.toUpperCase()}
                          </span>
                        </div>
                        <div className="review-item">
                          <span className="review-label">الدرجة العلمية</span>
                          <span className="review-value">
                            {PHARMACIST_DEGREES.find((d) => d.id === pharmacistFormData.degree)?.nameAr}
                          </span>
                        </div>
                        <div className="review-item">
                          <span className="review-label">مجال العمل</span>
                          <span className="review-value">{selectedPharmSpecialization?.nameAr}</span>
                        </div>
                        <div className="review-item">
                          <span className="review-label">نوع الدوام</span>
                          <span className="review-value">
                            {PHARMACIST_EMPLOYMENT_TYPES.find((e) => e.id === pharmacistFormData.employmentType)?.nameAr}
                          </span>
                        </div>
                        <div className="review-item">
                          <span className="review-label">سنوات الخبرة</span>
                          <span className="review-value">{pharmacistFormData.yearsOfExperience} سنة</span>
                        </div>
                      </div>
                    </div>

                    {/* Facility */}
                    <div className="review-section">
                      <h4>
                        <Building size={16} strokeWidth={2.2} />
                        الصيدلية
                      </h4>
                      {pharmacistFormData.selectedPharmacy ? (
                        <div className="review-facility">
                          <div className="review-facility-icon existing">
                            <CheckCircle2 size={18} strokeWidth={2.2} />
                          </div>
                          <div className="review-facility-info">
                            <span className="review-facility-name">
                              {pharmacistFormData.selectedPharmacy.arabicName || pharmacistFormData.selectedPharmacy.name}
                            </span>
                            <span className="review-facility-address">
                              {[
                                SYRIAN_GOVERNORATES.find((g) => g.id === pharmacistFormData.selectedPharmacy.governorate)?.nameAr,
                                pharmacistFormData.selectedPharmacy.city,
                              ].filter(Boolean).join(' — ')}
                            </span>
                            <span className="review-facility-tag">صيدلية مسجلة</span>
                          </div>
                        </div>
                      ) : pharmacistFormData.newPharmacy ? (
                        <div className="review-facility">
                          <div className="review-facility-icon new">
                            <Plus size={18} strokeWidth={2.5} />
                          </div>
                          <div className="review-facility-info">
                            <span className="review-facility-name">
                              {pharmacistFormData.newPharmacy.name}
                            </span>
                            <span className="review-facility-address">
                              {[
                                SYRIAN_GOVERNORATES.find((g) => g.id === pharmacistFormData.newPharmacy.governorate)?.nameAr,
                                pharmacistFormData.newPharmacy.city,
                                pharmacistFormData.newPharmacy.address,
                              ].filter(Boolean).join(' — ')}
                            </span>
                            <span className="review-facility-tag new">صيدلية جديدة — بانتظار تسجيل الإدارة</span>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {/* Documents */}
                    <div className="review-section">
                      <h4>
                        <Paperclip size={16} strokeWidth={2.2} />
                        الوثائق المرفقة
                      </h4>
                      <div className="review-docs">
                        <div className={`review-doc ${pharmacistFormData.licenseDocument ? 'attached' : 'missing'}`}>
                          {pharmacistFormData.licenseDocument
                            ? <Check size={16} strokeWidth={2.5} />
                            : <X size={16} strokeWidth={2.5} />}
                          <span>
                            الترخيص المهني: {pharmacistFormData.licenseDocument?.name || 'غير مرفق'}
                          </span>
                        </div>
                        <div className={`review-doc ${pharmacistFormData.degreeDocument ? 'attached' : 'missing'}`}>
                          {pharmacistFormData.degreeDocument
                            ? <Check size={16} strokeWidth={2.5} />
                            : <X size={16} strokeWidth={2.5} />}
                          <span>
                            الشهادة العلمية: {pharmacistFormData.degreeDocument?.name || 'غير مرفق'}
                          </span>
                        </div>
                        <div className={`review-doc ${pharmacistFormData.profilePhoto ? 'attached' : 'missing'}`}>
                          {pharmacistFormData.profilePhoto
                            ? <Check size={16} strokeWidth={2.5} />
                            : <X size={16} strokeWidth={2.5} />}
                          <span>
                            الصورة الشخصية: {pharmacistFormData.profilePhoto?.name || 'غير مرفقة'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="review-agreement">
                    <label className="checkbox-label">
                      <input type="checkbox" required />
                      <span className="checkbox-custom" />
                      <span>
                        أقر بأن جميع المعلومات المقدمة صحيحة وأوافق على
                        <Link to="/terms" target="_blank" style={{ color: 'var(--tm-action)', fontWeight: 700, margin: '0 4px' }}>
                          الشروط والأحكام
                        </Link>
                        وسياسة الخصوصية
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* Form actions */}
              <div className="form-actions">
                {currentStep > 1 && (
                  <button type="button" className="btn-secondary" onClick={handlePrev}>
                    <ArrowRight size={18} strokeWidth={2.2} />
                    <span>السابق</span>
                  </button>
                )}

                {currentStep < PHARMACIST_TOTAL_STEPS ? (
                  <button type="button" className="btn-primary" onClick={handleNext}>
                    <span>التالي</span>
                    <ArrowLeft size={18} strokeWidth={2.2} />
                  </button>
                ) : (
                  <button type="submit" className="btn-primary">
                    <Send size={18} strokeWidth={2.2} />
                    <span>تقديم الطلب</span>
                  </button>
                )}
              </div>

              <div className="login-link">
                لديك حساب بالفعل؟
                <Link to="/">تسجيل الدخول</Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }
  /* ═════════════════════════════════════════════════════════════════
     RENDER — LAB TECHNICIAN REGISTRATION FORM (4 steps)
     Steps : Personal → Professional → Documents → Review
     ═════════════════════════════════════════════════════════════════ */

  if (userType === 'professional' && professionalType === 'lab_technician') {
    const progressPercent = ((currentStep - 1) / (LAB_TECH_TOTAL_STEPS - 1)) * 100;

    return (
      <div className="signup-page">
        <Navbar />
        <Modal
          isOpen={modal.isOpen}
          type={modal.type}
          title={modal.title}
          message={modal.message}
          onClose={closeModal}
        />

        <div className="signup-container">
          <div className="signup-wrapper">
            {/* Back button */}
            <button
              type="button"
              className="back-to-selection"
              onClick={handleBackToProfessionalSelection}
            >
              <ArrowRight size={16} strokeWidth={2.2} />
              <span>العودة لاختيار المهنة</span>
            </button>

            {/* Progress bar */}
            <div className="progress-bar">
              <div className="progress-track" />
              <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
              <div className="progress-steps">
                {[1, 2, 3, 4].map((step) => (
                  <div
                    key={step}
                    className={`progress-step ${
                      currentStep === step ? 'active' : ''
                    } ${currentStep > step ? 'completed' : ''}`}
                  >
                    {currentStep > step ? <Check size={18} strokeWidth={3} /> : step}
                  </div>
                ))}
              </div>
            </div>

            {/* Form header */}
            <div className="form-header lab-tech">
              <div className="lab-tech-header-badge">
                <Microscope size={14} strokeWidth={2.5} />
                <span>طلب تسجيل فني مختبر</span>
              </div>
              <h1 className="form-title">انضم إلى فريق المختبرات الطبية</h1>
              <p className="form-subtitle">
                {currentStep === 1 && 'الخطوة 1 من 4 — المعلومات الشخصية'}
                {currentStep === 2 && 'الخطوة 2 من 4 — المعلومات المهنية والمختبر'}
                {currentStep === 3 && 'الخطوة 3 من 4 — الوثائق المطلوبة'}
                {currentStep === 4 && 'الخطوة 4 من 4 — مراجعة الطلب'}
              </p>
            </div>

            {/* Form */}
            <form className="signup-form" onSubmit={handleLabTechSubmit} noValidate>

              {/* ═══ STEP 1: Personal Information ═══ */}
              {currentStep === 1 && (
                <div className="form-step">
                  {/* Names row 1 */}
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="lab-firstName">
                        الاسم الأول <span className="required-mark">*</span>
                      </label>
                      <div className="form-input-wrapper">
                        <span className="form-input-icon" aria-hidden="true">
                          <User size={18} strokeWidth={2} />
                        </span>
                        <input
                          id="lab-firstName"
                          type="text"
                          name="firstName"
                          className={`form-input ${errors.firstName ? 'error' : ''}`}
                          value={labTechFormData.firstName}
                          onChange={handleLabTechChange}
                          placeholder="أدخل الاسم الأول"
                          maxLength={50}
                          autoComplete="given-name"
                        />
                      </div>
                      {errors.firstName && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.firstName}
                        </span>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="lab-fatherName">
                        اسم الأب <span className="required-mark">*</span>
                      </label>
                      <div className="form-input-wrapper">
                        <span className="form-input-icon" aria-hidden="true">
                          <User size={18} strokeWidth={2} />
                        </span>
                        <input
                          id="lab-fatherName"
                          type="text"
                          name="fatherName"
                          className={`form-input ${errors.fatherName ? 'error' : ''}`}
                          value={labTechFormData.fatherName}
                          onChange={handleLabTechChange}
                          placeholder="أدخل اسم الأب"
                          maxLength={50}
                        />
                      </div>
                      {errors.fatherName && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.fatherName}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Names row 2 */}
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="lab-lastName">
                        الكنية <span className="required-mark">*</span>
                      </label>
                      <div className="form-input-wrapper">
                        <span className="form-input-icon" aria-hidden="true">
                          <User size={18} strokeWidth={2} />
                        </span>
                        <input
                          id="lab-lastName"
                          type="text"
                          name="lastName"
                          className={`form-input ${errors.lastName ? 'error' : ''}`}
                          value={labTechFormData.lastName}
                          onChange={handleLabTechChange}
                          placeholder="أدخل الكنية"
                          maxLength={50}
                          autoComplete="family-name"
                        />
                      </div>
                      {errors.lastName && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.lastName}
                        </span>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="lab-motherName">
                        اسم الأم الكامل <span className="required-mark">*</span>
                      </label>
                      <div className="form-input-wrapper">
                        <span className="form-input-icon" aria-hidden="true">
                          <User size={18} strokeWidth={2} />
                        </span>
                        <input
                          id="lab-motherName"
                          type="text"
                          name="motherName"
                          className={`form-input ${errors.motherName ? 'error' : ''}`}
                          value={labTechFormData.motherName}
                          onChange={handleLabTechChange}
                          placeholder="أدخل اسم الأم الكامل"
                          maxLength={100}
                        />
                      </div>
                      {errors.motherName && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.motherName}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* National ID */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="lab-nationalId">
                      الرقم الوطني <span className="required-mark">*</span>
                    </label>
                    <div className="form-input-wrapper">
                      <span className="form-input-icon" aria-hidden="true">
                        <IdCard size={18} strokeWidth={2} />
                      </span>
                      <input
                        id="lab-nationalId"
                        type="text"
                        name="nationalId"
                        className={`form-input ${errors.nationalId ? 'error' : ''}`}
                        value={labTechFormData.nationalId}
                        onChange={handleLabTechChange}
                        placeholder="11 رقم"
                        maxLength={11}
                        dir="ltr"
                      />
                    </div>
                    {errors.nationalId && (
                      <span className="error-message">
                        <AlertCircle size={14} strokeWidth={2.2} />
                        {errors.nationalId}
                      </span>
                    )}
                  </div>

                  {/* DOB + Gender */}
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="lab-dateOfBirth">
                        تاريخ الميلاد <span className="required-mark">*</span>
                      </label>
                      <div className="form-input-wrapper">
                        <span className="form-input-icon" aria-hidden="true">
                          <Calendar size={18} strokeWidth={2} />
                        </span>
                        <input
                          id="lab-dateOfBirth"
                          type="date"
                          name="dateOfBirth"
                          className={`form-input ${errors.dateOfBirth ? 'error' : ''}`}
                          value={labTechFormData.dateOfBirth}
                          onChange={handleLabTechChange}
                          max={getTodayDate()}
                        />
                      </div>
                      {errors.dateOfBirth && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.dateOfBirth}
                        </span>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="lab-gender">
                        الجنس <span className="required-mark">*</span>
                      </label>
                      <select
                        id="lab-gender"
                        name="gender"
                        className="form-input"
                        value={labTechFormData.gender}
                        onChange={handleLabTechChange}
                      >
                        <option value="male">ذكر</option>
                        <option value="female">أنثى</option>
                      </select>
                    </div>
                  </div>

                  {/* Email */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="lab-email">
                      البريد الإلكتروني <span className="required-mark">*</span>
                    </label>
                    <div className="form-input-wrapper">
                      <span className="form-input-icon" aria-hidden="true">
                        <Mail size={18} strokeWidth={2} />
                      </span>
                      <input
                        id="lab-email"
                        type="email"
                        name="email"
                        className={`form-input ${errors.email ? 'error' : ''}`}
                        value={labTechFormData.email}
                        onChange={handleLabTechChange}
                        placeholder="example@email.com"
                        dir="ltr"
                        autoComplete="email"
                      />
                    </div>
                    {errors.email && (
                      <span className="error-message">
                        <AlertCircle size={14} strokeWidth={2.2} />
                        {errors.email}
                      </span>
                    )}
                    <span className="form-hint">
                      <Info size={12} strokeWidth={2.2} />
                      سيتم إرسال بيانات الدخول إلى هذا البريد عند القبول
                    </span>
                  </div>

                  {/* Passwords */}
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="lab-password">
                        كلمة المرور <span className="required-mark">*</span>
                      </label>
                      <div className="form-input-wrapper has-toggle">
                        <span className="form-input-icon" aria-hidden="true">
                          <Lock size={18} strokeWidth={2} />
                        </span>
                        <input
                          id="lab-password"
                          type={showLabPassword ? 'text' : 'password'}
                          name="password"
                          className={`form-input ${errors.password ? 'error' : ''}`}
                          value={labTechFormData.password}
                          onChange={handleLabTechChange}
                          placeholder="8 أحرف على الأقل"
                          dir="ltr"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          className="password-toggle-btn"
                          onClick={() => setShowLabPassword((p) => !p)}
                          aria-label={showLabPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                        >
                          {showLabPassword
                            ? <EyeOff size={18} strokeWidth={2} />
                            : <Eye size={18} strokeWidth={2} />}
                        </button>
                      </div>
                      {errors.password && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.password}
                        </span>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="lab-confirmPassword">
                        تأكيد كلمة المرور <span className="required-mark">*</span>
                      </label>
                      <div className="form-input-wrapper has-toggle">
                        <span className="form-input-icon" aria-hidden="true">
                          <Lock size={18} strokeWidth={2} />
                        </span>
                        <input
                          id="lab-confirmPassword"
                          type={showLabConfirm ? 'text' : 'password'}
                          name="confirmPassword"
                          className={`form-input ${errors.confirmPassword ? 'error' : ''}`}
                          value={labTechFormData.confirmPassword}
                          onChange={handleLabTechChange}
                          placeholder="أعد إدخال كلمة المرور"
                          dir="ltr"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          className="password-toggle-btn"
                          onClick={() => setShowLabConfirm((p) => !p)}
                          aria-label={showLabConfirm ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                        >
                          {showLabConfirm
                            ? <EyeOff size={18} strokeWidth={2} />
                            : <Eye size={18} strokeWidth={2} />}
                        </button>
                      </div>
                      {errors.confirmPassword && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.confirmPassword}
                        </span>
                      )}
                    </div>
                  </div>

                  <PasswordStrengthMeter password={labTechFormData.password} />

                  {/* Phone */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="lab-phoneNumber">
                      رقم الهاتف <span className="required-mark">*</span>
                    </label>
                    <div className="form-input-wrapper">
                      <span className="form-input-icon" aria-hidden="true">
                        <Phone size={18} strokeWidth={2} />
                      </span>
                      <input
                        id="lab-phoneNumber"
                        type="tel"
                        name="phoneNumber"
                        className={`form-input ${errors.phoneNumber ? 'error' : ''}`}
                        value={labTechFormData.phoneNumber}
                        onChange={handleLabTechChange}
                        placeholder="+963 9XX XXX XXX"
                        dir="ltr"
                        autoComplete="tel"
                      />
                    </div>
                    {errors.phoneNumber && (
                      <span className="error-message">
                        <AlertCircle size={14} strokeWidth={2.2} />
                        {errors.phoneNumber}
                      </span>
                    )}
                  </div>

                  {/* Governorate + City */}
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="lab-governorate">
                        المحافظة <span className="required-mark">*</span>
                      </label>
                      <select
                        id="lab-governorate"
                        name="governorate"
                        className={`form-input ${errors.governorate ? 'error' : ''}`}
                        value={labTechFormData.governorate}
                        onChange={handleLabTechChange}
                      >
                        <option value="">اختر المحافظة</option>
                        {SYRIAN_GOVERNORATES.map((g) => (
                          <option key={g.id} value={g.id}>{g.nameAr}</option>
                        ))}
                      </select>
                      {errors.governorate && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.governorate}
                        </span>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="lab-city">
                        المدينة <span className="required-mark">*</span>
                      </label>
                      <div className="form-input-wrapper">
                        <span className="form-input-icon" aria-hidden="true">
                          <MapPin size={18} strokeWidth={2} />
                        </span>
                        <input
                          id="lab-city"
                          type="text"
                          name="city"
                          className={`form-input ${errors.city ? 'error' : ''}`}
                          value={labTechFormData.city}
                          onChange={handleLabTechChange}
                          placeholder="أدخل المدينة"
                        />
                      </div>
                      {errors.city && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.city}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Address */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="lab-address">
                      عنوان السكن <span className="required-mark">*</span>
                    </label>
                    <div className="form-input-wrapper">
                      <span className="form-input-icon" aria-hidden="true">
                        <Building size={18} strokeWidth={2} />
                      </span>
                      <input
                        id="lab-address"
                        type="text"
                        name="address"
                        className={`form-input ${errors.address ? 'error' : ''}`}
                        value={labTechFormData.address}
                        onChange={handleLabTechChange}
                        placeholder="العنوان التفصيلي"
                      />
                    </div>
                    {errors.address && (
                      <span className="error-message">
                        <AlertCircle size={14} strokeWidth={2.2} />
                        {errors.address}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* ═══ STEP 2: Professional Information ═══ */}
              {currentStep === 2 && (
                <div className="form-step">
                  {/* License number */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="lab-licenseNumber">
                      رقم الترخيص المهني <span className="required-mark">*</span>
                    </label>
                    <div className="form-input-wrapper">
                      <span className="form-input-icon" aria-hidden="true">
                        <Award size={18} strokeWidth={2} />
                      </span>
                      <input
                        id="lab-licenseNumber"
                        type="text"
                        name="licenseNumber"
                        className={`form-input ${errors.licenseNumber ? 'error' : ''}`}
                        value={labTechFormData.licenseNumber}
                        onChange={handleLabTechChange}
                        placeholder="مثال: LAB-SY-12345"
                        dir="ltr"
                        style={{ textTransform: 'uppercase' }}
                      />
                    </div>
                    {errors.licenseNumber && (
                      <span className="error-message">
                        <AlertCircle size={14} strokeWidth={2.2} />
                        {errors.licenseNumber}
                      </span>
                    )}
                    <span className="form-hint">
                      <Info size={12} strokeWidth={2.2} />
                      رقم الترخيص من وزارة الصحة السورية (6-20 حرف/رقم)
                    </span>
                  </div>

                  {/* Degree picker */}
                  <div className="form-group">
                    <label className="form-label">
                      الدرجة العلمية <span className="required-mark">*</span>
                    </label>
                    <div className="degree-grid" role="radiogroup">
                      {LAB_TECH_DEGREES.map((deg) => {
                        const isSelected = labTechFormData.degree === deg.id;
                        return (
                          <button
                            key={deg.id}
                            type="button"
                            className={`degree-card ${isSelected ? 'selected' : ''}`}
                            onClick={() => setLabTechFormData((prev) => ({ ...prev, degree: deg.id }))}
                            role="radio"
                            aria-checked={isSelected}
                          >
                            <div className="degree-card-icon">
                              <GraduationCap size={20} strokeWidth={2} />
                            </div>
                            <div className="degree-card-content">
                              <span className="degree-card-name">{deg.nameAr}</span>
                              <span className="degree-card-hint">{deg.hint}</span>
                            </div>
                            {isSelected && (
                              <div className="degree-card-check">
                                <Check size={14} strokeWidth={3} />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {errors.degree && (
                      <span className="error-message">
                        <AlertCircle size={14} strokeWidth={2.2} />
                        {errors.degree}
                      </span>
                    )}
                  </div>

                  {/* Specialization picker (card grid) */}
                  <div className="form-group">
                    <label className="form-label">
                      مجال التخصص <span className="required-mark">*</span>
                    </label>
                    <div className="lab-spec-grid" role="radiogroup">
                      {LAB_TECH_SPECIALIZATIONS.map((spec) => {
                        const SpecIcon = spec.Icon;
                        const isSelected = labTechFormData.specialization === spec.id;
                        return (
                          <button
                            key={spec.id}
                            type="button"
                            className={`lab-spec-card ${isSelected ? 'selected' : ''}`}
                            onClick={() => handleLabSpecSelect(spec.id)}
                            role="radio"
                            aria-checked={isSelected}
                          >
                            <div className="lab-spec-icon">
                              <SpecIcon size={22} strokeWidth={2} />
                            </div>
                            <div className="lab-spec-content">
                              <span className="lab-spec-name">{spec.nameAr}</span>
                              <span className="lab-spec-desc">{spec.description}</span>
                            </div>
                            {isSelected && (
                              <div className="lab-spec-check">
                                <Check size={14} strokeWidth={3} />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {errors.specialization && (
                      <span className="error-message">
                        <AlertCircle size={14} strokeWidth={2.2} />
                        {errors.specialization}
                      </span>
                    )}
                  </div>

                  {/* Position + Years */}
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="lab-position">
                        المسمى الوظيفي <span className="required-mark">*</span>
                      </label>
                      <select
                        id="lab-position"
                        name="position"
                        className={`form-input ${errors.position ? 'error' : ''}`}
                        value={labTechFormData.position}
                        onChange={handleLabTechChange}
                      >
                        {LAB_TECH_POSITIONS.map((pos) => (
                          <option key={pos.id} value={pos.id}>{pos.nameAr}</option>
                        ))}
                      </select>
                      {errors.position && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.position}
                        </span>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="lab-years">
                        سنوات الخبرة <span className="required-mark">*</span>
                      </label>
                      <div className="form-input-wrapper">
                        <span className="form-input-icon" aria-hidden="true">
                          <Clock size={18} strokeWidth={2} />
                        </span>
                        <input
                          id="lab-years"
                          type="number"
                          name="yearsOfExperience"
                          className={`form-input ${errors.yearsOfExperience ? 'error' : ''}`}
                          value={labTechFormData.yearsOfExperience}
                          onChange={handleLabTechChange}
                          placeholder="0-60"
                          min="0"
                          max="60"
                        />
                      </div>
                      {errors.yearsOfExperience && (
                        <span className="error-message">
                          <AlertCircle size={14} strokeWidth={2.2} />
                          {errors.yearsOfExperience}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Facility autocomplete */}
                  <FacilityAutocomplete
                    label="المختبر الذي تعمل به"
                    placeholder="ابحث عن المختبر بالاسم..."
                    searchFn={searchLaboratories}
                    value={labTechFormData.selectedLaboratory}
                    newFacility={labTechFormData.newLaboratory}
                    onSelect={handleLaboratorySelect}
                    onNewFacilityChange={handleNewLaboratoryChange}
                    error={errors.laboratory}
                    facilityType="laboratory"
                  />
                </div>
              )}

              {/* ═══ STEP 3: Documents ═══ */}
              {currentStep === 3 && (
                <div className="form-step">
                  <div className="documents-intro">
                    <div className="documents-intro-icon">
                      <Paperclip size={22} strokeWidth={2} />
                    </div>
                    <div>
                      <h3>الوثائق المطلوبة</h3>
                      <p>يرجى رفع الوثائق التالية للتحقق من هويتك المهنية. الحد الأقصى لحجم الملف: 5 ميجابايت.</p>
                    </div>
                  </div>

                  <FileUploadField
                    id="lab-licenseDocument"
                    label="صورة الترخيص المهني"
                    hint="PDF, JPG, PNG حتى 5MB"
                    required
                    accept={DOC_ACCEPT}
                    Icon={FileText}
                    file={labTechFormData.licenseDocument}
                    error={errors.licenseDocument}
                    onFileChange={(file) => labTechFiles.upload('licenseDocument', file)}
                    onFileRemove={() => labTechFiles.remove('licenseDocument')}
                  />

                  <FileUploadField
                    id="lab-degreeDocument"
                    label="صورة الشهادة العلمية"
                    hint="PDF, JPG, PNG حتى 5MB"
                    required
                    accept={DOC_ACCEPT}
                    Icon={GraduationCap}
                    file={labTechFormData.degreeDocument}
                    error={errors.degreeDocument}
                    onFileChange={(file) => labTechFiles.upload('degreeDocument', file)}
                    onFileRemove={() => labTechFiles.remove('degreeDocument')}
                  />

                  <FileUploadField
                    id="lab-profilePhoto"
                    label="صورة شخصية"
                    hint="اختياري — JPG, PNG حتى 5MB"
                    required={false}
                    accept={IMAGE_ACCEPT}
                    Icon={Camera}
                    file={labTechFormData.profilePhoto}
                    error={errors.profilePhoto}
                    onFileChange={(file) => labTechFiles.upload('profilePhoto', file)}
                    onFileRemove={() => labTechFiles.remove('profilePhoto')}
                  />

                  <div className="form-group">
                    <label className="form-label" htmlFor="lab-notes">
                      ملاحظات إضافية
                      <span className="label-hint">(اختياري)</span>
                    </label>
                    <textarea
                      id="lab-notes"
                      name="additionalNotes"
                      className="form-input"
                      value={labTechFormData.additionalNotes}
                      onChange={handleLabTechChange}
                      placeholder="أي معلومات إضافية تريد إضافتها للطلب"
                      rows="3"
                    />
                  </div>
                </div>
              )}

              {/* ═══ STEP 4: Review ═══ */}
              {currentStep === 4 && (
                <div className="form-step review-step">
                  <div className="review-header">
                    <div className="review-header-icon">
                      <ClipboardCheck size={28} strokeWidth={2} />
                    </div>
                    <h3>مراجعة البيانات</h3>
                    <p>تأكد من صحة جميع البيانات قبل تقديم الطلب</p>
                  </div>

                  <div className="review-sections">
                    {/* Personal */}
                    <div className="review-section">
                      <h4>
                        <User size={16} strokeWidth={2.2} />
                        المعلومات الشخصية
                      </h4>
                      <div className="review-grid">
                        <div className="review-item full-width">
                          <span className="review-label">الاسم الكامل</span>
                          <span className="review-value">
                            {labTechFormData.firstName} {labTechFormData.fatherName} {labTechFormData.lastName}
                          </span>
                        </div>
                        <div className="review-item">
                          <span className="review-label">اسم الأم</span>
                          <span className="review-value">{labTechFormData.motherName}</span>
                        </div>
                        <div className="review-item">
                          <span className="review-label">الرقم الوطني</span>
                          <span className="review-value" dir="ltr">{labTechFormData.nationalId}</span>
                        </div>
                        <div className="review-item">
                          <span className="review-label">البريد الإلكتروني</span>
                          <span className="review-value" dir="ltr">{labTechFormData.email}</span>
                        </div>
                        <div className="review-item">
                          <span className="review-label">رقم الهاتف</span>
                          <span className="review-value" dir="ltr">{labTechFormData.phoneNumber}</span>
                        </div>
                        <div className="review-item">
                          <span className="review-label">المحافظة</span>
                          <span className="review-value">
                            {SYRIAN_GOVERNORATES.find((g) => g.id === labTechFormData.governorate)?.nameAr}
                          </span>
                        </div>
                        <div className="review-item">
                          <span className="review-label">المدينة</span>
                          <span className="review-value">{labTechFormData.city}</span>
                        </div>
                      </div>
                    </div>

                    {/* Professional */}
                    <div className="review-section">
                      <h4>
                        <Microscope size={16} strokeWidth={2.2} />
                        المعلومات المهنية
                      </h4>
                      <div className="review-grid">
                        <div className="review-item">
                          <span className="review-label">رقم الترخيص</span>
                          <span className="review-value" dir="ltr">
                            {labTechFormData.licenseNumber.toUpperCase()}
                          </span>
                        </div>
                        <div className="review-item">
                          <span className="review-label">الدرجة العلمية</span>
                          <span className="review-value">
                            {LAB_TECH_DEGREES.find((d) => d.id === labTechFormData.degree)?.nameAr}
                          </span>
                        </div>
                        <div className="review-item">
                          <span className="review-label">مجال التخصص</span>
                          <span className="review-value">{selectedLabSpecialization?.nameAr}</span>
                        </div>
                        <div className="review-item">
                          <span className="review-label">المسمى الوظيفي</span>
                          <span className="review-value">
                            {LAB_TECH_POSITIONS.find((p) => p.id === labTechFormData.position)?.nameAr}
                          </span>
                        </div>
                        <div className="review-item">
                          <span className="review-label">سنوات الخبرة</span>
                          <span className="review-value">{labTechFormData.yearsOfExperience} سنة</span>
                        </div>
                      </div>
                    </div>

                    {/* Facility */}
                    <div className="review-section">
                      <h4>
                        <Building size={16} strokeWidth={2.2} />
                        المختبر
                      </h4>
                      {labTechFormData.selectedLaboratory ? (
                        <div className="review-facility">
                          <div className="review-facility-icon existing">
                            <CheckCircle2 size={18} strokeWidth={2.2} />
                          </div>
                          <div className="review-facility-info">
                            <span className="review-facility-name">
                              {labTechFormData.selectedLaboratory.arabicName || labTechFormData.selectedLaboratory.name}
                            </span>
                            <span className="review-facility-address">
                              {[
                                SYRIAN_GOVERNORATES.find((g) => g.id === labTechFormData.selectedLaboratory.governorate)?.nameAr,
                                labTechFormData.selectedLaboratory.city,
                              ].filter(Boolean).join(' — ')}
                            </span>
                            <span className="review-facility-tag">مختبر مسجل</span>
                          </div>
                        </div>
                      ) : labTechFormData.newLaboratory ? (
                        <div className="review-facility">
                          <div className="review-facility-icon new">
                            <Plus size={18} strokeWidth={2.5} />
                          </div>
                          <div className="review-facility-info">
                            <span className="review-facility-name">
                              {labTechFormData.newLaboratory.name}
                            </span>
                            <span className="review-facility-address">
                              {[
                                SYRIAN_GOVERNORATES.find((g) => g.id === labTechFormData.newLaboratory.governorate)?.nameAr,
                                labTechFormData.newLaboratory.city,
                                labTechFormData.newLaboratory.address,
                              ].filter(Boolean).join(' — ')}
                            </span>
                            <span className="review-facility-tag new">مختبر جديد — بانتظار تسجيل الإدارة</span>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {/* Documents */}
                    <div className="review-section">
                      <h4>
                        <Paperclip size={16} strokeWidth={2.2} />
                        الوثائق المرفقة
                      </h4>
                      <div className="review-docs">
                        <div className={`review-doc ${labTechFormData.licenseDocument ? 'attached' : 'missing'}`}>
                          {labTechFormData.licenseDocument
                            ? <Check size={16} strokeWidth={2.5} />
                            : <X size={16} strokeWidth={2.5} />}
                          <span>
                            الترخيص المهني: {labTechFormData.licenseDocument?.name || 'غير مرفق'}
                          </span>
                        </div>
                        <div className={`review-doc ${labTechFormData.degreeDocument ? 'attached' : 'missing'}`}>
                          {labTechFormData.degreeDocument
                            ? <Check size={16} strokeWidth={2.5} />
                            : <X size={16} strokeWidth={2.5} />}
                          <span>
                            الشهادة العلمية: {labTechFormData.degreeDocument?.name || 'غير مرفق'}
                          </span>
                        </div>
                        <div className={`review-doc ${labTechFormData.profilePhoto ? 'attached' : 'missing'}`}>
                          {labTechFormData.profilePhoto
                            ? <Check size={16} strokeWidth={2.5} />
                            : <X size={16} strokeWidth={2.5} />}
                          <span>
                            الصورة الشخصية: {labTechFormData.profilePhoto?.name || 'غير مرفقة'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="review-agreement">
                    <label className="checkbox-label">
                      <input type="checkbox" required />
                      <span className="checkbox-custom" />
                      <span>
                        أقر بأن جميع المعلومات المقدمة صحيحة وأوافق على
                        <Link to="/terms" target="_blank" style={{ color: 'var(--tm-action)', fontWeight: 700, margin: '0 4px' }}>
                          الشروط والأحكام
                        </Link>
                        وسياسة الخصوصية
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* Form actions */}
              <div className="form-actions">
                {currentStep > 1 && (
                  <button type="button" className="btn-secondary" onClick={handlePrev}>
                    <ArrowRight size={18} strokeWidth={2.2} />
                    <span>السابق</span>
                  </button>
                )}

                {currentStep < LAB_TECH_TOTAL_STEPS ? (
                  <button type="button" className="btn-primary" onClick={handleNext}>
                    <span>التالي</span>
                    <ArrowLeft size={18} strokeWidth={2.2} />
                  </button>
                ) : (
                  <button type="submit" className="btn-primary">
                    <Send size={18} strokeWidth={2.2} />
                    <span>تقديم الطلب</span>
                  </button>
                )}
              </div>

              <div className="login-link">
                لديك حساب بالفعل؟
                <Link to="/">تسجيل الدخول</Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  /* ═════════════════════════════════════════════════════════════════
     FALLBACK — should never hit if flow control is correct
     ═════════════════════════════════════════════════════════════════ */

  return null;
};

export default SignUp;