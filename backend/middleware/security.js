const rateLimit = require('express-rate-limit');

// Rate limiter for login attempts
exports.loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per windowMs
  message: {
    success: false,
    message: 'تم تجاوز عدد محاولات تسجيل الدخول. الرجاء المحاولة بعد 15 دقيقة'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip successful requests
  skipSuccessfulRequests: true
});

// General API rate limiter
exports.apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per windowMs
  message: {
    success: false,
    message: 'تم تجاوز عدد الطلبات. الرجاء المحاولة لاحقاً'
  },
  standardHeaders: true,
  legacyHeaders: false
});