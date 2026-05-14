// ============================================================================
// LAB DASHBOARD — Patient 360°
// ============================================================================
// Syrian National Medical Platform | Arab International University
// Design System : Teal Medica | Typography: Cairo (Arabic RTL) + Inter
// DB Reference  : patient360_db_final.js (lab_tests collection)
// CSS Namespace : lab-
//
// Sections:
//   1. Home               — KPIs, lab info, recent activity, quick actions
//   2. Sample Collection  ⭐ — search patient → view tests → collect sample
//                              (status: ordered → sample_collected)
//   3. Result Entry       ⭐ — list of tests with sample_collected → enter
//                              results + upload PDF → complete
//   4. History            — all lab tests, filterable by status
//   5. Notifications      — slide-in panel
//
// Safety & productivity features:
//   • Auto-flag abnormal values    — parses reference range, suggests flag
//   • Critical result confirm gate — modal warns before submitting critical
//   • Common test templates        — CBC, FBS, HbA1c, Lipid, LFT, KFT
//   • PDF preview before submit    — inline iframe preview using blob URL
// ============================================================================

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI, labAPI } from '../services/api';
import { useTheme } from '../context/ThemeProvider';
import '../styles/LabDashboard.css';

import {
  // Navigation
  LayoutDashboard, FlaskConical, ClipboardList, History, Bell, LogOut, Menu, X,
  // Section icons
  Search, Microscope, FileText, ShieldAlert, Beaker, TestTube,
  // Actions
  Plus, Check, CheckCircle2, XCircle, AlertTriangle, AlertCircle,
  Printer, RefreshCw, Eye, Trash2, Upload, Download,
  // Medical
  HeartPulse, Activity, Stethoscope, Droplet, Syringe,
  // Patient
  User, UserCircle, Calendar, Phone, MapPin,
  // Data
  Hash, Tag, Clock, Zap, Info, ListChecks, FileCheck, FileType,
  // Status
  CircleDot, CheckCheck, ScanLine, ChevronRight, Sparkles,
  // Lab specific
  Building2, Layers
} from 'lucide-react';

// ============================================================================
// CONSTANTS — aligned with patient360_db_final.js enums
// ============================================================================

const SIDEBAR_GROUPS = [
  {
    label: 'نظرة عامة',
    items: [
      { id: 'home', label: 'الرئيسية', icon: LayoutDashboard }
    ]
  },
  {
    label: 'سير العمل',
    items: [
      { id: 'collection', label: 'تسجيل العينات', icon: TestTube, priority: true },
      { id: 'results',    label: 'إدخال النتائج', icon: Microscope, priority: true }
    ]
  },
  {
    label: 'السجلات',
    items: [
      { id: 'history', label: 'سجل التحاليل', icon: History }
    ]
  },
  {
    label: 'الإعدادات',
    items: [
      { id: 'notifications', label: 'الإشعارات', icon: Bell, badgeKey: 'unreadCount' }
    ]
  }
];

// lab_tests.testCategory enum
const TEST_CATEGORIES = {
  blood:        { label: 'دم',          icon: Droplet },
  urine:        { label: 'بول',         icon: Beaker },
  stool:        { label: 'براز',        icon: TestTube },
  imaging:      { label: 'تصوير',       icon: Eye },
  microbiology: { label: 'أحياء دقيقة', icon: Microscope },
  molecular:    { label: 'جزيئي',       icon: Layers },
  biopsy:       { label: 'خزعة',        icon: FlaskConical },
  other:        { label: 'أخرى',        icon: ClipboardList }
};

// lab_tests.sampleType enum
const SAMPLE_TYPES = [
  { id: 'blood',   label: 'دم' },
  { id: 'urine',   label: 'بول' },
  { id: 'stool',   label: 'براز' },
  { id: 'tissue',  label: 'نسيج' },
  { id: 'swab',    label: 'مسحة' },
  { id: 'saliva',  label: 'لعاب' },
  { id: 'other',   label: 'أخرى' }
];

// lab_tests.priority enum
const PRIORITY_CONFIG = {
  routine: { label: 'روتيني', icon: CircleDot },
  urgent:  { label: 'عاجل',    icon: Zap },
  stat:    { label: 'طارئ',    icon: AlertTriangle }
};

// lab_tests.status enum
const STATUS_CONFIG = {
  ordered:          { label: 'مطلوب',         icon: FileText },
  scheduled:        { label: 'محجوز',          icon: Calendar },
  sample_collected: { label: 'تم أخذ العينة', icon: TestTube },
  in_progress:      { label: 'قيد التحليل',   icon: Microscope },
  completed:        { label: 'مكتمل',          icon: CheckCircle2 },
  cancelled:        { label: 'ملغي',           icon: XCircle },
  rejected:         { label: 'مرفوض',          icon: XCircle }
};

// ============================================================================
// COMMON LAB TEST TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────
// Six pre-filled templates for the most common Syrian lab orders. When the
// technician clicks a template button, the result entry table is populated
// with all sub-tests, units, and reference ranges in one click.
//
// Reference ranges follow international clinical laboratory standards
// (compatible with ISO 15189). Values may be adjusted per the laboratory's
// own validated ranges if needed.
// ============================================================================

const TEST_TEMPLATES = {
  CBC: {
    label: 'CBC تعداد دم كامل',
    icon: Droplet,
    rows: [
      { testCode: 'WBC',  testName: 'White Blood Cells',  unit: '×10³/µL', referenceRange: '4-10' },
      { testCode: 'RBC',  testName: 'Red Blood Cells',    unit: '×10⁶/µL', referenceRange: '4.5-5.9' },
      { testCode: 'HGB',  testName: 'Hemoglobin',         unit: 'g/dL',    referenceRange: '13.5-17.5' },
      { testCode: 'HCT',  testName: 'Hematocrit',         unit: '%',       referenceRange: '41-53' },
      { testCode: 'MCV',  testName: 'Mean Cell Volume',   unit: 'fL',      referenceRange: '80-100' },
      { testCode: 'MCH',  testName: 'Mean Cell Hgb',      unit: 'pg',      referenceRange: '27-33' },
      { testCode: 'MCHC', testName: 'Mean Cell Hgb Conc', unit: 'g/dL',    referenceRange: '32-36' },
      { testCode: 'PLT',  testName: 'Platelets',          unit: '×10³/µL', referenceRange: '150-450' }
    ]
  },
  FBS: {
    label: 'FBS سكر صائم',
    icon: Activity,
    rows: [
      { testCode: 'GLU', testName: 'Fasting Blood Glucose', unit: 'mg/dL', referenceRange: '70-100' }
    ]
  },
  HBA1C: {
    label: 'HbA1c السكر التراكمي',
    icon: TrendingUpIcon,
    rows: [
      { testCode: 'HBA1C', testName: 'Hemoglobin A1c', unit: '%', referenceRange: '4.0-5.6' }
    ]
  },
  LIPID: {
    label: 'Lipid الدهون',
    icon: HeartPulse,
    rows: [
      { testCode: 'TC',   testName: 'Total Cholesterol', unit: 'mg/dL', referenceRange: '0-200' },
      { testCode: 'HDL',  testName: 'HDL Cholesterol',   unit: 'mg/dL', referenceRange: '40-100' },
      { testCode: 'LDL',  testName: 'LDL Cholesterol',   unit: 'mg/dL', referenceRange: '0-100' },
      { testCode: 'TG',   testName: 'Triglycerides',     unit: 'mg/dL', referenceRange: '0-150' }
    ]
  },
  LFT: {
    label: 'LFT وظائف الكبد',
    icon: FlaskConical,
    rows: [
      { testCode: 'ALT',  testName: 'ALT (SGPT)',          unit: 'U/L',   referenceRange: '7-56' },
      { testCode: 'AST',  testName: 'AST (SGOT)',          unit: 'U/L',   referenceRange: '10-40' },
      { testCode: 'ALP',  testName: 'Alkaline Phosphatase',unit: 'U/L',   referenceRange: '44-147' },
      { testCode: 'TBIL', testName: 'Total Bilirubin',     unit: 'mg/dL', referenceRange: '0.1-1.2' },
      { testCode: 'DBIL', testName: 'Direct Bilirubin',    unit: 'mg/dL', referenceRange: '0-0.3' },
      { testCode: 'TP',   testName: 'Total Protein',       unit: 'g/dL',  referenceRange: '6.0-8.3' },
      { testCode: 'ALB',  testName: 'Albumin',             unit: 'g/dL',  referenceRange: '3.5-5.0' }
    ]
  },
  KFT: {
    label: 'KFT وظائف الكلى',
    icon: Beaker,
    rows: [
      { testCode: 'BUN',  testName: 'Blood Urea Nitrogen', unit: 'mg/dL',  referenceRange: '7-20' },
      { testCode: 'CREA', testName: 'Creatinine',          unit: 'mg/dL',  referenceRange: '0.7-1.3' },
      { testCode: 'UA',   testName: 'Uric Acid',           unit: 'mg/dL',  referenceRange: '3.4-7.0' },
      { testCode: 'NA',   testName: 'Sodium',              unit: 'mEq/L',  referenceRange: '135-145' },
      { testCode: 'K',    testName: 'Potassium',           unit: 'mEq/L',  referenceRange: '3.5-5.0' }
    ]
  }
};

// Replace the placeholder with the real lucide icon (TrendingUp). We can't
// import-rename in the middle of a list above so we patch it here.
function TrendingUpIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
      <polyline points="16 7 22 7 22 13"/>
    </svg>
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const formatDate = (d) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return '—'; }
};

const formatDateTime = (d) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('ar-EG', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch { return '—'; }
};

const formatNumber = (n) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '0';
  return new Intl.NumberFormat('en-US').format(n);
};

const getTimeGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'صباح الخير';
  if (h < 17) return 'طاب يومك';
  return 'مساء الخير';
};

const timeAgo = (date) => {
  if (!date) return '—';
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `قبل ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `قبل ${days} يوم`;
  return formatDate(date);
};

/**
 * Parse a reference range string into { min, max } numeric bounds.
 * Supports common formats:
 *   "70-100"      → { min: 70, max: 100 }
 *   "70 - 100"    → { min: 70, max: 100 }
 *   "<200"        → { min: -Infinity, max: 200 }
 *   ">40"         → { min: 40, max: Infinity }
 *   "≤200"        → { min: -Infinity, max: 200 }
 *   "≥40"         → { min: 40, max: Infinity }
 * Returns null for unparseable formats.
 */
const parseReferenceRange = (range) => {
  if (!range || typeof range !== 'string') return null;
  const trimmed = range.trim();

  // "min-max" or "min–max" formats
  const dashMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*[-–—]\s*(-?\d+(?:\.\d+)?)$/);
  if (dashMatch) {
    return { min: parseFloat(dashMatch[1]), max: parseFloat(dashMatch[2]) };
  }
  // "<N" or "≤N"
  const ltMatch = trimmed.match(/^[<≤]\s*(-?\d+(?:\.\d+)?)$/);
  if (ltMatch) {
    return { min: -Infinity, max: parseFloat(ltMatch[1]) };
  }
  // ">N" or "≥N"
  const gtMatch = trimmed.match(/^[>≥]\s*(-?\d+(?:\.\d+)?)$/);
  if (gtMatch) {
    return { min: parseFloat(gtMatch[1]), max: Infinity };
  }
  return null;
};

/**
 * Auto-flag a numeric result against its reference range.
 *
 * Returns:
 *   { isAbnormal: boolean, isCritical: boolean }
 *
 * Logic:
 *   - If value is within range: not abnormal, not critical
 *   - If value is outside range: abnormal
 *   - If value is more than 50% beyond the bounds: critical
 *     (e.g. range 70-100, value > 115 or < 55 = abnormal,
 *      value > 130 or < 40 = critical)
 *
 * Handles open-ended ranges (e.g. "<200", ">40") by considering anything
 * beyond the bound as abnormal but only critical if 25% beyond the bound.
 */
const autoFlagAbnormal = (numericValue, referenceRange) => {
  const num = parseFloat(numericValue);
  if (Number.isNaN(num)) return { isAbnormal: false, isCritical: false };

  const range = parseReferenceRange(referenceRange);
  if (!range) return { isAbnormal: false, isCritical: false };

  const { min, max } = range;
  const inRange = num >= min && num <= max;
  if (inRange) return { isAbnormal: false, isCritical: false };

  // Calculate critical thresholds
  let criticalLow, criticalHigh;
  if (min === -Infinity) {
    // "<200" style: critical if 25% over the max
    criticalLow = -Infinity;
    criticalHigh = max + (max * 0.25);
  } else if (max === Infinity) {
    // ">40" style: critical if 25% under the min
    criticalLow = min - (min * 0.25);
    criticalHigh = Infinity;
  } else {
    // Standard "min-max": critical if 50% of span beyond either bound
    const span = max - min;
    const halfSpan = span * 0.5;
    criticalLow = min - halfSpan;
    criticalHigh = max + halfSpan;
  }

  const isCritical = num < criticalLow || num > criticalHigh;
  return { isAbnormal: true, isCritical };
};

// ============================================================================
// MODAL COMPONENT (with body scroll lock + ESC + click-outside)
// ============================================================================

const Modal = ({ isOpen, onClose, children, size = 'sm' }) => {
  useEffect(() => {
    if (!isOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleEsc = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="lab-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className={`lab-modal ${size}`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const LabDashboard = () => {
  const navigate = useNavigate();
  useTheme(); // consumes theme context so the provider wraps this page

  // ── Identity ────────────────────────────────────────────────────
  const [user, setUser] = useState(null);
  const [laboratory, setLaboratory] = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Navigation ──────────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationsPanelOpen, setNotificationsPanelOpen] = useState(false);

  // ── Home KPIs ───────────────────────────────────────────────────
  const [kpis, setKpis] = useState({
    samplesCollectedToday: 0,
    inProgress: 0,
    completedToday: 0,
    completedThisMonth: 0,
    pendingResults: 0,
    criticalAlerts: 0
  });
  const [recentActivity, setRecentActivity] = useState([]);

  // ── Sample Collection State ─────────────────────────────────────
  const [searchNationalId, setSearchNationalId] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [patient, setPatient] = useState(null);
  const [patientTests, setPatientTests] = useState([]);

  // Per-test sample collection forms (keyed by test._id)
  // sampleForms[testId] = { sampleId, sampleType, submitting }
  const [sampleForms, setSampleForms] = useState({});

  // ── Result Entry State ──────────────────────────────────────────
  const [readyTests, setReadyTests] = useState([]);
  const [readyTestsLoading, setReadyTestsLoading] = useState(false);
  const [activeTest, setActiveTest] = useState(null);
  const [testResults, setTestResults] = useState([]);
  const [newResultRow, setNewResultRow] = useState({
    testCode: '', testName: '', value: '', numericValue: '',
    unit: '', referenceRange: ''
  });
  const [labNotes, setLabNotes] = useState('');
  const [isCriticalOverall, setIsCriticalOverall] = useState(false);
  const [resultPdf, setResultPdf] = useState(null);
  const [resultPdfUrl, setResultPdfUrl] = useState(null); // object URL for preview
  const [submittingResults, setSubmittingResults] = useState(false);
  const pdfInputRef = useRef(null);

  // ── Critical confirmation gate ──────────────────────────────────
  const [criticalConfirmOpen, setCriticalConfirmOpen] = useState(false);

  // ── History ─────────────────────────────────────────────────────
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historySearch, setHistorySearch] = useState('');

  // ── Notifications ───────────────────────────────────────────────
  const [notifications, setNotifications] = useState([]);

  // ── Generic modal (alerts + confirmations) ──────────────────────
  const [modal, setModal] = useState({
    isOpen: false,
    variant: 'info',
    title: '',
    message: '',
    onConfirm: null,
    confirmLabel: 'حسناً',
    cancelLabel: 'إلغاء'
  });

  // ============================================================================
  // MODAL HELPERS (closeModal NEVER fires onConfirm — bug fixed)
  // ============================================================================

  const openAlert = useCallback((variant, title, message) => {
    setModal({
      isOpen: true, variant, title, message,
      onConfirm: null, confirmLabel: 'حسناً', cancelLabel: 'إلغاء'
    });
  }, []);

  const openConfirm = useCallback((variant, title, message, onConfirm, confirmLabel = 'تأكيد') => {
    setModal({
      isOpen: true, variant, title, message, onConfirm,
      confirmLabel, cancelLabel: 'إلغاء'
    });
  }, []);

  const closeModal = useCallback(() => {
    setModal(prev => ({ ...prev, isOpen: false, onConfirm: null }));
  }, []);

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const currentUser = authAPI.getCurrentUser();
      if (!currentUser) { navigate('/login'); return; }
      if (!currentUser.roles?.includes('lab_technician')) {
        openAlert('error', 'غير مصرح', 'هذه الصفحة متاحة لفنيي المختبر فقط');
        setTimeout(() => navigate('/login'), 1500);
        return;
      }
      setUser(currentUser);

      // Lazy load all sections in parallel — any failure is tolerated
      const results = await Promise.allSettled([
        labAPI.getDashboardKPIs(),
        labAPI.getMyNotifications()
      ]);

      const [kpisResult, notifResult] = results;
      if (kpisResult.status === 'fulfilled' && kpisResult.value?.success) {
        setKpis(kpisResult.value.kpis || {});
        setRecentActivity(kpisResult.value.recentActivity || []);
        if (kpisResult.value.laboratory) setLaboratory(kpisResult.value.laboratory);
      }
      if (notifResult.status === 'fulfilled' && notifResult.value?.success) {
        setNotifications(notifResult.value.notifications || []);
      }

      setLoading(false);
    };
    init();
  }, [navigate, openAlert]);

  // Close mobile sidebar when section changes
  useEffect(() => {
    setSidebarOpen(false);
  }, [activeSection]);

  // Cleanup blob URL when PDF removed/changed/component unmounts
  useEffect(() => {
    return () => {
      if (resultPdfUrl) URL.revokeObjectURL(resultPdfUrl);
    };
  }, [resultPdfUrl]);

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  const unreadCount = useMemo(
    () => notifications.filter(n => n.status !== 'read').length,
    [notifications]
  );

  const hasCriticalResult = useMemo(
    () => testResults.some(r => r.isCritical),
    [testResults]
  );

  const filledResultsCount = useMemo(
    () => testResults.filter(r => r.value && String(r.value).trim()).length,
    [testResults]
  );

  const filteredHistory = useMemo(() => {
    let list = history;
    if (historyFilter !== 'all') {
      list = list.filter(h => h.status === historyFilter);
    }
    if (historySearch.trim()) {
      const q = historySearch.toLowerCase();
      list = list.filter(h =>
        h.testNumber?.toLowerCase().includes(q) ||
        h.patientName?.toLowerCase().includes(q) ||
        h.patientNationalId?.includes(q) ||
        h.sampleId?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [history, historyFilter, historySearch]);

  // ============================================================================
  // DATA LOADERS
  // ============================================================================

  const reloadKPIs = useCallback(async () => {
    try {
      const res = await labAPI.getDashboardKPIs();
      if (res?.success) {
        setKpis(res.kpis || {});
        setRecentActivity(res.recentActivity || []);
        if (res.laboratory) setLaboratory(res.laboratory);
      }
    } catch { /* silent */ }
  }, []);

  const loadReadyTests = useCallback(async () => {
    setReadyTestsLoading(true);
    try {
      const res = await labAPI.getReadyTests();
      if (res?.success) {
        setReadyTests(res.tests || []);
      }
    } catch (err) {
      openAlert('error', 'خطأ', err?.message || 'حدث خطأ في تحميل التحاليل');
    } finally {
      setReadyTestsLoading(false);
    }
  }, [openAlert]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await labAPI.getMyTests();
      if (res?.success) {
        setHistory(res.tests || []);
      }
    } catch (err) {
      openAlert('error', 'خطأ', err?.message || 'حدث خطأ في تحميل السجل');
    } finally {
      setHistoryLoading(false);
    }
  }, [openAlert]);

  // Auto-load when entering relevant sections
  useEffect(() => {
    if (!user) return;
    if (activeSection === 'results' && !activeTest) loadReadyTests();
    if (activeSection === 'history') loadHistory();
  }, [activeSection, user, activeTest, loadReadyTests, loadHistory]);

  // ============================================================================
  // SAMPLE COLLECTION HANDLERS
  // ============================================================================

  /** Search patient by national ID */
  const handleSearchPatient = useCallback(async () => {
    const clean = searchNationalId.trim();
    if (clean.length !== 11 || !/^\d{11}$/.test(clean)) {
      setSearchError('الرجاء إدخال رقم وطني صحيح مكون من 11 رقم');
      return;
    }
    setSearchLoading(true);
    setSearchError('');
    setPatient(null);
    setPatientTests([]);

    try {
      const res = await labAPI.searchPatientByNationalId(clean);
      if (res?.success) {
        setPatient(res.patient);
        setPatientTests(res.labTests || []);
        // Initialize a sample form for each test
        const forms = {};
        (res.labTests || []).forEach(t => {
          forms[t._id] = {
            sampleId: t.sampleId || '',
            sampleType: t.sampleType || 'blood',
            submitting: false
          };
        });
        setSampleForms(forms);
      } else {
        setSearchError(res?.message || 'لم يتم العثور على المريض');
      }
    } catch (err) {
      setSearchError(err?.message || 'حدث خطأ أثناء البحث');
    } finally {
      setSearchLoading(false);
    }
  }, [searchNationalId]);

  const handleSampleFormChange = useCallback((testId, field, value) => {
    setSampleForms(prev => ({
      ...prev,
      [testId]: { ...prev[testId], [field]: value }
    }));
  }, []);

  /** Submit sample collection for a specific test */
  const handleCollectSample = useCallback(async (test) => {
    const form = sampleForms[test._id];
    if (!form?.sampleId?.trim()) {
      openAlert('warning', 'حقل مطلوب', 'الرجاء إدخال رقم تعريف العينة (Barcode)');
      return;
    }
    if (!form.sampleType) {
      openAlert('warning', 'حقل مطلوب', 'الرجاء اختيار نوع العينة');
      return;
    }

    setSampleForms(prev => ({
      ...prev,
      [test._id]: { ...prev[test._id], submitting: true }
    }));

    try {
      const res = await labAPI.collectSample(test._id, {
        sampleId: form.sampleId.trim(),
        sampleType: form.sampleType
      });
      if (res?.success) {
        openAlert('success', 'تم تسجيل العينة', `تم تسجيل العينة رقم ${form.sampleId} بنجاح`);
        // Refresh the patient's tests
        handleSearchPatient();
        reloadKPIs();
      } else {
        openAlert('error', 'فشل', res?.message || 'حدث خطأ أثناء تسجيل العينة');
      }
    } catch (err) {
      openAlert('error', 'فشل', err?.message || 'حدث خطأ أثناء تسجيل العينة');
    } finally {
      setSampleForms(prev => ({
        ...prev,
        [test._id]: { ...prev[test._id], submitting: false }
      }));
    }
  }, [sampleForms, openAlert, handleSearchPatient, reloadKPIs]);

  // ============================================================================
  // RESULT ENTRY HANDLERS
  // ============================================================================

  /** Pick a test from the ready list and open the result entry form */
  const handleSelectTestForProcessing = useCallback(async (test) => {
    try {
      const res = await labAPI.startProcessing(test._id);
      if (res?.success) {
        setActiveTest({ ...test, status: 'in_progress' });
        // Pre-populate result rows from the testsOrdered array
        setTestResults((test.testsOrdered || []).map(t => ({
          testCode: t.testCode || '',
          testName: t.testName || '',
          value: '',
          numericValue: '',
          unit: '',
          referenceRange: '',
          isAbnormal: false,
          isCritical: false,
          autoFlagged: false
        })));
        setLabNotes('');
        setIsCriticalOverall(false);
        setResultPdf(null);
        if (resultPdfUrl) {
          URL.revokeObjectURL(resultPdfUrl);
          setResultPdfUrl(null);
        }
      }
    } catch (err) {
      openAlert('error', 'خطأ', err?.message || 'حدث خطأ في بدء التحليل');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAlert]);

  /**
   * Update a single result field. When numericValue or referenceRange changes,
   * automatically re-evaluate the abnormal/critical flags and apply them
   * unless the technician has manually overridden them.
   */
  const handleUpdateResult = useCallback((index, field, value) => {
    setTestResults(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };

      // Auto-flag logic
      if (field === 'numericValue' || field === 'referenceRange' || field === 'value') {
        const numStr = field === 'numericValue' ? value : next[index].numericValue;
        const rangeStr = field === 'referenceRange' ? value : next[index].referenceRange;
        const flags = autoFlagAbnormal(numStr, rangeStr);
        if (flags.isAbnormal || flags.isCritical) {
          next[index] = {
            ...next[index],
            isAbnormal: flags.isAbnormal,
            isCritical: flags.isCritical,
            autoFlagged: true
          };
        } else if (next[index].autoFlagged) {
          // Was auto-flagged but value is now normal — clear auto flags
          next[index] = {
            ...next[index],
            isAbnormal: false,
            isCritical: false,
            autoFlagged: false
          };
        }
      }
      return next;
    });
  }, []);

  /** Toggle a flag manually (overrides auto-flag) */
  const handleToggleFlag = useCallback((index, flag) => {
    setTestResults(prev => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        [flag]: !next[index][flag],
        autoFlagged: false
      };
      return next;
    });
  }, []);

  /** Add a custom result row */
  const handleAddResultRow = useCallback(() => {
    if (!newResultRow.testName.trim()) {
      openAlert('warning', 'حقل مطلوب', 'الرجاء إدخال اسم التحليل');
      return;
    }
    setTestResults(prev => [...prev, {
      ...newResultRow,
      isAbnormal: false,
      isCritical: false,
      autoFlagged: false
    }]);
    setNewResultRow({
      testCode: '', testName: '', value: '', numericValue: '',
      unit: '', referenceRange: ''
    });
  }, [newResultRow, openAlert]);

  /** Remove a result row */
  const handleRemoveResultRow = useCallback((index) => {
    setTestResults(prev => prev.filter((_, i) => i !== index));
  }, []);

  /** Apply a test template (CBC, FBS, HbA1c, Lipid, LFT, KFT) */
  const handleApplyTemplate = useCallback((templateKey) => {
    const template = TEST_TEMPLATES[templateKey];
    if (!template) return;
    const newRows = template.rows.map(row => ({
      ...row,
      value: '',
      numericValue: '',
      isAbnormal: false,
      isCritical: false,
      autoFlagged: false
    }));
    setTestResults(prev => [...prev, ...newRows]);
  }, []);

  /** Handle PDF file upload (with preview blob URL) */
  const handlePdfUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      openAlert('error', 'حجم كبير', 'حجم الملف يجب أن يكون أقل من 10 ميجابايت');
      return;
    }
    if (!file.type.includes('pdf')) {
      openAlert('error', 'صيغة غير مدعومة', 'يجب أن يكون الملف بصيغة PDF');
      return;
    }

    // Revoke any previous blob URL to prevent memory leak
    if (resultPdfUrl) URL.revokeObjectURL(resultPdfUrl);

    const blobUrl = URL.createObjectURL(file);
    setResultPdf(file);
    setResultPdfUrl(blobUrl);
  }, [resultPdfUrl, openAlert]);

  /** Remove the uploaded PDF */
  const handleRemovePdf = useCallback(() => {
    if (resultPdfUrl) URL.revokeObjectURL(resultPdfUrl);
    setResultPdf(null);
    setResultPdfUrl(null);
    if (pdfInputRef.current) pdfInputRef.current.value = '';
  }, [resultPdfUrl]);

  /** Begin submission flow — gates first */
  const handleSubmitResults = useCallback(() => {
    if (!activeTest) return;

    if (filledResultsCount === 0 && !resultPdf) {
      openAlert('warning', 'بيانات ناقصة', 'الرجاء إدخال نتيجة واحدة على الأقل أو رفع ملف PDF');
      return;
    }

    // Critical result confirmation gate
    if (isCriticalOverall || hasCriticalResult) {
      setCriticalConfirmOpen(true);
      return;
    }

    performSubmitResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTest, filledResultsCount, resultPdf, isCriticalOverall, hasCriticalResult, openAlert]);

  /** Actually send the results to the backend */
  const performSubmitResults = useCallback(async () => {
    setCriticalConfirmOpen(false);
    if (!activeTest) return;

    setSubmittingResults(true);

    try {
      // Filter only filled results — DB schema requires value to be non-empty
      const filledResults = testResults
        .filter(r => r.value && String(r.value).trim())
        .map(r => ({
          testCode: r.testCode || undefined,
          testName: r.testName,
          value: String(r.value).trim(),
          numericValue: r.numericValue !== '' && !Number.isNaN(parseFloat(r.numericValue))
            ? parseFloat(r.numericValue) : undefined,
          unit: r.unit || undefined,
          referenceRange: r.referenceRange || undefined,
          isAbnormal: !!r.isAbnormal,
          isCritical: !!r.isCritical
        }));

      const formData = new FormData();
      formData.append('testResults', JSON.stringify(filledResults));
      formData.append('labNotes', labNotes || '');
      formData.append('isCritical', String(isCriticalOverall || hasCriticalResult));
      if (resultPdf) formData.append('resultPdf', resultPdf);

      const res = await labAPI.submitResults(activeTest._id, formData);
      if (res?.success) {
        openAlert(
          'success',
          'تم إرسال النتائج',
          `تم إكمال التحليل ${activeTest.testNumber} بنجاح. النتائج متاحة الآن للطبيب والمريض.`
        );
        // Reset all result entry state
        setActiveTest(null);
        setTestResults([]);
        setLabNotes('');
        setIsCriticalOverall(false);
        if (resultPdfUrl) URL.revokeObjectURL(resultPdfUrl);
        setResultPdf(null);
        setResultPdfUrl(null);
        // Refresh
        loadReadyTests();
        reloadKPIs();
      } else {
        openAlert('error', 'فشل', res?.message || 'حدث خطأ أثناء إرسال النتائج');
      }
    } catch (err) {
      openAlert('error', 'فشل', err?.message || 'حدث خطأ أثناء إرسال النتائج');
    } finally {
      setSubmittingResults(false);
    }
  }, [
    activeTest, testResults, labNotes, isCriticalOverall, hasCriticalResult,
    resultPdf, resultPdfUrl, loadReadyTests, reloadKPIs, openAlert
  ]);

  /** Cancel the active test (back to ready list, no submit) */
  const handleCancelActiveTest = useCallback(() => {
    openConfirm(
      'warning',
      'إلغاء التحليل',
      'سيتم إلغاء جميع البيانات التي أدخلتها. هل أنت متأكد؟',
      () => {
        setActiveTest(null);
        setTestResults([]);
        setLabNotes('');
        setIsCriticalOverall(false);
        if (resultPdfUrl) URL.revokeObjectURL(resultPdfUrl);
        setResultPdf(null);
        setResultPdfUrl(null);
      },
      'نعم، إلغاء'
    );
  }, [openConfirm, resultPdfUrl]);

  // ============================================================================
  // NOTIFICATION + LOGOUT HANDLERS
  // ============================================================================

  const handleMarkNotificationRead = useCallback(async (id) => {
    try {
      await labAPI.markNotificationRead(id);
      setNotifications(prev => prev.map(n =>
        n._id === id ? { ...n, status: 'read' } : n
      ));
    } catch { /* silent */ }
  }, []);

  const handleLogout = useCallback(() => {
    openConfirm(
      'warning',
      'تسجيل الخروج',
      'هل أنت متأكد من رغبتك في تسجيل الخروج؟',
      () => {
        authAPI.logout();
        navigate('/login');
      },
      'تسجيل الخروج'
    );
  }, [navigate, openConfirm]);

  // ============================================================================
  // SIDEBAR ITEM RENDERER
  // ============================================================================

  const renderSidebarItem = (item) => {
    const Icon = item.icon;
    const isActive = activeSection === item.id;
    const badge = item.badgeKey === 'unreadCount' && unreadCount > 0 ? unreadCount : null;
    return (
      <button
        key={item.id}
        type="button"
        className={`lab-sidebar-item ${isActive ? 'active' : ''}`}
        onClick={() => setActiveSection(item.id)}
      >
        <Icon />
        <span className="lab-sb-label">{item.label}</span>
        {badge !== null && (
          <span className="lab-sidebar-badge lab-sidebar-badge-pulse">{badge}</span>
        )}
      </button>
    );
  };

  // ============================================================================
  // LOADING SCREEN
  // ============================================================================

  if (loading || !user) {
    return (
      <div className="lab-loading">
        <div className="lab-spinner" />
        <p>جاري تحميل لوحة المختبر...</p>
      </div>
    );
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="lab-page" dir="rtl" data-theme={undefined}>
      <div className="lab-shell">

        {/* ═══════════════════════════════════════════════════════
            SIDEBAR
            ═══════════════════════════════════════════════════════ */}
        {sidebarOpen && (
          <div className="lab-sidebar-backdrop open" onClick={() => setSidebarOpen(false)} />
        )}

        <aside className={`lab-sidebar ${sidebarOpen ? 'open' : ''}`}>
          <button className="lab-sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="إغلاق القائمة">
            <X />
          </button>

          <div className="lab-sidebar-brand">
            <div className="lab-sidebar-brand-logo">
              <FlaskConical />
            </div>
            <div className="lab-sidebar-brand-text">
              <h3>Patient 360°</h3>
              <p>لوحة المختبر</p>
            </div>
          </div>

          <div className="lab-sidebar-user">
            <div className="lab-sidebar-user-avatar">
              {(user.firstName?.[0] || '?') + (user.lastName?.[0] || '')}
            </div>
            <div className="lab-sidebar-user-info">
              <h4>{user.firstName} {user.lastName}</h4>
              <p>فني مختبر</p>
            </div>
          </div>

          {SIDEBAR_GROUPS.map((group) => (
            <div key={group.label} className="lab-sidebar-group">
              <div className="lab-sidebar-group-label">{group.label}</div>
              {group.items.map(renderSidebarItem)}
            </div>
          ))}

          <div className="lab-sidebar-divider" />
          <button type="button" className="lab-sidebar-item danger" onClick={handleLogout}>
            <LogOut />
            <span className="lab-sb-label">تسجيل الخروج</span>
          </button>
        </aside>

        {/* ═══════════════════════════════════════════════════════
            MAIN AREA
            ═══════════════════════════════════════════════════════ */}
        <main className="lab-main">

          {/* Page header (mobile menu + notifications + section title) */}
          <div className="lab-page-header">
            <div className="lab-page-header-left">
              <button
                type="button"
                className="lab-mobile-menu-btn"
                onClick={() => setSidebarOpen(true)}
                aria-label="فتح القائمة"
              >
                <Menu />
              </button>
              <div className="lab-section-icon">
                {(() => {
                  const current = SIDEBAR_GROUPS
                    .flatMap(g => g.items)
                    .find(i => i.id === activeSection);
                  const Icon = current?.icon || LayoutDashboard;
                  return <Icon />;
                })()}
              </div>
              <div className="lab-page-header-title">
                <h1>
                  {activeSection === 'home'          && 'الرئيسية'}
                  {activeSection === 'collection'    && 'تسجيل العينات'}
                  {activeSection === 'results'       && 'إدخال النتائج'}
                  {activeSection === 'history'       && 'سجل التحاليل'}
                  {activeSection === 'notifications' && 'الإشعارات'}
                </h1>
                <p>
                  {activeSection === 'home'          && 'نظرة عامة على عمل المختبر اليوم'}
                  {activeSection === 'collection'    && 'ابحث عن المريض وسجّل العينات'}
                  {activeSection === 'results'       && 'أدخل نتائج التحاليل وارفع التقارير'}
                  {activeSection === 'history'       && 'جميع التحاليل السابقة'}
                  {activeSection === 'notifications' && 'التنبيهات والإشعارات'}
                </p>
              </div>
            </div>

            <div className="lab-page-header-right">
              <button
                type="button"
                className="lab-btn icon-only"
                onClick={() => setNotificationsPanelOpen(true)}
                aria-label="الإشعارات"
              >
                <Bell />
                {unreadCount > 0 && <span className="lab-btn-dot" />}
              </button>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════
              SECTION 1: HOME
              ═══════════════════════════════════════════════════════ */}
          {activeSection === 'home' && (
            <>
              <div className="lab-hero">
                <div className="lab-hero-content">
                  <div className="lab-hero-top">
                    <div className="lab-hero-seal">
                      <Microscope />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="lab-hero-greeting">{getTimeGreeting()} 👋</p>
                      <h2 className="lab-hero-name">
                        {user.firstName} {user.lastName}
                      </h2>
                      <div className="lab-hero-meta">
                        {laboratory?.name && (
                          <span className="lab-hero-meta-item">
                            <Building2 /> {laboratory.arabicName || laboratory.name}
                          </span>
                        )}
                        {laboratory?.governorate && (
                          <span className="lab-hero-meta-item">
                            <MapPin /> {laboratory.governorate}{laboratory.city ? ` — ${laboratory.city}` : ''}
                          </span>
                        )}
                        <span className="lab-hero-meta-item">
                          <Calendar /> {formatDate(new Date())}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="lab-hero-action-btn"
                      onClick={() => setActiveSection('collection')}
                    >
                      <TestTube /> تسجيل عينة جديدة
                    </button>
                  </div>
                </div>
              </div>

              {/* KPI Tiles */}
              <div className="lab-kpi-grid">
                <div className="lab-kpi-tile accent-info">
                  <div className="lab-kpi-icon"><TestTube /></div>
                  <div className="lab-kpi-label">عينات اليوم</div>
                  <div className="lab-kpi-value">{formatNumber(kpis.samplesCollectedToday)}</div>
                  <div className="lab-kpi-sub">تم تسجيلها بواسطتك</div>
                </div>
                <div className="lab-kpi-tile">
                  <div className="lab-kpi-icon"><Microscope /></div>
                  <div className="lab-kpi-label">قيد التحليل</div>
                  <div className="lab-kpi-value">{formatNumber(kpis.inProgress)}</div>
                  <div className="lab-kpi-sub">تحاليل في مختبرك</div>
                </div>
                <div className="lab-kpi-tile accent-success">
                  <div className="lab-kpi-icon"><CheckCircle2 /></div>
                  <div className="lab-kpi-label">مكتملة اليوم</div>
                  <div className="lab-kpi-value">{formatNumber(kpis.completedToday)}</div>
                  <div className="lab-kpi-sub">
                    {kpis.completedThisMonth ? `${formatNumber(kpis.completedThisMonth)} هذا الشهر` : ''}
                  </div>
                </div>
                <div className="lab-kpi-tile accent-error">
                  <div className="lab-kpi-icon"><ShieldAlert /></div>
                  <div className="lab-kpi-label">نتائج حرجة</div>
                  <div className="lab-kpi-value">{formatNumber(kpis.criticalAlerts)}</div>
                  <div className="lab-kpi-sub">خلال آخر 24 ساعة</div>
                </div>
              </div>

              {/* Home split: activity + quick actions */}
              <div className="lab-home-split">
                <div className="lab-card">
                  <div className="lab-card-header">
                    <Activity className="lab-card-header-icon" />
                    <h2>النشاط الأخير</h2>
                    <div className="lab-card-header-right">
                      <button
                        type="button"
                        className="lab-btn ghost sm"
                        onClick={reloadKPIs}
                        aria-label="تحديث"
                      >
                        <RefreshCw /> تحديث
                      </button>
                    </div>
                  </div>
                  {recentActivity.length === 0 ? (
                    <div className="lab-empty">
                      <Activity />
                      <h3>لا يوجد نشاط حديث</h3>
                      <p>ستظهر هنا العينات والتحاليل المكتملة</p>
                    </div>
                  ) : (
                    <div className="lab-activity-list">
                      {recentActivity.slice(0, 8).map((item) => (
                        <div key={item._id} className="lab-activity-row">
                          <div className={`lab-activity-icon ${item.action === 'completed' ? 'completed' : ''} ${item.isCritical ? 'critical' : ''}`}>
                            {item.action === 'completed' && <CheckCheck />}
                            {item.action === 'sample_collected' && <TestTube />}
                            {item.action === 'in_progress' && <Microscope />}
                          </div>
                          <div className="lab-activity-info">
                            <p className="lab-activity-title">
                              {item.testNumber}
                              {item.isCritical && (
                                <span style={{ color: 'var(--tm-error)', fontSize: '0.76rem', fontWeight: 800 }}>
                                  حرج
                                </span>
                              )}
                            </p>
                            <p className="lab-activity-sub">
                              {item.patientName || ''}
                              {item.testNames && item.testNames.length > 0 && ` · ${item.testNames.join(', ')}`}
                            </p>
                          </div>
                          <span className="lab-activity-time">{timeAgo(item.timestamp)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="lab-card">
                  <div className="lab-card-header">
                    <Sparkles className="lab-card-header-icon" />
                    <h2>إجراءات سريعة</h2>
                  </div>
                  <div className="lab-quick-actions">
                    <button type="button" className="lab-quick-action" onClick={() => setActiveSection('collection')}>
                      <div className="lab-qa-icon"><TestTube /></div>
                      <div className="lab-qa-label">
                        <strong>تسجيل عينة جديدة</strong>
                        <span>ابحث عن المريض بالرقم الوطني</span>
                      </div>
                      <ChevronRight style={{ width: 18, height: 18, color: 'var(--tm-text-muted)' }} />
                    </button>
                    <button type="button" className="lab-quick-action" onClick={() => setActiveSection('results')}>
                      <div className="lab-qa-icon"><Microscope /></div>
                      <div className="lab-qa-label">
                        <strong>إدخال نتائج</strong>
                        <span>{formatNumber(kpis.pendingResults || 0)} عينة جاهزة للتحليل</span>
                      </div>
                      <ChevronRight style={{ width: 18, height: 18, color: 'var(--tm-text-muted)' }} />
                    </button>
                    <button type="button" className="lab-quick-action" onClick={() => setActiveSection('history')}>
                      <div className="lab-qa-icon"><History /></div>
                      <div className="lab-qa-label">
                        <strong>سجل التحاليل</strong>
                        <span>مراجعة التحاليل السابقة</span>
                      </div>
                      <ChevronRight style={{ width: 18, height: 18, color: 'var(--tm-text-muted)' }} />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════
              SECTION 2: SAMPLE COLLECTION
              ═══════════════════════════════════════════════════════ */}
          {activeSection === 'collection' && (
            <>
              <div className="lab-card">
                <div className="lab-card-header">
                  <Search className="lab-card-header-icon" />
                  <h2>البحث عن طلبات تحاليل بالرقم الوطني</h2>
                </div>
                <div className="lab-toolbar">
                  <div className="lab-search-wrap">
                    <Search className="lab-search-icon" />
                    <input
                      type="text"
                      dir="ltr"
                      className="lab-search-input"
                      placeholder="أدخل الرقم الوطني (11 رقم)..."
                      maxLength={11}
                      value={searchNationalId}
                      onChange={(e) => setSearchNationalId(e.target.value.replace(/\D/g, ''))}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchPatient()}
                    />
                  </div>
                  <button
                    type="button"
                    className="lab-btn primary"
                    onClick={handleSearchPatient}
                    disabled={searchLoading}
                  >
                    {searchLoading ? (<><span className="lab-btn-spinner" /> جاري البحث</>) : (<><Search /> بحث</>)}
                  </button>
                </div>
                {searchError && (
                  <div className="lab-alert error">
                    <AlertCircle />
                    <p>{searchError}</p>
                  </div>
                )}
              </div>

              {/* Patient Card */}
              {patient && (
                <div className="lab-card lab-patient-card">
                  <div className="lab-patient-header">
                    <div className="lab-patient-avatar">
                      <UserCircle />
                    </div>
                    <div className="lab-patient-info">
                      <h3>
                        {patient.firstName}
                        {patient.fatherName ? ` ${patient.fatherName} ` : ' '}
                        {patient.lastName}
                      </h3>
                      <div className="lab-patient-meta">
                        <span className="lab-patient-meta-item national-id">
                          <Hash /> {patient.nationalId}
                        </span>
                        {patient.dateOfBirth && (
                          <span className="lab-patient-meta-item">
                            <Calendar /> {formatDate(patient.dateOfBirth)}
                          </span>
                        )}
                        {patient.bloodType && (
                          <span className="lab-patient-meta-item">
                            <Droplet /> {patient.bloodType}
                          </span>
                        )}
                        {patient.gender && (
                          <span className="lab-patient-meta-item">
                            <User /> {patient.gender === 'male' ? 'ذكر' : 'أنثى'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {(patient.allergies?.length > 0 || patient.chronicDiseases?.length > 0) && (
                    <div className="lab-alert warning">
                      <AlertTriangle />
                      <p>
                        {patient.allergies?.length > 0 && (<><strong>الحساسية:</strong> {patient.allergies.join('، ')}<br /></>)}
                        {patient.chronicDiseases?.length > 0 && (<><strong>أمراض مزمنة:</strong> {patient.chronicDiseases.join('، ')}</>)}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Patient's tests */}
              {patient && patientTests.length > 0 && (
                <div className="lab-card">
                  <div className="lab-card-header">
                    <ListChecks className="lab-card-header-icon" />
                    <h2>طلبات التحاليل</h2>
                    <div className="lab-card-header-right">
                      <span className="lab-count-badge">{patientTests.length}</span>
                    </div>
                  </div>
                  <div className="lab-test-list">
                    {patientTests.map((test) => {
                      const statusInfo = STATUS_CONFIG[test.status] || STATUS_CONFIG.ordered;
                      const priorityInfo = PRIORITY_CONFIG[test.priority] || PRIORITY_CONFIG.routine;
                      const StatusIcon = statusInfo.icon;
                      const PriorityIcon = priorityInfo.icon;
                      const canCollect = test.status === 'ordered' || test.status === 'scheduled';
                      const alreadyCollected = test.status === 'sample_collected' || test.status === 'in_progress';
                      const CategoryIcon = TEST_CATEGORIES[test.testCategory]?.icon || ClipboardList;
                      const form = sampleForms[test._id] || {};

                      return (
                        <div
                          key={test._id}
                          className={`lab-test-card priority-${test.priority || 'routine'}`}
                        >
                          <div className="lab-test-top">
                            <div className="lab-test-id">
                              <span className="lab-test-number">{test.testNumber}</span>
                              <div className="lab-test-meta-row">
                                <span className="lab-test-meta-item">
                                  <Calendar /> {formatDate(test.orderDate)}
                                </span>
                                {test.orderedBy?.firstName && (
                                  <span className="lab-test-meta-item">
                                    <Stethoscope />
                                    د. {test.orderedBy.firstName} {test.orderedBy.lastName}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="lab-test-badges">
                              <span className={`lab-status-badge ${statusInfo.class || test.status}`}>
                                <StatusIcon /> {statusInfo.label}
                              </span>
                              <span className={`lab-priority-badge ${test.priority || 'routine'}`}>
                                <PriorityIcon /> {priorityInfo.label}
                              </span>
                            </div>
                          </div>

                          {test.testCategory && TEST_CATEGORIES[test.testCategory] && (
                            <div className="lab-category-row">
                              <CategoryIcon />
                              <span>{TEST_CATEGORIES[test.testCategory].label}</span>
                            </div>
                          )}

                          <div className="lab-tests-ordered">
                            <div className="lab-tests-label">
                              <ListChecks /> التحاليل المطلوبة:
                            </div>
                            <div className="lab-tests-chips">
                              {(test.testsOrdered || []).map((t, j) => (
                                <div key={j} className="lab-test-chip">
                                  {t.testCode && <span className="lab-test-chip-code">{t.testCode}</span>}
                                  <span className="lab-test-chip-name">{t.testName}</span>
                                  {t.notes && (
                                    <span className="lab-test-chip-note" title={t.notes}>
                                      <Info />
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>

                          {alreadyCollected && test.sampleId && (
                            <div className="lab-sample-info">
                              <CheckCircle2 />
                              تم أخذ العينة — الرقم: <strong>{test.sampleId}</strong>
                              {test.sampleCollectedAt && (
                                <span style={{ marginInlineStart: 8, opacity: 0.75 }}>
                                  ({timeAgo(test.sampleCollectedAt)})
                                </span>
                              )}
                            </div>
                          )}

                          {canCollect && (
                            <div className="lab-sample-section">
                              <div className="lab-sample-section-title">
                                <ScanLine /> تسجيل العينة
                              </div>
                              <div className="lab-sample-row">
                                <div className="lab-form-group">
                                  <label className="lab-form-label">
                                    <Hash /> رقم تعريف العينة (Barcode) <span className="required">*</span>
                                  </label>
                                  <input
                                    type="text"
                                    dir="ltr"
                                    className="lab-input"
                                    placeholder="Scan or type..."
                                    value={form.sampleId || ''}
                                    onChange={(e) => handleSampleFormChange(test._id, 'sampleId', e.target.value)}
                                  />
                                </div>
                                <div className="lab-form-group">
                                  <label className="lab-form-label">
                                    <Tag /> نوع العينة <span className="required">*</span>
                                  </label>
                                  <select
                                    className="lab-select"
                                    value={form.sampleType || 'blood'}
                                    onChange={(e) => handleSampleFormChange(test._id, 'sampleType', e.target.value)}
                                  >
                                    {SAMPLE_TYPES.map(st => (
                                      <option key={st.id} value={st.id}>{st.label}</option>
                                    ))}
                                  </select>
                                </div>
                                <button
                                  type="button"
                                  className="lab-btn success"
                                  onClick={() => handleCollectSample(test)}
                                  disabled={form.submitting}
                                >
                                  {form.submitting ? (
                                    <><span className="lab-btn-spinner" /> جاري الحفظ</>
                                  ) : (
                                    <><Check /> تسجيل العينة</>
                                  )}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {patient && patientTests.length === 0 && (
                <div className="lab-card">
                  <div className="lab-empty">
                    <ClipboardList />
                    <h3>لا توجد طلبات تحاليل لهذا المريض</h3>
                    <p>لا يوجد أي طلبات لهذا المريض في مختبرك حالياً</p>
                  </div>
                </div>
              )}

              {!patient && !searchError && (
                <div className="lab-card">
                  <div className="lab-empty">
                    <Search />
                    <h3>ابدأ بالبحث</h3>
                    <p>أدخل الرقم الوطني للمريض لعرض طلبات التحاليل الخاصة به</p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ═══════════════════════════════════════════════════════
              SECTION 3: RESULT ENTRY
              ═══════════════════════════════════════════════════════ */}
          {activeSection === 'results' && (
            <>
              {!activeTest ? (
                <>
                  <div className="lab-card">
                    <div className="lab-card-header">
                      <Microscope className="lab-card-header-icon" />
                      <h2>تحاليل جاهزة للمعالجة</h2>
                      <div className="lab-card-header-right">
                        <span className="lab-count-badge">{readyTests.length}</span>
                        <button
                          type="button"
                          className="lab-btn ghost sm"
                          onClick={loadReadyTests}
                        >
                          <RefreshCw /> تحديث
                        </button>
                      </div>
                    </div>
                    <div className="lab-alert info">
                      <Info />
                      <p>
                        هذه هي التحاليل التي تم أخذ عيناتها وجاهزة الآن لإدخال النتائج. اختر تحليلاً لبدء إدخال النتائج ورفع التقرير.
                      </p>
                    </div>

                    {readyTestsLoading ? (
                      <div className="lab-loading-inline">
                        <span className="lab-btn-spinner" /> جاري تحميل التحاليل...
                      </div>
                    ) : readyTests.length === 0 ? (
                      <div className="lab-empty">
                        <TestTube />
                        <h3>لا توجد تحاليل جاهزة</h3>
                        <p>لم يتم جمع أي عينات بعد. توجه إلى "تسجيل العينات" لبدء العمل.</p>
                      </div>
                    ) : (
                      <div className="lab-test-list">
                        {readyTests.map((test) => {
                          const priorityInfo = PRIORITY_CONFIG[test.priority] || PRIORITY_CONFIG.routine;
                          const PriorityIcon = priorityInfo.icon;
                          return (
                            <div
                              key={test._id}
                              className={`lab-ready-test-card priority-${test.priority || 'routine'}`}
                            >
                              <div className="lab-test-top">
                                <div className="lab-test-id">
                                  <span className="lab-test-number">{test.testNumber}</span>
                                  <div className="lab-test-meta-row">
                                    <span className="lab-test-meta-item">
                                      <Hash /> {test.sampleId}
                                    </span>
                                    {test.sampleCollectedAt && (
                                      <span className="lab-test-meta-item">
                                        <Clock /> {timeAgo(test.sampleCollectedAt)}
                                      </span>
                                    )}
                                    {test.orderedBy?.firstName && (
                                      <span className="lab-test-meta-item">
                                        <Stethoscope /> د. {test.orderedBy.firstName} {test.orderedBy.lastName}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="lab-test-badges">
                                  <span className={`lab-priority-badge ${test.priority || 'routine'}`}>
                                    <PriorityIcon /> {priorityInfo.label}
                                  </span>
                                </div>
                              </div>

                              {test.patientName && (
                                <div className="lab-ready-patient-row">
                                  <User />
                                  <span className="lab-ready-patient-name">{test.patientName}</span>
                                  {test.patientNationalId && (
                                    <span className="lab-ready-patient-id">{test.patientNationalId}</span>
                                  )}
                                </div>
                              )}

                              <div className="lab-tests-ordered">
                                <div className="lab-tests-label">
                                  <ListChecks /> التحاليل المطلوبة:
                                </div>
                                <div className="lab-tests-chips">
                                  {(test.testsOrdered || []).map((t, j) => (
                                    <div key={j} className="lab-test-chip">
                                      {t.testCode && <span className="lab-test-chip-code">{t.testCode}</span>}
                                      <span className="lab-test-chip-name">{t.testName}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <button
                                type="button"
                                className="lab-btn primary lab-process-action-btn full-width"
                                onClick={() => handleSelectTestForProcessing(test)}
                              >
                                <Microscope /> بدء إدخال النتائج
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* ── Active test: result entry form ───────────────────── */
                <div className="lab-card">
                  <div className="lab-card-header">
                    <FileCheck className="lab-card-header-icon" />
                    <h2>إدخال نتائج: {activeTest.testNumber}</h2>
                    <div className="lab-card-header-right">
                      <button
                        type="button"
                        className="lab-btn ghost sm"
                        onClick={handleCancelActiveTest}
                      >
                        <X /> إلغاء
                      </button>
                    </div>
                  </div>

                  {/* Templates bar */}
                  <div className="lab-templates-bar">
                    <div className="lab-templates-label">
                      <Sparkles /> قوالب جاهزة:
                    </div>
                    <div className="lab-templates-buttons">
                      {Object.entries(TEST_TEMPLATES).map(([key, tpl]) => {
                        const Icon = tpl.icon;
                        return (
                          <button
                            key={key}
                            type="button"
                            className="lab-template-btn"
                            onClick={() => handleApplyTemplate(key)}
                            title={`إضافة قالب ${tpl.label}`}
                          >
                            <Icon /> {tpl.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Results grid */}
                  <div className="lab-results-section">
                    <h3 className="lab-results-subheading">
                      <ClipboardList /> النتائج ({filledResultsCount}/{testResults.length})
                    </h3>

                    {testResults.length > 0 && (
                      <div className="lab-results-grid">
                        <div className="lab-results-grid-header">
                          <span>التحليل</span>
                          <span>الرمز</span>
                          <span>النتيجة</span>
                          <span>قيمة رقمية</span>
                          <span>الوحدة</span>
                          <span>المرجع</span>
                          <span>الحالة</span>
                        </div>
                        {testResults.map((r, i) => (
                          <div
                            key={i}
                            className={`lab-results-grid-row ${r.isCritical ? 'flagged-critical' : r.isAbnormal ? 'flagged-abnormal' : ''}`}
                          >
                            <input
                              type="text"
                              className="lab-result-input"
                              placeholder="اسم التحليل"
                              value={r.testName}
                              onChange={(e) => handleUpdateResult(i, 'testName', e.target.value)}
                            />
                            <input
                              type="text"
                              dir="ltr"
                              className="lab-result-input"
                              placeholder="Code"
                              value={r.testCode}
                              onChange={(e) => handleUpdateResult(i, 'testCode', e.target.value)}
                            />
                            <input
                              type="text"
                              dir="ltr"
                              className="lab-result-input"
                              placeholder="Value"
                              value={r.value}
                              onChange={(e) => handleUpdateResult(i, 'value', e.target.value)}
                            />
                            <input
                              type="number"
                              step="0.01"
                              dir="ltr"
                              className="lab-result-input"
                              placeholder="120"
                              value={r.numericValue}
                              onChange={(e) => handleUpdateResult(i, 'numericValue', e.target.value)}
                            />
                            <input
                              type="text"
                              dir="ltr"
                              className="lab-result-input"
                              placeholder="mg/dL"
                              value={r.unit}
                              onChange={(e) => handleUpdateResult(i, 'unit', e.target.value)}
                            />
                            <input
                              type="text"
                              dir="ltr"
                              className="lab-result-input"
                              placeholder="70-100"
                              value={r.referenceRange}
                              onChange={(e) => handleUpdateResult(i, 'referenceRange', e.target.value)}
                            />
                            <div className="lab-result-flags">
                              <button
                                type="button"
                                className={`lab-flag-btn ${r.isAbnormal && !r.isCritical ? 'active abnormal' : ''}`}
                                onClick={() => handleToggleFlag(i, 'isAbnormal')}
                                title="غير طبيعي"
                              >
                                <AlertTriangle />
                              </button>
                              <button
                                type="button"
                                className={`lab-flag-btn ${r.isCritical ? 'active critical' : ''}`}
                                onClick={() => handleToggleFlag(i, 'isCritical')}
                                title="حرج"
                              >
                                <ShieldAlert />
                              </button>
                              <button
                                type="button"
                                className="lab-flag-btn"
                                onClick={() => handleRemoveResultRow(i)}
                                title="حذف"
                              >
                                <Trash2 />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="lab-auto-flag-hint">
                      <Info />
                      <p>
                        <strong>تلقائي:</strong> عند إدخال القيمة الرقمية والمرجع، سيتم اكتشاف القيم غير الطبيعية وتلوين الصف تلقائياً. يمكنك تعديل الحالة يدوياً في أي وقت.
                      </p>
                    </div>

                    {/* Add custom row */}
                    <div className="lab-add-result-row">
                      <input
                        type="text"
                        className="lab-result-input"
                        placeholder="اسم تحليل مخصص..."
                        value={newResultRow.testName}
                        onChange={(e) => setNewResultRow({ ...newResultRow, testName: e.target.value })}
                      />
                      <input
                        type="text"
                        dir="ltr"
                        className="lab-result-input"
                        placeholder="Code"
                        value={newResultRow.testCode}
                        onChange={(e) => setNewResultRow({ ...newResultRow, testCode: e.target.value })}
                      />
                      <button
                        type="button"
                        className="lab-btn outline sm"
                        onClick={handleAddResultRow}
                      >
                        <Plus /> إضافة صف
                      </button>
                    </div>
                  </div>

                  {/* PDF upload */}
                  <div className="lab-pdf-section">
                    <h3>
                      <FileType /> رفع تقرير النتائج (PDF)
                    </h3>
                    {!resultPdf ? (
                      <label className="lab-pdf-upload-area">
                        <input
                          type="file"
                          accept="application/pdf,.pdf"
                          ref={pdfInputRef}
                          onChange={handlePdfUpload}
                          style={{ display: 'none' }}
                        />
                        <div className="lab-pdf-upload-icon">
                          <Upload />
                        </div>
                        <h4>اضغط لرفع ملف PDF</h4>
                        <p>تقرير نتائج التحاليل — حتى 10 ميجابايت</p>
                      </label>
                    ) : (
                      <div className="lab-pdf-preview-card">
                        <div className="lab-pdf-info-row">
                          <div className="lab-pdf-info-icon">
                            <FileText />
                          </div>
                          <div className="lab-pdf-info-text">
                            <div className="lab-pdf-info-name">{resultPdf.name}</div>
                            <div className="lab-pdf-info-size">
                              {(resultPdf.size / 1024 / 1024).toFixed(2)} MB
                            </div>
                          </div>
                          <div className="lab-pdf-actions">
                            <a
                              href={resultPdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="lab-btn ghost sm"
                            >
                              <Eye /> فتح
                            </a>
                            <button
                              type="button"
                              className="lab-btn danger sm"
                              onClick={handleRemovePdf}
                            >
                              <Trash2 /> إزالة
                            </button>
                          </div>
                        </div>
                        {resultPdfUrl && (
                          <div className="lab-pdf-iframe-wrap">
                            <iframe
                              className="lab-pdf-iframe"
                              src={resultPdfUrl}
                              title="معاينة PDF"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Lab notes */}
                  <div className="lab-form-group" style={{ marginBottom: 16 }}>
                    <label className="lab-form-label">
                      <FileText /> ملاحظات فني المختبر (اختياري)
                    </label>
                    <textarea
                      className="lab-textarea"
                      rows={3}
                      placeholder="أي ملاحظات إضافية حول التحليل أو العينة..."
                      value={labNotes}
                      onChange={(e) => setLabNotes(e.target.value)}
                    />
                  </div>

                  {/* Critical toggle */}
                  <div className="lab-critical-section">
                    <label className="lab-critical-toggle">
                      <input
                        type="checkbox"
                        checked={isCriticalOverall}
                        onChange={(e) => setIsCriticalOverall(e.target.checked)}
                      />
                      <div className="lab-critical-toggle-text">
                        <div className="lab-critical-toggle-title">
                          <ShieldAlert /> تصنيف النتيجة كحرجة
                        </div>
                        <div className="lab-critical-toggle-desc">
                          يتطلب متابعة فورية من الطبيب. سيتم إرسال تنبيه عاجل.
                        </div>
                      </div>
                    </label>
                  </div>

                  <button
                    type="button"
                    className="lab-btn success full-width"
                    onClick={handleSubmitResults}
                    disabled={submittingResults}
                  >
                    {submittingResults ? (
                      <><span className="lab-btn-spinner" /> جاري إرسال النتائج...</>
                    ) : (
                      <><CheckCircle2 /> إرسال النتائج وإكمال التحليل</>
                    )}
                  </button>

                  <div className="lab-alert info" style={{ marginTop: 14, marginBottom: 0 }}>
                    <Info />
                    <p>
                      بعد الإرسال، ستكون النتائج متاحة تلقائياً للطبيب المعالج والمريض عبر المنصة.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ═══════════════════════════════════════════════════════
              SECTION 4: HISTORY
              ═══════════════════════════════════════════════════════ */}
          {activeSection === 'history' && (
            <div className="lab-card">
              <div className="lab-card-header">
                <History className="lab-card-header-icon" />
                <h2>سجل التحاليل</h2>
                <div className="lab-card-header-right">
                  <span className="lab-count-badge">{history.length}</span>
                  <button
                    type="button"
                    className="lab-btn ghost sm"
                    onClick={loadHistory}
                  >
                    <RefreshCw /> تحديث
                  </button>
                </div>
              </div>

              <div className="lab-toolbar">
                <div className="lab-search-wrap">
                  <Search className="lab-search-icon" />
                  <input
                    type="text"
                    className="lab-search-input"
                    placeholder="ابحث برقم التحليل، اسم المريض، أو رقم العينة..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="lab-filter-chips" style={{ marginBottom: 18 }}>
                {[
                  { id: 'all',              label: 'الكل',           icon: Layers },
                  { id: 'completed',        label: 'مكتمل',          icon: CheckCircle2 },
                  { id: 'in_progress',      label: 'قيد التحليل',    icon: Microscope },
                  { id: 'sample_collected', label: 'عينات مجمعة',    icon: TestTube },
                  { id: 'ordered',          label: 'مطلوب',          icon: FileText }
                ].map(f => {
                  const Icon = f.icon;
                  const count = f.id === 'all'
                    ? history.length
                    : history.filter(h => h.status === f.id).length;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      className={`lab-filter-chip ${historyFilter === f.id ? 'active' : ''}`}
                      onClick={() => setHistoryFilter(f.id)}
                    >
                      <Icon /> {f.label}
                      <span className="lab-filter-chip-count">{count}</span>
                    </button>
                  );
                })}
              </div>

              {historyLoading ? (
                <div className="lab-loading-inline">
                  <span className="lab-btn-spinner" /> جاري تحميل السجل...
                </div>
              ) : filteredHistory.length === 0 ? (
                <div className="lab-empty">
                  <History />
                  <h3>لا توجد تحاليل</h3>
                  <p>{historySearch || historyFilter !== 'all' ? 'لا توجد نتائج مطابقة' : 'لم يتم تسجيل أي تحاليل بعد'}</p>
                </div>
              ) : (
                <div className="lab-history-list">
                  {filteredHistory.map((order) => {
                    const statusInfo = STATUS_CONFIG[order.status] || STATUS_CONFIG.ordered;
                    const StatusIcon = statusInfo.icon;
                    return (
                      <div
                        key={order._id}
                        className={`lab-history-card ${order.status} ${order.isCritical ? 'critical' : ''}`}
                      >
                        <div className="lab-history-top">
                          <div className="lab-history-top-left">
                            <span className="lab-history-number">{order.testNumber}</span>
                            <span className="lab-history-date">{formatDateTime(order.orderDate)}</span>
                          </div>
                          <span className={`lab-status-badge ${order.status}`}>
                            <StatusIcon /> {statusInfo.label}
                          </span>
                        </div>
                        <div className="lab-history-body">
                          <div className="lab-history-tests">
                            {(order.testsOrdered || []).map((t, j) => (
                              <span key={j} className="lab-history-test-chip">
                                <TestTube />
                                {t.testCode ? `${t.testCode} · ` : ''}{t.testName}
                              </span>
                            ))}
                          </div>

                          <div className="lab-history-rows">
                            {order.patientName && (
                              <div className="lab-history-row">
                                <User /> <strong>{order.patientName}</strong>
                                {order.patientNationalId && (
                                  <span style={{ fontFamily: 'Inter, monospace', marginInlineStart: 6 }}>
                                    · {order.patientNationalId}
                                  </span>
                                )}
                              </div>
                            )}
                            {order.orderedByName && (
                              <div className="lab-history-row">
                                <Stethoscope /> د. {order.orderedByName}
                              </div>
                            )}
                            {order.completedAt && (
                              <div className="lab-history-row">
                                <CheckCheck /> اكتمل: <strong>{formatDateTime(order.completedAt)}</strong>
                              </div>
                            )}
                          </div>

                          <div className="lab-history-meta-row">
                            {order.sampleId && (
                              <span className="lab-history-meta-item">
                                <Hash /> {order.sampleId}
                              </span>
                            )}
                            {order.isCritical && (
                              <span className="lab-history-meta-item critical">
                                <ShieldAlert /> نتيجة حرجة
                              </span>
                            )}
                            {order.resultPdfUrl && (
                              <a
                             href={`http://localhost:5000${order.resultPdfUrl}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="lab-history-pdf-link"
                              >
                                <FileText /> عرض التقرير
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════
              SECTION 5: NOTIFICATIONS
              ═══════════════════════════════════════════════════════ */}
          {activeSection === 'notifications' && (
            <div className="lab-card">
              <div className="lab-card-header">
                <Bell className="lab-card-header-icon" />
                <h2>جميع الإشعارات</h2>
                <div className="lab-card-header-right">
                  <span className="lab-count-badge">{notifications.length}</span>
                </div>
              </div>
              {notifications.length === 0 ? (
                <div className="lab-empty">
                  <Bell />
                  <h3>لا توجد إشعارات</h3>
                  <p>ستظهر هنا جميع التنبيهات والإشعارات</p>
                </div>
              ) : (
                <div className="lab-notif-list" style={{ padding: 0 }}>
                  {notifications.map((n) => (
                    <div
                      key={n._id}
                      className={`lab-notif-item ${n.status !== 'read' ? 'unread' : ''}`}
                      onClick={() => n.status !== 'read' && handleMarkNotificationRead(n._id)}
                    >
                      <h4 className="lab-notif-item-title">{n.title}</h4>
                      <p className="lab-notif-item-msg">{n.message}</p>
                      <span className="lab-notif-item-time">{timeAgo(n.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </main>
      </div>

      {/* ═══════════════════════════════════════════════════════
          NOTIFICATIONS SLIDE-IN PANEL
          ═══════════════════════════════════════════════════════ */}
      {notificationsPanelOpen && (
        <>
          <div className="lab-notif-backdrop" onClick={() => setNotificationsPanelOpen(false)} />
          <aside className="lab-notif-panel">
            <div className="lab-notif-header">
              <h2><Bell /> الإشعارات</h2>
              <button
                type="button"
                className="lab-btn icon-only"
                onClick={() => setNotificationsPanelOpen(false)}
                aria-label="إغلاق"
              >
                <X />
              </button>
            </div>
            <div className="lab-notif-list">
              {notifications.length === 0 ? (
                <div className="lab-empty">
                  <Bell />
                  <h3>لا توجد إشعارات</h3>
                </div>
              ) : (
                notifications.slice(0, 20).map((n) => (
                  <div
                    key={n._id}
                    className={`lab-notif-item ${n.status !== 'read' ? 'unread' : ''}`}
                    onClick={() => n.status !== 'read' && handleMarkNotificationRead(n._id)}
                  >
                    <h4 className="lab-notif-item-title">{n.title}</h4>
                    <p className="lab-notif-item-msg">{n.message}</p>
                    <span className="lab-notif-item-time">{timeAgo(n.createdAt)}</span>
                  </div>
                ))
              )}
            </div>
          </aside>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════
          GENERIC MODAL (alerts + confirmations)
          ═══════════════════════════════════════════════════════ */}
      <Modal isOpen={modal.isOpen} onClose={closeModal}>
        <div className={`lab-modal-header ${modal.variant}`}>
          {modal.variant === 'success' && <CheckCircle2 className="lab-modal-icon" />}
          {modal.variant === 'error'   && <XCircle className="lab-modal-icon" />}
          {modal.variant === 'warning' && <AlertTriangle className="lab-modal-icon" />}
          {modal.variant === 'info'    && <Info className="lab-modal-icon" />}
          <h3>{modal.title}</h3>
          <button type="button" className="lab-modal-close" onClick={closeModal} aria-label="إغلاق">
            <X />
          </button>
        </div>
        <div className="lab-modal-body">
          <p>{modal.message}</p>
        </div>
        <div className="lab-modal-footer">
          {modal.onConfirm ? (
            <>
              <button type="button" className="lab-btn secondary" onClick={closeModal}>
                {modal.cancelLabel}
              </button>
              <button
                type="button"
                className={`lab-btn ${modal.variant === 'error' || modal.variant === 'warning' ? 'danger' : 'primary'}`}
                onClick={() => {
                  const fn = modal.onConfirm;
                  closeModal();
                  if (fn) fn();
                }}
              >
                {modal.confirmLabel}
              </button>
            </>
          ) : (
            <button type="button" className="lab-btn primary" onClick={closeModal}>
              {modal.confirmLabel}
            </button>
          )}
        </div>
      </Modal>

      {/* ═══════════════════════════════════════════════════════
          CRITICAL RESULT CONFIRMATION GATE
          ═══════════════════════════════════════════════════════ */}
      <Modal isOpen={criticalConfirmOpen} onClose={() => setCriticalConfirmOpen(false)} size="md">
        <div className="lab-modal-header error">
          <ShieldAlert className="lab-modal-icon" />
          <h3>تأكيد إرسال نتيجة حرجة</h3>
          <button
            type="button"
            className="lab-modal-close"
            onClick={() => setCriticalConfirmOpen(false)}
            aria-label="إغلاق"
          >
            <X />
          </button>
        </div>
        <div className="lab-modal-body">
          <div className="lab-modal-icon-lg error">
            <AlertTriangle />
          </div>
          <p style={{ textAlign: 'center', fontWeight: 700, color: 'var(--tm-text)', fontSize: '1rem' }}>
            أنت على وشك إرسال نتيجة تحليل مُصنَّفة كحرجة.
          </p>
          <p style={{ textAlign: 'center' }}>
            سيتم إرسال <strong>تنبيه عاجل فوري</strong> إلى الطبيب المعالج، وسيتم تمييز الملف الطبي للمريض للمتابعة الفورية.
            هذا الإجراء يتوافق مع معايير ISO 15189 الدولية لإبلاغ القيم الحرجة.
          </p>
          <div className="lab-alert warning" style={{ marginTop: 14, marginBottom: 0 }}>
            <AlertCircle />
            <p>
              تحقق من جميع القيم مرة أخرى قبل التأكيد. لا يمكن التراجع عن هذا الإجراء.
            </p>
          </div>
        </div>
        <div className="lab-modal-footer">
          <button
            type="button"
            className="lab-btn secondary"
            onClick={() => setCriticalConfirmOpen(false)}
          >
            مراجعة النتائج
          </button>
          <button
            type="button"
            className="lab-btn danger"
            onClick={performSubmitResults}
            disabled={submittingResults}
          >
            {submittingResults ? (
              <><span className="lab-btn-spinner" /> جاري الإرسال...</>
            ) : (
              <><ShieldAlert /> تأكيد وإرسال عاجل</>
            )}
          </button>
        </div>
      </Modal>

    </div>
  );
};

export default LabDashboard;