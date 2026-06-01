/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  WeeklyScheduleEditor — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Reusable Calendly-style weekly schedule editor.
 *
 *  Used in THREE places:
 *    1. SignUp.jsx (mode='signup')      — initial schedule at registration
 *    2. DoctorDashboard.jsx (mode='edit')— view & update existing template
 *    3. DoctorDashboard.jsx (mode='add') — quick-add additional periods
 *
 *  Design system: Teal Medica (CSS variables --tm-*)
 *  Direction    : RTL (Arabic primary)
 *  Typography   : Cairo (Arabic) + Inter (numbers)
 *
 *  ─────────────────────────────────────────────────────────────────────
 *  PROPS
 *  ─────────────────────────────────────────────────────────────────────
 *    value          {Object}    — current schedule template (controlled)
 *    onChange       {Function}  — emits the next template object
 *    mode           {String}    — 'signup' | 'edit' | 'add'
 *    errors         {Object}    — optional validation errors keyed by path
 *    disabled       {Boolean}   — read-only display
 *    showSettings   {Boolean}   — slotDuration / buffer / window controls
 *    showPresets    {Boolean}   — quick-fill preset buttons
 *    showSummary    {Boolean}   — live summary card (hours, slots)
 *    showHeader     {Boolean}   — title block at the top of the editor
 *
 *  ─────────────────────────────────────────────────────────────────────
 *  TEMPLATE SHAPE (matches the backend Mongoose sub-schema)
 *  ─────────────────────────────────────────────────────────────────────
 *    {
 *      weeklyPattern: {
 *        Sunday:    [{ startTime: "08:00", endTime: "16:00" }],
 *        Monday:    [{ startTime: "08:00", endTime: "12:00" },
 *                    { startTime: "14:00", endTime: "18:00" }],
 *        ...
 *      },
 *      slotDuration:       20,
 *      bufferTime:          0,
 *      bookingWindowDays:  30,
 *      exceptions:         [],
 *      isActive:         true
 *    }
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useCallback, useMemo } from 'react';
import {
  Clock,
  Plus,
  Trash2,
  AlertCircle,
  CalendarDays,
  Sparkles,
  Timer,
  Hourglass,
  CalendarRange,
  Layers,
  CheckCircle2,
} from 'lucide-react';

import './WeeklyScheduleEditor.css';

/* ══════════════════════════════════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════════════════════════════════ */

const DAYS = [
  { id: 'Sunday',    nameAr: 'الأحد',     short: 'أحد' },
  { id: 'Monday',    nameAr: 'الإثنين',   short: 'إثنين' },
  { id: 'Tuesday',   nameAr: 'الثلاثاء',  short: 'ثلاثاء' },
  { id: 'Wednesday', nameAr: 'الأربعاء',  short: 'أربعاء' },
  { id: 'Thursday',  nameAr: 'الخميس',    short: 'خميس' },
  { id: 'Friday',    nameAr: 'الجمعة',    short: 'جمعة' },
  { id: 'Saturday',  nameAr: 'السبت',     short: 'سبت' },
];

const SLOT_DURATION_MIN = 5;
const SLOT_DURATION_MAX = 240;
const BUFFER_TIME_MIN = 0;
const BUFFER_TIME_MAX = 60;
const BOOKING_WINDOW_MIN = 1;
const BOOKING_WINDOW_MAX = 90;

const DEFAULT_PERIOD_START = '08:00';
const DEFAULT_PERIOD_END = '17:00';

/* ══════════════════════════════════════════════════════════════════════
   PRESETS — quick-fill schedule patterns
   ══════════════════════════════════════════════════════════════════════ */

const PRESETS = [
  {
    id: 'workweek',
    nameAr: 'أيام العمل الكاملة',
    descAr: 'الأحد - الخميس · 8 صباحاً - 5 مساءً',
    Icon: CalendarRange,
    apply: () => ({
      Sunday:    [{ startTime: '08:00', endTime: '17:00' }],
      Monday:    [{ startTime: '08:00', endTime: '17:00' }],
      Tuesday:   [{ startTime: '08:00', endTime: '17:00' }],
      Wednesday: [{ startTime: '08:00', endTime: '17:00' }],
      Thursday:  [{ startTime: '08:00', endTime: '17:00' }],
      Friday:    [],
      Saturday:  [],
    }),
  },
  {
    id: 'halfday',
    nameAr: 'نصف يوم',
    descAr: 'الأحد - الخميس · 8 صباحاً - 12 ظهراً',
    Icon: Timer,
    apply: () => ({
      Sunday:    [{ startTime: '08:00', endTime: '12:00' }],
      Monday:    [{ startTime: '08:00', endTime: '12:00' }],
      Tuesday:   [{ startTime: '08:00', endTime: '12:00' }],
      Wednesday: [{ startTime: '08:00', endTime: '12:00' }],
      Thursday:  [{ startTime: '08:00', endTime: '12:00' }],
      Friday:    [],
      Saturday:  [],
    }),
  },
  {
    id: 'split',
    nameAr: 'دوامين (صباح ومساء)',
    descAr: 'صباحاً 8-12 ومساءً 4-8',
    Icon: Layers,
    apply: () => ({
      Sunday:    [{ startTime: '08:00', endTime: '12:00' }, { startTime: '16:00', endTime: '20:00' }],
      Monday:    [{ startTime: '08:00', endTime: '12:00' }, { startTime: '16:00', endTime: '20:00' }],
      Tuesday:   [{ startTime: '08:00', endTime: '12:00' }, { startTime: '16:00', endTime: '20:00' }],
      Wednesday: [{ startTime: '08:00', endTime: '12:00' }, { startTime: '16:00', endTime: '20:00' }],
      Thursday:  [{ startTime: '08:00', endTime: '12:00' }, { startTime: '16:00', endTime: '20:00' }],
      Friday:    [],
      Saturday:  [],
    }),
  },
  {
    id: 'sixdays',
    nameAr: 'ستة أيام بالأسبوع',
    descAr: 'الأحد - الخميس + السبت · 9 - 5',
    Icon: CalendarDays,
    apply: () => ({
      Sunday:    [{ startTime: '09:00', endTime: '17:00' }],
      Monday:    [{ startTime: '09:00', endTime: '17:00' }],
      Tuesday:   [{ startTime: '09:00', endTime: '17:00' }],
      Wednesday: [{ startTime: '09:00', endTime: '17:00' }],
      Thursday:  [{ startTime: '09:00', endTime: '17:00' }],
      Friday:    [],
      Saturday:  [{ startTime: '10:00', endTime: '14:00' }],
    }),
  },
];

/* ══════════════════════════════════════════════════════════════════════
   FACTORIES & HELPERS
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Build a fresh empty template — call this when initializing state in
 * the parent component.
 */
export const createDefaultScheduleTemplate = () => ({
  weeklyPattern: {
    Sunday: [], Monday: [], Tuesday: [], Wednesday: [],
    Thursday: [], Friday: [], Saturday: [],
  },
  slotDuration: 20,
  bufferTime: 0,
  bookingWindowDays: 30,
  exceptions: [],
  isActive: true,
});

/**
 * Convert an "HH:MM" string to minutes since midnight. Returns null for
 * invalid input so the caller can decide how to handle it.
 */
const hhmmToMinutes = (hhmm) => {
  if (typeof hhmm !== 'string') return null;
  const match = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return (h * 60) + m;
};

/**
 * Format an integer minute count as a human-friendly "Xs ساعة Yد"
 * label for the summary card.
 */
const formatHours = (totalMinutes) => {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} دقيقة`;
  if (m === 0) return `${h} ساعة`;
  return `${h} ساعة ${m} دقيقة`;
};

/**
 * Detect whether two periods on the same day overlap.
 * Periods are stored as [start, end). End === start is allowed (back-to-back).
 */
const periodsOverlap = (a, b) => {
  const aStart = hhmmToMinutes(a.startTime);
  const aEnd = hhmmToMinutes(a.endTime);
  const bStart = hhmmToMinutes(b.startTime);
  const bEnd = hhmmToMinutes(b.endTime);
  if (aStart === null || aEnd === null || bStart === null || bEnd === null) {
    return false;
  }
  return aStart < bEnd && bStart < aEnd;
};

/**
 * For one day's array of periods, returns a Set of indices that overlap
 * with at least one other period. Used to highlight conflicting rows.
 */
const findOverlappingIndices = (periods) => {
  const conflicting = new Set();
  for (let i = 0; i < periods.length; i += 1) {
    for (let j = i + 1; j < periods.length; j += 1) {
      if (periodsOverlap(periods[i], periods[j])) {
        conflicting.add(i);
        conflicting.add(j);
      }
    }
  }
  return conflicting;
};

/**
 * Sum of all working minutes across the whole weekly pattern.
 */
const calculateWeeklyMinutes = (weeklyPattern) => {
  if (!weeklyPattern) return 0;
  let total = 0;
  DAYS.forEach((d) => {
    const periods = weeklyPattern[d.id] || [];
    periods.forEach((p) => {
      const s = hhmmToMinutes(p.startTime);
      const e = hhmmToMinutes(p.endTime);
      if (s !== null && e !== null && e > s) {
        total += (e - s);
      }
    });
  });
  return total;
};

/**
 * Estimate total weekly slot count given the template's slot duration
 * and buffer time. Each period contributes floor(periodDur / step) slots.
 */
const calculateWeeklySlots = (template) => {
  if (!template || !template.weeklyPattern) return 0;
  const slotDuration = template.slotDuration || 20;
  const bufferTime = template.bufferTime || 0;
  const step = slotDuration + bufferTime;
  if (step <= 0) return 0;

  let total = 0;
  DAYS.forEach((d) => {
    const periods = template.weeklyPattern[d.id] || [];
    periods.forEach((p) => {
      const s = hhmmToMinutes(p.startTime);
      const e = hhmmToMinutes(p.endTime);
      if (s !== null && e !== null && e > s) {
        const minutes = e - s;
        if (minutes >= slotDuration) {
          total += Math.floor((minutes - slotDuration) / step) + 1;
        }
      }
    });
  });
  return total;
};

/**
 * Count days that have at least one period.
 */
const countWorkingDays = (weeklyPattern) => {
  if (!weeklyPattern) return 0;
  return DAYS.filter((d) => {
    const periods = weeklyPattern[d.id] || [];
    return periods.length > 0;
  }).length;
};

/* ══════════════════════════════════════════════════════════════════════
   SUB-COMPONENT: PeriodRow
   ══════════════════════════════════════════════════════════════════════ */

const PeriodRow = ({
  period,
  isConflict,
  isInvalid,
  onChangeStart,
  onChangeEnd,
  onRemove,
  disabled,
}) => {
  const startMin = hhmmToMinutes(period.startTime);
  const endMin = hhmmToMinutes(period.endTime);
  const isReversed = startMin !== null && endMin !== null && endMin <= startMin;
  const hasError = isConflict || isInvalid || isReversed;

  return (
    <div className={`wse-period ${hasError ? 'wse-period--error' : ''}`}>
      <div className="wse-period-icon" aria-hidden="true">
        <Clock size={16} strokeWidth={2.2} />
      </div>

      <div className="wse-period-fields">
        <div className="wse-period-field">
          <label className="wse-period-label">من</label>
          <input
            type="time"
            className="wse-time-input"
            value={period.startTime || ''}
            onChange={(e) => onChangeStart(e.target.value)}
            disabled={disabled}
            aria-label="وقت البداية"
          />
        </div>

        <div className="wse-period-dash" aria-hidden="true">←</div>

        <div className="wse-period-field">
          <label className="wse-period-label">إلى</label>
          <input
            type="time"
            className="wse-time-input"
            value={period.endTime || ''}
            onChange={(e) => onChangeEnd(e.target.value)}
            disabled={disabled}
            aria-label="وقت النهاية"
          />
        </div>
      </div>

      {!disabled && (
        <button
          type="button"
          className="wse-period-remove"
          onClick={onRemove}
          aria-label="حذف الفترة"
          title="حذف الفترة"
        >
          <Trash2 size={15} strokeWidth={2.2} />
        </button>
      )}

      {hasError && (
        <div className="wse-period-error">
          <AlertCircle size={13} strokeWidth={2.4} />
          <span>
            {isReversed && 'وقت النهاية يجب أن يكون بعد البداية'}
            {!isReversed && isConflict && 'تتداخل هذه الفترة مع فترة أخرى'}
            {!isReversed && !isConflict && isInvalid && 'صيغة الوقت غير صحيحة'}
          </span>
        </div>
      )}
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════
   SUB-COMPONENT: DayRow
   ══════════════════════════════════════════════════════════════════════ */

const DayRow = ({
  day,
  periods,
  onToggle,
  onAddPeriod,
  onUpdatePeriod,
  onRemovePeriod,
  disabled,
}) => {
  const isEnabled = periods.length > 0;
  const conflictIndices = useMemo(() => findOverlappingIndices(periods), [periods]);

  // Day totals (for the right-side chip)
  const dayMinutes = useMemo(() => {
    let total = 0;
    periods.forEach((p) => {
      const s = hhmmToMinutes(p.startTime);
      const e = hhmmToMinutes(p.endTime);
      if (s !== null && e !== null && e > s) {
        total += (e - s);
      }
    });
    return total;
  }, [periods]);

  return (
    <div className={`wse-day ${isEnabled ? 'wse-day--enabled' : 'wse-day--disabled'}`}>
      {/* Day header */}
      <div className="wse-day-header">
        <button
          type="button"
          className={`wse-day-toggle ${isEnabled ? 'on' : 'off'}`}
          onClick={onToggle}
          disabled={disabled}
          aria-pressed={isEnabled}
          aria-label={isEnabled ? `إلغاء ${day.nameAr}` : `تفعيل ${day.nameAr}`}
        >
          <span className="wse-day-toggle-track">
            <span className="wse-day-toggle-knob" />
          </span>
        </button>

        <div className="wse-day-name-block">
          <div className="wse-day-name">{day.nameAr}</div>
          <div className="wse-day-status">
            {isEnabled ? 'يعمل في هذا اليوم' : 'لا يعمل'}
          </div>
        </div>

        <div className="wse-day-meta">
          {isEnabled && dayMinutes > 0 && (
            <span className="wse-day-hours-chip">
              <Hourglass size={12} strokeWidth={2.2} />
              {formatHours(dayMinutes)}
            </span>
          )}
        </div>
      </div>

      {/* Periods */}
      {isEnabled && (
        <div className="wse-day-periods">
          {periods.map((period, idx) => (
            <PeriodRow
              key={idx}
              period={period}
              isConflict={conflictIndices.has(idx)}
              isInvalid={!hhmmToMinutes(period.startTime) || !hhmmToMinutes(period.endTime)}
              onChangeStart={(v) => onUpdatePeriod(idx, 'startTime', v)}
              onChangeEnd={(v) => onUpdatePeriod(idx, 'endTime', v)}
              onRemove={() => onRemovePeriod(idx)}
              disabled={disabled}
            />
          ))}

          {!disabled && (
            <button
              type="button"
              className="wse-add-period-btn"
              onClick={onAddPeriod}
            >
              <Plus size={15} strokeWidth={2.3} />
              <span>إضافة فترة عمل أخرى</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════════ */

const WeeklyScheduleEditor = ({
  value,
  onChange,
  mode = 'edit',
  errors = {},
  disabled = false,
  showSettings = true,
  showPresets = true,
  showSummary = true,
  showHeader = true,
}) => {
  // Normalize incoming value — never trust the parent to send a complete shape
  const template = useMemo(() => {
    const base = createDefaultScheduleTemplate();
    if (!value) return base;
    return {
      ...base,
      ...value,
      weeklyPattern: { ...base.weeklyPattern, ...(value.weeklyPattern || {}) },
    };
  }, [value]);

  /* ──────────────────────────────────────────────────────────────────
     Immutable-update helpers
     ────────────────────────────────────────────────────────────────── */

  const emit = useCallback((next) => {
    if (onChange) onChange(next);
  }, [onChange]);

  const updateField = useCallback((field, val) => {
    emit({ ...template, [field]: val });
  }, [template, emit]);

  const updateWeeklyPattern = useCallback((dayId, periods) => {
    emit({
      ...template,
      weeklyPattern: {
        ...template.weeklyPattern,
        [dayId]: periods,
      },
    });
  }, [template, emit]);

  /* ──────────────────────────────────────────────────────────────────
     Day-level handlers
     ────────────────────────────────────────────────────────────────── */

  const toggleDay = useCallback((dayId) => {
    const current = template.weeklyPattern[dayId] || [];
    if (current.length === 0) {
      // Enable with one default period
      updateWeeklyPattern(dayId, [
        { startTime: DEFAULT_PERIOD_START, endTime: DEFAULT_PERIOD_END },
      ]);
    } else {
      // Disable — clear all periods for that day
      updateWeeklyPattern(dayId, []);
    }
  }, [template.weeklyPattern, updateWeeklyPattern]);

  const addPeriod = useCallback((dayId) => {
    const current = template.weeklyPattern[dayId] || [];
    // Sensible defaults: start at last period's end, run for the slot duration * a few
    const last = current[current.length - 1];
    let suggestedStart = DEFAULT_PERIOD_START;
    let suggestedEnd = DEFAULT_PERIOD_END;
    if (last) {
      const lastEndMin = hhmmToMinutes(last.endTime);
      if (lastEndMin !== null) {
        // Start 1 hour after the previous period ended, lasting 2 hours
        const newStartMin = Math.min(lastEndMin + 60, 22 * 60);
        const newEndMin = Math.min(newStartMin + 120, 23 * 60);
        suggestedStart = `${String(Math.floor(newStartMin / 60)).padStart(2, '0')}:${String(newStartMin % 60).padStart(2, '0')}`;
        suggestedEnd   = `${String(Math.floor(newEndMin / 60)).padStart(2, '0')}:${String(newEndMin % 60).padStart(2, '0')}`;
      }
    }
    updateWeeklyPattern(dayId, [
      ...current,
      { startTime: suggestedStart, endTime: suggestedEnd },
    ]);
  }, [template.weeklyPattern, updateWeeklyPattern]);

  const updatePeriod = useCallback((dayId, periodIdx, field, val) => {
    const current = [...(template.weeklyPattern[dayId] || [])];
    if (!current[periodIdx]) return;
    current[periodIdx] = { ...current[periodIdx], [field]: val };
    updateWeeklyPattern(dayId, current);
  }, [template.weeklyPattern, updateWeeklyPattern]);

  const removePeriod = useCallback((dayId, periodIdx) => {
    const current = [...(template.weeklyPattern[dayId] || [])];
    current.splice(periodIdx, 1);
    updateWeeklyPattern(dayId, current);
  }, [template.weeklyPattern, updateWeeklyPattern]);

  /* ──────────────────────────────────────────────────────────────────
     Preset handlers
     ────────────────────────────────────────────────────────────────── */

  const applyPreset = useCallback((preset) => {
    emit({
      ...template,
      weeklyPattern: preset.apply(),
    });
  }, [template, emit]);

  /* ──────────────────────────────────────────────────────────────────
     Summary calculations
     ────────────────────────────────────────────────────────────────── */

  const totalMinutes = useMemo(
    () => calculateWeeklyMinutes(template.weeklyPattern),
    [template.weeklyPattern],
  );
  const totalSlots = useMemo(
    () => calculateWeeklySlots(template),
    [template],
  );
  const workingDays = useMemo(
    () => countWorkingDays(template.weeklyPattern),
    [template.weeklyPattern],
  );

  /* ──────────────────────────────────────────────────────────────────
     Render
     ────────────────────────────────────────────────────────────────── */

  return (
    <div className={`wse-root wse-mode-${mode} ${disabled ? 'wse-disabled' : ''}`}>

      {/* ═══ HEADER ═══ */}
      {showHeader && (
        <div className="wse-header">
          <div className="wse-header-icon">
            <CalendarDays size={22} strokeWidth={2} />
          </div>
          <div>
            <h3 className="wse-header-title">جدول العمل الأسبوعي</h3>
            <p className="wse-header-subtitle">
              {mode === 'signup'
                ? 'حدد أوقات عملك في كل يوم من أيام الأسبوع. سيتم إنشاء المواعيد المتاحة تلقائياً.'
                : 'عدّل أوقات عملك. أي تغيير سيتم تطبيقه على المواعيد المستقبلية المتاحة.'}
            </p>
          </div>
        </div>
      )}

      {/* ═══ SETTINGS ═══ */}
      {showSettings && (
        <div className="wse-settings">
          <div className="wse-settings-title">
            <Sparkles size={16} strokeWidth={2.2} />
            <span>إعدادات الجدول</span>
          </div>

          <div className="wse-settings-grid">
            <div className="wse-setting">
              <label className="wse-setting-label">
                <Timer size={14} strokeWidth={2.2} />
                <span>مدة الموعد</span>
              </label>
              <div className="wse-setting-input-wrap">
                <input
                  type="number"
                  className="wse-setting-input"
                  value={template.slotDuration}
                  min={SLOT_DURATION_MIN}
                  max={SLOT_DURATION_MAX}
                  onChange={(e) => updateField('slotDuration', parseInt(e.target.value, 10) || SLOT_DURATION_MIN)}
                  disabled={disabled}
                />
                <span className="wse-setting-suffix">دقيقة</span>
              </div>
              <span className="wse-setting-hint">{`من ${SLOT_DURATION_MIN} إلى ${SLOT_DURATION_MAX}`}</span>
            </div>

            <div className="wse-setting">
              <label className="wse-setting-label">
                <Hourglass size={14} strokeWidth={2.2} />
                <span>الفاصل الزمني</span>
              </label>
              <div className="wse-setting-input-wrap">
                <input
                  type="number"
                  className="wse-setting-input"
                  value={template.bufferTime}
                  min={BUFFER_TIME_MIN}
                  max={BUFFER_TIME_MAX}
                  onChange={(e) => updateField('bufferTime', parseInt(e.target.value, 10) || 0)}
                  disabled={disabled}
                />
                <span className="wse-setting-suffix">دقيقة</span>
              </div>
              <span className="wse-setting-hint">بين كل موعد والذي يليه</span>
            </div>

            <div className="wse-setting">
              <label className="wse-setting-label">
                <CalendarRange size={14} strokeWidth={2.2} />
                <span>نافذة الحجز</span>
              </label>
              <div className="wse-setting-input-wrap">
                <input
                  type="number"
                  className="wse-setting-input"
                  value={template.bookingWindowDays}
                  min={BOOKING_WINDOW_MIN}
                  max={BOOKING_WINDOW_MAX}
                  onChange={(e) => updateField('bookingWindowDays', parseInt(e.target.value, 10) || BOOKING_WINDOW_MIN)}
                  disabled={disabled}
                />
                <span className="wse-setting-suffix">يوم</span>
              </div>
              <span className="wse-setting-hint">كم يوماً قبل الموعد يمكن الحجز</span>
            </div>
          </div>
        </div>
      )}

      {/* ═══ PRESETS ═══ */}
      {showPresets && !disabled && (
        <div className="wse-presets">
          <div className="wse-presets-title">
            <Sparkles size={14} strokeWidth={2.2} />
            <span>قوالب جاهزة (اضغط لتطبيق فوري)</span>
          </div>
          <div className="wse-presets-grid">
            {PRESETS.map((preset) => {
              const { Icon } = preset;
              return (
                <button
                  key={preset.id}
                  type="button"
                  className="wse-preset-btn"
                  onClick={() => applyPreset(preset)}
                >
                  <div className="wse-preset-icon">
                    <Icon size={18} strokeWidth={2.2} />
                  </div>
                  <div className="wse-preset-text">
                    <div className="wse-preset-name">{preset.nameAr}</div>
                    <div className="wse-preset-desc">{preset.descAr}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ DAYS GRID ═══ */}
      <div className="wse-days">
        {DAYS.map((day) => (
          <DayRow
            key={day.id}
            day={day}
            periods={template.weeklyPattern[day.id] || []}
            onToggle={() => toggleDay(day.id)}
            onAddPeriod={() => addPeriod(day.id)}
            onUpdatePeriod={(idx, field, val) => updatePeriod(day.id, idx, field, val)}
            onRemovePeriod={(idx) => removePeriod(day.id, idx)}
            disabled={disabled}
          />
        ))}
      </div>

      {/* ═══ TOP-LEVEL ERROR ═══ */}
      {errors.weeklyPattern && (
        <div className="wse-top-error">
          <AlertCircle size={16} strokeWidth={2.4} />
          <span>{errors.weeklyPattern}</span>
        </div>
      )}

      {/* ═══ SUMMARY ═══ */}
      {showSummary && (
        <div className="wse-summary">
          <div className="wse-summary-header">
            <CheckCircle2 size={16} strokeWidth={2.2} />
            <span>ملخّص الجدول</span>
          </div>
          <div className="wse-summary-stats">
            <div className="wse-stat">
              <div className="wse-stat-value">{workingDays}</div>
              <div className="wse-stat-label">{workingDays === 1 ? 'يوم عمل' : 'أيام عمل'}</div>
            </div>
            <div className="wse-stat">
              <div className="wse-stat-value">{formatHours(totalMinutes)}</div>
              <div className="wse-stat-label">إجمالي ساعات الأسبوع</div>
            </div>
            <div className="wse-stat">
              <div className="wse-stat-value">{totalSlots}</div>
              <div className="wse-stat-label">موعد متاح بالأسبوع</div>
            </div>
            <div className="wse-stat">
              <div className="wse-stat-value">{Math.round(totalSlots * (template.bookingWindowDays / 7))}</div>
              <div className="wse-stat-label">
                موعد خلال {template.bookingWindowDays} يوم
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WeeklyScheduleEditor;
