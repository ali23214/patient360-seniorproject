// src/utils/roleConfig.js

// Define all user roles
export const ROLES = {
  DOCTOR: 'doctor',
  PATIENT: 'patient',
  PHARMACIST: 'pharmacist',
  LABORATORY: 'laboratory'
};

// Map each role to its dashboard route
export const ROLE_ROUTES = {
  [ROLES.DOCTOR]: '/doctor/dashboard',
  [ROLES.PATIENT]: '/patient/dashboard',
  [ROLES.PHARMACIST]: '/pharmacist/dashboard',
  [ROLES.LABORATORY]: '/laboratory/dashboard'
};

// Get dashboard route for a specific role
export const getRoleRoute = (role) => {
  return ROLE_ROUTES[role] || '/';
};

// Role display names in Arabic
export const ROLE_NAMES = {
  [ROLES.DOCTOR]: 'طبيب',
  [ROLES.PATIENT]: 'مريض',
  [ROLES.PHARMACIST]: 'صيدلاني',
  [ROLES.LABORATORY]: 'أخصائي مختبر'
};

// Get role display name
export const getRoleName = (role) => {
  return ROLE_NAMES[role] || 'مستخدم';
};