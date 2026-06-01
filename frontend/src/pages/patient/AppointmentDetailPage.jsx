/**
 * AppointmentDetailPage
 *
 * Full-page detail view for a single appointment.
 * Reached from PatientDashboard → Appointments by clicking any card.
 *
 * Route: /patient-dashboard/appointments/:id
 *
 * Renders every schema field that may exist on an appointments document,
 * using detailHelpers to resolve doctor/hospital references regardless
 * of the Mongoose populate shape returned by the backend.
 *
 * Also owns the "cancel appointment" modal flow.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';

import {
  ArrowRight,
  Calendar,
  Clock,
  Stethoscope,
  Hospital,
  Phone,
  MapPin,
  FileText,
  Hash,
  X,
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Info,
  ClipboardList,
  Bookmark,
} from 'lucide-react';

import { patientAPI } from '../../services/api';
import LoadingSpinner from '../../components/LoadingSpinner';

import {
  getDoctorInfo,
  getHospitalName,
  getHospitalPhone,
  getHospitalAddress,
  getLabName,
  formatDoctorDisplay,
  formatLongDate,
  formatDateTime,
  orDash,
  PAYMENT_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PRIORITY_LABELS,
  BOOKING_METHOD_LABELS,
  APPOINTMENT_TYPE_LABELS,
} from './detailHelpers';

import '../../styles/PatientDashboard.css';
import '../../styles/patient-detail-pages.css';


const APPOINTMENT_STATUS_LABELS = {
  scheduled:   'مجدول',
  confirmed:   'مؤكد',
  checked_in:  'تم تسجيل الوصول',
  in_progress: 'قيد التنفيذ',
  completed:   'مكتمل',
  cancelled:   'ملغى',
  no_show:     'لم يحضر',
  rescheduled: 'تمت إعادة الجدولة',
};

const APPOINTMENT_STATUS_VARIANTS = {
  scheduled:   'info',
  confirmed:   'info',
  checked_in:  'warning',
  in_progress: 'warning',
  completed:   'success',
  cancelled:   'danger',
  no_show:     'muted',
  rescheduled: 'info',
};

// Cancellation reasons — schema-matched.
const CANCELLATION_REASONS = [
  { value: 'patient_request',     label: 'بناءً على طلبي' },
  { value: 'doctor_unavailable',  label: 'الطبيب غير متاح' },
  { value: 'emergency',           label: 'حالة طارئة' },
  { value: 'duplicate',           label: 'حجز مكرر' },
  { value: 'other',               label: 'سبب آخر' },
];

const CANCELLATION_REASON_LABELS = Object.fromEntries(
  CANCELLATION_REASONS.map((r) => [r.value, r.label])
);


export default function AppointmentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const stateAppt = location.state?.appointment || null;

  const [appointment, setAppointment] = useState(stateAppt);
  const [loading,     setLoading]     = useState(!stateAppt);
  const [error,       setError]       = useState(null);

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason,    setCancelReason]    = useState('patient_request');
  const [cancelNotes,     setCancelNotes]     = useState('');
  const [cancelling,      setCancelling]      = useState(false);
  const [feedbackOpen,    setFeedbackOpen]    = useState(false);
  const [feedbackKind,    setFeedbackKind]    = useState('success');
  const [feedbackMessage, setFeedbackMessage] = useState('');

  useEffect(() => {
    if (stateAppt) return undefined;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const res = await patientAPI.getAppointments();
        if (cancelled) return;
        if (res?.success) {
          const found = (res.appointments || []).find((a) => a._id === id);
          if (found) setAppointment(found);
          else setError('لم يتم العثور على الموعد المطلوب.');
        } else {
          setError(res?.message || 'تعذر تحميل تفاصيل الموعد.');
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'حدث خطأ في الاتصال بالخادم.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [id, stateAppt]);

  // ── Derived display data ────────────────────────────────────────────
  const typeLabel = appointment
    ? (APPOINTMENT_TYPE_LABELS[appointment.appointmentType] || appointment.appointmentType || '—')
    : '';
  const statusLabel = appointment
    ? (APPOINTMENT_STATUS_LABELS[appointment.status] || appointment.status || '—')
    : '';
  const statusVariant = appointment
    ? (APPOINTMENT_STATUS_VARIANTS[appointment.status] || 'muted')
    : 'muted';
  const priorityLabel = appointment?.priority
    ? (PRIORITY_LABELS[appointment.priority] || appointment.priority)
    : null;
  const bookingMethodLabel = appointment?.bookingMethod
    ? (BOOKING_METHOD_LABELS[appointment.bookingMethod] || appointment.bookingMethod)
    : null;
  const paymentStatusLabel = appointment?.paymentStatus
    ? (PAYMENT_STATUS_LABELS[appointment.paymentStatus] || appointment.paymentStatus)
    : null;
  const paymentMethodLabel = appointment?.paymentMethod
    ? (PAYMENT_METHOD_LABELS[appointment.paymentMethod] || appointment.paymentMethod)
    : null;
  const cancellationReasonLabel = appointment?.cancellationReason
    ? (CANCELLATION_REASON_LABELS[appointment.cancellationReason] || appointment.cancellationReason)
    : null;

  const doctorInfo    = useMemo(() => getDoctorInfo(appointment), [appointment]);
  const doctorDisplay = useMemo(() => formatDoctorDisplay(doctorInfo), [doctorInfo]);
  const hospitalName  = useMemo(() => getHospitalName(appointment), [appointment]);
  const hospitalPhone = useMemo(() => getHospitalPhone(appointment), [appointment]);
  const hospitalAddr  = useMemo(() => getHospitalAddress(appointment), [appointment]);
  const labName       = useMemo(() => getLabName(appointment), [appointment]);

  // Is this appointment cancellable? Only future scheduled/confirmed ones.
  const isCancellable = useMemo(() => {
    if (!appointment) return false;
    const cancellableStatuses = ['scheduled', 'confirmed'];
    if (!cancellableStatuses.includes(appointment.status)) return false;
    if (!appointment.appointmentDate) return false;
    try {
      return new Date(appointment.appointmentDate).getTime() > Date.now();
    } catch {
      return false;
    }
  }, [appointment]);

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/patient-dashboard');
  };

  const openCancelModal = () => {
    setCancelReason('patient_request');
    setCancelNotes('');
    setCancelModalOpen(true);
  };
  const closeCancelModal = () => setCancelModalOpen(false);

  const handleConfirmCancel = async () => {
    if (cancelling) return;
    setCancelling(true);
    try {
      const res = await patientAPI.cancelAppointment(appointment._id, {
        cancellationReason: cancelReason,
        notes: cancelNotes.trim() || undefined,
      });
      if (res?.success) {
        setAppointment((prev) => prev ? {
          ...prev,
          status:             'cancelled',
          cancellationReason: cancelReason,
          cancelledAt:        new Date().toISOString(),
        } : prev);
        setCancelModalOpen(false);
        setFeedbackKind('success');
        setFeedbackMessage('تم إلغاء الموعد بنجاح.');
        setFeedbackOpen(true);
      } else {
        setFeedbackKind('error');
        setFeedbackMessage(res?.message || 'تعذر إلغاء الموعد. حاول مرة أخرى.');
        setFeedbackOpen(true);
      }
    } catch (err) {
      setFeedbackKind('error');
      setFeedbackMessage(err?.message || 'حدث خطأ في الاتصال بالخادم.');
      setFeedbackOpen(true);
    } finally {
      setCancelling(false);
    }
  };


  if (loading) {
    return (
      <div className="dpg-page" dir="rtl">
        {renderTopBar(handleBack)}
        <div className="dpg-loading">
          <LoadingSpinner message="جاري تحميل تفاصيل الموعد..." />
        </div>
      </div>
    );
  }

  if (error || !appointment) {
    return (
      <div className="dpg-page" dir="rtl">
        {renderTopBar(handleBack)}
        <div className="dpg-error">
          <AlertTriangle size={32} aria-hidden="true" />
          <h2>تعذر عرض الموعد</h2>
          <p>{error || 'الموعد المطلوب غير موجود.'}</p>
          <button type="button" className="pd-btn pd-btn--primary" onClick={handleBack}>
            <ArrowRight size={16} aria-hidden="true" />
            <span>العودة إلى المواعيد</span>
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
            <Calendar size={28} />
          </div>
          <div className="dpg-hero-body">
            <h1 className="dpg-hero-title" dir="auto">
              {appointment.reasonForVisit || typeLabel}
            </h1>
            <div className="dpg-hero-meta">
              <span className="dpg-hero-meta-item" dir="ltr">
                <Calendar size={14} aria-hidden="true" />
                <time dateTime={appointment.appointmentDate}>
                  {formatLongDate(appointment.appointmentDate)}
                </time>
              </span>
              {appointment.appointmentTime && (
                <span className="dpg-hero-meta-item" dir="ltr">
                  <Clock size={14} aria-hidden="true" />
                  <time>{appointment.appointmentTime}</time>
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
              {priorityLabel && appointment.priority !== 'routine' && (
                <span className={`pdmr-priority pdmr-priority--${appointment.priority}`}>
                  {priorityLabel}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Action bar — Cancel button (only for cancellable appointments) */}
        {isCancellable && (
          <section className="dpg-actions">
            <button
              type="button"
              className="pd-btn pd-btn--danger"
              onClick={openCancelModal}
            >
              <X size={16} aria-hidden="true" />
              <span>إلغاء الموعد</span>
            </button>
          </section>
        )}

        {/* Basic info — always shown */}
        <section className="dpg-card">
          <h2 className="dpg-card-title">
            <Info size={18} aria-hidden="true" />
            <span>تفاصيل الموعد</span>
          </h2>
          <dl className="dpg-fields">
            <div className="dpg-field">
              <dt><Bookmark size={15} aria-hidden="true" /><span>نوع الموعد</span></dt>
              <dd>{typeLabel}</dd>
            </div>
            <div className="dpg-field">
              <dt><Calendar size={15} aria-hidden="true" /><span>التاريخ</span></dt>
              <dd dir="ltr">{formatLongDate(appointment.appointmentDate)}</dd>
            </div>
            {appointment.appointmentTime && (
              <div className="dpg-field">
                <dt><Clock size={15} aria-hidden="true" /><span>الوقت</span></dt>
                <dd dir="ltr">{appointment.appointmentTime}</dd>
              </div>
            )}
            {appointment.estimatedDuration && (
              <div className="dpg-field">
                <dt><Clock size={15} aria-hidden="true" /><span>المدة المتوقعة</span></dt>
                <dd dir="ltr">{appointment.estimatedDuration} دقيقة</dd>
              </div>
            )}
            <div className="dpg-field">
              <dt><Stethoscope size={15} aria-hidden="true" /><span>الطبيب</span></dt>
              <dd dir="auto">{orDash(doctorDisplay)}</dd>
            </div>
            <div className="dpg-field">
              <dt><Hospital size={15} aria-hidden="true" /><span>المستشفى</span></dt>
              <dd dir="auto">{orDash(hospitalName)}</dd>
            </div>
            {labName && (
              <div className="dpg-field">
                <dt><Hospital size={15} aria-hidden="true" /><span>المختبر</span></dt>
                <dd dir="auto">{labName}</dd>
              </div>
            )}
            {hospitalAddr && (
              <div className="dpg-field">
                <dt><MapPin size={15} aria-hidden="true" /><span>العنوان</span></dt>
                <dd dir="auto">{hospitalAddr}</dd>
              </div>
            )}
            {hospitalPhone && (
              <div className="dpg-field">
                <dt><Phone size={15} aria-hidden="true" /><span>هاتف للاستفسار</span></dt>
                <dd dir="ltr">{hospitalPhone}</dd>
              </div>
            )}
            <div className="dpg-field">
              <dt><Hash size={15} aria-hidden="true" /><span>الحالة</span></dt>
              <dd>{statusLabel}</dd>
            </div>
            {priorityLabel && (
              <div className="dpg-field">
                <dt><Hash size={15} aria-hidden="true" /><span>الأولوية</span></dt>
                <dd>{priorityLabel}</dd>
              </div>
            )}
            {bookingMethodLabel && (
              <div className="dpg-field">
                <dt><Bookmark size={15} aria-hidden="true" /><span>طريقة الحجز</span></dt>
                <dd>{bookingMethodLabel}</dd>
              </div>
            )}
          </dl>
        </section>

        {/* Reason for visit */}
        <section className="dpg-card">
          <h2 className="dpg-card-title">
            <ClipboardList size={18} aria-hidden="true" />
            <span>سبب الزيارة</span>
          </h2>
          <p className="dpg-card-text" dir="auto">{orDash(appointment.reasonForVisit)}</p>
        </section>

        {/* Notes */}
        {appointment.notes && (
          <section className="dpg-card">
            <h2 className="dpg-card-title">
              <FileText size={18} aria-hidden="true" />
              <span>ملاحظات إضافية</span>
            </h2>
            <p className="dpg-card-text" dir="auto">{appointment.notes}</p>
          </section>
        )}

        {/* Cancellation details */}
        {appointment.status === 'cancelled' && (cancellationReasonLabel || appointment.cancelledAt) && (
          <section className="dpg-card">
            <h2 className="dpg-card-title">
              <X size={18} aria-hidden="true" />
              <span>تفاصيل الإلغاء</span>
            </h2>
            <dl className="dpg-fields">
              {cancellationReasonLabel && (
                <div className="dpg-field">
                  <dt><Info size={15} aria-hidden="true" /><span>السبب</span></dt>
                  <dd>{cancellationReasonLabel}</dd>
                </div>
              )}
              {appointment.cancelledAt && (
                <div className="dpg-field">
                  <dt><Calendar size={15} aria-hidden="true" /><span>تاريخ الإلغاء</span></dt>
                  <dd dir="ltr">{formatDateTime(appointment.cancelledAt)}</dd>
                </div>
              )}
            </dl>
          </section>
        )}

        {/* Payment */}
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

      {/* Cancel modal */}
      {cancelModalOpen && (
        <div className="dpg-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="dpg-cancel-title">
          <div className="dpg-modal">
            <header className="dpg-modal-head">
              <h2 id="dpg-cancel-title" className="dpg-modal-title">
                <AlertTriangle size={20} aria-hidden="true" />
                <span>إلغاء الموعد</span>
              </h2>
              <button type="button" className="dpg-modal-close" onClick={closeCancelModal} aria-label="إغلاق">
                <X size={18} aria-hidden="true" />
              </button>
            </header>

            <div className="dpg-modal-body">
              <p className="dpg-modal-lead">
                هل أنت متأكد من إلغاء هذا الموعد؟ هذا الإجراء لا يمكن التراجع عنه.
              </p>

              <fieldset className="dpg-modal-fieldset">
                <legend>سبب الإلغاء</legend>
                <div className="dpg-modal-radios">
                  {CANCELLATION_REASONS.map((r) => (
                    <label key={r.value} className="dpg-modal-radio">
                      <input
                        type="radio"
                        name="cancel-reason"
                        value={r.value}
                        checked={cancelReason === r.value}
                        onChange={(e) => setCancelReason(e.target.value)}
                      />
                      <span>{r.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="dpg-modal-textarea-label">
                <span>ملاحظات إضافية <small>(اختياري)</small></span>
                <textarea
                  value={cancelNotes}
                  onChange={(e) => setCancelNotes(e.target.value)}
                  placeholder="مثلاً: السفر، تغير الظروف..."
                  rows={3}
                  dir="auto"
                />
              </label>
            </div>

            <footer className="dpg-modal-foot">
              <button
                type="button"
                className="pd-btn pd-btn--ghost"
                onClick={closeCancelModal}
                disabled={cancelling}
              >
                تراجع
              </button>
              <button
                type="button"
                className="pd-btn pd-btn--danger"
                onClick={handleConfirmCancel}
                disabled={cancelling}
              >
                {cancelling ? 'جاري الإلغاء...' : 'تأكيد الإلغاء'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Feedback toast/modal */}
      {feedbackOpen && (
        <div className="dpg-modal-overlay" role="alertdialog" aria-modal="true">
          <div className={`dpg-feedback dpg-feedback--${feedbackKind}`}>
            <div className="dpg-feedback-icon" aria-hidden="true">
              {feedbackKind === 'success'
                ? <CheckCircle2 size={32} />
                : <AlertTriangle size={32} />}
            </div>
            <p>{feedbackMessage}</p>
            <button
              type="button"
              className="pd-btn pd-btn--primary"
              onClick={() => setFeedbackOpen(false)}
            >
              حسناً
            </button>
          </div>
        </div>
      )}
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
