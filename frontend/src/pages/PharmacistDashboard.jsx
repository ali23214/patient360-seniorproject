// ============================================================================
// PHARMACIST DASHBOARD — Patient 360°
// ============================================================================
// Syrian National Medical Platform | Arab International University
// Design System : Teal Medica | Typography: Cairo (Arabic RTL) + Inter
// DB Reference  : patient360_db_final.js
// CSS Namespace : ph-
//
// Sections:
//   1. Home               — KPIs, pharmacy info, recent dispensing, quick actions
//   2. Dispense Prescription ⭐ — national ID search → prescription list →
//                           verification → per-medication checkboxes →
//                           allergy + interaction + controlled-substance gates →
//                           dispense → receipt preview
//   3. OTC                — walk-in sales with required otcReason
//   4. Dispensing History — filterable log of all dispense events
//   5. Notifications      — slide-in panel
//
// Core safety mechanism: the per-medication checkbox system writes to
// prescriptions.medications[].isDispensed natively. Unchecked medications
// remain available for other pharmacies — this is the multi-pharmacy
// safety gate requested by the user.
// ============================================================================

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI, pharmacistAPI } from '../services/api';
import { useTheme } from '../context/ThemeProvider';
import '../styles/PharmacistDashboard.css';

import {
  // Navigation
  LayoutDashboard, Pill, ScrollText, History, Bell, LogOut, Menu, X,
  // Section icons
  Search, Shield, Receipt, ShoppingBag, Info,
  // Actions
  Plus, Check, CheckCircle2, XCircle, AlertTriangle, AlertCircle,
  Printer, RefreshCw, Eye, Trash2, KeyRound, ShieldAlert, ShieldCheck,
  // Medical
  Stethoscope, HeartPulse, Activity, FileText, ClipboardList, Syringe,
  // Patient
  User, UserCircle, UserPlus, Calendar, MapPin, Phone, Droplet,
  // Business
  DollarSign, CreditCard, Banknote, Gift, Building2, Clock, TrendingUp,
  // Misc
  Zap, Lock, CheckCheck, CircleDot, FilePlus, PackageCheck
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
    label: 'الصرف',
    items: [
      { id: 'dispense', label: 'صرف وصفة طبية', icon: ScrollText, priority: true },
      { id: 'otc', label: 'بيع بدون وصفة', icon: Pill }
    ]
  },
  {
    label: 'السجلات',
    items: [
      { id: 'history', label: 'سجل الصرف', icon: History }
    ]
  },
  {
    label: 'الإعدادات',
    items: [
      { id: 'notifications', label: 'الإشعارات', icon: Bell, badgeKey: 'unreadCount' }
    ]
  }
];

// payment method enum from pharmacy_dispensing schema
const PAYMENT_METHODS = [
  { id: 'cash',      label: 'نقدي',  icon: Banknote },
  { id: 'card',      label: 'بطاقة', icon: CreditCard },
  { id: 'insurance', label: 'تأمين', icon: Building2 },
  { id: 'free',      label: 'مجاني', icon: Gift }
];

// medications.route enum
const ROUTE_LABELS = {
  oral:        'فموي',
  topical:     'موضعي',
  injection:   'حقن',
  inhalation:  'استنشاق',
  sublingual:  'تحت اللسان',
  rectal:      'شرجي',
  other:       'أخرى'
};

// Common OTC catalog — quick picks for the OTC tab
// All marked as requiresPrescription=false in the spirit of the DB enum
const COMMON_OTC_MEDICATIONS = [
  { name: 'Paracetamol (Panadol)',              arabicName: 'باراسيتامول (بنادول)', category: 'analgesic',       dosageForm: 'tablet', strength: '500mg' },
  { name: 'Ibuprofen',                           arabicName: 'ايبوبروفين',             category: 'analgesic',       dosageForm: 'tablet', strength: '400mg' },
  { name: 'Antacid (Gaviscon)',                  arabicName: 'مضاد حموضة (غافيسكون)',  category: 'gastrointestinal', dosageForm: 'syrup',  strength: '200ml' },
  { name: 'Loratadine (Claritine)',              arabicName: 'لوراتادين (كلاريتين)',    category: 'antihistamine',    dosageForm: 'tablet', strength: '10mg'  },
  { name: 'Vitamin C',                           arabicName: 'فيتامين C',              category: 'vitamin',          dosageForm: 'tablet', strength: '1000mg'},
  { name: 'Vitamin D3',                          arabicName: 'فيتامين D3',             category: 'vitamin',          dosageForm: 'capsule',strength: '1000IU'},
  { name: 'Oral Rehydration Salts',              arabicName: 'أملاح إماهة فموية',      category: 'supplement',       dosageForm: 'powder', strength: '20.5g' },
  { name: 'Cough Syrup',                         arabicName: 'شراب سعال',              category: 'respiratory',      dosageForm: 'syrup',  strength: '100ml' },
  { name: 'Artificial Tears',                    arabicName: 'قطرة عين مرطبة',          category: 'dermatological',   dosageForm: 'drops',  strength: '10ml'  },
  { name: 'Antiseptic Cream',                    arabicName: 'كريم مطهر',              category: 'dermatological',   dosageForm: 'cream',  strength: '30g'   },
  { name: 'Loperamide (Imodium)',                arabicName: 'لوبيراميد (إيموديوم)',    category: 'gastrointestinal', dosageForm: 'capsule',strength: '2mg'   },
  { name: 'Multivitamin',                        arabicName: 'فيتامينات متعددة',        category: 'vitamin',          dosageForm: 'tablet', strength: ''      }
];

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

const isExpired = (date) => {
  if (!date) return false;
  try { return new Date(date) < new Date(); }
  catch { return false; }
};

const getTimeGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'صباح الخير';
  if (h < 17) return 'طاب يومك';
  if (h < 21) return 'مساء الخير';
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
 * Check whether any dispensed medication conflicts with the patient's
 * recorded allergies. Uses case-insensitive substring match against
 * medicationName, arabicName, scientificName, and category for maximum
 * safety coverage.
 */
const checkAllergyConflicts = (medications, patientAllergies) => {
  if (!patientAllergies || patientAllergies.length === 0) return [];
  if (!medications || medications.length === 0) return [];
  const conflicts = [];
  medications.forEach(med => {
    patientAllergies.forEach(allergy => {
      if (!allergy) return;
      const lower = String(allergy).toLowerCase().trim();
      if (!lower) return;
      const haystacks = [
        med.medicationName, med.arabicName, med.scientificName, med.category
      ].filter(Boolean).map(s => String(s).toLowerCase());
      if (haystacks.some(h => h.includes(lower) || lower.includes(h))) {
        conflicts.push({ medicationName: med.medicationName, allergy });
      }
    });
  });
  return conflicts;
};

/**
 * Check for drug-drug interactions between every pair of selected
 * medications. Uses the `interactions` array from the medications
 * collection (each entry is a drug name that interacts with this drug).
 */
const checkInteractions = (medications) => {
  if (!medications || medications.length < 2) return [];
  const warnings = [];
  for (let i = 0; i < medications.length; i++) {
    const medA = medications[i];
    const list = medA.interactions || [];
    if (list.length === 0) continue;
    for (let j = 0; j < medications.length; j++) {
      if (i === j) continue;
      const medB = medications[j];
      const hit = list.some(int => {
        if (!int) return false;
        const lower = String(int).toLowerCase();
        return (
          (medB.medicationName  && medB.medicationName.toLowerCase().includes(lower))  ||
          (medB.scientificName && medB.scientificName.toLowerCase().includes(lower)) ||
          (medB.arabicName     && medB.arabicName.toLowerCase().includes(lower))
        );
      });
      if (hit) {
        // Avoid duplicate A-B / B-A pairs
        const pairKey = [medA.medicationName, medB.medicationName].sort().join('↔');
        if (!warnings.some(w => w.key === pairKey)) {
          warnings.push({
            key: pairKey,
            medA: medA.medicationName,
            medB: medB.medicationName
          });
        }
      }
    }
  }
  return warnings;
};

/** Returns the list of controlled-substance medications from a selection. */
const getControlledSubstances = (medications) => {
  return (medications || []).filter(m => m.controlledSubstance === true);
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
    <div className="ph-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className={`ph-modal ${size}`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const PharmacistDashboard = () => {
  const navigate = useNavigate();
  useTheme(); // consumes theme context so the provider wraps this page

  // ── Identity ────────────────────────────────────────────────────
  const [user, setUser] = useState(null);
  const [pharmacy, setPharmacy] = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Navigation ──────────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationsPanelOpen, setNotificationsPanelOpen] = useState(false);

  // ── Home KPIs ───────────────────────────────────────────────────
  const [kpis, setKpis] = useState({
    dispensedToday: 0,
    dispensedThisMonth: 0,
    prescriptionBasedToday: 0,
    otcToday: 0,
    totalRevenueToday: 0,
    totalRevenueMonth: 0
  });
  const [recentActivity, setRecentActivity] = useState([]);

  // ── Dispense Prescription State ─────────────────────────────────
  const [searchNationalId, setSearchNationalId] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [patient, setPatient] = useState(null);
  const [patientPrescriptions, setPatientPrescriptions] = useState([]);
  const [selectedPrescription, setSelectedPrescription] = useState(null);

  const [verificationCode, setVerificationCode] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const [verifyingCode, setVerifyingCode] = useState(false);

  const [dispenseMeds, setDispenseMeds] = useState([]); // per-med checklist
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [pharmacistNotes, setPharmacistNotes] = useState('');
  const [dispensing, setDispensing] = useState(false);

  // Scroll targets for smooth UX
  const verificationRef = useRef(null);
  const dispenseFooterRef = useRef(null);

  // ── Safety gate state ───────────────────────────────────────────
  const [allergyConfirmOpen, setAllergyConfirmOpen] = useState(false);
  const [controlledConfirmOpen, setControlledConfirmOpen] = useState(false);
  const [pendingDispenseKind, setPendingDispenseKind] = useState(null); // 'rx' | 'otc'

  // ── Receipt modal ───────────────────────────────────────────────
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptData, setReceiptData] = useState(null);

  // ── OTC State ───────────────────────────────────────────────────
  const [otcCart, setOtcCart] = useState([]); // [{id, medicationName, arabicName, quantity, unitPrice}]
  const [otcNewMed, setOtcNewMed] = useState({ medicationName: '', quantity: 1, unitPrice: 0 });
  const [otcReason, setOtcReason] = useState('');
  const [otcNotes, setOtcNotes] = useState('');
  const [otcPayment, setOtcPayment] = useState('cash');
  const [otcDispensing, setOtcDispensing] = useState(false);
  const [showOtcQuickList, setShowOtcQuickList] = useState(true);
  const [otcPatientId, setOtcPatientId] = useState('');
  const [otcPatient, setOtcPatient] = useState(null);
  const [otcPatientLoading, setOtcPatientLoading] = useState(false);

  // ── History ─────────────────────────────────────────────────────
  const [dispensingHistory, setDispensingHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historySearch, setHistorySearch] = useState('');

  // ── Notifications ───────────────────────────────────────────────
  const [notifications, setNotifications] = useState([]);

  // ── Generic modal (alerts + confirmations) ──────────────────────
  const [modal, setModal] = useState({
    isOpen: false,
    variant: 'info',       // 'success' | 'error' | 'warning' | 'info'
    title: '',
    message: '',
    onConfirm: null,
    confirmLabel: 'حسناً',
    cancelLabel: 'إلغاء'
  });

  // ============================================================================
  // MODAL HELPERS (bug-fixed: closeModal never fires onConfirm)
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
      if (!currentUser.roles?.includes('pharmacist')) {
        openAlert('error', 'غير مصرح', 'هذه الصفحة متاحة للصيادلة فقط');
        setTimeout(() => navigate('/login'), 1500);
        return;
      }
      setUser(currentUser);

      // Lazy load all sections in parallel — any failure is tolerated
      const results = await Promise.allSettled([
        pharmacistAPI.getDashboardKPIs(),
        pharmacistAPI.getMyNotifications()
      ]);

      const [kpisResult, notifResult] = results;
      if (kpisResult.status === 'fulfilled' && kpisResult.value?.success) {
        setKpis(kpisResult.value.kpis || {});
        setRecentActivity(kpisResult.value.recentActivity || []);
        if (kpisResult.value.pharmacy) setPharmacy(kpisResult.value.pharmacy);
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

  // Ctrl/Cmd+K → focus the active search
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (activeSection === 'dispense') setActiveSection('dispense');
        else setActiveSection('dispense');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeSection]);

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  const unreadCount = useMemo(
    () => notifications.filter(n => n.status !== 'read').length,
    [notifications]
  );

  const selectedMedsForSafetyCheck = useMemo(() => {
    return dispenseMeds.filter(m => m.selected && !m.isDispensed);
  }, [dispenseMeds]);

  const allergyConflicts = useMemo(() => {
    if (!patient) return [];
    return checkAllergyConflicts(selectedMedsForSafetyCheck, patient.allergies);
  }, [selectedMedsForSafetyCheck, patient]);

  const interactionWarnings = useMemo(() => {
    return checkInteractions(selectedMedsForSafetyCheck);
  }, [selectedMedsForSafetyCheck]);

  const controlledSubstances = useMemo(() => {
    return getControlledSubstances(selectedMedsForSafetyCheck);
  }, [selectedMedsForSafetyCheck]);

  const otcTotal = useMemo(
    () => otcCart.reduce((sum, m) => sum + ((m.quantity || 0) * (m.unitPrice || 0)), 0),
    [otcCart]
  );

  // Live grand total for the prescription-dispense flow.
  // Mirrors the totalCost computation in performDispensePrescription so the
  // number the pharmacist sees on screen is exactly what gets submitted.
  const dispenseTotal = useMemo(
    () => dispenseMeds
      .filter(m => m.selected && !m.isDispensed)
      .reduce((sum, m) => sum + ((m.quantityToDispense || 0) * (m.unitPrice || 0)), 0),
    [dispenseMeds]
  );

  const filteredHistory = useMemo(() => {
    let list = dispensingHistory;
    if (historyFilter !== 'all') {
      list = list.filter(h => h.dispensingType === historyFilter);
    }
    if (historySearch.trim()) {
      const q = historySearch.toLowerCase();
      list = list.filter(h =>
        h.dispensingNumber?.toLowerCase().includes(q) ||
        h.prescriptionNumber?.toLowerCase().includes(q) ||
        h.patientName?.toLowerCase().includes(q) ||
        h.patientNationalId?.includes(q)
      );
    }
    return list;
  }, [dispensingHistory, historyFilter, historySearch]);

  // ============================================================================
  // DATA LOADERS
  // ============================================================================

  const reloadKPIs = useCallback(async () => {
    try {
      const res = await pharmacistAPI.getDashboardKPIs();
      if (res?.success) {
        setKpis(res.kpis || {});
        setRecentActivity(res.recentActivity || []);
        if (res.pharmacy) setPharmacy(res.pharmacy);
      }
    } catch { /* silent */ }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await pharmacistAPI.getDispensingHistory();
      if (res?.success) {
        setDispensingHistory(res.history || []);
      }
    } catch (err) {
      openAlert('error', 'خطأ', err?.message || 'حدث خطأ في تحميل السجل');
    } finally {
      setHistoryLoading(false);
    }
  }, [openAlert]);

  useEffect(() => {
    if (activeSection === 'history' && user) loadHistory();
  }, [activeSection, user, loadHistory]);

  // ============================================================================
  // PRESCRIPTION DISPENSING HANDLERS
  // ============================================================================

  /** Step 1 — search patient by national ID */
  const handleSearchPatient = useCallback(async () => {
    const clean = searchNationalId.trim();
    if (clean.length !== 11 || !/^\d{11}$/.test(clean)) {
      setSearchError('الرجاء إدخال رقم وطني صحيح مكون من 11 رقم');
      return;
    }
    setSearchLoading(true);
    setSearchError('');
    setPatient(null);
    setPatientPrescriptions([]);
    setSelectedPrescription(null);
    setIsVerified(false);
    setVerificationCode('');
    setDispenseMeds([]);

    try {
      const res = await pharmacistAPI.searchPatientByNationalId(clean);
      if (res?.success) {
        setPatient(res.patient);
        setPatientPrescriptions(res.prescriptions || []);
      } else {
        setSearchError(res?.message || 'لم يتم العثور على المريض');
      }
    } catch (err) {
      setSearchError(err?.message || 'حدث خطأ أثناء البحث');
    } finally {
      setSearchLoading(false);
    }
  }, [searchNationalId]);

  /** Step 2 — pharmacist picks one prescription to dispense */
  const handleSelectPrescription = useCallback((rx) => {
    setSelectedPrescription(rx);
    setVerificationCode('');
    setIsVerified(false);
    setVerificationError('');
    setPharmacistNotes('');

    // Build the per-medication checklist from the DB medications array.
    // Already-dispensed items are locked (selected=false, checkbox disabled).
    const checklist = (rx.medications || []).map(med => ({
      ...med,
      selected: !med.isDispensed,        // available → default to checked
      quantityToDispense: med.quantity || 1,
      unitPrice: 0,                      // pharmacist fills this in per medication
      isGenericSubstitute: false,
      pharmacistNotes: ''
    }));
    setDispenseMeds(checklist);

    setTimeout(() => {
      verificationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 250);
  }, []);

  /** Step 3 — verify the 6-digit code */
  const handleVerifyCode = useCallback(async () => {
    if (verificationCode.length !== 6) {
      setVerificationError('رمز التحقق يجب أن يكون 6 أرقام');
      return;
    }
    setVerifyingCode(true);
    setVerificationError('');
    try {
      const res = await pharmacistAPI.verifyPrescriptionCode(
        selectedPrescription._id,
        { verificationCode }
      );
      if (res?.success && res.verified) {
        setIsVerified(true);
        setTimeout(() => {
          dispenseFooterRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }, 300);
      } else {
        setVerificationError(res?.message || 'رمز التحقق غير صحيح');
      }
    } catch (err) {
      // Fallback: if backend verify endpoint not yet implemented, do local check
      if (selectedPrescription?.verificationCode === verificationCode) {
        setIsVerified(true);
      } else {
        setVerificationError(err?.message || 'رمز التحقق غير صحيح');
      }
    } finally {
      setVerifyingCode(false);
    }
  }, [verificationCode, selectedPrescription]);

  /** Toggle checkbox on a medication */
  const handleToggleMed = useCallback((index) => {
    setDispenseMeds(prev => {
      const next = [...prev];
      if (next[index].isDispensed) return prev; // locked
      next[index] = { ...next[index], selected: !next[index].selected };
      return next;
    });
  }, []);

  /** Change quantity on a medication */
  const handleChangeQty = useCallback((index, value) => {
    const qty = Math.max(1, parseInt(value, 10) || 1);
    setDispenseMeds(prev => {
      const next = [...prev];
      next[index] = { ...next[index], quantityToDispense: qty };
      return next;
    });
  }, []);

  /** Change unit price on a medication (in SYP) */
  const handleChangeUnitPrice = useCallback((index, value) => {
    // Allow the field to be cleared without snapping to 0 mid-edit.
    // parseFloat handles both "2500" and "2500.50"; NaN falls back to 0.
    const price = value === '' ? 0 : Math.max(0, parseFloat(value) || 0);
    setDispenseMeds(prev => {
      const next = [...prev];
      next[index] = { ...next[index], unitPrice: price };
      return next;
    });
  }, []);

  /** Toggle generic substitute on a medication */
  const handleToggleGeneric = useCallback((index) => {
    setDispenseMeds(prev => {
      const next = [...prev];
      next[index] = { ...next[index], isGenericSubstitute: !next[index].isGenericSubstitute };
      return next;
    });
  }, []);

  /** Step 4 — begin dispense flow (safety gates come first) */
  const handleDispensePrescription = useCallback(() => {
    const selected = dispenseMeds.filter(m => m.selected && !m.isDispensed);
    if (selected.length === 0) {
      openAlert('warning', 'تنبيه', 'الرجاء اختيار دواء واحد على الأقل للصرف');
      return;
    }

    // Gate 1 — allergy conflicts
    if (allergyConflicts.length > 0) {
      setPendingDispenseKind('rx');
      setAllergyConfirmOpen(true);
      return;
    }

    // Gate 2 — controlled substances
    if (controlledSubstances.length > 0) {
      setPendingDispenseKind('rx');
      setControlledConfirmOpen(true);
      return;
    }

    // No gates → dispense directly
    performDispensePrescription();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispenseMeds, allergyConflicts, controlledSubstances, openAlert]);

  /** Actually send the dispense request to the backend */
  const performDispensePrescription = useCallback(async () => {
    setAllergyConfirmOpen(false);
    setControlledConfirmOpen(false);
    setPendingDispenseKind(null);

    const selected = dispenseMeds.filter(m => m.selected && !m.isDispensed);
    if (selected.length === 0 || !selectedPrescription || !patient) return;

    const totalCost = selected.reduce(
      (sum, m) => sum + ((m.unitPrice || 0) * (m.quantityToDispense || 1)), 0
    );

    const payload = {
      prescriptionId: selectedPrescription._id,
      patientPersonId: patient.personId || patient._id,
      medicationsDispensed: selected.map(med => ({
        medicationName: med.medicationName,
        quantityDispensed: med.quantityToDispense,
        batchNumber: med.batchNumber,
        expiryDate: med.expiryDate,
        unitPrice: med.unitPrice,
        isGenericSubstitute: !!med.isGenericSubstitute,
        pharmacistNotes: med.pharmacistNotes || ''
      })),
      totalCost,
      currency: 'SYP',
      paymentMethod,
      notes: pharmacistNotes
    };

    setDispensing(true);
    try {
      const res = await pharmacistAPI.dispensePrescription(payload);
      if (res?.success) {
        // Build receipt data for preview/print
        setReceiptData({
          kind: 'prescription',
          dispensingNumber: res.dispensing?.dispensingNumber || '—',
          prescriptionNumber: selectedPrescription.prescriptionNumber,
          patientName: `${patient.firstName || ''} ${patient.lastName || ''}`.trim(),
          nationalId: patient.nationalId,
          medications: selected.map(m => ({
            name: m.medicationName,
            quantity: m.quantityToDispense,
            unitPrice: m.unitPrice || 0,
            total: (m.unitPrice || 0) * m.quantityToDispense
          })),
          totalCost,
          currency: 'SYP',
          paymentMethod,
          pharmacyName: pharmacy?.arabicName || pharmacy?.name || 'Patient 360°',
          pharmacistName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
          dispensingDate: new Date().toISOString()
        });
        setReceiptOpen(true);

        // Refresh prescriptions (new isDispensed flags)
        handleSearchPatient();
        // Reset dispense state
        setSelectedPrescription(null);
        setIsVerified(false);
        setVerificationCode('');
        setDispenseMeds([]);
        setPharmacistNotes('');
        // Update home KPIs
        reloadKPIs();
      } else {
        openAlert('error', 'فشل الصرف', res?.message || 'حدث خطأ أثناء الصرف');
      }
    } catch (err) {
      openAlert('error', 'فشل الصرف', err?.message || 'حدث خطأ أثناء الصرف');
    } finally {
      setDispensing(false);
    }
  }, [
    dispenseMeds, selectedPrescription, patient, paymentMethod,
    pharmacistNotes, pharmacy, user, handleSearchPatient, reloadKPIs, openAlert
  ]);

  // ============================================================================
  // OTC HANDLERS
  // ============================================================================

  const handleSearchOtcPatient = useCallback(async () => {
    const clean = otcPatientId.trim();
    if (!clean) { setOtcPatient(null); return; }
    if (clean.length !== 11 || !/^\d{11}$/.test(clean)) {
      openAlert('warning', 'رقم غير صحيح', 'الرقم الوطني يجب أن يكون 11 رقم');
      return;
    }
    setOtcPatientLoading(true);
    try {
      const res = await pharmacistAPI.searchPatientByNationalId(clean);
      if (res?.success) {
        setOtcPatient(res.patient);
      } else {
        setOtcPatient(null);
        openAlert('error', 'غير موجود', res?.message || 'لم يتم العثور على المريض');
      }
    } catch (err) {
      setOtcPatient(null);
      openAlert('error', 'خطأ', err?.message || 'حدث خطأ أثناء البحث');
    } finally {
      setOtcPatientLoading(false);
    }
  }, [otcPatientId, openAlert]);

  const handleAddQuickOtcMed = useCallback((catalogItem) => {
    setOtcCart(prev => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        medicationName: catalogItem.name,
        arabicName: catalogItem.arabicName,
        quantity: 1,
        unitPrice: 0
      }
    ]);
  }, []);

  const handleAddManualOtcMed = useCallback(() => {
    const name = otcNewMed.medicationName.trim();
    if (!name) {
      openAlert('warning', 'تنبيه', 'الرجاء إدخال اسم الدواء');
      return;
    }
    setOtcCart(prev => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        medicationName: name,
        arabicName: '',
        quantity: Math.max(1, parseInt(otcNewMed.quantity, 10) || 1),
        unitPrice: Math.max(0, parseFloat(otcNewMed.unitPrice) || 0)
      }
    ]);
    setOtcNewMed({ medicationName: '', quantity: 1, unitPrice: 0 });
  }, [otcNewMed, openAlert]);

  const handleUpdateOtcCartItem = useCallback((id, field, value) => {
    setOtcCart(prev => prev.map(item =>
      item.id === id
        ? { ...item, [field]: field === 'medicationName' ? value : Math.max(0, parseFloat(value) || 0) }
        : item
    ));
  }, []);

  const handleRemoveOtcCartItem = useCallback((id) => {
    setOtcCart(prev => prev.filter(item => item.id !== id));
  }, []);

  const handleOtcDispense = useCallback(() => {
    // National ID is the new required first step — block if not yet linked.
    if (!otcPatient) {
      openAlert('warning', 'مريض مطلوب', 'الرجاء إدخال الرقم الوطني للمريض والبحث عنه قبل إتمام البيع');
      return;
    }
    if (otcCart.length === 0) {
      openAlert('warning', 'السلة فارغة', 'الرجاء إضافة دواء واحد على الأقل');
      return;
    }
    if (!otcReason.trim()) {
      openAlert('warning', 'حقل مطلوب', 'سبب الصرف بدون وصفة مطلوب');
      return;
    }

    // Allergy gate now always runs because every OTC sale is tied to a patient.
    if (otcPatient.allergies?.length > 0) {
      const cartAsMeds = otcCart.map(item => ({
        medicationName: item.medicationName,
        arabicName: item.arabicName
      }));
      const conflicts = checkAllergyConflicts(cartAsMeds, otcPatient.allergies);
      if (conflicts.length > 0) {
        openConfirm(
          'warning',
          'تحذير حساسية',
          `المريض لديه حساسية قد تتعارض مع: ${conflicts.map(c => c.medicationName).join('، ')}. هل أنت متأكد من المتابعة؟`,
          () => performOtcDispense(),
          'المتابعة على مسؤوليتي'
        );
        return;
      }
    }

    performOtcDispense();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otcCart, otcReason, otcPatient, openAlert, openConfirm]);

  const performOtcDispense = useCallback(async () => {
    closeModal();
    const payload = {
      patientPersonId: otcPatient?.personId || otcPatient?._id || undefined,
      medicationsDispensed: otcCart.map(item => ({
        medicationName: item.medicationName,
        arabicName: item.arabicName,
        quantityDispensed: item.quantity,
        unitPrice: item.unitPrice
      })),
      totalCost: otcTotal,
      currency: 'SYP',
      paymentMethod: otcPayment,
      otcReason: otcReason.trim(),
      otcNotes: otcNotes.trim() || undefined,
      notes: otcNotes.trim() || undefined
    };

    setOtcDispensing(true);
    try {
      const res = await pharmacistAPI.dispenseOTC(payload);
      if (res?.success) {
        openAlert('success', 'تم الصرف', `تم تسجيل بيع بدون وصفة رقم ${res.dispensing?.dispensingNumber || ''}`);
        // Reset OTC state
        setOtcCart([]);
        setOtcReason('');
        setOtcNotes('');
        setOtcPatient(null);
        setOtcPatientId('');
        reloadKPIs();
      } else {
        openAlert('error', 'فشل الصرف', res?.message || 'حدث خطأ أثناء الصرف');
      }
    } catch (err) {
      openAlert('error', 'فشل الصرف', err?.message || 'حدث خطأ أثناء الصرف');
    } finally {
      setOtcDispensing(false);
    }
  }, [otcCart, otcPatient, otcTotal, otcPayment, otcReason, otcNotes, reloadKPIs, openAlert, closeModal]);

  // ============================================================================
  // NOTIFICATION HANDLERS
  // ============================================================================

  const handleMarkNotificationRead = useCallback(async (id) => {
    try {
      await pharmacistAPI.markNotificationRead(id);
      setNotifications(prev => prev.map(n =>
        n._id === id ? { ...n, status: 'read' } : n
      ));
    } catch { /* silent */ }
  }, []);

  // ============================================================================
  // LOGOUT + PRINT
  // ============================================================================

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

  const handlePrintReceipt = useCallback(() => {
    window.print();
  }, []);

  // ============================================================================
  // SIDEBAR NAVIGATION HELPER
  // ============================================================================

  const renderSidebarItem = (item) => {
    const Icon = item.icon;
    const isActive = activeSection === item.id;
    const badge = item.badgeKey === 'unreadCount' && unreadCount > 0 ? unreadCount : null;
    return (
      <button
        key={item.id}
        type="button"
        className={`ph-sidebar-item ${isActive ? 'active' : ''}`}
        onClick={() => setActiveSection(item.id)}
      >
        <Icon />
        <span className="ph-sb-label">{item.label}</span>
        {badge !== null && (
          <span className="ph-sidebar-badge ph-sidebar-badge-pulse">{badge}</span>
        )}
      </button>
    );
  };

  // ============================================================================
  // LOADING SCREEN
  // ============================================================================

  if (loading || !user) {
    return (
      <div className="ph-loading">
        <div className="ph-spinner" />
        <p>جاري تحميل لوحة الصيدلي...</p>
      </div>
    );
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  const pharmacistInitial = (user.firstName || 'ص').charAt(0);
  const pharmacyLabel = pharmacy?.arabicName || pharmacy?.name || 'صيدلية';

  return (
    <div className="ph-page">
      <div className="ph-shell">

        {/* ─────────────────────── SIDEBAR BACKDROP (mobile) ─────────────────────── */}
        <div
          className={`ph-sidebar-backdrop ${sidebarOpen ? 'open' : ''}`}
          onClick={() => setSidebarOpen(false)}
        />

        {/* ──────────────────────────────── SIDEBAR ──────────────────────────────── */}
        <aside className={`ph-sidebar ${sidebarOpen ? 'open' : ''}`}>
          <button
            type="button"
            className="ph-sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="إغلاق القائمة"
          >
            <X />
          </button>

          <div className="ph-sidebar-brand">
            <div className="ph-sidebar-brand-logo">
              <HeartPulse />
            </div>
            <div className="ph-sidebar-brand-text">
              <h3>Patient 360°</h3>
              <p>لوحة الصيدلي</p>
            </div>
          </div>

          <div className="ph-sidebar-user">
            <div className="ph-sidebar-user-avatar">{pharmacistInitial}</div>
            <div className="ph-sidebar-user-info">
              <h4>{user.firstName} {user.lastName}</h4>
              <p>{pharmacyLabel}</p>
            </div>
          </div>

          {SIDEBAR_GROUPS.map(group => (
            <div key={group.label} className="ph-sidebar-group">
              <div className="ph-sidebar-group-label">{group.label}</div>
              {group.items.map(item => renderSidebarItem(item))}
            </div>
          ))}

          <div className="ph-sidebar-divider" />
          <button
            type="button"
            className="ph-sidebar-item danger"
            onClick={handleLogout}
          >
            <LogOut />
            <span className="ph-sb-label">تسجيل الخروج</span>
          </button>
        </aside>

        {/* ─────────────────────────────── MAIN CONTENT ─────────────────────────────── */}
        <main className="ph-main">

          {/* Page header */}
          <div className="ph-page-header">
            <div className="ph-page-header-left">
              <button
                type="button"
                className="ph-mobile-menu-btn"
                onClick={() => setSidebarOpen(true)}
                aria-label="فتح القائمة"
              >
                <Menu />
              </button>
              <div className="ph-section-icon">
                {activeSection === 'home'          && <LayoutDashboard />}
                {activeSection === 'dispense'      && <ScrollText />}
                {activeSection === 'otc'           && <Pill />}
                {activeSection === 'history'       && <History />}
                {activeSection === 'notifications' && <Bell />}
              </div>
              <div className="ph-page-header-title">
                <h1>
                  {activeSection === 'home'          && 'الرئيسية'}
                  {activeSection === 'dispense'      && 'صرف وصفة طبية'}
                  {activeSection === 'otc'           && 'بيع بدون وصفة'}
                  {activeSection === 'history'       && 'سجل الصرف'}
                  {activeSection === 'notifications' && 'الإشعارات'}
                </h1>
                <p>
                  {activeSection === 'home'          && 'نظرة عامة على نشاط الصيدلية اليوم'}
                  {activeSection === 'dispense'      && 'ابحث عن المريض برقمه الوطني ثم اختر الأدوية المراد صرفها'}
                  {activeSection === 'otc'           && 'تسجيل مبيعات الأدوية التي لا تتطلب وصفة طبية'}
                  {activeSection === 'history'       && 'جميع عمليات الصرف التي قمت بها'}
                  {activeSection === 'notifications' && 'تنبيهات وإشعارات الصيدلية'}
                </p>
              </div>
            </div>
            <div className="ph-page-header-right">
              <button
                type="button"
                className="ph-btn icon-only"
                onClick={() => setNotificationsPanelOpen(true)}
                aria-label="الإشعارات"
              >
                <Bell />
                {unreadCount > 0 && <span className="ph-btn-dot" />}
              </button>
              <button
                type="button"
                className="ph-btn icon-only"
                onClick={reloadKPIs}
                aria-label="تحديث"
              >
                <RefreshCw />
              </button>
            </div>
          </div>

          {/* ═══════════════ SECTION: HOME ═══════════════ */}
          {activeSection === 'home' && (
            <>
              <div className="ph-hero">
                <div className="ph-hero-content">
                  <div className="ph-hero-top">
                    <div className="ph-hero-seal">
                      <HeartPulse />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="ph-hero-greeting">{getTimeGreeting()}</p>
                      <h2 className="ph-hero-name">{user.firstName} {user.lastName}</h2>
                      <div className="ph-hero-meta">
                        {pharmacy?.name && (
                          <span className="ph-hero-meta-item">
                            <Building2 />
                            {pharmacyLabel}
                          </span>
                        )}
                        {pharmacy?.city && (
                          <span className="ph-hero-meta-item">
                            <MapPin />
                            {pharmacy.city}{pharmacy.governorate ? `، ${pharmacy.governorate}` : ''}
                          </span>
                        )}
                        <span className="ph-hero-meta-item">
                          <Clock />
                          {formatDate(new Date())}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="ph-hero-action-btn"
                      onClick={() => setActiveSection('dispense')}
                    >
                      <Zap />
                      بدء صرف وصفة
                    </button>
                  </div>
                </div>
              </div>

              <div className="ph-kpi-grid">
                <div className="ph-kpi-tile">
                  <div className="ph-kpi-icon"><PackageCheck /></div>
                  <div className="ph-kpi-label">عمليات الصرف اليوم</div>
                  <div className="ph-kpi-value">{formatNumber(kpis.dispensedToday)}</div>
                  <div className="ph-kpi-sub">
                    {formatNumber(kpis.totalRevenueToday)} ل.س
                  </div>
                </div>
                <div className="ph-kpi-tile accent-success">
                  <div className="ph-kpi-icon"><ScrollText /></div>
                  <div className="ph-kpi-label">وصفات مصروفة اليوم</div>
                  <div className="ph-kpi-value">{formatNumber(kpis.prescriptionBasedToday)}</div>
                  <div className="ph-kpi-sub">وصفات طبية</div>
                </div>
                <div className="ph-kpi-tile accent-warning">
                  <div className="ph-kpi-icon"><Pill /></div>
                  <div className="ph-kpi-label">بيع بدون وصفة</div>
                  <div className="ph-kpi-value">{formatNumber(kpis.otcToday)}</div>
                  <div className="ph-kpi-sub">اليوم</div>
                </div>
                <div className="ph-kpi-tile accent-info">
                  <div className="ph-kpi-icon"><TrendingUp /></div>
                  <div className="ph-kpi-label">عمليات هذا الشهر</div>
                  <div className="ph-kpi-value">{formatNumber(kpis.dispensedThisMonth)}</div>
                  <div className="ph-kpi-sub">
                    {formatNumber(kpis.totalRevenueMonth)} ل.س
                  </div>
                </div>
              </div>

              <div className="ph-home-split">
                <div className="ph-card">
                  <div className="ph-card-header">
                    <Activity className="ph-card-header-icon" />
                    <h2>آخر عمليات الصرف</h2>
                    <div className="ph-card-header-right">
                      <span className="ph-count-badge">{recentActivity.length}</span>
                    </div>
                  </div>
                  {recentActivity.length === 0 ? (
                    <div className="ph-empty">
                      <ClipboardList />
                      <h3>لا توجد عمليات بعد</h3>
                      <p>ستظهر هنا آخر عمليات الصرف التي تقوم بها</p>
                    </div>
                  ) : (
                    <div className="ph-activity-list">
                      {recentActivity.slice(0, 6).map(act => (
                        <div key={act._id} className="ph-activity-row">
                          <div className={`ph-activity-icon ${act.dispensingType === 'otc' ? 'otc' : ''}`}>
                            {act.dispensingType === 'otc' ? <Pill /> : <ScrollText />}
                          </div>
                          <div className="ph-activity-info">
                            <p className="ph-activity-title">
                              {act.dispensingNumber}
                              {act.patientName && <span style={{ color: 'var(--tm-text-muted)', fontWeight: 500, fontSize: '0.82rem' }}>· {act.patientName}</span>}
                            </p>
                            <p className="ph-activity-sub">
                              {timeAgo(act.dispensingDate)} · {act.medicationCount || 0} دواء
                            </p>
                          </div>
                          <div className="ph-activity-amount">
                            {formatNumber(act.totalCost || 0)} ل.س
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="ph-card">
                  <div className="ph-card-header">
                    <Zap className="ph-card-header-icon" />
                    <h2>إجراءات سريعة</h2>
                  </div>
                  <div className="ph-quick-actions" style={{ gridTemplateColumns: '1fr' }}>
                    <button
                      type="button"
                      className="ph-quick-action"
                      onClick={() => setActiveSection('dispense')}
                    >
                      <div className="ph-qa-icon"><ScrollText /></div>
                      <div className="ph-qa-label">
                        <strong>صرف وصفة طبية</strong>
                        <span>ابحث عن المريض وصرف الأدوية</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      className="ph-quick-action"
                      onClick={() => setActiveSection('otc')}
                    >
                      <div className="ph-qa-icon"><Pill /></div>
                      <div className="ph-qa-label">
                        <strong>بيع بدون وصفة</strong>
                        <span>تسجيل مبيعات الأدوية العامة</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      className="ph-quick-action"
                      onClick={() => setActiveSection('history')}
                    >
                      <div className="ph-qa-icon"><History /></div>
                      <div className="ph-qa-label">
                        <strong>مراجعة سجل الصرف</strong>
                        <span>جميع العمليات السابقة</span>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ═══════════════ SECTION: DISPENSE PRESCRIPTION ═══════════════ */}
          {activeSection === 'dispense' && (
            <>
              {/* ── Search card ── */}
              <div className="ph-card">
                <div className="ph-card-header">
                  <Search className="ph-card-header-icon" />
                  <h2>البحث عن المريض برقمه الوطني</h2>
                </div>
                <div className="ph-toolbar" style={{ marginBottom: 0 }}>
                  <div className="ph-search-wrap">
                    <Search className="ph-search-icon" />
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={11}
                      dir="ltr"
                      className="ph-search-input"
                      placeholder="11XXXXXXXXX"
                      value={searchNationalId}
                      onChange={(e) => setSearchNationalId(e.target.value.replace(/\D/g, ''))}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchPatient()}
                    />
                  </div>
                  <button
                    type="button"
                    className="ph-btn primary"
                    onClick={handleSearchPatient}
                    disabled={searchLoading}
                  >
                    {searchLoading ? <div className="ph-btn-spinner" /> : <Search />}
                    بحث
                  </button>
                </div>
                {searchError && (
                  <div className="ph-alert error" style={{ marginTop: 14, marginBottom: 0 }}>
                    <AlertCircle />
                    <p>{searchError}</p>
                  </div>
                )}
              </div>

              {/* ── Patient card ── */}
              {patient && (
                <div className="ph-card ph-patient-card">
                  <div className="ph-patient-header">
                    <div className="ph-patient-avatar">
                      <UserCircle />
                    </div>
                    <div className="ph-patient-info">
                      <h3>
                        {patient.firstName} {patient.fatherName} {patient.lastName}
                      </h3>
                      <div className="ph-patient-meta">
                        <span className="ph-patient-meta-item national-id">
                          <FileText />
                          {patient.nationalId}
                        </span>
                        {patient.gender && (
                          <span className="ph-patient-meta-item">
                            <User />
                            {patient.gender === 'male' ? 'ذكر' : 'أنثى'}
                          </span>
                        )}
                        {patient.dateOfBirth && (
                          <span className="ph-patient-meta-item">
                            <Calendar />
                            {formatDate(patient.dateOfBirth)}
                          </span>
                        )}
                        {patient.bloodType && (
                          <span className="ph-patient-meta-item">
                            <Droplet />
                            {patient.bloodType}
                          </span>
                        )}
                        {patient.phoneNumber && (
                          <span className="ph-patient-meta-item">
                            <Phone />
                            {patient.phoneNumber}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {patient.allergies && patient.allergies.length > 0 && (
                    <div className="ph-allergy-alert">
                      <div className="ph-allergy-header">
                        <AlertTriangle />
                        <h4>تحذير: المريض لديه حساسية مسجلة</h4>
                      </div>
                      <div className="ph-allergy-chips">
                        {patient.allergies.map((allergy, i) => (
                          <span key={i} className="ph-allergy-chip">
                            <ShieldAlert />
                            {allergy}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {patient.chronicDiseases && patient.chronicDiseases.length > 0 && (
                    <div className="ph-chronic-row">
                      <span className="ph-chronic-label">
                        <HeartPulse />
                        أمراض مزمنة:
                      </span>
                      {patient.chronicDiseases.map((disease, i) => (
                        <span key={i} className="ph-chronic-chip">{disease}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Prescriptions list ── */}
              {patient && (
                <div className="ph-card">
                  <div className="ph-card-header">
                    <ScrollText className="ph-card-header-icon" />
                    <h2>الوصفات الطبية</h2>
                    <div className="ph-card-header-right">
                      <span className="ph-count-badge">{patientPrescriptions.length}</span>
                    </div>
                  </div>

                  {patientPrescriptions.length === 0 ? (
                    <div className="ph-empty">
                      <ClipboardList />
                      <h3>لا توجد وصفات فعّالة</h3>
                      <p>هذا المريض ليس لديه وصفات طبية سارية حالياً</p>
                    </div>
                  ) : (
                    <div className="ph-rx-list">
                      {patientPrescriptions.map(rx => {
                        const expired = isExpired(rx.expiryDate) || rx.status === 'expired';
                        const inactive = rx.status === 'dispensed' || rx.status === 'cancelled';
                        const isSelected = selectedPrescription?._id === rx._id;
                        return (
                          <div
                            key={rx._id}
                            className={`ph-rx-card ${isSelected ? 'selected' : ''} ${expired ? 'expired' : ''} ${inactive ? 'inactive' : ''}`}
                          >
                            <div className="ph-rx-top">
                              <div className="ph-rx-id">
                                <span className="ph-rx-number">{rx.prescriptionNumber}</span>
                                <div className="ph-rx-meta-row">
                                  <span className="ph-rx-meta-item">
                                    <Calendar />
                                    {formatDate(rx.prescriptionDate)}
                                  </span>
                                  {rx.doctor && (
                                    <span className="ph-rx-meta-item">
                                      <Stethoscope />
                                      د. {rx.doctor.firstName} {rx.doctor.lastName}
                                    </span>
                                  )}
                                  {rx.expiryDate && (
                                    <span className="ph-rx-meta-item">
                                      <Clock />
                                      تنتهي {formatDate(rx.expiryDate)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="ph-rx-badges">
                                <span className={`ph-rx-status ${rx.status}`}>
                                  {rx.status === 'active' && <><CheckCircle2 />فعّالة</>}
                                  {rx.status === 'dispensed' && <><CheckCheck />مصروفة بالكامل</>}
                                  {rx.status === 'partially_dispensed' && <><CircleDot />مصروفة جزئياً</>}
                                  {rx.status === 'expired' && <><XCircle />منتهية</>}
                                  {rx.status === 'cancelled' && <><XCircle />ملغية</>}
                                </span>
                              </div>
                            </div>

                            <div className="ph-rx-meds-preview">
                              {(rx.medications || []).map((med, i) => (
                                <div
                                  key={i}
                                  className={`ph-rx-med-row ${med.isDispensed ? 'dispensed-elsewhere' : ''}`}
                                >
                                  <Pill className="pill-icon" />
                                  <div className="ph-rx-med-name">
                                    {med.medicationName}
                                    {med.arabicName && <span style={{ color: 'var(--tm-text-muted)', fontWeight: 500, marginInlineStart: 6 }}>({med.arabicName})</span>}
                                  </div>
                                  <span className="ph-rx-med-dosage">{med.dosage}</span>
                                  {med.route && ROUTE_LABELS[med.route] && (
                                    <span className="ph-rx-med-route">{ROUTE_LABELS[med.route]}</span>
                                  )}
                                  {med.isDispensed && (
                                    <span className="ph-med-tag already">
                                      <CheckCheck />
                                      مصروف
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>

                            {rx.prescriptionNotes && (
                              <div className="ph-rx-note success">
                                <Info />
                                {rx.prescriptionNotes}
                              </div>
                            )}

                            {!expired && !inactive && (
                              <button
                                type="button"
                                className={`ph-rx-select-btn ${isSelected ? 'selected' : ''}`}
                                onClick={() => handleSelectPrescription(rx)}
                              >
                                {isSelected ? <><Check />تم الاختيار — قم بإدخال رمز التحقق</> : <><Plus />اختيار هذه الوصفة للصرف</>}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── Verification card ── */}
              {selectedPrescription && !isVerified && (
                <div className="ph-card ph-verify-card" ref={verificationRef}>
                  <div className="ph-verify-header">
                    <KeyRound className="icon" />
                    <h2>التحقق من رمز الوصفة</h2>
                  </div>
                  <p className="ph-verify-desc">
                    اطلب من المريض رمز التحقق المكون من 6 أرقام من تطبيقه الخاص أو من الوصفة المطبوعة
                  </p>
                  <div className="ph-verify-input-row">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      dir="ltr"
                      className="ph-verify-input"
                      placeholder="——————"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                      onKeyDown={(e) => e.key === 'Enter' && handleVerifyCode()}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="ph-btn success"
                      onClick={handleVerifyCode}
                      disabled={verifyingCode || verificationCode.length !== 6}
                    >
                      {verifyingCode ? <div className="ph-btn-spinner" /> : <ShieldCheck />}
                      تحقق
                    </button>
                  </div>
                  {verificationError && (
                    <div className="ph-alert error" style={{ marginBottom: 14 }}>
                      <XCircle />
                      <p>{verificationError}</p>
                    </div>
                  )}
                  <div className="ph-verify-security-note">
                    <Lock />
                    <span>الرمز يُنشأ تلقائياً عند كل وصفة ويتم التحقق منه من خلال الخادم بشكل آمن</span>
                  </div>
                </div>
              )}

              {/* ── Dispensing medication checklist (post-verification) ── */}
              {selectedPrescription && isVerified && (
                <div className="ph-card ph-verify-card verified">
                  <div className="ph-verify-header">
                    <ShieldCheck className="icon" />
                    <h2>تم التحقق — اختر الأدوية للصرف</h2>
                  </div>
                  <p className="ph-verify-desc">
                    حدد الأدوية التي لديك في المخزون وستقوم بصرفها الآن. الأدوية غير المحددة ستبقى متاحة لصيدليات أخرى.
                  </p>

                  {allergyConflicts.length > 0 && (
                    <div className="ph-allergy-conflict">
                      <h4>
                        <AlertTriangle />
                        تعارض مع حساسية المريض!
                      </h4>
                      <p>تم رصد تعارض محتمل بين الأدوية المحددة وحساسية المريض المسجلة:</p>
                      <ul>
                        {allergyConflicts.map((c, i) => (
                          <li key={i}>
                            <strong>{c.medicationName}</strong> قد يتعارض مع حساسية <strong>{c.allergy}</strong>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {interactionWarnings.length > 0 && (
                    <div className="ph-interaction-warning">
                      <div className="ph-interaction-header">
                        <AlertTriangle />
                        تحذير تداخل دوائي
                      </div>
                      <ul className="ph-interaction-list">
                        {interactionWarnings.map((w, i) => (
                          <li key={i}>
                            احتمال تداخل بين <strong>{w.medA}</strong> و <strong>{w.medB}</strong>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="ph-dispense-meds">
                    {dispenseMeds.map((med, index) => (
                      <div
                        key={index}
                        className={`ph-med-item ${med.selected && !med.isDispensed ? 'checked' : ''} ${med.isDispensed ? 'already-dispensed' : ''} ${med.controlledSubstance ? 'controlled' : ''}`}
                      >
                        <div className="ph-med-item-top">
                          <label className="ph-med-checkbox">
                            <input
                              type="checkbox"
                              checked={!!med.selected && !med.isDispensed}
                              disabled={med.isDispensed}
                              onChange={() => handleToggleMed(index)}
                              aria-label={`اختيار ${med.medicationName}`}
                            />
                          </label>
                          <div className="ph-med-body">
                            <h4 className="ph-med-name">
                              <Pill className="pill" />
                              {med.medicationName}
                              {med.arabicName && <span className="ph-med-arabic">({med.arabicName})</span>}
                              {med.isDispensed && (
                                <span className="ph-med-tag already">
                                  <CheckCheck />
                                  مصروف مسبقاً
                                </span>
                              )}
                              {med.controlledSubstance && (
                                <span className="ph-med-tag controlled">
                                  <ShieldAlert />
                                  مادة خاضعة للرقابة
                                </span>
                              )}
                            </h4>
                            <div className="ph-med-details">
                              <span className="ph-med-detail"><Syringe />{med.dosage}</span>
                              <span className="ph-med-detail"><Clock />{med.frequency}</span>
                              <span className="ph-med-detail"><Calendar />{med.duration}</span>
                              {med.route && ROUTE_LABELS[med.route] && (
                                <span className="ph-med-detail">{ROUTE_LABELS[med.route]}</span>
                              )}
                            </div>
                            {med.instructions && (
                              <div className="ph-med-instructions">
                                <Info />
                                <span>{med.instructions}</span>
                              </div>
                            )}
                            {med.selected && !med.isDispensed && (
                              <div className="ph-med-extras">
                                <div className="ph-qty-group">
                                  <label>الكمية:</label>
                                  <input
                                    type="number"
                                    min="1"
                                    className="ph-qty-input"
                                    value={med.quantityToDispense}
                                    onChange={(e) => handleChangeQty(index, e.target.value)}
                                  />
                                </div>
                                <div className="ph-qty-group">
                                  <label>سعر الوحدة (ل.س):</label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    className="ph-qty-input"
                                    style={{ width: 110 }}
                                    value={med.unitPrice || ''}
                                    placeholder="0"
                                    onChange={(e) => handleChangeUnitPrice(index, e.target.value)}
                                  />
                                </div>
                                <label className="ph-med-extra-label">
                                  <input
                                    type="checkbox"
                                    checked={med.isGenericSubstitute}
                                    onChange={() => handleToggleGeneric(index)}
                                  />
                                  بديل جنيس (Generic)
                                </label>
                                <span className="ph-otc-cart-item-price">
                                  {formatNumber(med.quantityToDispense || 0)} ×{' '}
                                  {formatNumber(med.unitPrice || 0)} ={' '}
                                  <strong>
                                    {formatNumber((med.quantityToDispense || 0) * (med.unitPrice || 0))} ل.س
                                  </strong>
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="ph-payment-row">
                    <span className="ph-payment-label">
                      <CreditCard />
                      طريقة الدفع:
                    </span>
                    <div className="ph-payment-options">
                      {PAYMENT_METHODS.map(pm => {
                        const IconPM = pm.icon;
                        return (
                          <button
                            key={pm.id}
                            type="button"
                            className={`ph-payment-btn ${paymentMethod === pm.id ? 'active' : ''}`}
                            onClick={() => setPaymentMethod(pm.id)}
                          >
                            <IconPM />
                            {pm.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="ph-form-group" style={{ marginBottom: 16 }}>
                    <label className="ph-form-label">
                      <FileText />
                      ملاحظات الصيدلي (اختياري)
                    </label>
                    <textarea
                      className="ph-textarea"
                      placeholder="أي ملاحظات متعلقة بعملية الصرف..."
                      value={pharmacistNotes}
                      onChange={(e) => setPharmacistNotes(e.target.value)}
                    />
                  </div>

                  <div ref={dispenseFooterRef}>
                    <div className="ph-otc-total-row" style={{ marginBottom: 12 }}>
                      <span className="ph-otc-total-label">
                        <DollarSign />
                        الإجمالي
                      </span>
                      <span className="ph-otc-total-amount">
                        {formatNumber(dispenseTotal)} ل.س
                      </span>
                    </div>
                    <button
                      type="button"
                      className="ph-btn success full-width"
                      onClick={handleDispensePrescription}
                      disabled={dispensing || selectedMedsForSafetyCheck.length === 0}
                    >
                      {dispensing ? <div className="ph-btn-spinner" /> : <PackageCheck />}
                      صرف {selectedMedsForSafetyCheck.length} دواء
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ═══════════════ SECTION: OTC ═══════════════ */}
          {activeSection === 'otc' && (
            <>
              <div className="ph-otc-hint">
                <Info />
                <div>
                  <strong>بيع بدون وصفة طبية:</strong> ابدأ بإدخال الرقم الوطني للمريض لربط عملية البيع بسجله الصحي،
                  ثم اختر الأدوية المطلوبة وحدد الكمية والسعر. سيتم تسجيل سبب الصرف وجميع التفاصيل ضمن سجلات الصيدلية.
                </div>
              </div>

              {/* Step 1 — Required patient lookup */}
              <div className="ph-card">
                <div className="ph-card-header">
                  <UserPlus className="ph-card-header-icon" />
                  <h2>الرقم الوطني للمريض <span style={{ color: 'var(--tm-error)' }}>*</span></h2>
                </div>
                <div className="ph-otc-patient-row">
                  <div className="ph-form-group" style={{ flex: 1 }}>
                    <label className="ph-form-label">
                      <FileText />
                      الرقم الوطني للمريض
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
                      maxLength={11}
                      className="ph-input"
                      placeholder="11XXXXXXXXX"
                      value={otcPatientId}
                      onChange={(e) => setOtcPatientId(e.target.value.replace(/\D/g, ''))}
                    />
                  </div>
                  <button
                    type="button"
                    className="ph-btn outline"
                    onClick={handleSearchOtcPatient}
                    disabled={otcPatientLoading || !otcPatientId}
                  >
                    {otcPatientLoading ? <div className="ph-btn-spinner" /> : <Search />}
                    بحث
                  </button>
                  {otcPatient && (
                    <button
                      type="button"
                      className="ph-btn ghost"
                      onClick={() => { setOtcPatient(null); setOtcPatientId(''); }}
                    >
                      <X />
                      إزالة
                    </button>
                  )}
                </div>
                {otcPatient && (
                  <div className="ph-otc-patient-card-inline">
                    <CheckCircle2 />
                    <div>
                      تم الربط بالمريض: <strong>{otcPatient.firstName} {otcPatient.lastName}</strong>
                      {otcPatient.allergies?.length > 0 && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--tm-error)', marginTop: 4 }}>
                          <AlertTriangle style={{ width: 13, height: 13, display: 'inline', marginInlineEnd: 4 }} />
                          حساسية مسجلة: {otcPatient.allergies.join('، ')}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Step 2 — Medication picker: hidden until patient is linked */}
              {!otcPatient && (
                <div className="ph-card" style={{ opacity: 0.6, pointerEvents: 'none' }}>
                  <div className="ph-card-header">
                    <Pill className="ph-card-header-icon" />
                    <h2>اختر الأدوية</h2>
                  </div>
                  <div className="ph-empty-state" style={{ padding: '48px 24px' }}>
                    <UserPlus style={{ width: 48, height: 48, color: 'var(--tm-text-muted)' }} />
                    <h3 style={{ marginTop: 12 }}>أدخل الرقم الوطني للمريض أولاً</h3>
                    <p style={{ color: 'var(--tm-text-muted)' }}>
                      لا يمكن المتابعة بعملية البيع قبل ربطها بسجل المريض
                    </p>
                  </div>
                </div>
              )}

              {/* Quick OTC picks + manual entry */}
              {otcPatient && (
              <>
              <div className="ph-card">
                <div className="ph-card-header">
                  <Pill className="ph-card-header-icon" />
                  <h2>اختر الأدوية</h2>
                  <div className="ph-card-header-right">
                    <button
                      type="button"
                      className="ph-btn ghost"
                      onClick={() => setShowOtcQuickList(v => !v)}
                    >
                      {showOtcQuickList ? <X /> : <Plus />}
                      {showOtcQuickList ? 'إخفاء القائمة السريعة' : 'عرض القائمة السريعة'}
                    </button>
                  </div>
                </div>

                {showOtcQuickList && (
                  <div className="ph-otc-quick-section">
                    <h3 className="ph-otc-subheading">
                      <Zap />
                      اختيار سريع من الأدوية الشائعة
                    </h3>
                    <div className="ph-otc-quick-grid">
                      {COMMON_OTC_MEDICATIONS.map((item, i) => (
                        <button
                          key={i}
                          type="button"
                          className="ph-otc-quick-item"
                          onClick={() => handleAddQuickOtcMed(item)}
                        >
                          <div className="ph-otc-quick-item-name">
                            <Pill />
                            {item.arabicName}
                          </div>
                          <div className="ph-otc-quick-item-strength">
                            {item.name}{item.strength ? ` · ${item.strength}` : ''}
                          </div>
                          <div className="ph-otc-quick-item-add">
                            <Plus />
                            إضافة إلى السلة
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <h3 className="ph-otc-subheading" style={{ marginTop: showOtcQuickList ? 24 : 0 }}>
                  <FilePlus />
                  إضافة دواء يدوياً
                </h3>
                <div className="ph-otc-manual">
                  <div className="ph-otc-manual-row">
                    <div className="ph-form-group">
                      <label className="ph-form-label">
                        <Pill />
                        اسم الدواء
                      </label>
                      <input
                        type="text"
                        className="ph-input"
                        placeholder="أدخل اسم الدواء"
                        value={otcNewMed.medicationName}
                        onChange={(e) => setOtcNewMed(prev => ({ ...prev, medicationName: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddManualOtcMed()}
                      />
                    </div>
                    <div className="ph-form-group narrow">
                      <label className="ph-form-label">الكمية</label>
                      <input
                        type="number"
                        min="1"
                        className="ph-input"
                        value={otcNewMed.quantity}
                        onChange={(e) => setOtcNewMed(prev => ({ ...prev, quantity: e.target.value }))}
                      />
                    </div>
                    <div className="ph-form-group narrow">
                      <label className="ph-form-label">السعر (ل.س)</label>
                      <input
                        type="number"
                        min="0"
                        className="ph-input"
                        value={otcNewMed.unitPrice}
                        onChange={(e) => setOtcNewMed(prev => ({ ...prev, unitPrice: e.target.value }))}
                      />
                    </div>
                    <button
                      type="button"
                      className="ph-btn primary"
                      onClick={handleAddManualOtcMed}
                    >
                      <Plus />
                      إضافة
                    </button>
                  </div>
                </div>
              </div>

              {/* Cart */}
              {otcCart.length > 0 && (
                <div className="ph-card">
                  <div className="ph-card-header">
                    <ShoppingBag className="ph-card-header-icon" />
                    <h2>السلة</h2>
                    <div className="ph-card-header-right">
                      <span className="ph-count-badge">{otcCart.length}</span>
                    </div>
                  </div>
                  <div className="ph-otc-cart">
                    {otcCart.map(item => (
                      <div key={item.id} className="ph-otc-cart-item">
                        <div className="ph-otc-cart-item-info">
                          <div className="ph-otc-cart-item-name">
                            <Pill />
                            {item.arabicName || item.medicationName}
                          </div>
                          <div className="ph-qty-group">
                            <label>الكمية:</label>
                            <input
                              type="number"
                              min="1"
                              className="ph-qty-input"
                              value={item.quantity}
                              onChange={(e) => handleUpdateOtcCartItem(item.id, 'quantity', e.target.value)}
                            />
                          </div>
                          <div className="ph-qty-group">
                            <label>سعر الوحدة:</label>
                            <input
                              type="number"
                              min="0"
                              className="ph-qty-input"
                              style={{ width: 92 }}
                              value={item.unitPrice}
                              onChange={(e) => handleUpdateOtcCartItem(item.id, 'unitPrice', e.target.value)}
                            />
                          </div>
                          <span className="ph-otc-cart-item-price">
                            {formatNumber((item.quantity || 0) * (item.unitPrice || 0))} ل.س
                          </span>
                        </div>
                        <button
                          type="button"
                          className="ph-otc-cart-remove"
                          onClick={() => handleRemoveOtcCartItem(item.id)}
                          aria-label="حذف"
                        >
                          <Trash2 />
                        </button>
                      </div>
                    ))}

                    <div className="ph-otc-total-row">
                      <span className="ph-otc-total-label">
                        <DollarSign />
                        الإجمالي
                      </span>
                      <span className="ph-otc-total-amount">
                        {formatNumber(otcTotal)} ل.س
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Dispense form */}
              {otcCart.length > 0 && (
                <div className="ph-card">
                  <div className="ph-card-header">
                    <Receipt className="ph-card-header-icon" />
                    <h2>تفاصيل الصرف</h2>
                  </div>
                  <div className="ph-form-group" style={{ marginBottom: 16 }}>
                    <label className="ph-form-label">
                      <Info />
                      سبب الصرف <span className="required">*</span>
                    </label>
                    <textarea
                      className="ph-textarea"
                      placeholder="مثال: ألم في الرأس، ارتفاع درجة الحرارة، إلخ"
                      value={otcReason}
                      onChange={(e) => setOtcReason(e.target.value)}
                      required
                    />
                  </div>
                  <div className="ph-form-group" style={{ marginBottom: 16 }}>
                    <label className="ph-form-label">
                      <FileText />
                      ملاحظات إضافية (اختياري)
                    </label>
                    <textarea
                      className="ph-textarea"
                      placeholder="أي ملاحظات إضافية..."
                      value={otcNotes}
                      onChange={(e) => setOtcNotes(e.target.value)}
                    />
                  </div>
                  <div className="ph-payment-row">
                    <span className="ph-payment-label">
                      <CreditCard />
                      طريقة الدفع:
                    </span>
                    <div className="ph-payment-options">
                      {PAYMENT_METHODS.map(pm => {
                        const IconPM = pm.icon;
                        return (
                          <button
                            key={pm.id}
                            type="button"
                            className={`ph-payment-btn ${otcPayment === pm.id ? 'active' : ''}`}
                            onClick={() => setOtcPayment(pm.id)}
                          >
                            <IconPM />
                            {pm.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="ph-btn success full-width"
                    onClick={handleOtcDispense}
                    disabled={otcDispensing || !otcReason.trim()}
                  >
                    {otcDispensing ? <div className="ph-btn-spinner" /> : <PackageCheck />}
                    إتمام عملية البيع
                  </button>
                </div>
              )}
              </>
              )}
            </>
          )}

          {/* ═══════════════ SECTION: HISTORY ═══════════════ */}
          {activeSection === 'history' && (
            <div className="ph-card">
              <div className="ph-card-header">
                <History className="ph-card-header-icon" />
                <h2>سجل الصرف</h2>
                <div className="ph-card-header-right">
                  <span className="ph-count-badge">{filteredHistory.length}</span>
                  <button
                    type="button"
                    className="ph-btn ghost"
                    onClick={loadHistory}
                    disabled={historyLoading}
                  >
                    <RefreshCw />
                    تحديث
                  </button>
                </div>
              </div>

              <div className="ph-toolbar">
                <div className="ph-search-wrap">
                  <Search className="ph-search-icon" />
                  <input
                    type="text"
                    className="ph-search-input"
                    placeholder="بحث برقم العملية، الوصفة، أو اسم المريض..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                  />
                </div>
                <div className="ph-filter-chips">
                  <button
                    type="button"
                    className={`ph-filter-chip ${historyFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setHistoryFilter('all')}
                  >
                    <ClipboardList />
                    الكل
                    <span className="ph-filter-chip-count">{dispensingHistory.length}</span>
                  </button>
                  <button
                    type="button"
                    className={`ph-filter-chip ${historyFilter === 'prescription_based' ? 'active' : ''}`}
                    onClick={() => setHistoryFilter('prescription_based')}
                  >
                    <ScrollText />
                    وصفات
                    <span className="ph-filter-chip-count">
                      {dispensingHistory.filter(h => h.dispensingType === 'prescription_based').length}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`ph-filter-chip ${historyFilter === 'otc' ? 'active' : ''}`}
                    onClick={() => setHistoryFilter('otc')}
                  >
                    <Pill />
                    بدون وصفة
                    <span className="ph-filter-chip-count">
                      {dispensingHistory.filter(h => h.dispensingType === 'otc').length}
                    </span>
                  </button>
                </div>
              </div>

              {historyLoading ? (
                <div className="ph-loading-inline">
                  <div className="ph-btn-spinner" />
                  <span>جاري تحميل السجل...</span>
                </div>
              ) : filteredHistory.length === 0 ? (
                <div className="ph-empty">
                  <ClipboardList />
                  <h3>لا توجد عمليات في السجل</h3>
                  <p>ستظهر هنا جميع عمليات الصرف التي تقوم بها</p>
                </div>
              ) : (
                <div className="ph-history-list">
                  {filteredHistory.map(rec => (
                    <div key={rec._id} className={`ph-history-card ${rec.dispensingType}`}>
                      <div className="ph-history-top">
                        <div className="ph-history-top-left">
                          <span className="ph-history-number">{rec.dispensingNumber}</span>
                          <span className="ph-history-date">{formatDateTime(rec.dispensingDate)}</span>
                        </div>
                        <span className={`ph-history-type ${rec.dispensingType}`}>
                          {rec.dispensingType === 'prescription_based'
                            ? <><ScrollText />وصفة طبية</>
                            : <><Pill />بدون وصفة</>}
                        </span>
                      </div>
                      <div className="ph-history-body">
                        <div className="ph-history-meds">
                          {(rec.medicationsDispensed || []).slice(0, 8).map((med, i) => (
                            <span key={i} className="ph-history-med-chip">
                              <Pill />
                              {med.medicationName} × {med.quantityDispensed}
                            </span>
                          ))}
                        </div>
                        {rec.prescriptionNumber && (
                          <div className="ph-history-rx-ref">
                            <ScrollText />
                            وصفة: {rec.prescriptionNumber}
                          </div>
                        )}
                        {rec.otcReason && (
                          <div className="ph-history-reason">
                            <Info />
                            السبب: {rec.otcReason}
                          </div>
                        )}
                        {rec.patientName && (
                          <div className="ph-history-rx-ref">
                            <User />
                            {rec.patientName}
                          </div>
                        )}
                        <div className="ph-history-meta-row">
                          {rec.paymentMethod && (
                            <span className="ph-history-meta-item">
                              <CreditCard />
                              {PAYMENT_METHODS.find(p => p.id === rec.paymentMethod)?.label || rec.paymentMethod}
                            </span>
                          )}
                          <span className="ph-history-meta-item amount">
                            <DollarSign />
                            {formatNumber(rec.totalCost || 0)} {rec.currency || 'ل.س'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═══════════════ SECTION: NOTIFICATIONS (inline view) ═══════════════ */}
          {activeSection === 'notifications' && (
            <div className="ph-card">
              <div className="ph-card-header">
                <Bell className="ph-card-header-icon" />
                <h2>جميع الإشعارات</h2>
                <div className="ph-card-header-right">
                  <span className="ph-count-badge">{notifications.length}</span>
                </div>
              </div>
              {notifications.length === 0 ? (
                <div className="ph-empty">
                  <Bell />
                  <h3>لا توجد إشعارات</h3>
                  <p>ستظهر هنا جميع التنبيهات المرسلة إليك</p>
                </div>
              ) : (
                <div className="ph-notif-list" style={{ padding: 0 }}>
                  {notifications.map(n => (
                    <div
                      key={n._id}
                      className={`ph-notif-item ${n.status !== 'read' ? 'unread' : ''}`}
                      onClick={() => n.status !== 'read' && handleMarkNotificationRead(n._id)}
                    >
                      <h4 className="ph-notif-item-title">{n.title}</h4>
                      <p className="ph-notif-item-msg">{n.message}</p>
                      <span className="ph-notif-item-time">{timeAgo(n.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </main>
      </div>

      {/* ═══════════════ NOTIFICATIONS SLIDE-IN PANEL ═══════════════ */}
      {notificationsPanelOpen && (
        <>
          <div
            className="ph-notif-backdrop"
            onClick={() => setNotificationsPanelOpen(false)}
          />
          <aside className="ph-notif-panel" role="dialog" aria-modal="true">
            <div className="ph-notif-header">
              <h2>
                <Bell />
                الإشعارات {unreadCount > 0 && <span className="ph-count-badge">{unreadCount}</span>}
              </h2>
              <button
                type="button"
                className="ph-modal-close"
                onClick={() => setNotificationsPanelOpen(false)}
                aria-label="إغلاق"
              >
                <X />
              </button>
            </div>
            <div className="ph-notif-list">
              {notifications.length === 0 ? (
                <div className="ph-empty">
                  <Bell />
                  <h3>لا توجد إشعارات</h3>
                  <p>لم يتم استلام أي تنبيهات بعد</p>
                </div>
              ) : (
                notifications.map(n => (
                  <div
                    key={n._id}
                    className={`ph-notif-item ${n.status !== 'read' ? 'unread' : ''}`}
                    onClick={() => n.status !== 'read' && handleMarkNotificationRead(n._id)}
                  >
                    <h4 className="ph-notif-item-title">{n.title}</h4>
                    <p className="ph-notif-item-msg">{n.message}</p>
                    <span className="ph-notif-item-time">{timeAgo(n.createdAt)}</span>
                  </div>
                ))
              )}
            </div>
          </aside>
        </>
      )}

      {/* ═══════════════ GENERIC MODAL (alerts + confirmations) ═══════════════ */}
      <Modal isOpen={modal.isOpen} onClose={closeModal}>
        <div className={`ph-modal-header ${modal.variant}`}>
          {modal.variant === 'success' && <CheckCircle2 className="ph-modal-icon" />}
          {modal.variant === 'error'   && <XCircle className="ph-modal-icon" />}
          {modal.variant === 'warning' && <AlertTriangle className="ph-modal-icon" />}
          {modal.variant === 'info'    && <Info className="ph-modal-icon" />}
          <h3>{modal.title}</h3>
          <button
            type="button"
            className="ph-modal-close"
            onClick={closeModal}
            aria-label="إغلاق"
          >
            <X />
          </button>
        </div>
        <div className="ph-modal-body">
          <p style={{ whiteSpace: 'pre-wrap' }}>{modal.message}</p>
        </div>
        <div className="ph-modal-footer">
          {modal.onConfirm && (
            <button type="button" className="ph-btn secondary" onClick={closeModal}>
              {modal.cancelLabel}
            </button>
          )}
          <button
            type="button"
            className={`ph-btn ${modal.variant === 'error' || modal.variant === 'warning' ? 'danger' : 'primary'}`}
            onClick={() => {
              const action = modal.onConfirm;
              closeModal();
              if (action) action();
            }}
          >
            {modal.confirmLabel}
          </button>
        </div>
      </Modal>

      {/* ═══════════════ ALLERGY CONFIRMATION MODAL ═══════════════ */}
      <Modal isOpen={allergyConfirmOpen} onClose={() => setAllergyConfirmOpen(false)} size="md">
        <div className="ph-modal-header error">
          <AlertTriangle className="ph-modal-icon" />
          <h3>تحذير: تعارض مع حساسية المريض</h3>
          <button
            type="button"
            className="ph-modal-close"
            onClick={() => setAllergyConfirmOpen(false)}
            aria-label="إغلاق"
          >
            <X />
          </button>
        </div>
        <div className="ph-modal-body">
          <div className="ph-modal-icon-lg error">
            <ShieldAlert />
          </div>
          <p style={{ textAlign: 'center', fontWeight: 700, color: 'var(--tm-error)' }}>
            المريض لديه حساسية مسجلة قد تتعارض مع الأدوية التالية
          </p>
          <div style={{ background: 'var(--tm-error-light)', padding: 16, borderRadius: 12, margin: '14px 0' }}>
            <ul style={{ margin: 0, paddingInlineStart: 20 }}>
              {allergyConflicts.map((c, i) => (
                <li key={i} style={{ marginBottom: 6, color: 'var(--tm-text)' }}>
                  <strong>{c.medicationName}</strong> ↔ حساسية <strong style={{ color: 'var(--tm-error)' }}>{c.allergy}</strong>
                </li>
              ))}
            </ul>
          </div>
          <p style={{ fontSize: '0.88rem', color: 'var(--tm-text-muted)' }}>
            هل أنت متأكد من المتابعة؟ يُنصح بإلغاء الصرف والتواصل مع الطبيب المعالج.
          </p>
        </div>
        <div className="ph-modal-footer">
          <button
            type="button"
            className="ph-btn secondary"
            onClick={() => setAllergyConfirmOpen(false)}
          >
            إلغاء الصرف
          </button>
          <button
            type="button"
            className="ph-btn danger"
            onClick={() => {
              setAllergyConfirmOpen(false);
              // Continue to the next gate (controlled substances) or dispense
              if (controlledSubstances.length > 0) {
                setControlledConfirmOpen(true);
              } else {
                performDispensePrescription();
              }
            }}
          >
            <ShieldAlert />
            المتابعة على مسؤوليتي
          </button>
        </div>
      </Modal>

      {/* ═══════════════ CONTROLLED SUBSTANCE CONFIRMATION MODAL ═══════════════ */}
      <Modal isOpen={controlledConfirmOpen} onClose={() => setControlledConfirmOpen(false)} size="md">
        <div className="ph-modal-header warning">
          <ShieldAlert className="ph-modal-icon" />
          <h3>تأكيد صرف مواد خاضعة للرقابة</h3>
          <button
            type="button"
            className="ph-modal-close"
            onClick={() => setControlledConfirmOpen(false)}
            aria-label="إغلاق"
          >
            <X />
          </button>
        </div>
        <div className="ph-modal-body">
          <div className="ph-modal-icon-lg warning">
            <Lock />
          </div>
          <p style={{ textAlign: 'center', fontWeight: 700 }}>
            الأدوية التالية خاضعة للرقابة وفقاً للوائح وزارة الصحة
          </p>
          <div style={{ background: 'var(--tm-warning-light)', padding: 16, borderRadius: 12, margin: '14px 0' }}>
            {controlledSubstances.map((med, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '6px 0',
                borderBottom: i < controlledSubstances.length - 1 ? '1px dashed var(--tm-divider)' : 'none'
              }}>
                <Pill style={{ width: 16, height: 16, color: 'var(--tm-warning)' }} />
                <strong>{med.medicationName}</strong>
                <span style={{ color: 'var(--tm-text-muted)', fontSize: '0.84rem' }}>{med.dosage}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '0.88rem', color: 'var(--tm-text-muted)' }}>
            يجب التحقق من هوية المريض وصحة الوصفة. سيتم تسجيل هذه العملية ضمن سجلات المواد الخاضعة للرقابة.
          </p>
        </div>
        <div className="ph-modal-footer">
          <button
            type="button"
            className="ph-btn secondary"
            onClick={() => setControlledConfirmOpen(false)}
          >
            إلغاء
          </button>
          <button
            type="button"
            className="ph-btn primary"
            onClick={() => {
              setControlledConfirmOpen(false);
              performDispensePrescription();
            }}
          >
            <ShieldCheck />
            تأكيد الصرف
          </button>
        </div>
      </Modal>

      {/* ═══════════════ RECEIPT PREVIEW MODAL ═══════════════ */}
      <Modal isOpen={receiptOpen} onClose={() => setReceiptOpen(false)} size="md">
        <div className="ph-modal-header success">
          <CheckCircle2 className="ph-modal-icon" />
          <h3>تم الصرف بنجاح</h3>
          <button
            type="button"
            className="ph-modal-close"
            onClick={() => setReceiptOpen(false)}
            aria-label="إغلاق"
          >
            <X />
          </button>
        </div>
        <div className="ph-modal-body">
          {receiptData && (
            <div className="ph-receipt">
              <div className="ph-receipt-header">
                <HeartPulse />
                <h2>{receiptData.pharmacyName}</h2>
                <p>Patient 360° — منصة طبية وطنية سورية</p>
              </div>
              <div className="ph-receipt-meta">
                <div className="ph-receipt-meta-row">
                  <span>رقم العملية:</span>
                  <strong>{receiptData.dispensingNumber}</strong>
                </div>
                {receiptData.prescriptionNumber && (
                  <div className="ph-receipt-meta-row">
                    <span>رقم الوصفة:</span>
                    <strong>{receiptData.prescriptionNumber}</strong>
                  </div>
                )}
                <div className="ph-receipt-meta-row">
                  <span>التاريخ:</span>
                  <strong>{formatDateTime(receiptData.dispensingDate)}</strong>
                </div>
                {receiptData.patientName && (
                  <div className="ph-receipt-meta-row">
                    <span>المريض:</span>
                    <strong>{receiptData.patientName}</strong>
                  </div>
                )}
                {receiptData.nationalId && (
                  <div className="ph-receipt-meta-row">
                    <span>الرقم الوطني:</span>
                    <strong>{receiptData.nationalId}</strong>
                  </div>
                )}
                <div className="ph-receipt-meta-row">
                  <span>الصيدلي:</span>
                  <strong>{receiptData.pharmacistName}</strong>
                </div>
              </div>
              <hr className="ph-receipt-divider" />
              <div className="ph-receipt-meds">
                <h4>الأدوية المصروفة</h4>
                <table>
                  <thead>
                    <tr>
                      <th>الدواء</th>
                      <th>الكمية</th>
                      <th>الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiptData.medications.map((m, i) => (
                      <tr key={i}>
                        <td>{m.name}</td>
                        <td className="qty">{m.quantity}</td>
                        <td className="price">{formatNumber(m.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="ph-receipt-total">
                <span>الإجمالي الكلي</span>
                <span className="ph-receipt-total-amount">
                  {formatNumber(receiptData.totalCost)} {receiptData.currency === 'SYP' ? 'ل.س' : receiptData.currency}
                </span>
              </div>
              <div className="ph-receipt-footer">
                <p>طريقة الدفع: {PAYMENT_METHODS.find(p => p.id === receiptData.paymentMethod)?.label || receiptData.paymentMethod}</p>
                <p>شكراً لاختياركم صيدليتنا — دمتم بصحة وعافية</p>
              </div>
            </div>
          )}
        </div>
        <div className="ph-modal-footer">
          <button
            type="button"
            className="ph-btn secondary"
            onClick={() => setReceiptOpen(false)}
          >
            إغلاق
          </button>
          <button
            type="button"
            className="ph-btn primary"
            onClick={handlePrintReceipt}
          >
            <Printer />
            طباعة الإيصال
          </button>
        </div>
      </Modal>

    </div>
  );
};

export default PharmacistDashboard;