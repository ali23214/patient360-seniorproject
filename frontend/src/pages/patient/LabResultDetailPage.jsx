/**
 * LabResultDetailPage
 *
 * Full-page detail view for a single lab test order/result.
 * Route: /patient-dashboard/lab-results/:id
 *
 * NEW in v2: also renders `testsOrdered` (what the doctor REQUESTED)
 * separately from `testResults` (what the lab MEASURED).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';

import {
  ArrowRight,
  Calendar,
  Stethoscope,
  FlaskConical,
  FileText,
  AlertTriangle,
  AlertOctagon,
  AlertCircle,
  CheckCircle2,
  Info,
  Download,
  Hash,
  Hospital,
  Clock,
  Beaker,
  ListChecks,
} from 'lucide-react';

import { patientAPI } from '../../services/api';
import LoadingSpinner from '../../components/LoadingSpinner';

import {
  getDoctorInfo,
  getLabName,
  formatDoctorDisplay,
  formatLongDate,
  formatDateTime,
  orDash,
  SAMPLE_TYPE_LABELS,
  TEST_CATEGORY_LABELS,
  PRIORITY_LABELS,
} from './detailHelpers';

import '../../styles/PatientDashboard.css';
import '../../styles/patient-detail-pages.css';


const LAB_STATUS_LABELS = {
  ordered:          'معلّقة',
  scheduled:        'مجدولة',
  sample_collected: 'تم سحب العينة',
  in_progress:      'قيد التنفيذ',
  completed:        'مكتملة',
  cancelled:        'ملغاة',
  rejected:         'مرفوضة',
};

const LAB_STATUS_VARIANTS = {
  ordered:          'info',
  scheduled:        'info',
  sample_collected: 'info',
  in_progress:      'warning',
  completed:        'success',
  cancelled:        'danger',
  rejected:         'danger',
};

const BACKEND_BASE = 'http://localhost:5000';


export default function LabResultDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const stateLab = location.state?.labTest || null;

  const [lab,     setLab]     = useState(stateLab);
  const [loading, setLoading] = useState(!stateLab);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (stateLab) return undefined;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const res = await patientAPI.getLabTests();
        if (cancelled) return;
        if (res?.success) {
          const found = (res.labTests || []).find((t) => t._id === id);
          if (found) setLab(found);
          else setError('لم يتم العثور على التحليل المطلوب.');
        } else {
          setError(res?.message || 'تعذر تحميل تفاصيل التحليل.');
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'حدث خطأ في الاتصال بالخادم.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [id, stateLab]);

  // Auto-mark as viewed on direct URL hit.
  useEffect(() => {
    if (!lab || lab.status !== 'completed' || lab.isViewedByPatient) return;
    (async () => {
      try {
        await patientAPI.markLabTestViewed(lab._id);
        setLab((prev) => prev ? { ...prev, isViewedByPatient: true } : prev);
      } catch {
        // Silent — next list refresh reconciles.
      }
    })();
  }, [lab]);

  const statusLabel    = lab ? (LAB_STATUS_LABELS[lab.status]   || lab.status || '—') : '';
  const statusVariant  = lab ? (LAB_STATUS_VARIANTS[lab.status] || 'muted')           : 'muted';
  const results = lab && Array.isArray(lab.testResults) ? lab.testResults : [];
  const ordered = lab && Array.isArray(lab.testsOrdered) ? lab.testsOrdered : [];

  const stats = useMemo(() => {
    let normal = 0, abnormal = 0, critical = 0;
    for (const r of results) {
      if (r.isCritical)      critical++;
      else if (r.isAbnormal) abnormal++;
      else                   normal++;
    }
    return { normal, abnormal, critical, total: results.length };
  }, [results]);

  const doctorInfo    = useMemo(() => getDoctorInfo(lab ? { ...lab, doctor: lab.doctor, doctorId: lab.orderedBy || lab.doctorId } : null), [lab]);
  const doctorDisplay = useMemo(() => formatDoctorDisplay(doctorInfo), [doctorInfo]);
  const labName       = useMemo(() => getLabName(lab), [lab]);

  const categoryLabel = lab?.testCategory
    ? (TEST_CATEGORY_LABELS[lab.testCategory] || lab.testCategory)
    : null;
  const priorityLabel = lab?.priority
    ? (PRIORITY_LABELS[lab.priority] || lab.priority)
    : null;
  const sampleTypeLabel = lab?.sampleType
    ? (SAMPLE_TYPE_LABELS[lab.sampleType] || lab.sampleType)
    : null;

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/patient-dashboard');
  };

  if (loading) {
    return (
      <div className="dpg-page" dir="rtl">
        {renderTopBar(handleBack)}
        <div className="dpg-loading">
          <LoadingSpinner message="جاري تحميل تفاصيل التحليل..." />
        </div>
      </div>
    );
  }

  if (error || !lab) {
    return (
      <div className="dpg-page" dir="rtl">
        {renderTopBar(handleBack)}
        <div className="dpg-error">
          <AlertTriangle size={32} aria-hidden="true" />
          <h2>تعذر عرض التحليل</h2>
          <p>{error || 'التحليل المطلوب غير موجود.'}</p>
          <button type="button" className="pd-btn pd-btn--primary" onClick={handleBack}>
            <ArrowRight size={16} aria-hidden="true" />
            <span>العودة إلى نتائج المختبر</span>
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
            <FlaskConical size={28} />
          </div>
          <div className="dpg-hero-body">
            <h1 className="dpg-hero-title" dir="ltr">
              {lab.testNumber || 'تحليل مخبري'}
            </h1>
            <div className="dpg-hero-meta">
              <span className="dpg-hero-meta-item" dir="ltr">
                <Calendar size={14} aria-hidden="true" />
                <time dateTime={lab.orderDate}>{formatLongDate(lab.orderDate)}</time>
              </span>
              {labName && (
                <span className="dpg-hero-meta-item" dir="auto">
                  <Hospital size={14} aria-hidden="true" />
                  <span>{labName}</span>
                </span>
              )}
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
              {stats.critical > 0 && (
                <span className="pdmr-priority pdmr-priority--emergency">
                  <AlertOctagon size={11} aria-hidden="true" />
                  <span>{stats.critical} نتيجة حرجة</span>
                </span>
              )}
              {stats.critical === 0 && stats.abnormal > 0 && (
                <span className="pdmr-priority pdmr-priority--urgent">
                  <AlertTriangle size={11} aria-hidden="true" />
                  <span>{stats.abnormal} غير طبيعية</span>
                </span>
              )}
            </div>
          </div>
        </section>

        {stats.critical > 0 && (
          <section className="dpg-banner dpg-banner--danger" role="alert">
            <AlertOctagon size={32} strokeWidth={2.5} aria-hidden="true" />
            <div className="dpg-banner-body">
              <h3>نتائج حرجة — راجع طبيبك فوراً</h3>
              <p>
                هذا التحليل يحتوي على {stats.critical} نتيجة خارج النطاق الحرج.
                لا تتأخر في عرضها على طبيبك المعالج.
              </p>
            </div>
          </section>
        )}

        {/* Basic info */}
        <section className="dpg-card">
          <h2 className="dpg-card-title">
            <Info size={18} aria-hidden="true" />
            <span>معلومات التحليل</span>
          </h2>
          <dl className="dpg-fields">
            <div className="dpg-field">
              <dt><Hash size={15} aria-hidden="true" /><span>رقم التحليل</span></dt>
              <dd dir="ltr">{orDash(lab.testNumber)}</dd>
            </div>
            <div className="dpg-field">
              <dt><Calendar size={15} aria-hidden="true" /><span>تاريخ الطلب</span></dt>
              <dd dir="ltr">{formatLongDate(lab.orderDate)}</dd>
            </div>
            {lab.scheduledDate && (
              <div className="dpg-field">
                <dt><Calendar size={15} aria-hidden="true" /><span>التاريخ المقرر</span></dt>
                <dd dir="ltr">{formatLongDate(lab.scheduledDate)}</dd>
              </div>
            )}
            {lab.sampleCollectedAt && (
              <div className="dpg-field">
                <dt><Beaker size={15} aria-hidden="true" /><span>تاريخ سحب العينة</span></dt>
                <dd dir="ltr">{formatDateTime(lab.sampleCollectedAt)}</dd>
              </div>
            )}
            {lab.completedAt && (
              <div className="dpg-field">
                <dt><CheckCircle2 size={15} aria-hidden="true" /><span>تاريخ النتائج</span></dt>
                <dd dir="ltr">{formatDateTime(lab.completedAt)}</dd>
              </div>
            )}
            <div className="dpg-field">
              <dt><Stethoscope size={15} aria-hidden="true" /><span>الطبيب الطالب</span></dt>
              <dd dir="auto">{orDash(doctorDisplay)}</dd>
            </div>
            <div className="dpg-field">
              <dt><Hospital size={15} aria-hidden="true" /><span>المختبر</span></dt>
              <dd dir="auto">{orDash(labName)}</dd>
            </div>
            {categoryLabel && (
              <div className="dpg-field">
                <dt><FlaskConical size={15} aria-hidden="true" /><span>الفئة</span></dt>
                <dd>{categoryLabel}</dd>
              </div>
            )}
            {sampleTypeLabel && (
              <div className="dpg-field">
                <dt><Beaker size={15} aria-hidden="true" /><span>نوع العينة</span></dt>
                <dd>{sampleTypeLabel}</dd>
              </div>
            )}
            {lab.sampleId && (
              <div className="dpg-field">
                <dt><Hash size={15} aria-hidden="true" /><span>معرف العينة</span></dt>
                <dd dir="ltr">{lab.sampleId}</dd>
              </div>
            )}
            {priorityLabel && (
              <div className="dpg-field">
                <dt><Clock size={15} aria-hidden="true" /><span>الأولوية</span></dt>
                <dd>{priorityLabel}</dd>
              </div>
            )}
            <div className="dpg-field">
              <dt><Hash size={15} aria-hidden="true" /><span>الحالة</span></dt>
              <dd>{statusLabel}</dd>
            </div>
          </dl>
        </section>

        {/* Tests ordered (what doctor requested) */}
        {ordered.length > 0 && (
          <section className="dpg-card">
            <h2 className="dpg-card-title">
              <ListChecks size={18} aria-hidden="true" />
              <span>الفحوصات المطلوبة</span>
              <span className="dpg-card-title-count">{ordered.length}</span>
            </h2>
            <ul className="pd-visit-meds">
              {ordered.map((t, idx) => (
                <li key={idx} className="pd-visit-med">
                  <strong dir="auto">{t.testName || '—'}</strong>
                  {t.testCode && (
                    <span dir="ltr" style={{ color: 'var(--tm-text-secondary)' }}>
                      {t.testCode}
                    </span>
                  )}
                  {t.notes && (
                    <span className="pd-visit-med-note" dir="auto">{t.notes}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Results table */}
        {results.length > 0 ? (
          <section className="dpg-card">
            <h2 className="dpg-card-title">
              <FlaskConical size={18} aria-hidden="true" />
              <span>النتائج</span>
              <span className="dpg-card-title-count">{results.length}</span>
            </h2>

            <div className="dpg-result-stats">
              {stats.normal > 0 && (
                <span className="dpg-result-stat dpg-result-stat--normal">
                  <CheckCircle2 size={13} aria-hidden="true" />
                  <span>{stats.normal} طبيعية</span>
                </span>
              )}
              {stats.abnormal > 0 && (
                <span className="dpg-result-stat dpg-result-stat--abnormal">
                  <AlertTriangle size={13} aria-hidden="true" />
                  <span>{stats.abnormal} غير طبيعية</span>
                </span>
              )}
              {stats.critical > 0 && (
                <span className="dpg-result-stat dpg-result-stat--critical">
                  <AlertOctagon size={13} aria-hidden="true" />
                  <span>{stats.critical} حرجة</span>
                </span>
              )}
            </div>

            <div className="dpg-results-wrap">
              <table className="dpg-results-table">
                <thead>
                  <tr>
                    <th scope="col">الفحص</th>
                    <th scope="col">القيمة</th>
                    <th scope="col">المعدل الطبيعي</th>
                    <th scope="col" className="dpg-results-status-col">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, idx) => {
                    const rowClass =
                      r.isCritical ? 'dpg-result-row--critical'
                      : r.isAbnormal ? 'dpg-result-row--abnormal'
                      : 'dpg-result-row--normal';
                    const StatusIcon =
                      r.isCritical ? AlertOctagon
                      : r.isAbnormal ? AlertTriangle
                      : CheckCircle2;
                    const rowLabel =
                      r.isCritical ? 'حرجة'
                      : r.isAbnormal ? 'غير طبيعية'
                      : 'طبيعية';

                    return (
                      <tr key={idx} className={rowClass}>
                        <td dir="auto">{orDash(r.testName)}</td>
                        <td dir="ltr">
                          <strong>{orDash(r.value)}</strong>
                          {r.unit && <span className="dpg-result-unit">{' '}{r.unit}</span>}
                        </td>
                        <td dir="ltr">{r.referenceRange || '—'}</td>
                        <td>
                          <span className="dpg-result-pill">
                            <StatusIcon size={12} aria-hidden="true" />
                            <span>{rowLabel}</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : lab.status === 'completed' ? (
          <section className="dpg-card">
            <p className="dpg-card-text" style={{ color: 'var(--tm-text-secondary)' }}>
              لم تُسجّل نتائج تفصيلية لهذا التحليل، لكن قد يتوفر تقرير PDF للتنزيل أدناه.
            </p>
          </section>
        ) : (
          <section className="dpg-card">
            <p className="dpg-card-text" style={{ color: 'var(--tm-text-secondary)' }}>
              لم تصدر النتائج بعد. ستظهر هنا فور توفرها من المختبر.
            </p>
          </section>
        )}

        {lab.resultPdfUrl && (
          <section className="dpg-card">
            <h2 className="dpg-card-title">
              <FileText size={18} aria-hidden="true" />
              <span>تقرير المختبر (PDF)</span>
            </h2>
            <a
              href={`${BACKEND_BASE}${lab.resultPdfUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="pd-btn pd-btn--primary"
              style={{ alignSelf: 'flex-start' }}
            >
              <Download size={16} aria-hidden="true" />
              <span>تنزيل تقرير PDF</span>
            </a>
          </section>
        )}

        {lab.labNotes && (
          <section className="dpg-card">
            <h2 className="dpg-card-title">
              <FileText size={18} aria-hidden="true" />
              <span>ملاحظات المختبر</span>
            </h2>
            <p className="dpg-card-text" dir="auto">{lab.labNotes}</p>
          </section>
        )}

        {lab.status === 'rejected' && lab.rejectionReason && (
          <section className="dpg-card">
            <h2 className="dpg-card-title">
              <AlertCircle size={18} aria-hidden="true" />
              <span>سبب الرفض</span>
            </h2>
            <p className="dpg-card-text" dir="auto">{lab.rejectionReason}</p>
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
