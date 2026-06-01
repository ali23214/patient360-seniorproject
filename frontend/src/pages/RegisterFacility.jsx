/**
 * ═══════════════════════════════════════════════════════════════════════
 *  Patient 360° — Register Facility Page  (v2.2 — public facility self-registration)
 *  ─────────────────────────────────────────────────────────────────────
 *  Stack       : React 18 + React Router v6 + Lucide React
 *  Design      : Teal Medica (Light + Dark via [data-theme])
 *  Direction   : RTL (Arabic primary)
 *  Backend     : POST /api/facilities/requests  (no auth required)
 *
 *  Purpose:
 *    Public-facing page for facility owners (pharmacy/laboratory)
 *    to submit a registration request for their facility. The request lands
 *    in facility_requests collection and waits for admin approval in the
 *    AdminDashboard → طلبات المنشآت tab.
 *
 *    Once approved, the facility appears in the system and pharmacists/lab
 *    technicians can select it during their own signup.
 *
 *  Architecture:
 *    Stage 1 — Type selection (2 cards: Pharmacy | Laboratory)
 *    Stage 2 — Form wizard (basic info, location, contact, owner info)
 *    Stage 3 — Success screen (shows requestNumber + status check link)
 *
 *  All DB enum values mirror patient360_db_final.js exactly.
 * ═══════════════════════════════════════════════════════════════════════
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  // Facility types
  Pill,
  Microscope,
  Building2,

  // Form & inputs
  User,
  Mail,
  Phone,
  MapPin,
  Award,
  FileText,
  Info,
  AlertCircle,

  // Actions
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  Loader2,
  Send,
  LogIn,
  Copy,

  // Status
  CheckCircle2,
  Clock,
  ClipboardCheck,
  Search,
  XCircle,
  AlertTriangle,
  Shield,
} from 'lucide-react';

import Navbar from '../components/common/Navbar';
import { authAPI } from '../services/api';
import '../styles/SignUp.css';


/* ═══════════════════════════════════════════════════════════════════════
   CONSTANTS — match patient360_db_final.js exactly
   ═══════════════════════════════════════════════════════════════════════ */

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

const PHARMACY_SUB_TYPES = [
  { id: 'community', nameAr: 'صيدلية حي' },
  { id: 'hospital',  nameAr: 'صيدلية مستشفى' },
  { id: 'clinic',    nameAr: 'صيدلية عيادة' },
  { id: 'online',    nameAr: 'صيدلية إلكترونية' },
];

const LAB_SUB_TYPES = [
  { id: 'independent',    nameAr: 'مختبر مستقل' },
  { id: 'hospital_based', nameAr: 'مختبر تابع لمستشفى' },
  { id: 'clinic_based',   nameAr: 'مختبر تابع لعيادة' },
  { id: 'specialized',    nameAr: 'مختبر متخصص' },
];


/* ═══════════════════════════════════════════════════════════════════════
   VALIDATION HELPERS
   ═══════════════════════════════════════════════════════════════════════ */

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isValidPhone = (phone) => /^09\d{8}$/.test(phone.replace(/\s/g, ''));


/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT — RegisterFacility
   ═══════════════════════════════════════════════════════════════════════ */

const RegisterFacility = () => {
  const navigate = useNavigate();

  /* ─────────────────────────────────────────────────────────────────
     STAGE STATE
     'select'  → choose facility type (3 cards)
     'form'    → fill the registration form
     'success' → display request number + next-steps
     ───────────────────────────────────────────────────────────────── */

  const [stage, setStage] = useState('select');
  const [facilityType, setFacilityType] = useState(null);  // 'pharmacy' | 'laboratory'

  /* ─────────────────────────────────────────────────────────────────
     FORM STATE
     ───────────────────────────────────────────────────────────────── */

  const [formData, setFormData] = useState({
    // Facility info
    name: '',
    arabicName: '',
    license: '',
    specificType: '',
    phoneNumber: '',
    email: '',

    // Location
    governorate: '',
    city: '',
    district: '',
    address: '',

    // Owner / submitter info
    submittedByName: '',
    submittedByEmail: '',
    submittedByPhone: '',

    // Notes
    notes: '',
  });

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');

  /* ─────────────────────────────────────────────────────────────────
     SUCCESS STATE
     ───────────────────────────────────────────────────────────────── */

  const [requestNumber, setRequestNumber] = useState('');
  const [requestId, setRequestId] = useState('');
  const [copyFeedback, setCopyFeedback] = useState(false);

  /* ─────────────────────────────────────────────────────────────────
     TRACK-REQUEST STATE (status lookup by requestNumber OR email)
     ───────────────────────────────────────────────────────────────── */

  const [trackQuery, setTrackQuery] = useState('');
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState('');
  const [trackResult, setTrackResult] = useState(null);

  // Decide whether the typed value is a request number or an email.
  // FAC- prefix (case-insensitive) → requestNumber; contains @ → email.
  const handleTrackRequest = useCallback(async (e) => {
    e?.preventDefault();
    const q = trackQuery.trim();
    setTrackError('');
    setTrackResult(null);

    if (!q) {
      setTrackError('يرجى إدخال رقم الطلب أو البريد الإلكتروني');
      return;
    }

    const identifier = /^FAC-/i.test(q)
      ? { requestNumber: q }
      : q.includes('@')
        ? { email: q }
        : { requestNumber: q }; // default: treat as request number

    try {
      setTrackLoading(true);
      const res = await authAPI.checkFacilityStatus(identifier);
      if (res?.success) {
        setTrackResult(res);
      } else {
        setTrackError(res?.message || 'لم يتم العثور على طلب بهذه البيانات');
      }
    } catch (err) {
      setTrackError(err?.message || 'لم يتم العثور على طلب بهذه البيانات');
    } finally {
      setTrackLoading(false);
    }
  }, [trackQuery]);

  const resetTracking = useCallback(() => {
    setTrackQuery('');
    setTrackError('');
    setTrackResult(null);
    setTrackLoading(false);
  }, []);

  /* ─────────────────────────────────────────────────────────────────
     COPY-DERIVED FIELDS (depend on facilityType)
     ───────────────────────────────────────────────────────────────── */

  const copy = useMemo(() => {
    if (facilityType === 'pharmacy') {
      return {
        title: 'تسجيل صيدلية جديدة',
        subtitle: 'سجّل صيدليتك في منصة Patient 360° لتظهر للصيدلانيين عند تسجيلهم',
        nameLabel: 'اسم الصيدلية',
        namePlaceholder: 'مثال: صيدلية الشفاء',
        licenseLabel: 'رقم الترخيص',
        licensePlaceholder: 'رقم الترخيص من نقابة الصيادلة',
        subTypeLabel: 'نوع الصيدلية',
        subTypes: PHARMACY_SUB_TYPES,
        defaultSubType: 'community',
        icon: Pill,
        accentColor: '#00897B',
      };
    }
    if (facilityType === 'laboratory') {
      return {
        title: 'تسجيل مختبر جديد',
        subtitle: 'سجّل مختبرك في منصة Patient 360° ليصبح متاحاً للفنيين والأطباء',
        nameLabel: 'اسم المختبر',
        namePlaceholder: 'مثال: مختبر الحياة',
        licenseLabel: 'رقم الترخيص',
        licensePlaceholder: 'رقم الترخيص من وزارة الصحة',
        subTypeLabel: 'نوع المختبر',
        subTypes: LAB_SUB_TYPES,
        defaultSubType: 'independent',
        icon: Microscope,
        accentColor: '#4DB6AC',
      };
    }
    return null;
  }, [facilityType]);

  /* ─────────────────────────────────────────────────────────────────
     HANDLERS
     ───────────────────────────────────────────────────────────────── */

  const handleSelectType = useCallback((type) => {
    setFacilityType(type);
    const defaultSubType = type === 'pharmacy' ? 'community' : 'independent';
    setFormData((prev) => ({ ...prev, specificType: defaultSubType }));
    setStage('form');
    setErrors({});
    setServerError('');
  }, []);

  const handleBackToSelect = useCallback(() => {
    setStage('select');
    setFacilityType(null);
    setErrors({});
    setServerError('');
  }, []);

  const handleFieldChange = useCallback((field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear field-specific error on change
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }, [errors]);

  /* ─────────────────────────────────────────────────────────────────
     VALIDATION
     ───────────────────────────────────────────────────────────────── */

  const validate = useCallback(() => {
    const e = {};

    // Facility info
    if (!formData.name.trim()) e.name = 'اسم المنشأة مطلوب';
    else if (formData.name.trim().length < 2) e.name = 'الاسم قصير جداً (حرفين على الأقل)';

    if (formData.email && !isValidEmail(formData.email)) {
      e.email = 'البريد الإلكتروني للمنشأة غير صحيح';
    }
    if (formData.phoneNumber && !isValidPhone(formData.phoneNumber)) {
      e.phoneNumber = 'رقم الهاتف يجب أن يبدأ بـ 09 ويتألف من 10 أرقام';
    }

    // Location
    if (!formData.governorate) e.governorate = 'المحافظة مطلوبة';
    if (!formData.city.trim()) e.city = 'المدينة مطلوبة';
    if (!formData.address.trim()) e.address = 'العنوان التفصيلي مطلوب';

    // Submitter info — REQUIRED for admin to follow up
    if (!formData.submittedByName.trim()) e.submittedByName = 'اسم مقدّم الطلب مطلوب';
    if (!formData.submittedByEmail.trim()) {
      e.submittedByEmail = 'البريد الإلكتروني لمقدّم الطلب مطلوب';
    } else if (!isValidEmail(formData.submittedByEmail)) {
      e.submittedByEmail = 'البريد الإلكتروني غير صحيح';
    }
    if (!formData.submittedByPhone.trim()) {
      e.submittedByPhone = 'رقم هاتف مقدّم الطلب مطلوب';
    } else if (!isValidPhone(formData.submittedByPhone)) {
      e.submittedByPhone = 'رقم الهاتف يجب أن يبدأ بـ 09 ويتألف من 10 أرقام';
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }, [formData]);

  /* ─────────────────────────────────────────────────────────────────
     SUBMIT
     ───────────────────────────────────────────────────────────────── */

  const handleSubmit = useCallback(async (event) => {
    if (event) event.preventDefault();

    setServerError('');

    if (!validate()) {
      // Scroll to first error field
      setTimeout(() => {
        const firstErrorField = document.querySelector('.form-input.error, .error-message');
        if (firstErrorField) firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      return;
    }

    setLoading(true);
    try {
      const payload = {
        facilityType,
        name: formData.name.trim(),
        arabicName: (formData.arabicName.trim() || formData.name.trim()),
        license: formData.license.trim().toUpperCase() || undefined,
        specificType: formData.specificType || copy.defaultSubType,
        phoneNumber: formData.phoneNumber.trim() || undefined,
        email: formData.email.trim().toLowerCase() || undefined,
        governorate: formData.governorate,
        city: formData.city.trim(),
        district: formData.district.trim() || undefined,
        address: formData.address.trim(),
        submittedByName: formData.submittedByName.trim(),
        submittedByEmail: formData.submittedByEmail.trim().toLowerCase(),
        submittedByPhone: formData.submittedByPhone.trim(),
        notes: formData.notes.trim() || undefined,
      };

      const data = await authAPI.submitFacilityRequest(payload);

      setRequestNumber(data.requestNumber || '');
      setRequestId(data._id || '');
      setStage('success');
      // Scroll to top on success
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error('[RegisterFacility] Submit error:', err);
      setServerError(err.message || 'حدث خطأ في إرسال الطلب. الرجاء المحاولة مرة أخرى.');
    } finally {
      setLoading(false);
    }
  }, [facilityType, formData, copy, validate]);

  /* ─────────────────────────────────────────────────────────────────
     COPY REQUEST NUMBER
     ───────────────────────────────────────────────────────────────── */

  const handleCopyRequestNumber = useCallback(() => {
    if (!requestNumber) return;
    try {
      navigator.clipboard.writeText(requestNumber);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch (err) {
      console.error('Clipboard error:', err);
    }
  }, [requestNumber]);

  /* ═════════════════════════════════════════════════════════════════
     RENDER — STAGE 1: SELECT FACILITY TYPE
     ═════════════════════════════════════════════════════════════════ */

  if (stage === 'select') {
    return (
      <div className="signup-page">
        <Navbar />
        <div className="signup-container">
          <div className="signup-content" style={{ maxWidth: 980 }}>
            {/* Header */}
            <div className="signup-header" style={{ textAlign: 'center' }}>
              <div className="signup-header-icon" style={{ margin: '0 auto 16px' }}>
                <Building2 size={32} strokeWidth={2} />
              </div>
              <h1 className="signup-title">تسجيل منشأة جديدة</h1>
              <p className="signup-subtitle">
                اختر نوع المنشأة التي تريد تسجيلها في منصة Patient 360°
              </p>
            </div>

            {/* 2 cards grid */}
            <div className="role-cards" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 16,
              marginTop: 24,
            }}>
              {/* Pharmacy */}
              <button
                type="button"
                className="role-card"
                onClick={() => handleSelectType('pharmacy')}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '28px 20px',
                  border: '2px solid var(--tm-border, #E0F2F1)',
                  borderRadius: 14,
                  backgroundColor: 'var(--tm-card-bg, #FFFFFF)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  textAlign: 'center',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#00897B';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 137, 123, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--tm-border, #E0F2F1)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{
                  width: 64,
                  height: 64,
                  borderRadius: 16,
                  backgroundColor: 'rgba(0, 137, 123, 0.12)',
                  color: '#00897B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 14,
                }}>
                  <Pill size={32} strokeWidth={2} />
                </div>
                <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 700, color: 'var(--tm-text, #0D3B3E)' }}>
                  صيدلية
                </h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--tm-text-muted, #607D8B)', lineHeight: 1.6 }}>
                  لمالكي الصيدليات الذين يريدون تسجيل صيدلياتهم في النظام
                </p>
              </button>

              {/* Laboratory */}
              <button
                type="button"
                className="role-card"
                onClick={() => handleSelectType('laboratory')}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '28px 20px',
                  border: '2px solid var(--tm-border, #E0F2F1)',
                  borderRadius: 14,
                  backgroundColor: 'var(--tm-card-bg, #FFFFFF)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  textAlign: 'center',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#4DB6AC';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(77, 182, 172, 0.18)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--tm-border, #E0F2F1)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{
                  width: 64,
                  height: 64,
                  borderRadius: 16,
                  backgroundColor: 'rgba(77, 182, 172, 0.18)',
                  color: '#00897B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 14,
                }}>
                  <Microscope size={32} strokeWidth={2} />
                </div>
                <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 700, color: 'var(--tm-text, #0D3B3E)' }}>
                  مختبر
                </h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--tm-text-muted, #607D8B)', lineHeight: 1.6 }}>
                  لمالكي المختبرات الطبية لتسجيل مختبراتهم في النظام
                </p>
              </button>
            </div>

            {/* Info box */}
            <div style={{
              marginTop: 28,
              padding: '14px 16px',
              backgroundColor: 'var(--tm-surface, rgba(0, 137, 123, 0.06))',
              border: '1px solid var(--tm-accent, rgba(77, 182, 172, 0.4))',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
            }}>
              <Info size={20} strokeWidth={2} style={{ color: 'var(--tm-action, #00897B)', flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: '0.88rem', lineHeight: 1.7, color: 'var(--tm-text, #0D3B3E)' }}>
                <strong>ملاحظة مهمة:</strong> طلب التسجيل سيتم مراجعته من قبل الإدارة. بعد الموافقة، ستصبح منشأتك متاحة في النظام، ويمكن للموظفين (أطباء، صيادلة، فنيي مختبر) اختيارها أثناء تسجيلهم.
              </div>
            </div>

            {/* Track an existing request */}
            <div className="login-link" style={{ textAlign: 'center', marginTop: 28 }}>
              عندك طلب سابق؟
              <button
                type="button"
                onClick={() => setStage('track')}
                style={{
                  marginInlineStart: 6,
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  font: 'inherit',
                  color: 'var(--tm-action, #00897B)',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                تابع حالة طلبك
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ═════════════════════════════════════════════════════════════════
     RENDER — STAGE: TRACK REQUEST STATUS
     ═════════════════════════════════════════════════════════════════ */

  /* ═════════════════════════════════════════════════════════════════
     RENDER — STAGE: TRACK REQUEST STATUS
     Matches the SignUp.jsx status-check design (scm-* + status-card).
     ═════════════════════════════════════════════════════════════════ */

  if (stage === 'track') {
    // Status → display config, mirroring SignUp's statusConfig.
    const statusConfig = {
      pending:  { Icon: Clock,        label: 'قيد المراجعة', className: 'pending' },
      approved: { Icon: CheckCircle2, label: 'تمت الموافقة',  className: 'approved' },
      rejected: { Icon: XCircle,      label: 'مرفوض',         className: 'rejected' },
    };

    const REJECTION_LABELS = {
      duplicate: 'طلب مكرر',
      invalid_info: 'معلومات غير صحيحة',
      unverifiable: 'تعذّر التحقق من المعلومات',
      incomplete: 'معلومات ناقصة',
      other: 'سبب آخر',
    };

    // ── RESULT SCREEN (after a successful lookup) ──────────────────────
    if (trackResult) {
      const status = statusConfig[trackResult.status] || statusConfig.pending;
      const StatusIcon = status.Icon;
      const facilityLabel = trackResult.facilityType === 'pharmacy' ? 'صيدلية' : 'مختبر';

      return (
        <div className="signup-page">
          <Navbar />
          <div className="signup-container">
            <div className="request-status-container">
              <div className="status-card">
                <div className={`status-icon ${trackResult.status}`}>
                  <StatusIcon size={48} strokeWidth={2} />
                  {trackResult.status === 'pending' && <div className="status-pulse" />}
                </div>

                <h1>حالة طلب المنشأة</h1>
                <p className="status-subtitle">{trackResult.arabicName || trackResult.name}</p>

                <div className="status-details">
                  <div className="status-detail-row">
                    <span className="detail-label">رقم الطلب</span>
                    <span className="detail-value" dir="ltr">{trackResult.requestNumber}</span>
                  </div>
                  <div className="status-detail-row">
                    <span className="detail-label">نوع المنشأة</span>
                    <span className="detail-value">{facilityLabel}</span>
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
                  {trackResult.submittedAt && (
                    <div className="status-detail-row">
                      <span className="detail-label">تاريخ التقديم</span>
                      <span className="detail-value">
                        {new Date(trackResult.submittedAt).toLocaleDateString('ar-EG')}
                      </span>
                    </div>
                  )}
                  {trackResult.reviewedAt && (
                    <div className="status-detail-row">
                      <span className="detail-label">تاريخ المراجعة</span>
                      <span className="detail-value">
                        {new Date(trackResult.reviewedAt).toLocaleDateString('ar-EG')}
                      </span>
                    </div>
                  )}
                </div>

                {trackResult.status === 'pending' && (
                  <div className="status-info-box pending-info">
                    <Clock size={20} strokeWidth={2} />
                    <div className="info-text">
                      <p><strong>طلبك قيد المراجعة</strong></p>
                      <p>سيتم مراجعة طلب تسجيل المنشأة من قبل الإدارة. ستصبح منشأتك متاحة في النظام بعد الموافقة.</p>
                    </div>
                  </div>
                )}

                {trackResult.status === 'approved' && (
                  <div className="status-info-box pending-info">
                    <CheckCircle2 size={20} strokeWidth={2} />
                    <div className="info-text">
                      <p><strong>تمت الموافقة على منشأتك</strong></p>
                      <p>أصبحت منشأتك متاحة الآن في النظام، ويمكن للموظفين (أطباء، صيادلة، فنيي مختبر) اختيارها أثناء تسجيلهم.</p>
                    </div>
                  </div>
                )}

                {trackResult.status === 'rejected' && (trackResult.rejectionReason || trackResult.rejectionDetails) && (
                  <div className="rejection-reason-box">
                    <AlertTriangle size={20} strokeWidth={2} />
                    <div className="info-text">
                      <p className="reason-title">سبب الرفض:</p>
                      {trackResult.rejectionReason && (
                        <p>{REJECTION_LABELS[trackResult.rejectionReason] || trackResult.rejectionReason}</p>
                      )}
                      {trackResult.rejectionDetails && <p>{trackResult.rejectionDetails}</p>}
                    </div>
                  </div>
                )}

                <div className="status-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={resetTracking}
                  >
                    <Search size={18} strokeWidth={2.2} />
                    <span>تحقق من طلب آخر</span>
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => { resetTracking(); setStage('select'); }}
                  >
                    <ArrowLeft size={18} strokeWidth={2.2} />
                    <span>تسجيل منشأة</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // ── LOOKUP MODAL (enter requestNumber or email) ────────────────────
    return (
      <div className="signup-page">
        <Navbar />
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="status-check-modal" onClick={(e) => e.stopPropagation()}>
            <div className="scm-header">
              <div className="scm-icon-wrapper">
                <div className="scm-icon">
                  <Search size={36} strokeWidth={2} />
                </div>
                <div className="scm-icon-pulse" />
              </div>
              <h2>التحقق من حالة الطلب</h2>
              <p>أدخل رقم الطلب أو البريد الإلكتروني الذي استخدمته عند التقديم</p>
            </div>

            <div className="scm-body">
              {trackError && (
                <div className="scm-error">
                  <AlertCircle size={18} strokeWidth={2.2} />
                  <span>{trackError}</span>
                </div>
              )}

              <div className="scm-form-group">
                <label htmlFor="track-query">رقم الطلب أو البريد الإلكتروني</label>
                <div className="form-input-wrapper">
                  <span className="form-input-icon" aria-hidden="true">
                    <Search size={18} strokeWidth={2} />
                  </span>
                  <input
                    id="track-query"
                    type="text"
                    className="form-input"
                    placeholder="FAC-20260528-00001  أو  owner@example.com"
                    value={trackQuery}
                    onChange={(e) => { setTrackQuery(e.target.value); setTrackError(''); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !trackLoading) handleTrackRequest();
                    }}
                    disabled={trackLoading}
                    dir="auto"
                    autoFocus
                  />
                </div>
                <span className="scm-input-hint">
                  <Info size={12} strokeWidth={2.2} />
                  أدخل رقم الطلب (FAC-...) أو البريد الإلكتروني المستخدم عند التقديم
                </span>
              </div>

              <button
                type="button"
                className="scm-submit-btn"
                onClick={handleTrackRequest}
                disabled={trackLoading || !trackQuery.trim()}
              >
                {trackLoading ? (
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
              <button
                type="button"
                className="scm-close-btn"
                onClick={() => { resetTracking(); setStage('select'); }}
              >
                إلغاء
              </button>
            </div>

            <div className="scm-security-note">
              <Shield size={14} strokeWidth={2.2} />
              <span>بياناتك محمية ومشفرة</span>
            </div>
          </div>
        </div>
      </div>
    );
  }


  /* ═════════════════════════════════════════════════════════════════
     RENDER — STAGE 3: SUCCESS
     ═════════════════════════════════════════════════════════════════ */

  if (stage === 'success') {
    const FacilityIcon = copy?.icon || Building2;
    return (
      <div className="signup-page">
        <Navbar />
        <div className="signup-container">
          <div className="signup-content" style={{ maxWidth: 640 }}>
            <div style={{
              backgroundColor: 'var(--tm-card-bg, #FFFFFF)',
              borderRadius: 14,
              padding: '40px 32px',
              textAlign: 'center',
              border: '1px solid var(--tm-border, #E0F2F1)',
              boxShadow: '0 4px 16px rgba(0, 137, 123, 0.08)',
            }}>
              {/* Success icon */}
              <div style={{
                width: 84,
                height: 84,
                borderRadius: '50%',
                backgroundColor: 'rgba(0, 137, 123, 0.12)',
                color: 'var(--tm-action, #00897B)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
              }}>
                <CheckCircle2 size={48} strokeWidth={2} />
              </div>

              <h1 style={{ margin: '0 0 12px', fontSize: '1.6rem', fontWeight: 700, color: 'var(--tm-text, #0D3B3E)' }}>
                تم استلام طلبك بنجاح
              </h1>

              <p style={{ margin: '0 0 28px', fontSize: '0.95rem', color: 'var(--tm-text-muted, #607D8B)', lineHeight: 1.7 }}>
                طلب تسجيل {facilityType === 'pharmacy' ? 'الصيدلية' : 'المختبر'} قيد المراجعة من قبل الإدارة. سيتم إعلامك عند الموافقة على الطلب.
              </p>

              {/* Request number box */}
              {requestNumber && (
                <div style={{
                  padding: '16px 20px',
                  backgroundColor: 'var(--tm-surface, #E0F2F1)',
                  borderRadius: 12,
                  marginBottom: 24,
                  textAlign: 'start',
                }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--tm-text-muted, #607D8B)', marginBottom: 6 }}>
                    رقم الطلب
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <code style={{
                      fontFamily: 'Inter, monospace',
                      fontSize: '1.05rem',
                      fontWeight: 700,
                      color: 'var(--tm-text, #0D3B3E)',
                      flex: 1,
                      direction: 'ltr',
                      textAlign: 'left',
                    }}>
                      {requestNumber}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopyRequestNumber}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 12px',
                        backgroundColor: copyFeedback ? 'var(--tm-action, #00897B)' : 'transparent',
                        color: copyFeedback ? '#FFFFFF' : 'var(--tm-action, #00897B)',
                        border: '1px solid var(--tm-action, #00897B)',
                        borderRadius: 6,
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      {copyFeedback ? <CheckCircle2 size={14} strokeWidth={2.5} /> : <Copy size={14} strokeWidth={2.2} />}
                      {copyFeedback ? 'تم النسخ' : 'نسخ'}
                    </button>
                  </div>
                </div>
              )}

              {/* Next steps */}
              <div style={{
                padding: 16,
                backgroundColor: 'var(--tm-bg, #F5FAFA)',
                borderRadius: 10,
                marginBottom: 24,
                textAlign: 'start',
                border: '1px solid var(--tm-border, #E0F2F1)',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 10,
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  color: 'var(--tm-text, #0D3B3E)',
                }}>
                  <ClipboardCheck size={16} strokeWidth={2.2} />
                  الخطوات التالية
                </div>
                <ol style={{
                  margin: 0,
                  paddingInlineStart: 18,
                  fontSize: '0.85rem',
                  lineHeight: 1.8,
                  color: 'var(--tm-text, #0D3B3E)',
                }}>
                  <li>ستراجع الإدارة طلبك خلال 1-3 أيام عمل</li>
                  <li>ستتلقى إيميل بنتيجة الطلب (قبول أو رفض مع الأسباب)</li>
                  <li>عند القبول، ستظهر منشأتك في النظام مباشرة</li>
                  <li>يمكن لموظفي المنشأة عندها التسجيل واختيارها من قائمة المنشآت</li>
                </ol>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="btn btn-secondary"
                  style={{
                    padding: '10px 20px',
                    borderRadius: 8,
                    border: '1px solid var(--tm-border, #E0F2F1)',
                    backgroundColor: 'transparent',
                    color: 'var(--tm-text, #0D3B3E)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <LogIn size={16} strokeWidth={2.2} />
                  العودة لتسجيل الدخول
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStage('select');
                    setFacilityType(null);
                    setFormData({
                      name: '', arabicName: '', license: '', specificType: '',
                      phoneNumber: '', email: '',
                      governorate: '', city: '', district: '', address: '',
                      submittedByName: '', submittedByEmail: '', submittedByPhone: '',
                      notes: '',
                    });
                    setRequestNumber('');
                    setRequestId('');
                  }}
                  className="btn btn-primary"
                  style={{
                    padding: '10px 20px',
                    borderRadius: 8,
                    border: 'none',
                    backgroundColor: 'var(--tm-action, #00897B)',
                    color: '#FFFFFF',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Building2 size={16} strokeWidth={2.2} />
                  تسجيل منشأة أخرى
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ═════════════════════════════════════════════════════════════════
     RENDER — STAGE 2: FORM
     ═════════════════════════════════════════════════════════════════ */

  const FacilityIcon = copy?.icon || Building2;

  return (
    <div className="signup-page">
      <Navbar />
      <div className="signup-container">
        <div className="signup-content" style={{ maxWidth: 820 }}>
          {/* Back button */}
          <button
            type="button"
            onClick={handleBackToSelect}
            className="back-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              border: 'none',
              backgroundColor: 'transparent',
              color: 'var(--tm-text-muted, #607D8B)',
              fontSize: '0.9rem',
              cursor: 'pointer',
              marginBottom: 16,
            }}
          >
            <ChevronLeft size={16} strokeWidth={2.2} />
            تغيير نوع المنشأة
          </button>

          {/* Header */}
          <div className="signup-header" style={{ textAlign: 'center' }}>
            <div
              className="signup-header-icon"
              style={{
                margin: '0 auto 16px',
                backgroundColor: `${copy.accentColor}20`,
                color: copy.accentColor,
              }}
            >
              <FacilityIcon size={32} strokeWidth={2} />
            </div>
            <h1 className="signup-title">{copy.title}</h1>
            <p className="signup-subtitle">{copy.subtitle}</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="signup-form" style={{ marginTop: 24 }}>
            {/* Server error banner */}
            {serverError && (
              <div style={{
                padding: '12px 16px',
                backgroundColor: 'rgba(211, 47, 47, 0.08)',
                border: '1px solid var(--tm-error, #D32F2F)',
                borderRadius: 8,
                color: 'var(--tm-error, #D32F2F)',
                marginBottom: 20,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                fontSize: '0.9rem',
              }}>
                <AlertCircle size={18} strokeWidth={2.2} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{serverError}</span>
              </div>
            )}

            {/* SECTION 1 — Facility info */}
            <div className="form-section">
              <h3 className="form-section-title">
                <FacilityIcon size={18} strokeWidth={2.2} />
                معلومات المنشأة
              </h3>

              <div className="form-group">
                <label className="form-label" htmlFor="rf-name">
                  {copy.nameLabel} <span className="required-mark">*</span>
                </label>
                <div className="form-input-wrapper">
                  <span className="form-input-icon" aria-hidden="true">
                    <Building2 size={18} strokeWidth={2} />
                  </span>
                  <input
                    id="rf-name"
                    type="text"
                    className={`form-input ${errors.name ? 'error' : ''}`}
                    value={formData.name}
                    onChange={(e) => handleFieldChange('name', e.target.value)}
                    placeholder={copy.namePlaceholder}
                  />
                </div>
                {errors.name && (
                  <span className="error-message">
                    <AlertCircle size={14} strokeWidth={2.2} />
                    {errors.name}
                  </span>
                )}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="rf-arabic-name">
                  الاسم العربي (اختياري)
                </label>
                <div className="form-input-wrapper">
                  <span className="form-input-icon" aria-hidden="true">
                    <Building2 size={18} strokeWidth={2} />
                  </span>
                  <input
                    id="rf-arabic-name"
                    type="text"
                    className="form-input"
                    value={formData.arabicName}
                    onChange={(e) => handleFieldChange('arabicName', e.target.value)}
                    placeholder="إذا كان مختلفاً عن الاسم أعلاه"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="rf-license">
                    {copy.licenseLabel}
                  </label>
                  <div className="form-input-wrapper">
                    <span className="form-input-icon" aria-hidden="true">
                      <Award size={18} strokeWidth={2} />
                    </span>
                    <input
                      id="rf-license"
                      type="text"
                      className="form-input"
                      value={formData.license}
                      onChange={(e) => handleFieldChange('license', e.target.value)}
                      placeholder={copy.licensePlaceholder}
                      dir="ltr"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="rf-subtype">
                    {copy.subTypeLabel}
                  </label>
                  <select
                    id="rf-subtype"
                    className="form-input"
                    value={formData.specificType}
                    onChange={(e) => handleFieldChange('specificType', e.target.value)}
                  >
                    {copy.subTypes.map((t) => (
                      <option key={t.id} value={t.id}>{t.nameAr}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="rf-phone">
                    رقم هاتف المنشأة
                  </label>
                  <div className="form-input-wrapper">
                    <span className="form-input-icon" aria-hidden="true">
                      <Phone size={18} strokeWidth={2} />
                    </span>
                    <input
                      id="rf-phone"
                      type="tel"
                      className={`form-input ${errors.phoneNumber ? 'error' : ''}`}
                      value={formData.phoneNumber}
                      onChange={(e) => handleFieldChange('phoneNumber', e.target.value)}
                      placeholder="0912345678"
                      dir="ltr"
                    />
                  </div>
                  {errors.phoneNumber && (
                    <span className="error-message">
                      <AlertCircle size={14} strokeWidth={2.2} />
                      {errors.phoneNumber}
                    </span>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="rf-email">
                    البريد الإلكتروني للمنشأة
                  </label>
                  <div className="form-input-wrapper">
                    <span className="form-input-icon" aria-hidden="true">
                      <Mail size={18} strokeWidth={2} />
                    </span>
                    <input
                      id="rf-email"
                      type="email"
                      className={`form-input ${errors.email ? 'error' : ''}`}
                      value={formData.email}
                      onChange={(e) => handleFieldChange('email', e.target.value)}
                      placeholder="info@example.com"
                      dir="ltr"
                    />
                  </div>
                  {errors.email && (
                    <span className="error-message">
                      <AlertCircle size={14} strokeWidth={2.2} />
                      {errors.email}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* SECTION 2 — Location */}
            <div className="form-section">
              <h3 className="form-section-title">
                <MapPin size={18} strokeWidth={2.2} />
                الموقع
              </h3>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="rf-gov">
                    المحافظة <span className="required-mark">*</span>
                  </label>
                  <select
                    id="rf-gov"
                    className={`form-input ${errors.governorate ? 'error' : ''}`}
                    value={formData.governorate}
                    onChange={(e) => handleFieldChange('governorate', e.target.value)}
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
                  <label className="form-label" htmlFor="rf-city">
                    المدينة <span className="required-mark">*</span>
                  </label>
                  <div className="form-input-wrapper">
                    <span className="form-input-icon" aria-hidden="true">
                      <MapPin size={18} strokeWidth={2} />
                    </span>
                    <input
                      id="rf-city"
                      type="text"
                      className={`form-input ${errors.city ? 'error' : ''}`}
                      value={formData.city}
                      onChange={(e) => handleFieldChange('city', e.target.value)}
                      placeholder="مثال: دمشق"
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

              <div className="form-group">
                <label className="form-label" htmlFor="rf-district">
                  المنطقة / الحي (اختياري)
                </label>
                <div className="form-input-wrapper">
                  <span className="form-input-icon" aria-hidden="true">
                    <MapPin size={18} strokeWidth={2} />
                  </span>
                  <input
                    id="rf-district"
                    type="text"
                    className="form-input"
                    value={formData.district}
                    onChange={(e) => handleFieldChange('district', e.target.value)}
                    placeholder="مثال: المالكي"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="rf-address">
                  العنوان التفصيلي <span className="required-mark">*</span>
                </label>
                <div className="form-input-wrapper">
                  <span className="form-input-icon" aria-hidden="true">
                    <Building2 size={18} strokeWidth={2} />
                  </span>
                  <input
                    id="rf-address"
                    type="text"
                    className={`form-input ${errors.address ? 'error' : ''}`}
                    value={formData.address}
                    onChange={(e) => handleFieldChange('address', e.target.value)}
                    placeholder="الشارع، رقم البناء، علامة مميزة"
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

            {/* SECTION 3 — Submitter (Owner / Authorized Person) */}
            <div className="form-section">
              <h3 className="form-section-title">
                <User size={18} strokeWidth={2.2} />
                معلومات مقدّم الطلب
              </h3>
              <p style={{
                margin: '-4px 0 14px',
                fontSize: '0.83rem',
                color: 'var(--tm-text-muted, #607D8B)',
                lineHeight: 1.6,
              }}>
                المالك أو الشخص المخوّل بتقديم الطلب نيابة عن المنشأة. ستستخدم هذه المعلومات للتواصل بخصوص الطلب.
              </p>

              <div className="form-group">
                <label className="form-label" htmlFor="rf-sub-name">
                  الاسم الكامل <span className="required-mark">*</span>
                </label>
                <div className="form-input-wrapper">
                  <span className="form-input-icon" aria-hidden="true">
                    <User size={18} strokeWidth={2} />
                  </span>
                  <input
                    id="rf-sub-name"
                    type="text"
                    className={`form-input ${errors.submittedByName ? 'error' : ''}`}
                    value={formData.submittedByName}
                    onChange={(e) => handleFieldChange('submittedByName', e.target.value)}
                    placeholder="الاسم الكامل"
                  />
                </div>
                {errors.submittedByName && (
                  <span className="error-message">
                    <AlertCircle size={14} strokeWidth={2.2} />
                    {errors.submittedByName}
                  </span>
                )}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="rf-sub-email">
                    البريد الإلكتروني <span className="required-mark">*</span>
                  </label>
                  <div className="form-input-wrapper">
                    <span className="form-input-icon" aria-hidden="true">
                      <Mail size={18} strokeWidth={2} />
                    </span>
                    <input
                      id="rf-sub-email"
                      type="email"
                      className={`form-input ${errors.submittedByEmail ? 'error' : ''}`}
                      value={formData.submittedByEmail}
                      onChange={(e) => handleFieldChange('submittedByEmail', e.target.value)}
                      placeholder="owner@example.com"
                      dir="ltr"
                    />
                  </div>
                  {errors.submittedByEmail && (
                    <span className="error-message">
                      <AlertCircle size={14} strokeWidth={2.2} />
                      {errors.submittedByEmail}
                    </span>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="rf-sub-phone">
                    رقم الهاتف <span className="required-mark">*</span>
                  </label>
                  <div className="form-input-wrapper">
                    <span className="form-input-icon" aria-hidden="true">
                      <Phone size={18} strokeWidth={2} />
                    </span>
                    <input
                      id="rf-sub-phone"
                      type="tel"
                      className={`form-input ${errors.submittedByPhone ? 'error' : ''}`}
                      value={formData.submittedByPhone}
                      onChange={(e) => handleFieldChange('submittedByPhone', e.target.value)}
                      placeholder="0912345678"
                      dir="ltr"
                    />
                  </div>
                  {errors.submittedByPhone && (
                    <span className="error-message">
                      <AlertCircle size={14} strokeWidth={2.2} />
                      {errors.submittedByPhone}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* SECTION 4 — Notes (optional) */}
            <div className="form-section">
              <h3 className="form-section-title">
                <FileText size={18} strokeWidth={2.2} />
                ملاحظات إضافية (اختياري)
              </h3>
              <div className="form-group">
                <label className="form-label" htmlFor="rf-notes">
                  معلومات إضافية تريد إعلام الإدارة بها
                </label>
                <textarea
                  id="rf-notes"
                  className="form-input"
                  value={formData.notes}
                  onChange={(e) => handleFieldChange('notes', e.target.value)}
                  placeholder="مثال: تم تجديد ترخيص المنشأة في 2024، أو معلومات تساعد في التحقق من الطلب..."
                  rows={4}
                  maxLength={2000}
                  style={{ resize: 'vertical', fontFamily: 'inherit', padding: '10px 14px' }}
                />
                <span style={{
                  display: 'block',
                  marginTop: 4,
                  fontSize: '0.75rem',
                  color: 'var(--tm-text-muted, #607D8B)',
                  textAlign: 'end',
                }}>
                  {formData.notes.length} / 2000
                </span>
              </div>
            </div>

            {/* Privacy note */}
            <div style={{
              padding: '12px 16px',
              backgroundColor: 'var(--tm-surface, rgba(0, 137, 123, 0.06))',
              border: '1px solid var(--tm-accent, rgba(77, 182, 172, 0.4))',
              borderRadius: 10,
              marginBottom: 20,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              fontSize: '0.85rem',
              color: 'var(--tm-text, #0D3B3E)',
              lineHeight: 1.6,
            }}>
              <Shield size={18} strokeWidth={2.2} style={{ color: 'var(--tm-action, #00897B)', flexShrink: 0, marginTop: 2 }} />
              <div>
                بياناتك محمية ولن يتم استخدامها إلا لمراجعة طلب التسجيل والتواصل بخصوصه. لن يتم نشر معلومات مقدّم الطلب علناً.
              </div>
            </div>

            {/* Submit button */}
            <div className="form-actions" style={{ justifyContent: 'flex-end', marginTop: 20 }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
                style={{
                  padding: '12px 28px',
                  borderRadius: 10,
                  border: 'none',
                  backgroundColor: 'var(--tm-action, #00897B)',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '1rem',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  opacity: loading ? 0.7 : 1,
                  transition: 'all 0.2s',
                }}
              >
                {loading ? (
                  <>
                    <Loader2 size={18} strokeWidth={2.2} className="btn-spin" />
                    جاري الإرسال...
                  </>
                ) : (
                  <>
                    <Send size={18} strokeWidth={2.2} />
                    إرسال الطلب
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Track an existing request */}
          <div className="login-link" style={{ textAlign: 'center', marginTop: 24 }}>
            عندك طلب سابق؟
            <button
              type="button"
              onClick={() => setStage('track')}
              style={{
                marginInlineStart: 6,
                background: 'none',
                border: 'none',
                padding: 0,
                font: 'inherit',
                color: 'var(--tm-action, #00897B)',
                fontWeight: 700,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              تابع حالة طلبك
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterFacility;
