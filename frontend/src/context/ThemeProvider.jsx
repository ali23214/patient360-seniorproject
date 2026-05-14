// ============================================================================
// ThemeProvider.jsx — Patient 360° | Global Theme Context
// ============================================================================
// Location: src/context/ThemeProvider.jsx
// Purpose:  Single source of truth for light/dark mode across ALL pages
// Usage:    Wrap your <App /> with <ThemeProvider> in index.js or App.jsx
//           Then import { useTheme } from './context/ThemeProvider' anywhere
// ============================================================================

import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';

// ============================================================================
// CONTEXT
// ============================================================================
const ThemeContext = createContext({
  theme: 'light',
  toggleTheme: () => {},
  isDark: false,
});

export const useTheme = () => useContext(ThemeContext);

// ============================================================================
// DESIGN TOKENS — Teal Medica | Light + Dark Values
// ============================================================================
const THEME_TOKENS = {
  light: {
    '--tm-primary':         '#0D3B3E',
    '--tm-primary-rgb':     '13, 59, 62',
    '--tm-primary-light':   '#145456',
    '--tm-action':          '#00897B',
    '--tm-action-rgb':      '0, 137, 123',
    '--tm-action-hover':    '#00796B',
    '--tm-action-light':    '#00A99D',
    '--tm-accent':          '#4DB6AC',
    '--tm-accent-rgb':      '77, 182, 172',
    '--tm-accent-soft':     '#80CBC4',
    '--tm-surface':         '#E0F2F1',
    '--tm-surface-rgb':     '224, 242, 241',
    '--tm-surface-hover':   '#D0EDEB',
    '--tm-background':      '#F5FAFA',
    '--tm-bg-rgb':          '245, 250, 250',
    '--tm-white':           '#FFFFFF',

    // Text
    '--tm-text':            '#0D3B3E',
    '--tm-text-primary':    '#0D3B3E',
    '--tm-text-secondary':  '#4A6B6E',
    '--tm-text-muted':      '#7A9A9D',

    // Cards
    '--tm-card-bg':         '#FFFFFF',
    '--tm-card-border':     'rgba(0, 137, 123, 0.12)',
    '--tm-card-shadow':     '0 4px 24px rgba(13, 59, 62, 0.08)',

    // Inputs
    '--tm-input-bg':        '#FFFFFF',
    '--tm-input-border':    '#B2DFDB',
    '--tm-input-focus':     '#00897B',

    // Borders
    '--tm-border':          '#C8E6E4',
    '--tm-border-light':    '#E0F2F1',
    '--tm-divider':         '#B2DFDB',

    // Overlay
    '--tm-overlay':         'rgba(13, 59, 62, 0.6)',

    // Sections
    '--tm-hero-start':      '#F5FAFA',
    '--tm-hero-end':        '#FFFFFF',
    '--tm-footer-bg':       '#0D3B3E',
    '--tm-section-alt':     '#E0F2F1',

    // Semantic
    '--tm-success':         '#00897B',
    '--tm-success-light':   'rgba(0, 137, 123, 0.1)',
    '--tm-success-bg':      '#E6FFF5',
    '--tm-error':           '#D32F2F',
    '--tm-error-light':     'rgba(211, 47, 47, 0.08)',
    '--tm-error-bg':        '#FFF5F5',
    '--tm-error-border':    '#FEB2B2',
    '--tm-warning':         '#F57C00',
    '--tm-warning-bg':      '#FFFBEB',
    '--tm-warning-border':  '#F6E05E',

    // Effects
    '--tm-glow':            'rgba(0, 137, 123, 0.3)',
    '--tm-gradient':        'linear-gradient(135deg, #0D3B3E 0%, #00897B 100%)',
    '--tm-gradient-accent': 'linear-gradient(135deg, #00897B 0%, #4DB6AC 100%)',

    // Shadows
    '--tm-shadow-sm':       '0 2px 8px rgba(13, 59, 62, 0.06)',
    '--tm-shadow-md':       '0 8px 30px rgba(13, 59, 62, 0.10)',
    '--tm-shadow-lg':       '0 20px 60px rgba(13, 59, 62, 0.12)',
    '--tm-shadow-xl':       '0 30px 80px rgba(13, 59, 62, 0.16)',

    // Illustration panels (SignUp side panels)
    '--tm-illustration-start': '#0D3B3E',
    '--tm-illustration-mid':   '#0B4F52',
    '--tm-illustration-end':   '#00897B',
  },

  dark: {
    '--tm-primary':         '#4DB6AC',
    '--tm-primary-rgb':     '77, 182, 172',
    '--tm-primary-light':   '#80CBC4',
    '--tm-action':          '#4DB6AC',
    '--tm-action-rgb':      '77, 182, 172',
    '--tm-action-hover':    '#80CBC4',
    '--tm-action-light':    '#B2DFDB',
    '--tm-accent':          '#80CBC4',
    '--tm-accent-rgb':      '128, 203, 196',
    '--tm-accent-soft':     '#B2DFDB',
    '--tm-surface':         '#1A2E2F',
    '--tm-surface-rgb':     '26, 46, 47',
    '--tm-surface-hover':   '#1F3839',
    '--tm-background':      '#0F1F20',
    '--tm-bg-rgb':          '15, 31, 32',
    '--tm-white':           '#162626',

    // Text
    '--tm-text':            '#E0F2F1',
    '--tm-text-primary':    '#E0F2F1',
    '--tm-text-secondary':  '#A8CCC9',
    '--tm-text-muted':      '#6B9B97',

    // Cards
    '--tm-card-bg':         '#162626',
    '--tm-card-border':     'rgba(77, 182, 172, 0.15)',
    '--tm-card-shadow':     '0 4px 24px rgba(0, 0, 0, 0.3)',

    // Inputs
    '--tm-input-bg':        '#1A2E2F',
    '--tm-input-border':    '#2D4F50',
    '--tm-input-focus':     '#4DB6AC',

    // Borders
    '--tm-border':          '#2D4F50',
    '--tm-border-light':    '#1A2E2F',
    '--tm-divider':         '#2D4F50',

    // Overlay
    '--tm-overlay':         'rgba(0, 0, 0, 0.7)',

    // Sections
    '--tm-hero-start':      '#0A1A1B',
    '--tm-hero-end':        '#0F1F20',
    '--tm-footer-bg':       '#0A1A1B',
    '--tm-section-alt':     '#1A2E2F',

    // Semantic
    '--tm-success':         '#4DB6AC',
    '--tm-success-light':   'rgba(77, 182, 172, 0.12)',
    '--tm-success-bg':      'rgba(77, 182, 172, 0.12)',
    '--tm-error':           '#EF5350',
    '--tm-error-light':     'rgba(239, 83, 80, 0.12)',
    '--tm-error-bg':        'rgba(239, 83, 80, 0.12)',
    '--tm-error-border':    'rgba(239, 83, 80, 0.3)',
    '--tm-warning':         '#FFB74D',
    '--tm-warning-bg':      'rgba(255, 183, 77, 0.1)',
    '--tm-warning-border':  'rgba(255, 183, 77, 0.3)',

    // Effects
    '--tm-glow':            'rgba(77, 182, 172, 0.25)',
    '--tm-gradient':        'linear-gradient(135deg, #0D3B3E 0%, #00695C 100%)',
    '--tm-gradient-accent': 'linear-gradient(135deg, #00897B 0%, #4DB6AC 100%)',

    // Shadows
    '--tm-shadow-sm':       '0 2px 8px rgba(0, 0, 0, 0.2)',
    '--tm-shadow-md':       '0 8px 30px rgba(0, 0, 0, 0.25)',
    '--tm-shadow-lg':       '0 20px 60px rgba(0, 0, 0, 0.3)',
    '--tm-shadow-xl':       '0 30px 80px rgba(0, 0, 0, 0.35)',

    // Illustration panels
    '--tm-illustration-start': '#0A1A1B',
    '--tm-illustration-mid':   '#0D2E30',
    '--tm-illustration-end':   '#0D3B3E',
  },
};

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================
const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('p360-theme') || 'light';
    } catch {
      return 'light';
    }
  });

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      try {
        localStorage.setItem('p360-theme', next);
      } catch (e) {
        console.warn('Could not persist theme:', e);
      }
      return next;
    });
  }, []);

  // Apply CSS variables to <html> element whenever theme changes
  useEffect(() => {
    const tokens = THEME_TOKENS[theme];
    const root = document.documentElement;

    // Set all CSS custom properties
    Object.entries(tokens).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    // Set data-theme attribute for CSS [data-theme="dark"] selectors
    root.setAttribute('data-theme', theme);

    // Set color-scheme for native elements (scrollbars, form controls)
    root.style.colorScheme = theme;
  }, [theme]);

  const value = {
    theme,
    toggleTheme,
    isDark: theme === 'dark',
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export { ThemeContext };
export default ThemeProvider;
