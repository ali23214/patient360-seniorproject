/**
 * ═══════════════════════════════════════════════════════════════════
 *  Patient 360° — Navbar Component
 * ═══════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LogIn,
  LogOut,
  ChevronDown,
  Sun,
  Moon,
  Stethoscope,
  User,
  Pill,
  FlaskConical,
  ShieldCheck,
  Smile,
  Info,
  Eye,
  Mail,
  LayoutGrid,
  UserPlus,
} from 'lucide-react';

import { useTheme } from '../../context/ThemeProvider';
import '../../styles/Navbar.css';

/* ─── Constants ─── */

const DASHBOARD_ROUTES = Object.freeze({
  patient: '/patient-dashboard',
  doctor: '/doctor-dashboard',
  admin: '/admin-dashboard',
  pharmacist: '/pharmacist-dashboard',
  lab_technician: '/lab-dashboard',
  dentist: '/dentist-dashboard',
});

const ROLE_PREFIX = Object.freeze({
  patient: '',
  doctor: 'د.',
  admin: '',
  pharmacist: 'صيدلي',
  lab_technician: '',
  dentist: 'د.',
});

/* ─── Helpers ─── */

const RoleAvatarIcon = ({ role, size = 18 }) => {
  const iconProps = { size, strokeWidth: 2.2, 'aria-hidden': true };
  switch (role) {
    case 'doctor':         return <Stethoscope {...iconProps} />;
    case 'patient':        return <User {...iconProps} />;
    case 'pharmacist':     return <Pill {...iconProps} />;
    case 'lab_technician': return <FlaskConical {...iconProps} />;
    case 'admin':          return <ShieldCheck {...iconProps} />;
    case 'dentist':        return <Smile {...iconProps} />;
    default:               return <User {...iconProps} />;
  }
};

const ThemeToggleButton = ({ isDark, onToggle }) => (
  <button
    type="button"
    className={`p360-theme-btn ${isDark ? 'p360-theme-btn--dark' : ''}`}
    onClick={onToggle}
    aria-label={isDark ? 'تبديل إلى الوضع الفاتح' : 'تبديل إلى الوضع الداكن'}
    aria-pressed={isDark}
    title={isDark ? 'الوضع الفاتح' : 'الوضع الداكن'}
  >
    <span className="p360-theme-btn__icons">
      {isDark ? (
        <Sun size={18} strokeWidth={2.2} className="p360-theme-btn__sun" aria-hidden />
      ) : (
        <Moon size={18} strokeWidth={2.2} className="p360-theme-btn__moon" aria-hidden />
      )}
    </span>
  </button>
);

/* ═══ NAVBAR ═══ */

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  const [activeDropdown, setActiveDropdown] = useState(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  const navbarRef = useRef(null);

  const isDark = theme === 'dark';
  const isDashboardPage = location.pathname.includes('-dashboard');

  /* Scroll detection */
  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      window.requestAnimationFrame(() => {
        setIsScrolled(window.scrollY > 50);
        ticking = false;
      });
      ticking = true;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  /* User sync */
  useEffect(() => {
    try {
      const stored = localStorage.getItem('currentUser');
      if (!stored) {
        setCurrentUser(null);
        return;
      }
      const parsed = JSON.parse(stored);
      const role = parsed.role || (Array.isArray(parsed.roles) && parsed.roles[0]);
      setCurrentUser(role ? { ...parsed, role } : null);
    } catch (err) {
      console.error('[Navbar] Failed to parse currentUser:', err);
      setCurrentUser(null);
    }
  }, [location.pathname]);

  /* Click outside */
  useEffect(() => {
    if (!activeDropdown) return;
    const handleClickOutside = (event) => {
      if (navbarRef.current && !navbarRef.current.contains(event.target)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeDropdown]);

  /* ESC key */
  useEffect(() => {
    if (!activeDropdown) return;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setActiveDropdown(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeDropdown]);

  const closeDropdowns = useCallback(() => setActiveDropdown(null), []);

  const toggleDropdown = useCallback((dropdownId) => {
    setActiveDropdown((prev) => (prev === dropdownId ? null : dropdownId));
  }, []);

  const scrollToSection = useCallback(
    (sectionId) => {
      const isHomePage = location.pathname === '/' || location.pathname === '/login';
      const performScroll = () => {
        const element = document.getElementById(sectionId);
        if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      if (isHomePage) {
        performScroll();
      } else {
        navigate('/');
        setTimeout(performScroll, 150);
      }
      closeDropdowns();
    },
    [location.pathname, navigate, closeDropdowns]
  );

  const handleLogoClick = useCallback(() => {
    if (currentUser) {
      navigate(DASHBOARD_ROUTES[currentUser.role] || '/');
      return;
    }
    if (location.pathname === '/' || location.pathname === '/login') {
      scrollToSection('hero');
    } else {
      navigate('/');
    }
  }, [currentUser, location.pathname, navigate, scrollToSection]);

  const handleLoginClick = useCallback(() => {
    if (location.pathname === '/signup') {
      navigate('/');
    } else if (location.pathname === '/' || location.pathname === '/login') {
      scrollToSection('hero');
    } else {
      navigate('/');
    }
  }, [location.pathname, navigate, scrollToSection]);

  const handleSignupClick = useCallback(
    (e) => {
      if (e?.preventDefault) e.preventDefault();
      navigate('/signup');
      closeDropdowns();
    },
    [navigate, closeDropdowns]
  );

  const handleLogout = useCallback(() => {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('token');
    setCurrentUser(null);
    navigate('/');
    closeDropdowns();
  }, [navigate, closeDropdowns]);

  const aboutMenuItems = useMemo(
    () => [
      { id: 'about', label: 'عن Patient 360°', Icon: Info },
      { id: 'vision', label: 'رؤيتنا ورسالتنا', Icon: Eye },
      { id: 'contact', label: 'اتصل بنا', Icon: Mail },
    ],
    []
  );

  const servicesMenuItems = useMemo(
    () => [
      { id: 'services', label: 'خدماتنا', Icon: LayoutGrid },
      { id: 'signup', label: 'إنشاء حساب جديد', Icon: UserPlus, action: handleSignupClick },
    ],
    [handleSignupClick]
  );

const renderDropdownMenu = (items, dropdownKey, ariaLabel) => {
    if (activeDropdown !== dropdownKey) return null;
    return (
      <div className="p360-dropdown-menu" role="menu" aria-label={ariaLabel}>
        <div className="p360-dropdown-inner">
          {items.map((item, index) => {
            const Icon = item.Icon;
            return (
              <button
                type="button"
                key={item.id}
                className="p360-dropdown-item"
                role="menuitem"
                style={{ animationDelay: `${index * 0.04}s` }}
                onClick={(e) => {
                  e.preventDefault();
                  if (item.action) {
                    item.action(e);
                  } else {
                    scrollToSection(item.id);
                  }
                }}
              >
                <span className="p360-dropdown-item-icon" aria-hidden="true">
                  <Icon size={16} strokeWidth={2.2} />
                </span>
                <span className="p360-dropdown-item-label">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const rolePrefix = currentUser ? ROLE_PREFIX[currentUser.role] || '' : '';

  return (
    <>
      {activeDropdown && (
        <div className="p360-overlay" onClick={closeDropdowns} aria-hidden="true" />
      )}

      <nav
        ref={navbarRef}
        className={`p360-navbar ${isScrolled ? 'p360-navbar--scrolled' : ''}`}
        role="navigation"
        aria-label="التنقل الرئيسي"
      >
        <div className="p360-navbar-container">
          {/* LOGO */}
          <div className="p360-navbar-brand">
            <button
              type="button"
              className="p360-logo-btn"
              onClick={handleLogoClick}
              aria-label="الصفحة الرئيسية — Patient 360"
            >
              <div className="p360-logo-icon">
                <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M18 2L4 8v10c0 9 6 16 14 18 8-2 14-9 14-18V8L18 2z"
                    fill="url(#shieldGrad)"
                    opacity="0.15"
                    stroke="url(#shieldStroke)"
                    strokeWidth="1.5"
                  />
                  <rect x="15" y="10" width="6" height="16" rx="1.5" fill="url(#crossGrad)" />
                  <rect x="10" y="15" width="16" height="6" rx="1.5" fill="url(#crossGrad)" />
                  <path
                    className="p360-pulse-path"
                    d="M6 18h4l2-4 3 8 2-6 2 4h4l2-3 2 3h3"
                    stroke="url(#pulseGrad)"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                  <defs>
                    <linearGradient id="shieldGrad" x1="4" y1="2" x2="32" y2="30">
                      <stop offset="0%" stopColor="#4DB6AC" />
                      <stop offset="100%" stopColor="#00897B" />
                    </linearGradient>
                    <linearGradient id="shieldStroke" x1="4" y1="2" x2="32" y2="30">
                      <stop offset="0%" stopColor="#4DB6AC" stopOpacity="0.6" />
                      <stop offset="100%" stopColor="#00897B" stopOpacity="0.6" />
                    </linearGradient>
                    <linearGradient id="crossGrad" x1="10" y1="10" x2="26" y2="26">
                      <stop offset="0%" stopColor="#E0F2F1" />
                      <stop offset="100%" stopColor="#B2DFDB" />
                    </linearGradient>
                    <linearGradient id="pulseGrad" x1="6" y1="18" x2="34" y2="18">
                      <stop offset="0%" stopColor="#4DB6AC" stopOpacity="0" />
                      <stop offset="30%" stopColor="#4DB6AC" />
                      <stop offset="70%" stopColor="#00897B" />
                      <stop offset="100%" stopColor="#00897B" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <div className="p360-logo-text">
                <span className="p360-logo-name">
                  PATIENT 360<span className="p360-logo-degree">°</span>
                </span>
                <span className="p360-logo-tagline">المنصة الطبية الوطنية</span>
              </div>
            </button>
          </div>

          {/* NAV */}
          <div className="p360-navbar-nav">
            {currentUser ? (
              <div className="p360-auth-section">
                <ThemeToggleButton isDark={isDark} onToggle={toggleTheme} />

                <div className="p360-user-badge" aria-label={`المستخدم الحالي: ${currentUser.firstName}`}>
                  <div className="p360-user-avatar">
                    <RoleAvatarIcon role={currentUser.role} size={18} />
                  </div>
                  <div className="p360-user-details">
                    <span className="p360-user-greeting">مرحباً</span>
                    <span className="p360-user-name">
                      {rolePrefix} {currentUser.firstName}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  className="p360-btn p360-btn--logout"
                  onClick={handleLogout}
                  aria-label="تسجيل الخروج"
                >
                  <LogOut size={16} strokeWidth={2.2} aria-hidden />
                  <span>تسجيل الخروج</span>
                </button>
              </div>
            ) : (
              <div className="p360-guest-section">
                <ThemeToggleButton isDark={isDark} onToggle={toggleTheme} />

                <button
                  type="button"
                  className="p360-btn p360-btn--login"
                  onClick={handleLoginClick}
                  aria-label="تسجيل الدخول"
                >
                  <LogIn size={16} strokeWidth={2.2} aria-hidden />
                  <span>تسجيل الدخول</span>
                </button>

                {!isDashboardPage && (
                  <>
                    <div className="p360-nav-item">
                      <button
                        type="button"
                        className={`p360-btn p360-btn--nav ${activeDropdown === 'about' ? 'p360-btn--active' : ''}`}
                        onClick={() => toggleDropdown('about')}
                        aria-expanded={activeDropdown === 'about'}
                        aria-haspopup="menu"
                      >
                        <span>حول المنصة</span>
                        <ChevronDown
                          size={14}
                          strokeWidth={2.5}
                          className={`p360-chevron ${activeDropdown === 'about' ? 'p360-chevron--open' : ''}`}
                          aria-hidden
                        />
                      </button>
                      {renderDropdownMenu(aboutMenuItems, 'about', 'حول المنصة')}
                    </div>

                    <div className="p360-nav-item">
                      <button
                        type="button"
                        className={`p360-btn p360-btn--nav ${activeDropdown === 'services' ? 'p360-btn--active' : ''}`}
                        onClick={() => toggleDropdown('services')}
                        aria-expanded={activeDropdown === 'services'}
                        aria-haspopup="menu"
                      >
                        <span>الخدمات</span>
                        <ChevronDown
                          size={14}
                          strokeWidth={2.5}
                          className={`p360-chevron ${activeDropdown === 'services' ? 'p360-chevron--open' : ''}`}
                          aria-hidden
                        />
                      </button>
                      {renderDropdownMenu(servicesMenuItems, 'services', 'الخدمات')}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="p360-navbar-accent" aria-hidden="true" />
      </nav>
    </>
  );
};

export default Navbar;