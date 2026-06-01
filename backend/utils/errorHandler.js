/**
 * Error Handler Utility
 * Provides standardized error responses and logging
 */

/**
 * Custom Error Class
 */
class AppError extends Error {
  constructor(message, statusCode, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error Response Formatter
 */
exports.formatErrorResponse = (error, req) => {
  const response = {
    success: false,
    error: {
      message: error.message || 'حدث خطأ في الخادم',
      statusCode: error.statusCode || 500,
      timestamp: new Date().toISOString()
    }
  };

  // Add error code if provided
  if (error.code) {
    response.error.code = error.code;
  }

  // Add stack trace in development
  if (process.env.NODE_ENV === 'development') {
    response.error.stack = error.stack;
    response.error.path = req.path;
    response.error.method = req.method;
  }

  return response;
};

/**
 * Handle Mongoose Validation Errors
 */
exports.handleValidationError = (error) => {
  const errors = Object.values(error.errors).map(err => err.message);
  const message = `بيانات غير صالحة: ${errors.join(', ')}`;
  return new AppError(message, 400, 'VALIDATION_ERROR');
};

/**
 * Handle Mongoose Duplicate Key Error
 */
exports.handleDuplicateKeyError = (error) => {
  const field = Object.keys(error.keyValue)[0];
  const value = error.keyValue[field];
  const message = `${field} "${value}" مستخدم بالفعل`;
  return new AppError(message, 400, 'DUPLICATE_ERROR');
};

/**
 * Handle Mongoose Cast Error (Invalid ID)
 */
exports.handleCastError = (error) => {
  const message = `معرف غير صالح: ${error.value}`;
  return new AppError(message, 400, 'INVALID_ID');
};

/**
 * Handle JWT Errors
 */
exports.handleJWTError = () => {
  return new AppError('رمز غير صالح. الرجاء تسجيل الدخول مرة أخرى', 401, 'INVALID_TOKEN');
};

exports.handleJWTExpiredError = () => {
  return new AppError('انتهت صلاحية الرمز. الرجاء تسجيل الدخول مرة أخرى', 401, 'TOKEN_EXPIRED');
};

/**
 * Global Error Handler Middleware
 */
exports.globalErrorHandler = (err, req, res, next) => {
  // Log error
  console.error('❌ ERROR:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    user: req.user?.email || 'Unauthenticated'
  });

  // Handle specific error types
  let error = { ...err };
  error.message = err.message;

  // Mongoose Validation Error
  if (err.name === 'ValidationError') {
    error = this.handleValidationError(err);
  }

  // Mongoose Duplicate Key Error
  if (err.code === 11000) {
    error = this.handleDuplicateKeyError(err);
  }

  // Mongoose Cast Error
  if (err.name === 'CastError') {
    error = this.handleCastError(err);
  }

  // JWT Errors
  if (err.name === 'JsonWebTokenError') {
    error = this.handleJWTError();
  }

  if (err.name === 'TokenExpiredError') {
    error = this.handleJWTExpiredError();
  }

  // Send error response
  const formattedError = this.formatErrorResponse(error, req);
  res.status(error.statusCode || 500).json(formattedError);
};

/**
 * Catch Async Errors Wrapper
 */
exports.catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

/**
 * Not Found Handler
 */
exports.notFound = (req, res, next) => {
  const error = new AppError(
    `المسار ${req.originalUrl} غير موجود`,
    404,
    'NOT_FOUND'
  );
  next(error);
};

module.exports.AppError = AppError;