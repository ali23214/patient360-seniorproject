/**
 * Calculate age from date of birth
 * @param {string|Date} birthDate - Date of birth
 * @returns {number} Age in years
 */
export const calculateAge = (birthDate) => {
  if (!birthDate) return 0;
  
  const today = new Date();
  const birth = new Date(birthDate);
  
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  
  // Adjust age if birthday hasn't occurred this year yet
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  
  return age;
};

/**
 * Check if person is a minor (under 14 — Syrian national ID threshold)
 * @param {string|Date} birthDate - Date of birth
 * @returns {boolean} True if under 14, false otherwise
 */
export const isMinor = (birthDate) => {
  return calculateAge(birthDate) < 14;
};

/**
 * Format date for display
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date string
 */
export const formatDate = (date) => {
  if (!date) return '';
  
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

/**
 * Get today's date in YYYY-MM-DD format (for input max attribute)
 * @returns {string} Today's date
 */
export const getTodayDate = () => {
  return new Date().toISOString().split('T')[0];
};

/**
 * Validate Syrian phone number
 * @param {string} phone - Phone number to validate
 * @returns {boolean} True if valid, false otherwise
 */
export const validateSyrianPhone = (phone) => {
  const phoneRegex = /^(\+963[0-9]{9}|09[0-9]{8})$/;
  return phoneRegex.test(phone);
};

/**
 * Validate national ID (11 digits)
 * @param {string} nationalId - National ID to validate
 * @returns {boolean} True if valid, false otherwise
 */
export const validateNationalId = (nationalId) => {
  const idRegex = /^[0-9]{11}$/;
  return idRegex.test(nationalId);
};