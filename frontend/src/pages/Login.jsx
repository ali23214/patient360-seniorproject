/**
 * ═══════════════════════════════════════════════════════════════════
 *  Patient 360° — Login Page
 *  ───────────────────────────────────────────────────────────────────
 *  Stack       : React 18 + React Router v6 + Lucide React
 *  Design      : Teal Medica (Light + Dark via [data-theme])
 *  Direction   : RTL (Arabic primary)
 *  Backend     : authAPI from src/services/api.js
 *  DB enums    : roles match accounts.roles in patient360_db_final.js
 * ═══════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  // Form & auth
  Mail,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  X,
  Loader2,
  RefreshCw,
  Check,

  // Page sections
  Hospital,
  BarChart3,
  ShieldCheck,
  Network,
  ClipboardList,
  CalendarDays,
  Pill,
  TrendingUp,
  Bell,
  Globe,
  Target,
  Zap,
  MapPin,
  Phone,
  AtSign,

  // Team / about
  Stethoscope,
  Users,

  // Stats (NEW)
  Building2,
  Activity,
  Headset,

  // Forgot password
  KeyRound,
  ShieldQuestion,
  Send,
} from 'lucide-react';

import Navbar from '../components/common/Navbar';
import FooterBrand from '../components/common/FooterBrand';
import { authAPI } from '../services/api';
import '../styles/Login.css';


/* ───────────────────────────────────────────────────────────────────
   CONSTANTS — kept outside component
   ─────────────────────────────────────────────────────────────────── */

/**
 * Dashboard routes — aligned with App.js routes and the
 * accounts.roles enum from patient360_db_final.js:
 *   patient | doctor | admin | pharmacist | lab_technician | dentist
 * 
 * 
 */

/* LinkedIn brand mark — inline SVG (lucide-react dropped this export) */

/* ───────────────────────────────────────────────────────────────────
   BRAND ICONS — inline SVG (lucide-react dropped these exports)
   ─────────────────────────────────────────────────────────────────── */

const brandIconProps = (size, strokeWidth) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
});

const LinkedinIcon = ({ size = 16, strokeWidth = 2 }) => (
  <svg {...brandIconProps(size, strokeWidth)}>
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect x="2" y="9" width="4" height="12" />
    <circle cx="4" cy="4" r="2" />
  </svg>
);

const TwitterIcon = ({ size = 16, strokeWidth = 2 }) => (
  <svg {...brandIconProps(size, strokeWidth)}>
    <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
  </svg>
);

const FacebookIcon = ({ size = 18, strokeWidth = 2 }) => (
  <svg {...brandIconProps(size, strokeWidth)}>
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);


const DASHBOARD_ROUTES = Object.freeze({
  patient: '/patient-dashboard',
  doctor: '/doctor-dashboard',
  admin: '/admin-dashboard',
  pharmacist: '/pharmacist-dashboard',
  lab_technician: '/lab-dashboard',
  dentist: '/dentist-dashboard',
});

const ROLE_LABELS_AR = Object.freeze({
  patient: 'مريض',
  doctor: 'طبيب',
  admin: 'مسؤول النظام',
  pharmacist: 'صيدلي',
  lab_technician: 'فني مختبر',
  dentist: 'طبيب أسنان',
});

/* ───────────────────────────────────────────────────────────────────
   VALIDATION HELPERS
   ─────────────────────────────────────────────────────────────────── */

const isValidEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const validatePassword = (password) => {
  const minLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  return {
    isValid: minLength && hasUppercase && hasLowercase && hasNumber,
    minLength,
    hasUppercase,
    hasLowercase,
    hasNumber,
    hasSpecial,
  };
};

/* ───────────────────────────────────────────────────────────────────
   ANIMATED COUNTER COMPONENT  (for premium stat cards)
   ───────────────────────────────────────────────────────────────────
   Counts from 0 → `to` when scrolled into view.
   - Uses requestAnimationFrame with ease-out cubic easing
   - Triggered exactly once via IntersectionObserver
   - Respects prefers-reduced-motion (snaps to final value)
   - `format` function controls how the running value is displayed,
     allowing custom suffixes like "+", "%", "M+", etc.
   ─────────────────────────────────────────────────────────────────── */

const AnimatedCounter = ({ to, format, duration = 1800 }) => {
  const ref = useRef(null);
  const [display, setDisplay] = useState(() => format(0));
  const startedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Honor user motion preference — snap straight to final value
    const prefersReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    if (prefersReduced) {
      setDisplay(format(to));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !startedRef.current) {
            startedRef.current = true;
            const start = performance.now();

            const tick = (now) => {
              const elapsed = now - start;
              const progress = Math.min(elapsed / duration, 1);
              // Ease-out cubic — fast start, gentle finish (Apple-style)
              const eased = 1 - Math.pow(1 - progress, 3);
              setDisplay(format(to * eased));
              if (progress < 1) {
                requestAnimationFrame(tick);
              } else {
                setDisplay(format(to));
              }
            };

            requestAnimationFrame(tick);
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [to, format, duration]);

  return <span ref={ref}>{display}</span>;
};

/* ═══════════════════════════════════════════════════════════════════
   LOGIN PAGE
   ═══════════════════════════════════════════════════════════════════ */

const Login = () => {
  const navigate = useNavigate();

  /* ── Login form state ──────────────────────────────────────────── */
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  /* ── Hero feature carousel ─────────────────────────────────────── */
  const [currentSlide, setCurrentSlide] = useState(0);

  /* ── Contact form ──────────────────────────────────────────────── */
  const [contactData, setContactData] = useState({
    name: '',
    email: '',
    phone: '',
    message: '',
  });

  /* ── Generic alert modal ───────────────────────────────────────── */
  const [modal, setModal] = useState({
    isOpen: false,
    type: '',
    title: '',
    message: '',
    onClose: null,
  });

  /* ── Forgot password modal state ───────────────────────────────── */
  const [fpModal, setFpModal] = useState({
    isOpen: false,
    step: 1,
    email: '',
    otp: ['', '', '', '', '', ''],
    newPassword: '',
    confirmPassword: '',
    isLoading: false,
    error: '',
    resendTimer: 0,
    showNewPassword: false,
    showConfirmPassword: false,
  });

  const otpInputsRef = useRef([]);

  /* ── Stats grid (premium reveal-on-scroll) ─────────────────────── */
  const statsRef = useRef(null);

  /* ─── Hero features (carousel) ─── */
  const features = useMemo(
    () => [
      {
        title: 'إدارة متكاملة للمرضى',
        description: 'نظام شامل لإدارة السجلات الطبية والمواعيد والوصفات الطبية',
        Icon: Hospital,
        highlight: 'رعاية صحية متقدمة',
      },
      {
        title: 'تحليلات ذكية',
        description: 'رؤى عميقة وتقارير مفصلة لتحسين جودة الرعاية الصحية',
        Icon: BarChart3,
        highlight: 'قرارات مبنية على البيانات',
      },
      {
        title: 'أمان على مستوى طبي',
        description: 'حماية البيانات بأعلى معايير الأمان الطبي العالمية',
        Icon: ShieldCheck,
        highlight: 'خصوصية مضمونة',
      },
      {
        title: 'تكامل سلس',
        description: 'ربط جميع الأقسام الطبية في منصة واحدة متكاملة',
        Icon: Network,
        highlight: 'كفاءة تشغيلية عالية',
      },
    ],
    []
  );

  /* ─── Services ─── */
  const services = useMemo(
    () => [
      {
        Icon: ClipboardList,
        title: 'السجلات الطبية الإلكترونية',
        description: 'إدارة شاملة للسجلات الطبية مع إمكانية الوصول الفوري والآمن',
      },
      {
        Icon: CalendarDays,
        title: 'نظام المواعيد الذكي',
        description: 'جدولة مواعيد ذكية مع تذكيرات تلقائية وإدارة قوائم الانتظار',
      },
      {
        Icon: Pill,
        title: 'إدارة الوصفات الطبية',
        description: 'نظام متكامل للوصفات الإلكترونية مع تتبع الأدوية والتفاعلات',
      },
      {
        Icon: TrendingUp,
        title: 'التقارير والتحليلات',
        description: 'لوحات تحكم تفاعلية وتقارير مفصلة لاتخاذ قرارات مستنيرة',
      },
      {
        Icon: Bell,
        title: 'نظام التنبيهات',
        description: 'تنبيهات ذكية للمواعيد والأدوية والمتابعات الطبية',
      },
      {
        Icon: Globe,
        title: 'البوابة الإلكترونية',
        description: 'بوابة تفاعلية للمرضى للوصول إلى سجلاتهم ونتائج الفحوصات',
      },
    ],
    []
  );

  /* ─── Team ─── */
  const teamMembers = useMemo(
    () => [
      {
        name: 'معاذ جبري',
        role: 'المدير التنفيذي',
        Icon: Stethoscope,
        bio: 'خبرة 15 عاماً في التحول الرقمي الصحي',
      },
      {
        name: 'أنس النابلسي',
        role: 'مدير التطوير',
        Icon: Users,
        bio: 'متخصص في أنظمة المعلومات الطبية',
      },
      {
        name: 'علي راعي',
        role: 'مدير التقنية',
        Icon: ShieldCheck,
        bio: 'خبير في الأمن السيبراني والبنية التحتية',
      },
      {
        name: 'كنان المجذوب',
        role: 'مدير العمليات',
        Icon: BarChart3,
        bio: 'رائد في تحسين العمليات الصحية',
      },
    ],
    []
  );

  /* ─── Stats (data-driven, single source of truth) ───
     Each entry has either:
       • `to` + `format`  → animates with AnimatedCounter
       • `value`          → renders as static text (for non-numeric like 24/7)
     Format functions are stable across renders thanks to useMemo. */
  const stats = useMemo(
    () => [
      {
        Icon: Building2,
        to: 500,
        format: (n) => `+${Math.round(n)}`,
        label: 'مؤسسة صحية مشتركة',
      },
      {
        Icon: Users,
        to: 1_000_000,
        format: (n) => {
          if (n >= 999_999) return '+1M';
          if (n >= 1000) return `+${Math.round(n / 1000)}K`;
          return `+${Math.round(n)}`;
        },
        label: 'مريض مخدوم بعد الإطلاق',
      },
      {
        Icon: Activity,
        to: 99.9,
        format: (n) => `${n.toFixed(1)}%`,
        label: 'وقت التشغيل',
      },
      {
        Icon: Headset,
        value: '24/7',
        label: 'دعم فني متواصل',
      },
    ],
    []
  );

  /* ─────────────────────────────────────────────────────────────────
     EFFECTS
     ───────────────────────────────────────────────────────────────── */

  /* Carousel auto-rotate */
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % features.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [features.length]);

  /* Auto-redirect if already logged in */
  useEffect(() => {
    try {
      const stored = localStorage.getItem('currentUser');
      if (!stored) return;

      const user = JSON.parse(stored);
      const role = user.role || (Array.isArray(user.roles) && user.roles[0]);
      const route = DASHBOARD_ROUTES[role];
      if (route) navigate(route);
    } catch (err) {
      console.error('[Login] Failed to parse currentUser:', err);
      localStorage.removeItem('currentUser');
    }
  }, [navigate]);

  /* Resend OTP timer */
  useEffect(() => {
    if (fpModal.resendTimer <= 0) return;
    const interval = setInterval(() => {
      setFpModal((prev) => ({ ...prev, resendTimer: prev.resendTimer - 1 }));
    }, 1000);
    return () => clearInterval(interval);
  }, [fpModal.resendTimer]);

  /* Reveal-on-scroll: add `.is-visible` to all stat cards when the
     container enters the viewport. CSS handles the staggered cascade
     via :nth-child transition-delays. Triggered exactly once. */
  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            el.querySelectorAll('.p360-stat').forEach((card) => {
              card.classList.add('is-visible');
            });
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.2 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
     LOGIN HANDLER
     ───────────────────────────────────────────────────────────────── */

  const handleLogin = useCallback(
    async (e) => {
      e.preventDefault();
      setLoginError('');

      const trimmedEmail = email.trim().toLowerCase();

      if (!trimmedEmail) {
        setLoginError('الرجاء إدخال البريد الإلكتروني');
        return;
      }
      if (!isValidEmail(trimmedEmail)) {
        setLoginError('الرجاء إدخال بريد إلكتروني صحيح');
        return;
      }
      if (!password) {
        setLoginError('الرجاء إدخال كلمة المرور');
        return;
      }

      setIsLoading(true);

      try {
        const response = await authAPI.login({
          email: trimmedEmail,
          password,
        });

        const user = response.user;
        const primaryRole =
          user.role || (Array.isArray(user.roles) && user.roles[0]);

        if (!primaryRole || !DASHBOARD_ROUTES[primaryRole]) {
          throw new Error('دور المستخدم غير معروف');
        }

        // Persist remember-me preference (optional UX enhancement)
        if (rememberMe) {
          localStorage.setItem('p360-remember-email', trimmedEmail);
        } else {
          localStorage.removeItem('p360-remember-email');
        }

        setIsLoading(false);

        openModal(
          'success',
          'تم تسجيل الدخول بنجاح',
          `مرحباً ${user.firstName} ${user.lastName}\n\nتم تسجيل دخولك كـ ${ROLE_LABELS_AR[primaryRole]}`,
          () => navigate(DASHBOARD_ROUTES[primaryRole])
        );
      } catch (error) {
        setIsLoading(false);
        console.error('[Login] Error:', error);

        const errorMessage =
          error?.message ||
          error?.error ||
          'حدث خطأ أثناء تسجيل الدخول. الرجاء المحاولة مرة أخرى';

        setLoginError(errorMessage);
      }
    },
    [email, password, rememberMe, navigate, openModal]
  );

  /* Restore remembered email */
  useEffect(() => {
    const remembered = localStorage.getItem('p360-remember-email');
    if (remembered) {
      setEmail(remembered);
      setRememberMe(true);
    }
  }, []);

  /* ─────────────────────────────────────────────────────────────────
     CONTACT FORM HANDLER
     ───────────────────────────────────────────────────────────────── */

  const handleContactSubmit = useCallback(
    (e) => {
      e.preventDefault();
      console.log('[Contact] Submission:', contactData);
      openModal(
        'success',
        'تم إرسال الرسالة',
        'تم إرسال رسالتك بنجاح!\n\nسنتواصل معك قريباً.'
      );
      setContactData({ name: '', email: '', phone: '', message: '' });
    },
    [contactData, openModal]
  );

  /* ─────────────────────────────────────────────────────────────────
     FORGOT PASSWORD HANDLERS
     ───────────────────────────────────────────────────────────────── */

  const openFpModal = useCallback((e) => {
    if (e?.preventDefault) e.preventDefault();
    setFpModal({
      isOpen: true,
      step: 1,
      email: '',
      otp: ['', '', '', '', '', ''],
      newPassword: '',
      confirmPassword: '',
      isLoading: false,
      error: '',
      resendTimer: 0,
      showNewPassword: false,
      showConfirmPassword: false,
    });
  }, []);

  const closeFpModal = useCallback(() => {
    setFpModal((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handleSendOTP = useCallback(async () => {
    const target = fpModal.email.trim().toLowerCase();
    if (!target) {
      setFpModal((p) => ({ ...p, error: 'الرجاء إدخال البريد الإلكتروني' }));
      return;
    }
    if (!isValidEmail(target)) {
      setFpModal((p) => ({ ...p, error: 'الرجاء إدخال بريد إلكتروني صحيح' }));
      return;
    }

    setFpModal((p) => ({ ...p, isLoading: true, error: '' }));

    try {
      await authAPI.forgotPassword({ email: target });
      setFpModal((p) => ({
        ...p,
        isLoading: false,
        step: 2,
        resendTimer: 60,
        error: '',
      }));
    } catch (error) {
      console.error('[FP] Send OTP error:', error);
      setFpModal((p) => ({
        ...p,
        isLoading: false,
        error: error?.message || 'حدث خطأ أثناء إرسال رمز التحقق',
      }));
    }
  }, [fpModal.email]);

  const handleOtpChange = useCallback((index, value) => {
    if (value && !/^\d$/.test(value)) return;
    setFpModal((prev) => {
      const newOtp = [...prev.otp];
      newOtp[index] = value;
      return { ...prev, otp: newOtp, error: '' };
    });
    if (value && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }
  }, []);

  const handleOtpKeyDown = useCallback((index, e) => {
    if (e.key === 'Backspace' && !fpModal.otp[index] && index > 0) {
      otpInputsRef.current[index - 1]?.focus();
    }
  }, [fpModal.otp]);

  const handleOtpPaste = useCallback((e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').slice(0, 6);
    if (!/^\d+$/.test(pasted)) return;

    setFpModal((prev) => {
      const newOtp = [...prev.otp];
      pasted.split('').forEach((char, i) => {
        if (i < 6) newOtp[i] = char;
      });
      return { ...prev, otp: newOtp, error: '' };
    });

    const nextEmpty = pasted.length >= 6 ? 5 : pasted.length;
    setTimeout(() => otpInputsRef.current[nextEmpty]?.focus(), 0);
  }, []);

  const handleVerifyOTP = useCallback(async () => {
    const otpCode = fpModal.otp.join('');
    if (otpCode.length !== 6) {
      setFpModal((p) => ({ ...p, error: 'الرجاء إدخال رمز التحقق كاملاً' }));
      return;
    }

    setFpModal((p) => ({ ...p, isLoading: true, error: '' }));

    try {
      await authAPI.verifyOTP({ email: fpModal.email, otp: otpCode });
      setFpModal((p) => ({ ...p, isLoading: false, step: 3, error: '' }));
    } catch (error) {
      console.error('[FP] Verify OTP error:', error);
      setFpModal((p) => ({
        ...p,
        isLoading: false,
        error: error?.message || 'رمز التحقق غير صحيح',
      }));
    }
  }, [fpModal.email, fpModal.otp]);

  const handleResetPassword = useCallback(async () => {
    const { newPassword, confirmPassword } = fpModal;

    if (!newPassword) {
      setFpModal((p) => ({ ...p, error: 'الرجاء إدخال كلمة المرور الجديدة' }));
      return;
    }

    const v = validatePassword(newPassword);
    if (!v.isValid) {
      setFpModal((p) => ({
        ...p,
        error: 'كلمة المرور يجب أن تحتوي على 8 أحرف على الأقل، حرف كبير، حرف صغير، ورقم',
      }));
      return;
    }

    if (newPassword !== confirmPassword) {
      setFpModal((p) => ({ ...p, error: 'كلمتا المرور غير متطابقتين' }));
      return;
    }

    setFpModal((p) => ({ ...p, isLoading: true, error: '' }));

    try {
      await authAPI.resetPassword({
        email: fpModal.email,
        otp: fpModal.otp.join(''),
        newPassword,
      });
      setFpModal((p) => ({ ...p, isLoading: false, step: 4, error: '' }));
    } catch (error) {
      console.error('[FP] Reset password error:', error);
      setFpModal((p) => ({
        ...p,
        isLoading: false,
        error: error?.message || 'حدث خطأ أثناء إعادة تعيين كلمة المرور',
      }));
    }
  }, [fpModal]);

  const handleResendOTP = useCallback(async () => {
    if (fpModal.resendTimer > 0) return;
    setFpModal((p) => ({ ...p, isLoading: true, error: '' }));

    try {
      await authAPI.forgotPassword({ email: fpModal.email });
      setFpModal((p) => ({
        ...p,
        isLoading: false,
        resendTimer: 60,
        otp: ['', '', '', '', '', ''],
        error: '',
      }));
      otpInputsRef.current[0]?.focus();
    } catch (error) {
      console.error('[FP] Resend OTP error:', error);
      setFpModal((p) => ({
        ...p,
        isLoading: false,
        error: error?.message || 'حدث خطأ أثناء إعادة إرسال رمز التحقق',
      }));
    }
  }, [fpModal.email, fpModal.resendTimer]);

  /* ═════════════════════════════════════════════════════════════════
     RENDER — Forgot password sub-renderers
     ═════════════════════════════════════════════════════════════════ */

  const renderFpStepProgress = () => {
    if (fpModal.step === 4) return null;
    const steps = [
      { num: 1, label: 'البريد' },
      { num: 2, label: 'التحقق' },
      { num: 3, label: 'كلمة المرور' },
    ];

    return (
      <div className="fp-step-progress">
        {steps.map((s, index) => (
          <React.Fragment key={s.num}>
            <div
              className={`fp-step ${fpModal.step >= s.num ? 'active' : ''} ${
                fpModal.step > s.num ? 'completed' : ''
              }`}
            >
              <div className="fp-step-number">
                {fpModal.step > s.num ? <Check size={14} strokeWidth={3} /> : s.num}
              </div>
              <span className="fp-step-label">{s.label}</span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`fp-step-connector ${
                  fpModal.step > s.num ? 'completed' : ''
                }`}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  };

  const renderFpContent = () => {
    const {
      step,
      email: fpEmail,
      otp,
      newPassword,
      confirmPassword,
      isLoading: fpLoading,
      error,
      resendTimer,
      showNewPassword,
      showConfirmPassword,
    } = fpModal;

    if (step === 1) {
      return (
        <>
          <div className="fp-modal-header">
            <div className="fp-icon-container">
              <div className="fp-icon">
                <KeyRound size={36} strokeWidth={2} />
              </div>
              <div className="fp-icon-pulse" />
            </div>
            <h2 className="fp-title">استعادة كلمة المرور</h2>
            <p className="fp-subtitle">أدخل بريدك الإلكتروني لإرسال رمز التحقق</p>
          </div>

          <div className="fp-modal-body">
            {error && (
              <div className="fp-error-alert">
                <AlertCircle size={18} strokeWidth={2.2} />
                <span>{error}</span>
              </div>
            )}

            <div className="fp-form-group">
              <label className="fp-label" htmlFor="fp-email">البريد الإلكتروني</label>
              <div className="fp-input-wrapper">
                <span className="fp-input-icon" aria-hidden="true">
                  <Mail size={18} strokeWidth={2} />
                </span>
                <input
                  id="fp-email"
                  type="email"
                  className="fp-input"
                  placeholder="example@domain.com"
                  value={fpEmail}
                  onChange={(e) =>
                    setFpModal((p) => ({ ...p, email: e.target.value, error: '' }))
                  }
                  disabled={fpLoading}
                  dir="ltr"
                  autoFocus
                />
              </div>
            </div>

            <button
              type="button"
              className="fp-button primary"
              onClick={handleSendOTP}
              disabled={fpLoading}
            >
              {fpLoading ? (
                <span className="fp-loading">
                  <Loader2 size={20} className="fp-spin" />
                  جارٍ الإرسال...
                </span>
              ) : (
                <>
                  <Send size={18} strokeWidth={2.2} />
                  <span>إرسال رمز التحقق</span>
                </>
              )}
            </button>
          </div>

          <div className="fp-modal-footer">
            <button type="button" className="fp-link-button" onClick={closeFpModal}>
              العودة لتسجيل الدخول
            </button>
          </div>
        </>
      );
    }

    if (step === 2) {
      return (
        <>
          <div className="fp-modal-header">
            <div className="fp-icon-container">
              <div className="fp-icon otp">
                <ShieldQuestion size={36} strokeWidth={2} />
              </div>
              <div className="fp-icon-pulse" />
            </div>
            <h2 className="fp-title">التحقق من الهوية</h2>
            <p className="fp-subtitle">
              أدخل رمز التحقق المرسل إلى
              <br />
              <span className="fp-email-highlight">{fpEmail}</span>
            </p>
          </div>

          <div className="fp-modal-body">
            {error && (
              <div className="fp-error-alert">
                <AlertCircle size={18} strokeWidth={2.2} />
                <span>{error}</span>
              </div>
            )}

            <div className="fp-otp-container">
              <label className="fp-label centered">رمز التحقق</label>
              <div className="fp-otp-inputs" dir="ltr">
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => (otpInputsRef.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    className={`fp-otp-input ${digit ? 'filled' : ''}`}
                    value={digit}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    onPaste={handleOtpPaste}
                    disabled={fpLoading}
                    autoFocus={index === 0}
                    aria-label={`رقم ${index + 1} من رمز التحقق`}
                  />
                ))}
              </div>
            </div>

            <button
              type="button"
              className="fp-button primary"
              onClick={handleVerifyOTP}
              disabled={fpLoading || otp.join('').length !== 6}
            >
              {fpLoading ? (
                <span className="fp-loading">
                  <Loader2 size={20} className="fp-spin" />
                  جارٍ التحقق...
                </span>
              ) : (
                <>
                  <Check size={18} strokeWidth={2.5} />
                  <span>تحقق من الرمز</span>
                </>
              )}
            </button>

            <div className="fp-resend-container">
              {resendTimer > 0 ? (
                <p className="fp-resend-timer">
                  إعادة الإرسال بعد <span className="timer">{resendTimer}</span> ثانية
                </p>
              ) : (
                <button
                  type="button"
                  className="fp-resend-button"
                  onClick={handleResendOTP}
                  disabled={fpLoading}
                >
                  <RefreshCw size={14} strokeWidth={2.2} />
                  إعادة إرسال الرمز
                </button>
              )}
            </div>
          </div>

          <div className="fp-modal-footer">
            <button
              type="button"
              className="fp-link-button"
              onClick={() =>
                setFpModal((p) => ({ ...p, step: 1, error: '' }))
              }
            >
              <ArrowRight size={14} strokeWidth={2.2} />
              تغيير البريد الإلكتروني
            </button>
          </div>
        </>
      );
    }

    if (step === 3) {
      const v = validatePassword(newPassword);
      return (
        <>
          <div className="fp-modal-header">
            <div className="fp-icon-container">
              <div className="fp-icon success-icon">
                <Lock size={36} strokeWidth={2} />
              </div>
              <div className="fp-icon-pulse success" />
            </div>
            <h2 className="fp-title">كلمة مرور جديدة</h2>
            <p className="fp-subtitle">أنشئ كلمة مرور قوية وآمنة</p>
          </div>

          <div className="fp-modal-body">
            {error && (
              <div className="fp-error-alert">
                <AlertCircle size={18} strokeWidth={2.2} />
                <span>{error}</span>
              </div>
            )}

            <div className="fp-form-group">
              <label className="fp-label" htmlFor="fp-new-password">كلمة المرور الجديدة</label>
              <div className="fp-input-wrapper password">
                <span className="fp-input-icon" aria-hidden="true">
                  <Lock size={18} strokeWidth={2} />
                </span>
                <input
                  id="fp-new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  className="fp-input"
                  placeholder="أدخل كلمة المرور الجديدة"
                  value={newPassword}
                  onChange={(e) =>
                    setFpModal((p) => ({ ...p, newPassword: e.target.value, error: '' }))
                  }
                  disabled={fpLoading}
                  dir="ltr"
                  autoFocus
                />
                <button
                  type="button"
                  className="fp-toggle-password"
                  onClick={() =>
                    setFpModal((p) => ({ ...p, showNewPassword: !p.showNewPassword }))
                  }
                  aria-label={showNewPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  {showNewPassword ? (
                    <EyeOff size={18} strokeWidth={2} />
                  ) : (
                    <Eye size={18} strokeWidth={2} />
                  )}
                </button>
              </div>
            </div>

            {newPassword && (
              <div className="fp-password-strength">
                <div className="fp-strength-bars">
                  <div className={`fp-strength-bar ${v.minLength ? 'active' : ''}`} />
                  <div className={`fp-strength-bar ${v.hasLowercase ? 'active' : ''}`} />
                  <div className={`fp-strength-bar ${v.hasUppercase ? 'active' : ''}`} />
                  <div className={`fp-strength-bar ${v.hasNumber ? 'active' : ''}`} />
                </div>
                <div className="fp-strength-checklist">
                  <span className={v.minLength ? 'valid' : ''}>
                    {v.minLength ? <Check size={12} /> : <X size={12} />} 8 أحرف على الأقل
                  </span>
                  <span className={v.hasLowercase ? 'valid' : ''}>
                    {v.hasLowercase ? <Check size={12} /> : <X size={12} />} حرف صغير
                  </span>
                  <span className={v.hasUppercase ? 'valid' : ''}>
                    {v.hasUppercase ? <Check size={12} /> : <X size={12} />} حرف كبير
                  </span>
                  <span className={v.hasNumber ? 'valid' : ''}>
                    {v.hasNumber ? <Check size={12} /> : <X size={12} />} رقم واحد
                  </span>
                </div>
              </div>
            )}

            <div className="fp-form-group">
              <label className="fp-label" htmlFor="fp-confirm-password">تأكيد كلمة المرور</label>
              <div className="fp-input-wrapper password">
                <span className="fp-input-icon" aria-hidden="true">
                  <Lock size={18} strokeWidth={2} />
                </span>
                <input
                  id="fp-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  className="fp-input"
                  placeholder="أعد إدخال كلمة المرور"
                  value={confirmPassword}
                  onChange={(e) =>
                    setFpModal((p) => ({ ...p, confirmPassword: e.target.value, error: '' }))
                  }
                  disabled={fpLoading}
                  dir="ltr"
                />
                <button
                  type="button"
                  className="fp-toggle-password"
                  onClick={() =>
                    setFpModal((p) => ({ ...p, showConfirmPassword: !p.showConfirmPassword }))
                  }
                  aria-label={showConfirmPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  {showConfirmPassword ? (
                    <EyeOff size={18} strokeWidth={2} />
                  ) : (
                    <Eye size={18} strokeWidth={2} />
                  )}
                </button>
              </div>
              {confirmPassword && newPassword !== confirmPassword && (
                <span className="fp-match-error">كلمتا المرور غير متطابقتين</span>
              )}
              {confirmPassword && newPassword === confirmPassword && (
                <span className="fp-match-success">
                  <Check size={12} strokeWidth={3} /> كلمتا المرور متطابقتان
                </span>
              )}
            </div>

            <button
              type="button"
              className="fp-button primary"
              onClick={handleResetPassword}
              disabled={fpLoading || !v.isValid || newPassword !== confirmPassword}
            >
              {fpLoading ? (
                <span className="fp-loading">
                  <Loader2 size={20} className="fp-spin" />
                  جارٍ الحفظ...
                </span>
              ) : (
                <>
                  <Check size={18} strokeWidth={2.5} />
                  <span>حفظ كلمة المرور</span>
                </>
              )}
            </button>
          </div>

          <div className="fp-modal-footer">
            <button
              type="button"
              className="fp-link-button"
              onClick={() => setFpModal((p) => ({ ...p, step: 2, error: '' }))}
            >
              <ArrowRight size={14} strokeWidth={2.2} />
              العودة للخطوة السابقة
            </button>
          </div>
        </>
      );
    }

    /* Step 4 — Success */
    return (
      <>
        <div className="fp-modal-header success-header">
          <div className="fp-success-animation">
            <div className="fp-success-circle">
              <CheckCircle2 size={72} strokeWidth={1.8} />
            </div>
          </div>
          <h2 className="fp-title success">تم بنجاح!</h2>
          <p className="fp-subtitle">تم إعادة تعيين كلمة المرور بنجاح</p>
        </div>

        <div className="fp-modal-body success-body">
          <div className="fp-success-message">
            <p>يمكنك الآن تسجيل الدخول باستخدام كلمة المرور الجديدة</p>
            <div className="fp-success-details">
              <Mail size={16} strokeWidth={2} />
              <span className="fp-detail-text">{fpEmail}</span>
            </div>
          </div>

          <button
            type="button"
            className="fp-button primary success-button"
            onClick={closeFpModal}
          >
            <ArrowLeft size={18} strokeWidth={2.2} />
            <span>العودة لتسجيل الدخول</span>
          </button>
        </div>
      </>
    );
  };

  /* ═════════════════════════════════════════════════════════════════
     MAIN RENDER
     ═════════════════════════════════════════════════════════════════ */

  return (
    <div className="home-page">
      <Navbar />

      {/* ─── Generic Alert Modal ─── */}
      {modal.isOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target.className === 'modal-overlay') closeModal();
          }}
        >
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className={`modal-header ${modal.type}`}>
              <div className="modal-icon">
                {modal.type === 'success' ? (
                  <CheckCircle2 size={40} strokeWidth={2} />
                ) : (
                  <AlertCircle size={40} strokeWidth={2} />
                )}
              </div>
              <h2 className="modal-title">{modal.title}</h2>
            </div>
            <div className="modal-body">
              <p className="modal-message">{modal.message}</p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="modal-button primary"
                onClick={closeModal}
                autoFocus
              >
                حسناً
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Forgot Password Modal ─── */}
      {fpModal.isOpen && (
        <div
          className="fp-modal-overlay"
          onClick={(e) => {
            if (e.target.className === 'fp-modal-overlay') closeFpModal();
          }}
        >
          <div className="fp-modal-container" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="fp-close-button"
              onClick={closeFpModal}
              aria-label="إغلاق"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
            {renderFpStepProgress()}
            {renderFpContent()}
          </div>
        </div>
      )}

      {/* ═══════ HERO SECTION ═══════ */}
      <section id="hero" className="hero-section">
        <div className="hero-container">
          <div className="left-section">
            <div className="login-form-container">
              <h1 className="login-title">تسجيل الدخول</h1>
              <p className="login-subtitle">مرحباً بك في منصة Patient 360°</p>

              {loginError && (
                <div className="error-alert" role="alert">
                  <AlertCircle size={18} strokeWidth={2.2} />
                  <span>{loginError}</span>
                </div>
              )}

              <form className="login-form" onSubmit={handleLogin} noValidate>
                <div className="form-group">
                  <label className="form-label" htmlFor="login-email">البريد الإلكتروني</label>
                  <div className="form-input-wrapper">
                    <span className="form-input-icon" aria-hidden="true">
                      <Mail size={18} strokeWidth={2} />
                    </span>
                    <input
                      id="login-email"
                      type="email"
                      className="form-input"
                      placeholder="example@domain.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={isLoading}
                      dir="ltr"
                      autoComplete="email"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="login-password">كلمة المرور</label>
                  <div className="form-input-wrapper">
                    <span className="form-input-icon" aria-hidden="true">
                      <Lock size={18} strokeWidth={2} />
                    </span>
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      className="form-input"
                      placeholder="أدخل كلمة المرور"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={isLoading}
                      dir="ltr"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowPassword((p) => !p)}
                      aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    >
                      {showPassword ? (
                        <EyeOff size={18} strokeWidth={2} />
                      ) : (
                        <Eye size={18} strokeWidth={2} />
                      )}
                    </button>
                  </div>
                </div>

                <div className="form-options-row">
                  <label className="remember-me-label">
                    <input
                      type="checkbox"
                      className="remember-me-checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    <span className="remember-me-checkmark" aria-hidden="true" />
                    <span className="remember-me-text">تذكرني</span>
                  </label>

                  <a href="#forgot" className="forgot-link" onClick={openFpModal}>
                    هل نسيت كلمة المرور؟
                  </a>
                </div>

                <button
                  type="submit"
                  className="login-button"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span className="login-loading">
                      <Loader2 size={20} className="login-spinner" />
                      جارٍ تسجيل الدخول...
                    </span>
                  ) : (
                    <>
                      <LogIn size={18} strokeWidth={2.2} />
                      <span>تسجيل الدخول</span>
                    </>
                  )}
                </button>
              </form>

              <div className="divider">
                <div className="divider-line" />
                <span className="divider-text">أو</span>
                <div className="divider-line" />
              </div>

              <div className="signup-link">
                ليس لديك حساب؟ <Link to="/signup">سجل الآن</Link>
              </div>
            </div>
          </div>

          <div className="right-section">
            <div className="feature-carousel">
              {features.map((feature, index) => {
                const FIcon = feature.Icon;
                return (
                  <div
                    key={index}
                    className={`feature-slide ${
                      currentSlide === index ? 'active' : ''
                    }`}
                  >
                    <div className="feature-icon">
                      <FIcon size={72} strokeWidth={1.6} />
                    </div>
                    <div className="feature-highlight">{feature.highlight}</div>
                    <h2 className="feature-title">{feature.title}</h2>
                    <p className="feature-description">{feature.description}</p>
                  </div>
                );
              })}
            </div>
            <div className="slide-indicators">
              {features.map((_, index) => (
                <button
                  type="button"
                  key={index}
                  className={`indicator ${currentSlide === index ? 'active' : ''}`}
                  onClick={() => setCurrentSlide(index)}
                  aria-label={`الانتقال إلى الشريحة ${index + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ ABOUT SECTION ═══════ */}
      <section id="about" className="about-section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">عن Patient 360°</h2>
            <p className="section-subtitle">منصة رائدة في التحول الرقمي للرعاية الصحية</p>
          </div>

          <div className="about-content">
            <div className="about-text">
              <h3>نحن نعيد تعريف الرعاية الصحية</h3>
              <p>
                Patient 360° هي منصة متكاملة تجمع بين أحدث التقنيات والخبرة الطبية لتوفير نظام شامل
                لإدارة المعلومات الصحية. نسعى لتحسين جودة الرعاية الصحية من خلال توفير أدوات ذكية
                وفعالة للأطباء والمرضى على حد سواء.
              </p>
              <p>
                نأمل تطبيق هذا المشروع على كامل النطاق الطبي في أراضي الجمهورية العربية السورية
                تحت رعاية وزارة الصحة.
              </p>

              {/* ═══ Premium stat cards — 2×2 bento grid ═══ */}
              <div className="p360-stats" ref={statsRef} role="list" aria-label="إحصائيات المنصة">
                {stats.map(({ Icon, to, format, value, label }, index) => (
                  <div key={index} className="p360-stat" role="listitem">
                    <div className="p360-stat__icon" aria-hidden="true">
                      <Icon size={22} strokeWidth={2} />
                    </div>
                    <div className="p360-stat__value-row">
                      <div className="p360-stat__value">
                        {to !== undefined ? (
                          <AnimatedCounter to={to} format={format} />
                        ) : (
                          value
                        )}
                      </div>
                    </div>
                    <p className="p360-stat__label">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="about-image">
              <div className="image-placeholder">
                <Hospital size={140} strokeWidth={1.4} className="placeholder-icon" />
                <div className="floating-card card-1">
                  <BarChart3 size={20} strokeWidth={2} />
                  <span>تحليلات متقدمة</span>
                </div>
                <div className="floating-card card-2">
                  <ShieldCheck size={20} strokeWidth={2} />
                  <span>أمان عالي</span>
                </div>
                <div className="floating-card card-3">
                  <Zap size={20} strokeWidth={2} />
                  <span>أداء فائق</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ SERVICES SECTION ═══════ */}
      <section id="services" className="services-section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">خدماتنا</h2>
            <p className="section-subtitle">حلول متكاملة لجميع احتياجاتك الصحية</p>
          </div>

          <div className="services-grid">
            {services.map((service, index) => {
              const SIcon = service.Icon;
              return (
                <div key={index} className="service-card">
                  <div className="service-icon">
                    <SIcon size={48} strokeWidth={1.6} />
                  </div>
                  <h3 className="service-title">{service.title}</h3>
                  <p className="service-description">{service.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════ VISION SECTION ═══════ */}
      <section id="vision" className="vision-section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">رؤيتنا</h2>
            <p className="section-subtitle">نحو مستقبل صحي أفضل</p>
          </div>

          <div className="vision-content">
            <div className="vision-text">
              <h3>رسالتنا</h3>
              <p>
                نسعى لأن نكون الشريك التقني الأول للمؤسسات الصحية في المنطقة، من خلال توفير حلول
                مبتكرة تسهم في تحسين جودة الرعاية الصحية وتمكين الأطباء والمرضى.
              </p>

              <h3>أهدافنا</h3>
              <div className="vision-goals">
                <div className="goal-item">
                  <Target size={18} strokeWidth={2} />
                  <span>تحسين تجربة المريض</span>
                </div>
                <div className="goal-item">
                  <Target size={18} strokeWidth={2} />
                  <span>رفع كفاءة العمليات الطبية</span>
                </div>
                <div className="goal-item">
                  <Target size={18} strokeWidth={2} />
                  <span>ضمان أمان البيانات الصحية</span>
                </div>
                <div className="goal-item">
                  <Target size={18} strokeWidth={2} />
                  <span>التوسع إقليمياً وعالمياً</span>
                </div>
              </div>
            </div>

            <div className="vision-features">
              <div className="feature-item">
                <div className="feature-number">01</div>
                <div className="feature-content">
                  <h3>الابتكار المستمر</h3>
                  <p>نستثمر في البحث والتطوير لتقديم أحدث الحلول التقنية</p>
                </div>
              </div>
              <div className="feature-item">
                <div className="feature-number">02</div>
                <div className="feature-content">
                  <h3>التميز في الخدمة</h3>
                  <p>نلتزم بأعلى معايير الجودة في جميع خدماتنا</p>
                </div>
              </div>
              <div className="feature-item">
                <div className="feature-number">03</div>
                <div className="feature-content">
                  <h3>الشراكة الاستراتيجية</h3>
                  <p>نبني علاقات طويلة الأمد مع عملائنا</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ TEAM SECTION ═══════ */}
      <section id="team" className="team-section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">فريقنا</h2>
            <p className="section-subtitle">خبراء متخصصون في خدمتك</p>
          </div>

          <div className="team-grid">
            {teamMembers.map((member, index) => {
              const MIcon = member.Icon;
              return (
                <div key={index} className="team-card">
                  <div className="member-image">
                    <MIcon size={56} strokeWidth={1.5} />
                  </div>
                  <h3>{member.name}</h3>
                  <p className="member-role">{member.role}</p>
                  <p className="member-bio">{member.bio}</p>
                  <div className="social-links">
                    <a href="#linkedin" className="social-link" aria-label="LinkedIn">
                      <LinkedinIcon size={16} strokeWidth={2} />
                    </a>
                    <a href="#twitter" className="social-link" aria-label="Twitter">
                      <TwitterIcon size={16} strokeWidth={2} />
                    </a>
                    <a href="#email" className="social-link" aria-label="Email">
                      <AtSign size={16} strokeWidth={2} />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════ CONTACT SECTION ═══════ */}
      <section id="contact" className="contact-section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">تواصل معنا</h2>
            <p className="section-subtitle">نحن هنا لمساعدتك</p>
          </div>

          <div className="contact-content">
            <div className="contact-info">
              <div className="info-card">
                <div className="info-icon">
                  <MapPin size={32} strokeWidth={1.8} />
                </div>
                <h3>العنوان</h3>
                <p>دمشق، سوريا</p>
                <p>شارع المزة، بناء الصحة</p>
              </div>

              <div className="info-card">
                <div className="info-icon">
                  <Phone size={32} strokeWidth={1.8} />
                </div>
                <h3>الهاتف</h3>
                <p dir="ltr">+963 11 123 4567</p>
                <p dir="ltr">+963 11 765 4321</p>
              </div>

              <div className="info-card">
                <div className="info-icon">
                  <Mail size={32} strokeWidth={1.8} />
                </div>
                <h3>البريد الإلكتروني</h3>
                <p dir="ltr">info@patient360.sa</p>
                <p dir="ltr">support@patient360.sa</p>
              </div>
            </div>

            <div className="contact-form-container">
              <form className="contact-form" onSubmit={handleContactSubmit}>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="contact-name">الاسم الكامل</label>
                    <input
                      id="contact-name"
                      type="text"
                      className="form-input"
                      value={contactData.name}
                      onChange={(e) =>
                        setContactData({ ...contactData, name: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="contact-email">البريد الإلكتروني</label>
                    <input
                      id="contact-email"
                      type="email"
                      className="form-input"
                      value={contactData.email}
                      onChange={(e) =>
                        setContactData({ ...contactData, email: e.target.value })
                      }
                      required
                      dir="ltr"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="contact-phone">رقم الهاتف</label>
                  <input
                    id="contact-phone"
                    type="tel"
                    className="form-input"
                    value={contactData.phone}
                    onChange={(e) =>
                      setContactData({ ...contactData, phone: e.target.value })
                    }
                    dir="ltr"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="contact-message">الرسالة</label>
                  <textarea
                    id="contact-message"
                    className="form-input"
                    rows="5"
                    value={contactData.message}
                    onChange={(e) =>
                      setContactData({ ...contactData, message: e.target.value })
                    }
                    required
                  />
                </div>

                <button type="submit" className="submit-button">
                  إرسال الرسالة
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ FOOTER ═══════ */}
      <footer className="footer">
        <div className="footer-content">
          <div className="footer-section footer-section--brand">
            <FooterBrand size="md" />
            <p className="footer-description">
              منصة متكاملة لإدارة الرعاية الصحية، نوفر حلولاً ذكية للمؤسسات الطبية.
            </p>
            <div className="social-links">
             <a href="#facebook" className="social-icon" aria-label="Facebook">
               <FacebookIcon size={18} strokeWidth={2} />
            </a>
            <a href="#twitter" className="social-icon" aria-label="Twitter">
              <TwitterIcon size={18} strokeWidth={2} />
            </a>
              <a href="#linkedin" className="social-icon" aria-label="LinkedIn">
                <LinkedinIcon size={18} strokeWidth={2} />
              </a>
              <a href="#email" className="social-icon" aria-label="Email">
                <AtSign size={18} strokeWidth={2} />
              </a>
            </div>
          </div>

          <div className="footer-section">
            <h3 className="footer-title">روابط سريعة</h3>
            <div className="footer-links">
              <a href="#about" className="footer-link">من نحن</a>
              <a href="#services" className="footer-link">الخدمات</a>
              <a href="#vision" className="footer-link">رؤيتنا</a>
              <a href="#contact" className="footer-link">تواصل معنا</a>
            </div>
          </div>

          <div className="footer-section">
            <h3 className="footer-title">معلومات التواصل</h3>
            <div className="footer-links">
              <span className="footer-link" dir="ltr">+963 11 123 4567</span>
              <span className="footer-link" dir="ltr">info@patient360.sa</span>
              <span className="footer-link">دمشق، سوريا</span>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          تم التطوير بكل فخر — جميع الحقوق محفوظة © 2026 Patient 360°
        </div>
      </footer>
    </div>
  );
};

export default Login;