/**
 * Data Sanitization Utilities
 * Removes sensitive fields before sending data to frontend
 */

/**
 * Sanitize patient data
 * Removes sensitive fields that should not be exposed to frontend
 */
exports.sanitizePatientData = (patient) => {
  if (!patient) return null;

  const sanitized = { ...patient };

  // Remove sensitive system fields
  delete sanitized.__v;
  delete sanitized._password; // If ever included by mistake

  // Remove sensitive medical data if needed
  // (Uncomment if you want to hide certain fields)
  // delete sanitized.allergies;
  // delete sanitized.chronicDiseases;

  return sanitized;
};

/**
 * Sanitize visit data
 * Removes doctor's personal information that patient doesn't need
 */
exports.sanitizeVisitData = (visit) => {
  if (!visit) return null;

  const sanitized = { ...visit };

  // Remove system fields
  delete sanitized.__v;

  // If doctor data is populated, remove sensitive doctor info
  if (sanitized.doctorId && typeof sanitized.doctorId === 'object') {
    const doctorInfo = {
      _id: sanitized.doctorId._id,
      firstName: sanitized.doctorId.personId?.firstName,
      lastName: sanitized.doctorId.personId?.lastName,
      specialization: sanitized.doctorId.specialization
    };
    sanitized.doctorId = doctorInfo;
  }

  return sanitized;
};

/**
 * Sanitize array of data
 */
exports.sanitizeArray = (array, sanitizeFunction) => {
  if (!Array.isArray(array)) return [];
  return array.map(item => sanitizeFunction(item));
};

/**
 * Mask sensitive personal information
 * Used for logging and debugging
 */
exports.maskSensitiveData = (data) => {
  if (!data) return null;

  const masked = { ...data };

  // Mask email
  if (masked.email) {
    const [username, domain] = masked.email.split('@');
    masked.email = `${username.substring(0, 2)}***@${domain}`;
  }

  // Mask phone number
  if (masked.phoneNumber) {
    masked.phoneNumber = masked.phoneNumber.replace(/\d(?=\d{4})/g, '*');
  }

  // Mask national ID
  if (masked.nationalId) {
    masked.nationalId = masked.nationalId.replace(/\d(?=\d{4})/g, '*');
  }

  return masked;
};

/**
 * Remove null and undefined values from object
 */
exports.removeEmptyFields = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;

  const cleaned = {};
  
  Object.keys(obj).forEach(key => {
    if (obj[key] !== null && obj[key] !== undefined) {
      cleaned[key] = obj[key];
    }
  });

  return cleaned;
};

/**
 * Deep clone object (removes MongoDB metadata)
 */
exports.deepClone = (obj) => {
  return JSON.parse(JSON.stringify(obj));
};