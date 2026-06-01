const rateLimit = require('express-rate-limit');

/**
 * Rate Limiters for Patient Dashboard Endpoints
 * Prevents abuse and protects against DDoS attacks
 */

/**
 * Profile Rate Limiter
 * 100 requests per 15 minutes
 * Used for: profile, medical-history, ai-risk-prediction
 */
exports.profileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    success: false,
    message: 'تم تجاوز الحد الأقصى للطلبات. الرجاء المحاولة بعد 15 دقيقة'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip successful requests from counting
  skip: (req, res) => res.statusCode < 400,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'تم تجاوز الحد الأقصى للطلبات. الرجاء المحاولة بعد 15 دقيقة',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  }
});

/**
 * Visits Rate Limiter
 * 200 requests per 15 minutes
 * Used for: visits, visit details, visit stats
 */
exports.visitsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: {
    success: false,
    message: 'تم تجاوز الحد الأقصى للطلبات. الرجاء المحاولة بعد قليل'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req, res) => res.statusCode < 400,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'تم تجاوز الحد الأقصى للطلبات. الرجاء المحاولة بعد 15 دقيقة',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  }
});

/**
 * Medications Rate Limiter
 * 150 requests per 15 minutes
 * Used for: medications, medication schedule, medication history
 */
exports.medicationsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 150,
  message: {
    success: false,
    message: 'تم تجاوز الحد الأقصى للطلبات. الرجاء المحاولة بعد قليل'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req, res) => res.statusCode < 400,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'تم تجاوز الحد الأقصى للطلبات. الرجاء المحاولة بعد 15 دقيقة',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  }
});

/**
 * Strict Rate Limiter for Sensitive Operations
 * 20 requests per hour
 * Used for: profile updates, data exports
 */
exports.strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: {
    success: false,
    message: 'تم تجاوز الحد الأقصى للطلبات. الرجاء المحاولة بعد ساعة'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'تم تجاوز الحد الأقصى للطلبات. الرجاء المحاولة بعد ساعة',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  }
});