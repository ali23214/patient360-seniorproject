import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import '../../styles/Navbar.css';

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    // Check if user is logged in
    const user = localStorage.getItem('currentUser');
    if (user) {
      setCurrentUser(JSON.parse(user));
    } else {
      setCurrentUser(null);
    }
  }, [location.pathname]); // Re-check when location changes

  const toggleDropdown = (dropdown) => {
    setActiveDropdown(activeDropdown === dropdown ? null : dropdown);
  };

  const closeDropdowns = () => {
    setActiveDropdown(null);
  };

  const scrollToSection = (sectionId) => {
    // Check if we're on the login page which has these sections
    if (location.pathname === '/' || location.pathname === '/login') {
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      // If on other pages, navigate to login page first
      navigate('/');
      // Wait a bit for navigation to complete then scroll
      setTimeout(() => {
        const element = document.getElementById(sectionId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    }
    closeDropdowns();
  };

  const handleLogoClick = () => {
    if (currentUser) {
      // If logged in, go to their dashboard
      const dashboardRoutes = {
        'doctor': '/doctor/dashboard',
        'patient': '/patient/dashboard',
        'pharmacist': '/pharmacist/dashboard',
        'laboratory': '/laboratory/dashboard'
      };
      navigate(dashboardRoutes[currentUser.role] || '/');
    } else {
      // If not logged in
      if (location.pathname === '/' || location.pathname === '/login') {
        scrollToSection('hero');
      } else {
        navigate('/');
      }
    }
  };

  const handleLoginButtonClick = () => {
    if (location.pathname === '/signup') {
      // If on signup page, go to login page
      navigate('/');
    } else if (location.pathname === '/' || location.pathname === '/login') {
      // If on login page, scroll to hero/login section
      scrollToSection('hero');
    } else {
      // From dashboard pages, go to login
      navigate('/');
    }
  };

  const handleSignupClick = (e) => {
    e.preventDefault();
    navigate('/signup');
    closeDropdowns();
  };

  const handleLogout = () => {
    localStorage.removeItem('currentUser');
    setCurrentUser(null);
    alert('تم تسجيل الخروج بنجاح');
    navigate('/');
    closeDropdowns();
  };

  const getRolePrefix = (role) => {
    const prefixes = {
      'doctor': 'د.',
      'patient': '',
      'pharmacist': '',
      'laboratory': ''
    };
    return prefixes[role] || '';
  };

  // Check if we're on a dashboard page
  const isDashboardPage = location.pathname.includes('/dashboard');

  return (
    <>
      {activeDropdown && (
        <div className="dropdown-backdrop" onClick={closeDropdowns}></div>
      )}
      
      <nav className={`navbar ${isScrolled ? 'scrolled' : ''}`}>
        <div className="navbar-container">
          <div className="navbar-left-section">
            <div className="heart-pulse-container">
              <svg className="heart-pulse-svg" viewBox="0 0 50 25" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="pulseGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#a23f97" stopOpacity="0.6"/>
                    <stop offset="50%" stopColor="#ff4444" stopOpacity="1"/>
                    <stop offset="100%" stopColor="#a23f97" stopOpacity="0.6"/>
                  </linearGradient>
                </defs>
                <path 
                  className="pulse-line" 
                  d="M2,12.5 Q6,12.5 8,8 T12,12.5 T16,8 T20,12.5 T24,8 T28,12.5 T32,8 T36,12.5 T40,8 T44,12.5 L48,12.5" 
                  fill="none" 
                  stroke="url(#pulseGradient)" 
                  strokeWidth="2"
                />
                <circle className="pulse-dot" cx="2" cy="12.5" r="2" fill="#ff4444"/>
              </svg>
            </div>
            <span className="brand-text" onClick={handleLogoClick} style={{cursor: 'pointer'}}>
              PATIENT 360<span className="degree-symbol">°</span>
            </span>
          </div>

          <div className="navbar-right-section">
            {currentUser ? (
              // Show when user is logged in
              <>
                <div className="user-info">
                  <span className="welcome-text">
                    مرحباً {getRolePrefix(currentUser.role)} {currentUser.firstName}
                  </span>
                </div>
                <button 
                  className="nav-button logout-button" 
                  onClick={handleLogout}
                >
                  تسجيل الخروج
                </button>
              </>
            ) : (
              // Show when user is NOT logged in (original buttons)
              <>
                <div className="nav-item">
                  <button className="nav-button login-nav-button" onClick={handleLoginButtonClick}>
                    <span>تسجيل الدخول</span>
                  </button>
                </div>

                {!isDashboardPage && (
                  <>
                    <div className="nav-item dropdown">
                      <button 
                        className={`nav-button ${activeDropdown === 'about' ? 'active' : ''}`}
                        onClick={() => toggleDropdown('about')}
                      >
                        <span>حول المنصة</span>
                        <svg className={`dropdown-arrow ${activeDropdown === 'about' ? 'rotated' : ''}`} 
                             viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      </button>
                      
                      {activeDropdown === 'about' && (
                        <div className="dropdown-menu">
                          <a href="#about" onClick={(e) => {e.preventDefault(); scrollToSection('about');}} className="dropdown-item">
                            <span>عن Patient 360°</span>
                          </a>
                          <a href="#vision" onClick={(e) => {e.preventDefault(); scrollToSection('vision');}} className="dropdown-item">
                            <span>رؤيتنا ورسالتنا</span>
                          </a>
                          <a href="#team" onClick={(e) => {e.preventDefault(); scrollToSection('team');}} className="dropdown-item">
                            <span>فريق العمل</span>
                          </a>
                          <a href="#contact" onClick={(e) => {e.preventDefault(); scrollToSection('contact');}} className="dropdown-item">
                            <span>اتصل بنا</span>
                          </a>
                        </div>
                      )}
                    </div>

                    <div className="nav-item dropdown">
                      <button 
                        className={`nav-button ${activeDropdown === 'services' ? 'active' : ''}`}
                        onClick={() => toggleDropdown('services')}
                      >
                        <span>الخدمات</span>
                        <svg className={`dropdown-arrow ${activeDropdown === 'services' ? 'rotated' : ''}`} 
                             viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      </button>
                      
                      {activeDropdown === 'services' && (
                        <div className="dropdown-menu">
                          <a href="#services" onClick={(e) => {e.preventDefault(); scrollToSection('services');}} className="dropdown-item">
                            <span>خدماتنا</span>
                          </a>
                          <a href="#features" onClick={(e) => {e.preventDefault(); scrollToSection('features');}} className="dropdown-item">
                            <span>المميزات</span>
                          </a>
                          <a href="#" onClick={handleSignupClick} className="dropdown-item">
                            <span>إنشاء حساب جديد</span>
                          </a>
                        </div>
                      )}
                    </div>

                    <div className="nav-item dropdown">
                      <button 
                        className={`nav-button ${activeDropdown === 'language' ? 'active' : ''}`}
                        onClick={() => toggleDropdown('language')}
                      >
                        <span>🌐 العربية</span>
                        <svg className={`dropdown-arrow ${activeDropdown === 'language' ? 'rotated' : ''}`} 
                             viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      </button>
                      
                      {activeDropdown === 'language' && (
                        <div className="dropdown-menu">
                          <a href="#" className="dropdown-item active-lang">
                            <span>العربية</span>
                          </a>
                          <a href="#" className="dropdown-item">
                            <span>English</span>
                          </a>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </nav>
    </>
  );
};

export default Navbar;