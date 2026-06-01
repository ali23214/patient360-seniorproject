/**
 * PrescriptionDetailPage
 *
 * Full-page detail view for a single prescription.
 * Route: /patient-dashboard/prescriptions/:id
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';

import {
  ArrowRight,
  Calendar,
  Stethoscope,
  Pill,
  FileText,
  AlertTriangle,
  Info,
  CheckCircle2,
  ShieldCheck,
  Syringe,
  Repeat,
  Hash,
  Navigation,
  Clock,
} from 'lucide-react';

import { patientAPI } from '../../services/api';
import LoadingSpinner from '../../components/LoadingSpinner';

import {
  getDoctorInfo,
  formatDoctorDisplay,
  formatLongDate,
  formatDateTime,
  orDash,
  MED_ROUTE_LABELS,
} from './detailHelpers';

import '../../styles/PatientDashboard.css';
import '../../styles/patient-detail-pages.css';


const PRESCRIPTION_STATUS_LABELS = {
  active:               'نشطة',
  dispensed:            'تم الصرف',
  partially_dispensed:  'صرف جزئي',
  expired:              'منتهية',
  cancelled:            'ملغاة',
};

const PRESCRIPTION_STATUS_VARIANTS = {
  active:               'info',
  partially_dispensed:  'warning',
  dispensed:            'success',
  expired:              'muted',
  cancelled:            'danger',
};


export default function PrescriptionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const stateRx = location.state?.prescription || null;

  const [rx,      setRx]      = useState(stateRx);
  const [loading, setLoading] = useState(!stateRx);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (stateRx) return undefined;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const res = await patientAPI.getPrescriptions();
        if (cancelled) return;
        if (res?.success) {
          const found = (res.prescriptions || []).find((p) => p._id === id);
          if (found) setRx(found);
          else setError('لم يتم العثور على الوصفة المطلوبة.');
        } else {
          setError(res?.message || 'تعذر تحميل تفاصيل الوصفة.');
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'حدث خطأ في الاتصال بالخادم.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [id, stateRx]);

  const statusLabel    = rx ? (PRESCRIPTION_STATUS_LABELS[rx.status]   || rx.status || '—') : '';
  const statusVariant  = rx ? (PRESCRIPTION_STATUS_VARIANTS[rx.status] || 'muted')          : 'muted';
  const meds = rx && Array.isArray(rx.medications) ? rx.medications : [];
  const dispensedCount = meds.filter((m) => m.isDispensed).length;
  const isFullyDispensed = rx ? (
    rx.status === 'dispensed' || (meds.length > 0 && dispensedCount === meds.length)
  ) : false;
  const dispensedDate = useMemo(() => (
    meds.map((m) => m.dispensedAt).filter(Boolean).sort()[0] || null
  ), [meds]);

  const doctorInfo    = useMemo(() => getDoctorInfo(rx), [rx]);
  const doctorDisplay = useMemo(() => formatDoctorDisplay(doctorInfo), [doctorInfo]);

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/patient-dashboard');
  };

  if (loading) {
    return (
      <div className="dpg-page" dir="rtl">
        {renderTopBar(handleBack)}
        <div className="dpg-loading">
          <LoadingSpinner message="جاري تحميل تفاصيل الوصفة..." />
        </div>
      </div>
    );
  }

  if (error || !rx) {
    return (
      <div className="dpg-page" dir="rtl">
        {renderTopBar(handleBack)}
        <div className="dpg-error">
          <AlertTriangle size={32} aria-hidden="true" />
          <h2>تعذر عرض الوصفة</h2>
          <p>{error || 'الوصفة المطلوبة غير موجودة.'}</p>
          <button type="button" className="pd-btn pd-btn--primary" onClick={handleBack}>
            <ArrowRight size={16} aria-hidden="true" />
            <span>العودة إلى الوصفات</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dpg-page" dir="rtl">
      {renderTopBar(handleBack)}

      <main className="dpg-main" role="main">

        <section className="dpg-hero">
          <div className="dpg-hero-icon" aria-hidden="true">
            <Pill size={28} />
          </div>
          <div className="dpg-hero-body">
            <h1 className="dpg-hero-title" dir="ltr">
              {rx.prescriptionNumber || 'وصفة طبية'}
            </h1>
            <div className="dpg-hero-meta">
              <span className="dpg-hero-meta-item" dir="ltr">
                <Calendar size={14} aria-hidden="true" />
                <time dateTime={rx.prescriptionDate}>{formatLongDate(rx.prescriptionDate)}</time>
              </span>
              {doctorDisplay && (
                <span className="dpg-hero-meta-item" dir="auto">
                  <Stethoscope size={14} aria-hidden="true" />
                  <span>{doctorDisplay}</span>
                </span>
              )}
              <span className="dpg-hero-meta-item">
                <Pill size={14} aria-hidden="true" />
                <span>{meds.length} دواء</span>
              </span>
            </div>
            <div className="dpg-hero-badges">
              <span className={`pdmr-status pdmr-status--${statusVariant}`}>
                {statusLabel}
              </span>
            </div>
          </div>
        </section>

        {isFullyDispensed && (
          <section className="dpg-banner dpg-banner--success" role="status">
            <CheckCircle2 size={32} strokeWidth={2.5} aria-hidden="true" />
            <div className="dpg-banner-body">
              <h3>تم صرف هذه الوصفة</h3>
              <p>
                {dispensedDate ? (
                  <>
                    تم الصرف بتاريخ{' '}
                    <time dateTime={dispensedDate} dir="ltr">
                      {formatLongDate(dispensedDate)}
                    </time>
                  </>
                ) : (
                  'جميع الأدوية في هذه الوصفة تم صرفها'
                )}
              </p>
            </div>
          </section>
        )}

        {/* Basic info */}
        <section className="dpg-card">
          <h2 className="dpg-card-title">
            <Info size={18} aria-hidden="true" />
            <span>معلومات الوصفة</span>
          </h2>
          <dl className="dpg-fields">
            <div className="dpg-field">
              <dt><Hash size={15} aria-hidden="true" /><span>رقم الوصفة</span></dt>
              <dd dir="ltr">{orDash(rx.prescriptionNumber)}</dd>
            </div>
            <div className="dpg-field">
              <dt><Calendar size={15} aria-hidden="true" /><span>تاريخ الإصدار</span></dt>
              <dd dir="ltr">{formatLongDate(rx.prescriptionDate)}</dd>
            </div>
            <div className="dpg-field">
              <dt><Clock size={15} aria-hidden="true" /><span>تاريخ الانتهاء</span></dt>
              <dd dir="ltr">{rx.expiryDate ? formatLongDate(rx.expiryDate) : '—'}</dd>
            </div>
            <div className="dpg-field">
              <dt><Stethoscope size={15} aria-hidden="true" /><span>الطبيب</span></dt>
              <dd dir="auto">{orDash(doctorDisplay)}</dd>
            </div>
            {doctorInfo?.license && (
              <div className="dpg-field">
                <dt><Hash size={15} aria-hidden="true" /><span>رقم الترخيص</span></dt>
                <dd dir="ltr">{doctorInfo.license}</dd>
              </div>
            )}
            <div className="dpg-field">
              <dt><Pill size={15} aria-hidden="true" /><span>عدد الأدوية</span></dt>
              <dd dir="ltr">{meds.length}</dd>
            </div>
            <div className="dpg-field">
              <dt><Hash size={15} aria-hidden="true" /><span>الحالة</span></dt>
              <dd>{statusLabel}</dd>
            </div>
          </dl>
        </section>

        {!isFullyDispensed && (
          <section className="dpg-card dpg-card--verification">
            <h2 className="dpg-card-title">
              <ShieldCheck size={18} aria-hidden="true" />
              <span>رمز التحقق للصيدلية</span>
            </h2>
            <div className="dpg-verification-row">
              {rx.verificationCode ? (
                <div
                  className="dpg-verification-code"
                  dir="ltr"
                  aria-label={`رمز التحقق: ${rx.verificationCode}`}
                >
                  {rx.verificationCode}
                </div>
              ) : (
                <div className="dpg-verification-code" dir="ltr">—</div>
              )}
              <div className="dpg-verification-qr" aria-label="رمز QR للصرف">
                <ShieldCheck size={48} aria-hidden="true" />
                <span>رمز QR</span>
              </div>
            </div>
            <p className="dpg-verification-hint">
              <Info size={14} aria-hidden="true" />
              <span>أبرز هذا الرمز للصيدلي عند صرف الوصفة.</span>
            </p>
          </section>
        )}

        {meds.length > 0 && (
          <section className="dpg-card">
            <h2 className="dpg-card-title">
              <Pill size={18} aria-hidden="true" />
              <span>الأدوية</span>
              <span className="dpg-card-title-count">{meds.length}</span>
            </h2>
            <ul className="dpg-meds-list">
              {meds.map((med, idx) => {
                const routeLabel = med.route ? (MED_ROUTE_LABELS[med.route] || med.route) : null;
                return (
                  <li key={idx} className={`dpg-med${med.isDispensed ? ' is-dispensed' : ''}`}>
                    <div className="dpg-med-head">
                      <div className="dpg-med-title">
                        <span className="dpg-med-icon" aria-hidden="true">
                          <Pill size={18} />
                        </span>
                        <div className="dpg-med-names">
                          <strong dir="auto">{med.medicationName || '—'}</strong>
                          {med.arabicName && med.arabicName !== med.medicationName && (
                            <span className="dpg-med-ar" dir="auto">{med.arabicName}</span>
                          )}
                        </div>
                      </div>
                      {med.isDispensed && (
                        <span className="dpg-med-badge">
                          <CheckCircle2 size={12} aria-hidden="true" />
                          <span>مصروف</span>
                        </span>
                      )}
                    </div>

                    <dl className="dpg-med-grid">
                      <div className="dpg-med-field">
                        <dt><Syringe size={13} aria-hidden="true" /><span>الجرعة</span></dt>
                        <dd dir="auto">{orDash(med.dosage)}</dd>
                      </div>
                      <div className="dpg-med-field">
                        <dt><Repeat size={13} aria-hidden="true" /><span>التكرار</span></dt>
                        <dd dir="auto">{orDash(med.frequency)}</dd>
                      </div>
                      <div className="dpg-med-field">
                        <dt><Calendar size={13} aria-hidden="true" /><span>المدة</span></dt>
                        <dd dir="auto">{orDash(med.duration)}</dd>
                      </div>
                      <div className="dpg-med-field">
                        <dt><Navigation size={13} aria-hidden="true" /><span>طريقة الاستخدام</span></dt>
                        <dd dir="auto">{orDash(routeLabel)}</dd>
                      </div>
                      <div className="dpg-med-field">
                        <dt><Hash size={13} aria-hidden="true" /><span>الكمية</span></dt>
                        <dd dir="auto">{orDash(med.quantity)}</dd>
                      </div>
                      {med.dispensedAt && (
                        <div className="dpg-med-field">
                          <dt><Calendar size={13} aria-hidden="true" /><span>تاريخ الصرف</span></dt>
                          <dd dir="ltr">{formatDateTime(med.dispensedAt)}</dd>
                        </div>
                      )}
                    </dl>

                    {med.instructions && (
                      <aside className="dpg-med-instructions" dir="auto">
                        <Info size={14} aria-hidden="true" />
                        <div>
                          <span className="dpg-med-instructions-label">تعليمات الاستخدام</span>
                          <p>{med.instructions}</p>
                        </div>
                      </aside>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {rx.prescriptionNotes && (
          <section className="dpg-card">
            <h2 className="dpg-card-title">
              <FileText size={18} aria-hidden="true" />
              <span>ملاحظات</span>
            </h2>
            <p className="dpg-card-text" dir="auto">{rx.prescriptionNotes}</p>
          </section>
        )}
      </main>
    </div>
  );
}


function renderTopBar(onBack) {
  return (
    <header className="dpg-topbar">
      <button
        type="button"
        className="dpg-back-btn"
        onClick={onBack}
        aria-label="رجوع"
      >
        <ArrowRight size={18} aria-hidden="true" />
        <span>رجوع</span>
      </button>
    </header>
  );
}
