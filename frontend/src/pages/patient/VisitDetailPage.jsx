/**
 * VisitDetailPage
 *
 * Full-page detail view for a single medical visit.
 * Reached from PatientDashboard → Visits by clicking any card.
 *
 * Route: /patient-dashboard/visits/:id
 *
 * Renders every schema field that may exist on a visits document, using
 * detailHelpers to resolve doctor/hospital references regardless of the
 * Mongoose populate shape returned by the backend.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';

import {
  ArrowRight,
  Calendar,
  Stethoscope,
  Activity,
  HeartPulse,
  Heart,
  Pill,
  FileText,
  ExternalLink,
  AlertTriangle,
  Info,
  CreditCard,
  Hospital,
  Phone,
  Hash,
  ClipboardList,
} from 'lucide-react';

import { patientAPI } from '../../services/api';
import LoadingSpinner from '../../components/LoadingSpinner';

import {
  getDoctorInfo,
  getHospitalName,
  getHospitalPhone,
  getHospitalAddress,
  formatDoctorDisplay,
  formatLongDate,
  orDash,
  PAYMENT_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  MED_ROUTE_LABELS,
} from './detailHelpers';

import '../../styles/PatientDashboard.css';
import '../../styles/patient-detail-pages.css';


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


/**
 * Render the 9-field vital-signs grid. Returns null when every value is
 * missing so the caller can skip the whole section.
 */
function renderVitalSigns(vitals) {
  if (!vitals || typeof vitals !== 'object') return null;
  const items = [
    { key: 'bloodPressureSystolic',  label: 'ضغط الدم الانقباضي',  value: vitals.bloodPressureSystolic,  unit: 'mmHg'        },
    { key: 'bloodPressureDiastolic', label: 'ضغط الدم الانبساطي',  value: vitals.bloodPressureDiastolic, unit: 'mmHg'        },
    { key: 'heartRate',              label: 'النبض',                  value: vitals.heartRate,              unit: 'نبضة/دقيقة' },
    { key: 'oxygenSaturation',       label: 'الأكسجين',                value: vitals.oxygenSaturation,       unit: '%'           },
    { key: 'bloodGlucose',           label: 'سكر الدم',                value: vitals.bloodGlucose,           unit: 'mg/dL'       },
    { key: 'temperature',            label: 'الحرارة',                  value: vitals.temperature,            unit: '°C'          },
    { key: 'weight',                 label: 'الوزن',                    value: vitals.weight,                 unit: 'كغ'           },
    { key: 'height',                 label: 'الطول',                    value: vitals.height,                 unit: 'سم'           },
    { key: 'respiratoryRate',        label: 'التنفس',                   value: vitals.respiratoryRate,        unit: 'نفس/دقيقة'  },
  ].filter((i) => i.value !== undefined && i.value !== null && i.value !== '');

  if (items.length === 0) return null;

  return (
    <dl className="pd-visit-vitals">
      {items.map((item) => (
        <div key={item.key} className="pd-visit-vital">
          <dt className="pd-visit-vital-label">{item.label}</dt>
          <dd className="pd-visit-vital-value" dir="ltr">
            {item.value}{' '}
            <span className="pd-visit-vital-unit">{item.unit}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}


export default function VisitDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const stateVisit = location.state?.visit || null;

  const [visit,   setVisit]   = useState(stateVisit);
  const [loading, setLoading] = useState(!stateVisit);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (stateVisit) return undefined;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const res = await patientAPI.getVisits();
        if (cancelled) return;
        if (res?.success) {
          const found = (res.visits || []).find((v) => v._id === id);
          if (found) setVisit(found);
          else setError('لم يتم العثور على الزيارة المطلوبة.');
        } else {
          setError(res?.message || 'تعذر تحميل تفاصيل الزيارة.');
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'حدث خطأ في الاتصال بالخادم.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [id, stateVisit]);

  const typeLabel     = visit ? (VISIT_TYPE_LABELS[visit.visitType]    || visit.visitType || '—')  : '';
  const statusLabel   = visit ? (VISIT_STATUS_LABELS[visit.status]     || visit.status    || '—')  : '';
  const statusVariant = visit ? (VISIT_STATUS_VARIANTS[visit.status]   || 'muted')                 : 'muted';

  const doctorInfo    = useMemo(() => getDoctorInfo(visit),     [visit]);
  const doctorDisplay = useMemo(() => formatDoctorDisplay(doctorInfo), [doctorInfo]);
  const hospitalName  = useMemo(() => getHospitalName(visit),   [visit]);
  const hospitalPhone = useMemo(() => getHospitalPhone(visit),  [visit]);
  const hospitalAddr  = useMemo(() => getHospitalAddress(visit), [visit]);

  const paymentStatusLabel = visit?.paymentStatus
    ? (PAYMENT_STATUS_LABELS[visit.paymentStatus] || visit.paymentStatus)
    : null;
  const paymentMethodLabel = visit?.paymentMethod
    ? (PAYMENT_METHOD_LABELS[visit.paymentMethod] || visit.paymentMethod)
    : null;

  const vitalsJSX = visit ? renderVitalSigns(visit.vitalSigns) : null;
  const meds = visit && Array.isArray(visit.prescribedMedications) ? visit.prescribedMedications : [];

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/patient-dashboard');
  };

  if (loading) {
    return (
      <div className="dpg-page" dir="rtl">
        {renderTopBar(handleBack)}
        <div className="dpg-loading">
          <LoadingSpinner message="جاري تحميل تفاصيل الزيارة..." />
        </div>
      </div>
    );
  }

  if (error || !visit) {
    return (
      <div className="dpg-page" dir="rtl">
        {renderTopBar(handleBack)}
        <div className="dpg-error">
          <AlertTriangle size={32} aria-hidden="true" />
          <h2>تعذر عرض الزيارة</h2>
          <p>{error || 'الزيارة المطلوبة غير موجودة.'}</p>
          <button type="button" className="pd-btn pd-btn--primary" onClick={handleBack}>
            <ArrowRight size={16} aria-hidden="true" />
            <span>العودة إلى الزيارات</span>
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
            <Stethoscope size={28} />
          </div>
          <div className="dpg-hero-body">
            <h1 className="dpg-hero-title" dir="auto">
              {visit.chiefComplaint || typeLabel}
            </h1>
            <div className="dpg-hero-meta">
              <span className="dpg-hero-meta-item" dir="ltr">
                <Calendar size={14} aria-hidden="true" />
                <time dateTime={visit.visitDate}>{formatLongDate(visit.visitDate)}</time>
              </span>
              <span className="dpg-hero-meta-item">
                <Activity size={14} aria-hidden="true" />
                <span>{typeLabel}</span>
              </span>
              {doctorDisplay && (
                <span className="dpg-hero-meta-item" dir="auto">
                  <Stethoscope size={14} aria-hidden="true" />
                  <span>{doctorDisplay}</span>
                </span>
              )}
            </div>
            <div className="dpg-hero-badges">
              <span className={`pdmr-status pdmr-status--${statusVariant}`}>
                {statusLabel}
              </span>
            </div>
          </div>
        </section>

        {/* Basic info — always shown with orDash for missing fields */}
        <section className="dpg-card">
          <h2 className="dpg-card-title">
            <Info size={18} aria-hidden="true" />
            <span>معلومات الزيارة</span>
          </h2>
          <dl className="dpg-fields">
            <div className="dpg-field">
              <dt><Activity size={15} aria-hidden="true" /><span>نوع الزيارة</span></dt>
              <dd>{typeLabel}</dd>
            </div>
            <div className="dpg-field">
              <dt><Calendar size={15} aria-hidden="true" /><span>تاريخ الزيارة</span></dt>
              <dd dir="ltr">{formatLongDate(visit.visitDate)}</dd>
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
              <dt><Hospital size={15} aria-hidden="true" /><span>المستشفى</span></dt>
              <dd dir="auto">{orDash(hospitalName)}</dd>
            </div>
            {hospitalAddr && (
              <div className="dpg-field">
                <dt><Hospital size={15} aria-hidden="true" /><span>العنوان</span></dt>
                <dd dir="auto">{hospitalAddr}</dd>
              </div>
            )}
            {hospitalPhone && (
              <div className="dpg-field">
                <dt><Phone size={15} aria-hidden="true" /><span>هاتف المستشفى</span></dt>
                <dd dir="ltr">{hospitalPhone}</dd>
              </div>
            )}
            <div className="dpg-field">
              <dt><Hash size={15} aria-hidden="true" /><span>الحالة</span></dt>
              <dd>{statusLabel}</dd>
            </div>
          </dl>
        </section>

        <section className="dpg-card">
          <h2 className="dpg-card-title">
            <ClipboardList size={18} aria-hidden="true" />
            <span>الشكوى الرئيسية</span>
          </h2>
          <p className="dpg-card-text" dir="auto">{orDash(visit.chiefComplaint)}</p>
        </section>

        <section className="dpg-card">
          <h2 className="dpg-card-title">
            <Activity size={18} aria-hidden="true" />
            <span>التشخيص</span>
          </h2>
          <p className="dpg-card-text" dir="auto">{orDash(visit.diagnosis)}</p>
        </section>

        {vitalsJSX && (
          <section className="dpg-card">
            <h2 className="dpg-card-title">
              <HeartPulse size={18} aria-hidden="true" />
              <span>العلامات الحيوية</span>
            </h2>
            {vitalsJSX}
          </section>
        )}

        {meds.length > 0 && (
          <section className="dpg-card">
            <h2 className="dpg-card-title">
              <Pill size={18} aria-hidden="true" />
              <span>الأدوية الموصوفة</span>
              <span className="dpg-card-title-count">{meds.length}</span>
            </h2>
            <ul className="pd-visit-meds">
              {meds.map((med, idx) => {
                const routeLabel = med.route ? (MED_ROUTE_LABELS[med.route] || med.route) : null;
                const metaParts = [med.dosage, med.frequency, med.duration, routeLabel].filter(Boolean);
                return (
                  <li key={idx} className="pd-visit-med">
                    <strong dir="auto">{med.medicationName || '—'}</strong>
                    {metaParts.length > 0 && <span dir="auto">{metaParts.join(' • ')}</span>}
                    {med.quantity != null && med.quantity !== '' && (
                      <span dir="auto" style={{ color: 'var(--tm-text-secondary)' }}>
                        الكمية: {med.quantity}
                      </span>
                    )}
                    {med.instructions && (
                      <span className="pd-visit-med-note" dir="auto">{med.instructions}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {visit.doctorNotes && (
          <section className="dpg-card">
            <h2 className="dpg-card-title">
              <FileText size={18} aria-hidden="true" />
              <span>ملاحظات الطبيب</span>
            </h2>
            <p className="dpg-card-text" dir="auto">{visit.doctorNotes}</p>
          </section>
        )}

        {visit.followUpDate && (
          <section className="dpg-card">
            <h2 className="dpg-card-title">
              <Calendar size={18} aria-hidden="true" />
              <span>موعد المتابعة</span>
            </h2>
            <p className="dpg-card-text">
              <span dir="ltr">{formatLongDate(visit.followUpDate)}</span>
              {visit.followUpNotes && (
                <>
                  <br />
                  <span dir="auto" style={{ color: 'var(--tm-text-secondary)' }}>
                    {visit.followUpNotes}
                  </span>
                </>
              )}
            </p>
          </section>
        )}

        {visit.visitPhotoUrl && (
          <section className="dpg-card">
            <h2 className="dpg-card-title">
              <FileText size={18} aria-hidden="true" />
              <span>صورة مرفقة</span>
            </h2>
            <a
              href={visit.visitPhotoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="pd-visit-photo-link"
            >
              <img
                src={visit.visitPhotoUrl}
                alt="صورة الزيارة"
                className="pd-visit-photo"
              />
              <span className="pd-visit-photo-hint">
                <ExternalLink size={12} aria-hidden="true" />
                <span>عرض بالحجم الكامل</span>
              </span>
            </a>
          </section>
        )}

        {visit.ecgAnalysis && (
          <section className="dpg-card">
            <h2 className="dpg-card-title">
              <Heart size={18} aria-hidden="true" />
              <span>تحليل تخطيط القلب</span>
            </h2>
            <div className="pd-visit-ecg-body">
              {visit.ecgAnalysis.topPrediction && (
                <p>
                  <strong>النتيجة الرئيسية: </strong>
                  <span dir="auto">{visit.ecgAnalysis.topPrediction}</span>
                </p>
              )}
              {visit.ecgAnalysis.recommendation && (
                <p dir="auto">{visit.ecgAnalysis.recommendation}</p>
              )}
              {Array.isArray(visit.ecgAnalysis.predictions) && visit.ecgAnalysis.predictions.length > 0 && (
                <ul className="pd-visit-meds">
                  {visit.ecgAnalysis.predictions.map((p, idx) => (
                    <li key={idx} className="pd-visit-med">
                      <strong dir="auto">{p.arabicLabel || p.englishLabel || p.class}</strong>
                      <span dir="ltr">{Number(p.confidence).toFixed(1)}%</span>
                    </li>
                  ))}
                </ul>
              )}
              {visit.ecgAnalysis.ecgImageUrl && (
                <a
                  href={visit.ecgAnalysis.ecgImageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pd-visit-ecg-link"
                >
                  <ExternalLink size={14} aria-hidden="true" />
                  <span>عرض صورة التخطيط</span>
                </a>
              )}
            </div>
          </section>
        )}

        {(paymentStatusLabel || paymentMethodLabel) && (
          <section className="dpg-card">
            <h2 className="dpg-card-title">
              <CreditCard size={18} aria-hidden="true" />
              <span>الدفع</span>
            </h2>
            <dl className="dpg-fields">
              {paymentStatusLabel && (
                <div className="dpg-field">
                  <dt><CreditCard size={15} aria-hidden="true" /><span>الحالة</span></dt>
                  <dd>{paymentStatusLabel}</dd>
                </div>
              )}
              {paymentMethodLabel && (
                <div className="dpg-field">
                  <dt><CreditCard size={15} aria-hidden="true" /><span>طريقة الدفع</span></dt>
                  <dd>{paymentMethodLabel}</dd>
                </div>
              )}
            </dl>
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
