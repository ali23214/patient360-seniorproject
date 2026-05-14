import axios from 'axios';

// ═══════════════════════════════════════════════════════════════════════
//  API BASE URL
//  ─────────────────────────────────────────────────────────────────────
//  Reads from REACT_APP_API_URL environment variable (set in .env file
//  at project root) so you don't have to edit this file when deploying
//  to production. Falls back to localhost:5000 for local development.
//
//  To use:
//    1. Create patient360frontend/.env  (next to package.json)
//    2. Add this line:
//         REACT_APP_API_URL=http://localhost:5000/api
//    3. For production, set REACT_APP_API_URL on your hosting provider
//       to your real API URL (e.g. https://api.patient360.gov.sy/api)
//    4. Restart `npm start` after changing .env
// ═══════════════════════════════════════════════════════════════════════
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 10000 // 10 seconds
});

// Add request interceptor to include auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Don't redirect during login attempt itself
    if (error.response?.status === 401) {
      const isLoginAttempt = error.config?.url?.includes('/auth/login');

      if (!isLoginAttempt && localStorage.getItem('token')) {
        // Only redirect if it's NOT a login attempt and user has a token
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ============================================
// AUTHENTICATION APIs
// ============================================
export const authAPI = {
  // Register new patient
  register: async (patientData) => {
    try {
      const response = await api.post('/auth/register', patientData);
      return response.data;
    } catch (error) {
      // ✅ Properly format error for frontend
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في التسجيل';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // Login
  login: async (credentials) => {
    try {
      const response = await api.post('/auth/login', credentials);
      // Save token and user info
      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
      }
      return response.data;
    } catch (error) {
      // ✅ Properly format error for frontend
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تسجيل الدخول';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // Logout
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  },

  // Get current user
  getCurrentUser: () => {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },

  // Check if user is authenticated
  isAuthenticated: () => {
    return !!localStorage.getItem('token');
  },

  // ==========================================
  // ✅ FORGET PASSWORD FUNCTIONS
  // ==========================================

  /**
   * Send OTP to email for password reset
   */
  forgotPassword: async (data) => {
    try {
      const response = await api.post('/auth/forgot-password', data);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في إرسال رمز التحقق';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  /**
   * Verify OTP code
   */
  verifyOTP: async (data) => {
    try {
      const response = await api.post('/auth/verify-otp', data);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في التحقق من الرمز';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  /**
   * Reset password with OTP
   */
  resetPassword: async (data) => {
    try {
      const response = await api.post('/auth/reset-password', data);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تغيير كلمة المرور';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ==========================================
  // ✅ DOCTOR REGISTRATION FUNCTIONS
  // ==========================================

  /**
   * Submit a doctor registration request with file uploads.
   *
   * Sent as multipart/form-data because it includes files (license document,
   * medical certificate, profile photo). The browser will automatically set
   * the correct Content-Type header with the multipart boundary.
   *
   * Timeout extended to 30 seconds because file uploads can take longer
   * than the default 10s, especially on slower connections.
   *
   * @param {FormData} formData - FormData built in SignUp.jsx
   * @returns {Promise<{success, requestId, data}>}
   */
  registerDoctor: async (formData) => {
    try {
      const response = await api.post('/auth/register-doctor', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        timeout: 30000 // 30 seconds — file uploads need more time
      });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تقديم طلب التسجيل';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  /**
   * Check the status of a previously submitted doctor registration request.
   * Looks up the request by the email used during registration.
   *
   * @param {string} email - Email used during doctor registration
   * @returns {Promise<{success, status, credentials, submittedAt, reviewedAt, rejectionReason, message}>}
   *
   * Possible status values:
   *   - 'pending'  — Request submitted, awaiting Ministry of Health review
   *   - 'approved' — Request accepted, credentials returned in response
   *   - 'rejected' — Request rejected, rejectionReason returned in response
   */
  checkDoctorStatus: async (email) => {
    try {
      const response = await api.post('/auth/check-doctor-status', { email });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'لم يتم العثور على طلب بهذا البريد الإلكتروني';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ==========================================
  // ✅ PHARMACIST REGISTRATION FUNCTIONS  (v2 — added in SignUp v2)
  // ==========================================

  /**
   * Submit a pharmacist registration request with file uploads.
   *
   * Sent as multipart/form-data because it includes files (license document,
   * degree certificate, optional profile photo). Persists on the backend into
   * doctor_requests with requestType='pharmacist' (no DB schema change needed —
   * doctor_requests has additionalProperties: true).
   *
   * Expected FormData fields (built in SignUp.jsx handlePharmacistSubmit):
   *   Personal: firstName, fatherName, lastName, motherName, nationalId,
   *             dateOfBirth, gender, phoneNumber, email, password,
   *             address, governorate, city
   *   Professional: pharmacyLicenseNumber, degree, specialization,
   *                 yearsOfExperience, employmentType
   *   Facility (exactly one of):
   *             pharmacyId          — ObjectId of an existing pharmacies doc
   *             newPharmacyData     — JSON string: { name, license, governorate, city, address }
   *   Optional: additionalNotes
   *   Files   : licenseDocument, degreeDocument, profilePhoto (optional)
   *
   * @param {FormData} formData
   * @returns {Promise<{success, requestId, message}>}
   */
  registerPharmacist: async (formData) => {
    try {
      const response = await api.post('/auth/register-pharmacist', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        timeout: 30000 // 30 seconds — file uploads need more time
      });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تقديم طلب تسجيل الصيدلي';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ==========================================
  // ✅ LAB TECHNICIAN REGISTRATION FUNCTIONS  (v2 — added in SignUp v2)
  // ==========================================

  /**
   * Submit a lab technician registration request with file uploads.
   *
   * Same multipart/form-data pattern as registerPharmacist. Persists into
   * doctor_requests with requestType='lab_technician'.
   *
   * Expected FormData fields:
   *   Personal: firstName, fatherName, lastName, motherName, nationalId,
   *             dateOfBirth, gender, phoneNumber, email, password,
   *             address, governorate, city
   *   Professional: licenseNumber, degree, specialization, position,
   *                 yearsOfExperience
   *   Facility (exactly one of):
   *             laboratoryId        — ObjectId of an existing laboratories doc
   *             newLaboratoryData   — JSON string: { name, license, governorate, city, address }
   *   Optional: additionalNotes
   *   Files   : licenseDocument, degreeDocument, profilePhoto (optional)
   *
   * @param {FormData} formData
   * @returns {Promise<{success, requestId, message}>}
   */
  registerLabTechnician: async (formData) => {
    try {
      const response = await api.post('/auth/register-lab-technician', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        timeout: 30000 // 30 seconds — file uploads need more time
      });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تقديم طلب تسجيل فني المختبر';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ==========================================
  // ✅ FACILITY AUTOCOMPLETE FUNCTIONS  (v2 — added in SignUp v2)
  // Powers the FacilityAutocomplete component in the pharmacist and
  // lab-tech signup forms. Public endpoints (no JWT required) because
  // they fire before the user has an account.
  // ==========================================

  /**
   * Search pharmacies by name for the facility picker autocomplete.
   * Backend should match against pharmacies.name, pharmacies.arabicName,
   * and pharmacies.registrationNumber, filter by isActive=true, and return
   * at most 10 results sorted by relevance.
   *
   * @param {string} query - search string, min 2 chars enforced client-side
   * @returns {Promise<Array<{
   *   _id: string,
   *   name: string,
   *   arabicName?: string,
   *   governorate: string,
   *   city: string,
   *   address?: string,
   *   pharmacyLicense?: string
   * }>>}
   */
  searchPharmacies: async (query) => {
    try {
      const response = await api.get('/pharmacies/search', {
        params: { q: query }
      });
      // Normalize: some endpoints wrap in { data: [...] }, some return the array directly
      return Array.isArray(response.data) ? response.data : (response.data?.data || []);
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في البحث عن الصيدليات';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  /**
   * Search laboratories by name for the facility picker autocomplete.
   * Mirror of searchPharmacies — same shape, same semantics.
   *
   * @param {string} query - search string, min 2 chars enforced client-side
   * @returns {Promise<Array<{
   *   _id: string,
   *   name: string,
   *   arabicName?: string,
   *   governorate: string,
   *   city: string,
   *   address?: string
   * }>>}
   */
  searchLaboratories: async (query) => {
    try {
      const response = await api.get('/laboratories/search', {
        params: { q: query }
      });
      return Array.isArray(response.data) ? response.data : (response.data?.data || []);
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في البحث عن المختبرات';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ==========================================
  // ✅ UNIFIED PROFESSIONAL STATUS CHECK  (v2 — added in SignUp v2)
  // ==========================================

  /**
   * Check the status of a previously submitted professional registration
   * request (doctor, pharmacist, or lab technician). Looks up the request
   * by the email used during registration.
   *
   * This is the v2 replacement for checkDoctorStatus. It returns an additional
   * `requestType` field so the UI can render the correct copy (طبيب / صيدلي /
   * فني مختبر). The old checkDoctorStatus method above is preserved as an
   * alias for backward compatibility.
   *
   * @param {string} email - Email used during professional registration
   * @returns {Promise<{
   *   success: boolean,
   *   status: 'pending' | 'approved' | 'rejected',
   *   requestType: 'doctor' | 'pharmacist' | 'lab_technician',
   *   credentials?: { email: string, password: string, name: string },
   *   submittedAt?: string,
   *   reviewedAt?: string,
   *   rejectionReason?: string,
   *   message?: string
   * }>}
   */
  checkProfessionalStatus: async (email) => {
    try {
      const response = await api.post('/auth/check-professional-status', { email });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'لم يتم العثور على طلب بهذا البريد الإلكتروني';
      throw { message: errorMessage, ...error.response?.data };
    }
  }
};

// ============================================
// PATIENT APIs
// ============================================
export const patientAPI = {
  // Search patient by national ID
  searchByNationalId: async (nationalId) => {
    try {
      const response = await api.get(`/patients/search?nationalId=${nationalId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  // Search patient by child ID
  searchByChildId: async (childId) => {
    try {
      const response = await api.get(`/patients/search?childId=${childId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  // Get children by parent's national ID
  getChildrenByParent: async (parentNationalId) => {
    try {
      const response = await api.get(`/patients/by-parent/${parentNationalId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  // Get patient by ID
  getById: async (patientId) => {
    try {
      const response = await api.get(`/patients/${patientId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  // Update patient
  update: async (patientId, data) => {
    try {
      const response = await api.put(`/patients/${patientId}`, data);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 1 — PROFILE
  // ════════════════════════════════════════════════════════════════

  /* BACKEND TODO: implement GET /api/patient/profile */
  /**
   * Get the logged-in patient's combined profile.
   *
   * Backend resolves identity from JWT (persons._id OR children._id) and
   * joins with the patients._id document. Returns dualRef so the frontend
   * can thread patientPersonId / patientChildId into downstream calls.
   *
   * @returns {Promise<{
   *   success: true,
   *   isMinor: boolean,
   *   dualRef: { patientPersonId?: string, patientChildId?: string },
   *   person?: {
   *     _id: string, nationalId: string, firstName: string, fatherName: string,
   *     lastName: string, motherName: string, dateOfBirth: string,
   *     gender: 'male'|'female', maritalStatus?: string, occupation?: string,
   *     education?: string, phoneNumber: string, alternativePhoneNumber?: string,
   *     email?: string, governorate: string, city: string, district?: string,
   *     street?: string, building?: string, address: string,
   *     profilePhoto?: { url: string, uploadedAt: string }
   *   },
   *   child?: {
   *     _id: string, childRegistrationNumber: string, parentPersonId: string,
   *     firstName: string, fatherName: string, lastName: string,
   *     motherName: string, dateOfBirth: string, gender: 'male'|'female',
   *     phoneNumber?: string, governorate: string, city: string, address: string,
   *     guardianName?: string, guardianRelationship?: string,
   *     schoolName?: string, grade?: string,
   *     profilePhoto?: { url: string, uploadedAt: string }
   *   },
   *   patient: {
   *     _id: string, personId?: string, childId?: string,
   *     bloodType?: string, rhFactor?: string, height?: number,
   *     weight?: number, bmi?: number, smokingStatus?: string,
   *     alcoholConsumption?: string, exerciseFrequency?: string,
   *     dietType?: string, chronicDiseases: string[], allergies: string[],
   *     familyHistory: string[], previousSurgeries: object[],
   *     currentMedications: string[],
   *     emergencyContact?: { name: string, relationship: string, phoneNumber: string, alternativePhoneNumber?: string },
   *     medicalCardNumber?: string, totalVisits?: number, lastVisitDate?: string
   *   }
   * }>}
   */
  getMyProfile: async () => {
    try {
      const response = await api.get('/patient/profile');
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل الملف الشخصي';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  /* BACKEND TODO: implement PATCH /api/patient/profile */
  /**
   * Update the logged-in patient's editable profile fields.
   *
   * Email changes not supported in v1 — requires backend confirmation flow
   * (separate feature; see CLAUDE.md Current pending work item 10).
   *
   * National ID and names are read-only on the backend (not accepted in this
   * payload). Backend rejects any attempt to modify them.
   *
   * Editable fields (persons/children): phoneNumber, alternativePhoneNumber,
   *   address, governorate, city, district, street, building, profilePhoto.
   * Editable fields (patients): bloodType, rhFactor, height, weight,
   *   smokingStatus, alcoholConsumption, exerciseFrequency, dietType,
   *   allergies, chronicDiseases, familyHistory, currentMedications,
   *   emergencyContact.
   *
   * @param {object} payload - Partial profile update
   * @returns {Promise<{ success: true, person?: object, child?: object, patient: object }>}
   */
  updateMyProfile: async (payload) => {
    try {
      const response = await api.patch('/patient/profile', payload);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحديث الملف الشخصي';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 2 — DASHBOARD OVERVIEW
  // ════════════════════════════════════════════════════════════════

  /* BACKEND TODO: implement GET /api/patient/overview */
  /**
   * Get aggregate counts + recent activity for the home section KPI tiles.
   *
   * Backend computes by querying appointments, prescriptions, lab_tests,
   * notifications scoped to the current patientPersonId/patientChildId.
   * No single backing collection — aggregation only.
   *
   * @returns {Promise<{
   *   success: true,
   *   upcomingAppointments: number,
   *   activePrescriptions: number,
   *   pendingLabResults: number,
   *   unreadNotifications: number,
   *   recentActivity: Array<{
   *     _id: string,
   *     type: 'appointment'|'visit'|'prescription'|'lab_test'|'notification',
   *     title: string,
   *     subtitle?: string,
   *     occurredAt: string,
   *     relatedId?: string
   *   }>
   * }>}
   */
  getDashboardOverview: async () => {
    try {
      const response = await api.get('/patient/overview');
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل البيانات';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 3 — APPOINTMENTS
  // ════════════════════════════════════════════════════════════════

  /* BACKEND TODO: implement GET /api/patient/appointments */
  /**
   * List the patient's appointments.
   *
   * Scoped server-side by patientPersonId OR patientChildId from JWT.
   *
   * @param {object} [filters]
   * @param {string} [filters.status] - scheduled|confirmed|checked_in|in_progress|completed|cancelled|no_show|rescheduled
   * @param {string} [filters.from] - ISO date lower bound
   * @param {string} [filters.to] - ISO date upper bound
   * @returns {Promise<{
   *   success: true,
   *   count: number,
   *   appointments: Array<{
   *     _id: string, appointmentType: string, patientPersonId?: string,
   *     patientChildId?: string, doctorId?: string, dentistId?: string,
   *     laboratoryId?: string, hospitalId?: string, slotId?: string,
   *     appointmentDate: string, appointmentTime: string,
   *     estimatedDuration?: number, reasonForVisit: string,
   *     status: string, bookingMethod?: string,
   *     cancellationReason?: string, priority?: string,
   *     paymentStatus?: string, visitId?: string, notes?: string,
   *     createdAt: string
   *   }>
   * }>}
   */
  getAppointments: async (filters = {}) => {
    try {
      const response = await api.get('/patient/appointments', { params: filters });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل المواعيد';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  /* BACKEND TODO: implement GET /api/patient/appointments/:id */
  /**
   * Get a single appointment by ID. Backend verifies ownership.
   *
   * @param {string} appointmentId
   * @returns {Promise<{ success: true, appointment: object }>} — see getAppointments shape
   */
  getAppointmentById: async (appointmentId) => {
    try {
      const response = await api.get(`/patient/appointments/${appointmentId}`);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل الموعد';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  /* BACKEND TODO: implement PATCH /api/patient/appointments/:id/cancel */
  /**
   * Cancel an appointment. cancellationReason is a schema enum.
   *
   * @param {string} appointmentId
   * @param {{ cancellationReason: 'patient_request'|'doctor_unavailable'|'emergency'|'duplicate'|'other' }} payload
   * @returns {Promise<{ success: true, appointment: object }>}
   */
  cancelAppointment: async (appointmentId, payload) => {
    try {
      const response = await api.patch(`/patient/appointments/${appointmentId}/cancel`, payload);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في إلغاء الموعد';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  /* BACKEND TODO: implement POST /api/patient/appointments */
  /**
   * Book a new appointment by selecting an availability slot.
   *
   * Payload must include a valid slotId obtained from getDoctorSlots.
   * Patient identity resolved server-side from JWT (no patientId in payload).
   *
   * @param {object} payload
   * @param {string} payload.slotId - availability_slots._id
   * @param {'doctor'|'dentist'|'lab_test'|'follow_up'|'emergency'} payload.appointmentType
   * @param {string} payload.reasonForVisit
   * @param {'routine'|'urgent'|'emergency'} [payload.priority]
   * @param {string} [payload.notes]
   * @returns {Promise<{ success: true, appointment: object }>}
   */
  bookAppointment: async (payload) => {
    try {
      const response = await api.post('/patient/appointments', payload);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في حجز الموعد';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  /* BACKEND TODO: implement GET /api/patient/doctors */
  /**
   * Search doctors available for appointment booking.
   *
   * @param {object} [filters]
   * @param {string} [filters.specialization]
   * @param {string} [filters.governorate]
   * @param {string} [filters.city]
   * @param {boolean} [filters.isAvailable]
   * @returns {Promise<{
   *   success: true,
   *   count: number,
   *   doctors: Array<{
   *     _id: string, personId: string, firstName: string, lastName: string,
   *     specialization: string, subSpecializations?: string[],
   *     medicalLicenseNumber: string, yearsOfExperience?: number,
   *     consultationFee?: number, currency?: string,
   *     governorate?: string, city?: string, hospitalIds?: string[],
   *     averageRating?: number, reviewCount?: number, profilePhoto?: object
   *   }>
   * }>}
   */
  searchDoctors: async (filters = {}) => {
    try {
      const response = await api.get('/patient/doctors', { params: filters });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في البحث عن الأطباء';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  /* BACKEND TODO: implement GET /api/patient/doctors/:id/slots */
  /**
   * List a doctor's available appointment slots.
   *
   * @param {string} doctorId
   * @param {string} [date] - ISO date YYYY-MM-DD; defaults server-side to next 7 days
   * @returns {Promise<{
   *   success: true,
   *   count: number,
   *   slots: Array<{
   *     _id: string, doctorId: string, slotDate: string,
   *     startTime: string, endTime: string,
   *     duration: number, isBooked: boolean, appointmentId?: string
   *   }>
   * }>}
   */
  getDoctorSlots: async (doctorId, date) => {
    try {
      const response = await api.get(`/patient/doctors/${doctorId}/slots`, { params: date ? { date } : {} });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل المواعيد المتاحة';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 4 — VISITS
  // ════════════════════════════════════════════════════════════════

  /* BACKEND TODO: implement GET /api/patient/visits */
  /**
   * List the patient's completed/in-progress visits.
   *
   * @param {object} [filters]
   * @param {string} [filters.from] - ISO date lower bound
   * @param {string} [filters.to] - ISO date upper bound
   * @param {'in_progress'|'completed'|'cancelled'} [filters.status]
   * @returns {Promise<{
   *   success: true,
   *   count: number,
   *   visits: Array<{
   *     _id: string, visitType: string, patientPersonId?: string,
   *     patientChildId?: string, doctorId?: string, dentistId?: string,
   *     hospitalId?: string, appointmentId?: string,
   *     visitDate: string, status: string,
   *     chiefComplaint: string, diagnosis?: string,
   *     vitalSigns?: object, prescribedMedications?: object[],
   *     doctorNotes?: string, followUpDate?: string, followUpNotes?: string,
   *     visitPhotoUrl?: string, ecgAnalysis?: object,
   *     paymentStatus?: string, paymentMethod?: string, createdAt: string
   *   }>
   * }>}
   */
  getVisits: async (filters = {}) => {
    try {
      const response = await api.get('/patient/visits', { params: filters });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل الزيارات';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  /* BACKEND TODO: implement GET /api/patient/visits/:id */
  /**
   * Get a single visit by ID with full details including vitalSigns,
   * prescribedMedications, and ecgAnalysis (if present).
   *
   * @param {string} visitId
   * @returns {Promise<{ success: true, visit: object }>}
   */
  getVisitById: async (visitId) => {
    try {
      const response = await api.get(`/patient/visits/${visitId}`);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل الزيارة';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 5 — PRESCRIPTIONS
  // ════════════════════════════════════════════════════════════════

  /* BACKEND TODO: implement GET /api/patient/prescriptions */
  /**
   * List the patient's prescriptions.
   *
   * @param {object} [filters]
   * @param {'active'|'dispensed'|'partially_dispensed'|'expired'|'cancelled'} [filters.status]
   * @returns {Promise<{
   *   success: true,
   *   count: number,
   *   prescriptions: Array<{
   *     _id: string, prescriptionNumber: string, patientPersonId?: string,
   *     patientChildId?: string, doctorId?: string, visitId?: string,
   *     prescriptionDate: string, expiryDate: string,
   *     medications: Array<{
   *       medicationId?: string, medicationName: string, arabicName?: string,
   *       dosage: string, frequency: string, duration: string,
   *       route?: string, instructions?: string, quantity?: number,
   *       isDispensed: boolean, dispensedAt?: string
   *     }>,
   *     status: string, verificationCode?: string, qrCode?: string,
   *     prescriptionNotes?: string, dispensingId?: string, createdAt: string
   *   }>
   * }>}
   */
  getPrescriptions: async (filters = {}) => {
    try {
      const response = await api.get('/patient/prescriptions', { params: filters });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل الوصفات الطبية';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  /* BACKEND TODO: implement GET /api/patient/prescriptions/:id */
  /**
   * Get a single prescription by ID, including verificationCode + qrCode
   * used at pharmacy pickup.
   *
   * @param {string} prescriptionId
   * @returns {Promise<{ success: true, prescription: object }>}
   */
  getPrescriptionById: async (prescriptionId) => {
    try {
      const response = await api.get(`/patient/prescriptions/${prescriptionId}`);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل الوصفة الطبية';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 6 — LAB RESULTS
  // ════════════════════════════════════════════════════════════════

  /* BACKEND TODO: implement GET /api/patient/lab-tests */
  /**
   * List the patient's lab tests.
   *
   * @param {object} [filters]
   * @param {'ordered'|'scheduled'|'sample_collected'|'in_progress'|'completed'|'cancelled'|'rejected'} [filters.status]
   * @returns {Promise<{
   *   success: true,
   *   count: number,
   *   labTests: Array<{
   *     _id: string, testNumber: string, patientPersonId?: string,
   *     patientChildId?: string, orderedBy: string, visitId?: string,
   *     laboratoryId: string, orderDate: string, scheduledDate?: string,
   *     testsOrdered: object[], testCategory?: string, priority?: string,
   *     status: string, sampleCollectedAt?: string,
   *     testResults?: Array<{
   *       testCode?: string, testName: string, value: string,
   *       numericValue?: number, unit?: string, referenceRange?: string,
   *       isAbnormal?: boolean, isCritical?: boolean
   *     }>,
   *     resultPdfUrl?: string, completedAt?: string,
   *     isCritical?: boolean, isViewedByPatient?: boolean,
   *     patientViewedAt?: string, totalCost?: number, currency?: string,
   *     createdAt: string
   *   }>
   * }>}
   */
  getLabTests: async (filters = {}) => {
    try {
      const response = await api.get('/patient/lab-tests', { params: filters });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل نتائج المختبر';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  /* BACKEND TODO: implement GET /api/patient/lab-tests/:id */
  /**
   * Get a single lab test by ID with full testResults array and resultPdfUrl.
   *
   * @param {string} labTestId
   * @returns {Promise<{ success: true, labTest: object }>}
   */
  getLabTestById: async (labTestId) => {
    try {
      const response = await api.get(`/patient/lab-tests/${labTestId}`);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل نتيجة المختبر';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  /* BACKEND TODO: implement PATCH /api/patient/lab-tests/:id/viewed */
  /**
   * Mark a lab test as viewed by the patient.
   *
   * Backend sets lab_tests.isViewedByPatient = true and
   * lab_tests.patientViewedAt = now server-side.
   *
   * @param {string} labTestId
   * @returns {Promise<{ success: true }>}
   */
  markLabTestViewed: async (labTestId) => {
    try {
      const response = await api.patch(`/patient/lab-tests/${labTestId}/viewed`);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 7 — NOTIFICATIONS
  // ════════════════════════════════════════════════════════════════

  /* BACKEND TODO: implement GET /api/patient/notifications */
  /**
   * List the patient's notifications from the notifications collection.
   *
   * Backend filters by recipientId = current patient accountId and
   * recipientType = 'patient'.
   *
   * @param {object} [filters]
   * @param {boolean} [filters.unread] - if true, return only notifications with status != 'read'
   * @returns {Promise<{
   *   success: true,
   *   count: number,
   *   notifications: Array<{
   *     _id: string, recipientId: string, recipientType: 'patient',
   *     type: string, title: string, message: string,
   *     status: 'pending'|'sent'|'delivered'|'read'|'failed',
   *     priority: 'low'|'medium'|'high'|'urgent',
   *     channels?: string[], relatedId?: string, relatedType?: string,
   *     sentAt?: string, deliveredAt?: string, readAt?: string,
   *     expiresAt?: string, createdAt: string
   *   }>
   * }>}
   */
  getNotifications: async (filters = {}) => {
    try {
      const response = await api.get('/patient/notifications', { params: filters });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل الإشعارات';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  /* BACKEND TODO: implement PATCH /api/patient/notifications/:id/read */
  /**
   * Mark a notification as read.
   *
   * Backend sets notifications.status = 'read' and readAt = now.
   *
   * @param {string} notificationId
   * @returns {Promise<{ success: true }>}
   */
  markNotificationRead: async (notificationId) => {
    try {
      const response = await api.patch(`/patient/notifications/${notificationId}/read`);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 8 — REVIEWS
  // ════════════════════════════════════════════════════════════════

  /* BACKEND TODO: implement GET /api/patient/reviews */
  /**
   * List reviews submitted by the current patient.
   *
   * Backend scopes by reviewerPersonId OR reviewerChildId from JWT.
   *
   * @returns {Promise<{
   *   success: true,
   *   count: number,
   *   reviews: Array<{
   *     _id: string, reviewerPersonId?: string, reviewerChildId?: string,
   *     doctorId?: string, dentistId?: string, laboratoryId?: string,
   *     pharmacyId?: string, hospitalId?: string,
   *     visitId?: string, appointmentId?: string,
   *     rating: 1|2|3|4|5, reviewText?: string,
   *     status: 'pending'|'approved'|'rejected'|'flagged',
   *     isAnonymous?: boolean, adminNote?: string,
   *     createdAt: string, updatedAt: string
   *   }>
   * }>}
   */
  getMyReviews: async () => {
    try {
      const response = await api.get('/patient/reviews');
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل التقييمات';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  /* BACKEND TODO: implement POST /api/patient/reviews */
  /**
   * Submit a new review.
   *
   * Client-side validation: payload must include exactly one of doctorId,
   * dentistId, laboratoryId, pharmacyId, hospitalId. Method throws
   * { message: 'يجب اختيار جهة واحدة فقط للتقييم' } if this rule is violated.
   *
   * @param {object} payload
   * @param {1|2|3|4|5} payload.rating
   * @param {string} [payload.reviewText] - up to 1000 chars
   * @param {boolean} [payload.isAnonymous]
   * @param {string} [payload.doctorId]
   * @param {string} [payload.dentistId]
   * @param {string} [payload.laboratoryId]
   * @param {string} [payload.pharmacyId]
   * @param {string} [payload.hospitalId]
   * @param {string} [payload.visitId]
   * @param {string} [payload.appointmentId]
   * @returns {Promise<{ success: true, review: object }>}
   */
  submitReview: async (payload) => {
    // ── Client-side validation (amendment 1): exactly one target ─────────
    const targetKeys = ['doctorId', 'dentistId', 'laboratoryId', 'pharmacyId', 'hospitalId'];
    const targetCount = targetKeys.filter((k) => payload && payload[k]).length;
    if (targetCount !== 1) {
      throw { message: 'يجب اختيار جهة واحدة فقط للتقييم' };
    }

    try {
      const response = await api.post('/patient/reviews', payload);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في إرسال التقييم';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 9 — AI ASSISTANT
  // ════════════════════════════════════════════════════════════════

  /* BACKEND TODO: already exists at /api/patient/ai-symptom-analysis (inline handler in routes/patient.js:197) — migrate to proper controller */
  /**
   * Specialist-recommender AI. Sends Arabic symptom text to the FastAPI
   * service on :8001 and returns the suggested specialist, disease, and
   * body system.
   *
   * Ephemeral: not persisted in v1 (no collection). Consider persisting
   * to emergency_reports in a future pass if history is desired.
   *
   * @param {{ symptoms: string }} payload
   * @returns {Promise<{
   *   success: true,
   *   data: { specialist: string, disease: string, organ_system: string }
   * }>}
   */
  analyzeSymptoms: async (payload) => {
    try {
      const response = await api.post('/patient/ai-symptom-analysis', payload);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحليل الأعراض';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  /**
   * Emergency triage AI — proxies to Redwan's FastAPI via Node backend.
   *
   * The Node backend at POST /api/emergency:
   *   1. Saves the uploaded image/audio under /uploads/emergency/
   *   2. Calls the appropriate FastAPI endpoint:
   *        text  → POST :8000/predict/text   (form: text)
   *        image → POST :8000/predict/image  (form: image)
   *        voice → POST :8000/predict/voice  (form: audio)
   *   3. Maps FastAPI's rich response → DB schema enums
   *   4. Persists to emergency_reports collection
   *   5. Returns the saved report
   *
   * Required FormData fields (built by PatientDashboard.submitTriage):
   *   - text     : Arabic symptom description (string) — text mode
   *   - image    : File — image mode
   *   - audio    : File — voice mode
   *   - location : JSON-stringified GeoJSON Point
   *                e.g. '{"type":"Point","coordinates":[36.27,33.51]}'
   *   - locationAccuracy : meters (string), optional
   *   - locationAddress  : human-readable address (string), optional
   *   - governorate      : Syrian governorate enum (string), optional
   *
   * Note: 'inputType' is NO LONGER sent — the backend derives it from
   * which fields are present in req.body and req.files.
   *
   * @param {FormData} formData
   * @returns {Promise<{
   *   success: true,
   *   message: string,
   *   report: {
   *     _id: string,
   *     aiRiskLevel: 'low'|'moderate'|'high'|'critical',
   *     aiAssessment: string,
   *     aiFirstAid: string[],
   *     aiConfidenceScore: number,
   *     recommendAmbulance: boolean,
   *     status: 'active'|'resolved'|'false_alarm'|'referred_to_hospital'
   *   }
   * }>}
   */
  submitEmergencyReport: async (formData) => {
    try {
      const response = await api.post('/emergency', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        // 90s — covers Whisper transcription on CPU + classification
        timeout: 90000,
      });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message
        || error.message
        || 'حدث خطأ في إرسال تقرير الطوارئ';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  /**
   * List the patient's past emergency reports.
   *
   * Backend: GET /api/emergency/mine — scoped by reporterPersonId OR
   * reporterChildId from JWT. Sorted by reportedAt descending.
   *
   * @returns {Promise<{
   *   success: true,
   *   count: number,
   *   page: number,
   *   pages: number,
   *   reports: Array<{
   *     _id: string,
   *     reportedAt: string,
   *     inputType: 'text'|'image'|'voice'|'combined',
   *     textDescription?: string,
   *     imageUrl?: string,
   *     audioUrl?: string,
   *     aiRiskLevel: 'low'|'moderate'|'high'|'critical',
   *     aiAssessment: string,
   *     aiFirstAid: string[],
   *     aiConfidenceScore: number,
   *     recommendAmbulance: boolean,
   *     ambulanceStatus: string,
   *     status: string,
   *     createdAt: string
   *   }>
   * }>}
   */
  getEmergencyReports: async () => {
    try {
      const response = await api.get('/emergency/mine');
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message
        || error.message
        || 'حدث خطأ في تحميل تقارير الطوارئ';
      throw { message: errorMessage, ...error.response?.data };
    }
  }
};

// ============================================
// ✅ DOCTOR DASHBOARD APIs
// ============================================
//
// All endpoints route through the existing axios `api` instance, so they
// automatically inherit:
//   - The base URL from REACT_APP_API_URL
//   - The Authorization Bearer token from localStorage
//   - The 401 redirect logic
//   - Error handling
//
// FormData uploads explicitly override Content-Type to multipart/form-data
// and extend the timeout to 60 seconds (image uploads + AI inference can
// take longer than the default 10s, especially the X-Ray models).
//
// ─────────────────────────────────────────────────────────────────────
// EXPECTED BACKEND CONTRACTS — for the backend team
// ─────────────────────────────────────────────────────────────────────
// All endpoints expect a Bearer token in the Authorization header.
// All responses should follow this envelope shape:
//   { success: true,  ...data }     (on success)
//   { success: false, message: '...' } (on failure)
//
// Each method below documents the exact endpoint, HTTP verb, request
// payload, and expected response shape so the backend team has a clear
// contract to implement.
// ============================================

export const doctorAPI = {

  // ──────────────────────────────────────────
  // 1. DASHBOARD KPIs
  // ──────────────────────────────────────────
  /**
   * GET /api/doctor/dashboard/kpis
   *
   * Returns the four KPI numbers shown on the home page tiles.
   *
   * @returns {Promise<{
   *   appointmentsToday: number,
   *   patientsThisWeek: number,
   *   pendingLabs: number,         // lab_tests where orderedBy=doctor && isViewedByDoctor=false
   *   prescriptionsIssued: number  // prescriptions issued by this doctor in current month
   * }>}
   */
  getDashboardKPIs: async () => {
    try {
      const response = await api.get('/doctor/dashboard/kpis');
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل البيانات';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ──────────────────────────────────────────
  // 2. APPOINTMENTS
  // ──────────────────────────────────────────
  /**
   * GET /api/doctor/appointments
   *
   * Returns all appointments where doctorId = current logged-in doctor.
   * Optionally accepts ?from=YYYY-MM-DD&to=YYYY-MM-DD query params for
   * filtering by date range.
   */
  getMyAppointments: async (from, to) => {
    try {
      const params = {};
      if (from) params.from = from;
      if (to) params.to = to;
      const response = await api.get('/doctor/appointments', { params });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل المواعيد';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ──────────────────────────────────────────
  // 3. AVAILABILITY SLOTS
  // ──────────────────────────────────────────
  /**
   * GET /api/doctor/availability-slots
   */
  getMyAvailabilitySlots: async () => {
    try {
      const response = await api.get('/doctor/availability-slots');
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل المواعيد المتاحة';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  /**
   * POST /api/doctor/availability-slots
   */
  createAvailabilitySlot: async (slot) => {
    try {
      const response = await api.post('/doctor/availability-slots', slot);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في إضافة الموعد';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ──────────────────────────────────────────
  // 3.5 SCHEDULE TEMPLATE (Calendly-style — v2)
  // ──────────────────────────────────────────
  // The schedule template is the source of truth for the doctor's weekly
  // working hours. The backend uses it to AUTO-GENERATE availability_slots,
  // so the doctor no longer has to add slots one by one. Used in:
  //   • SignUp (submitted as part of the registration form)
  //   • DoctorDashboard "جدول العمل" section (view + edit)

  /**
   * GET /api/doctor/schedule-template
   * Returns the logged-in doctor's full weekly schedule template.
   * If the doctor has never saved one, returns a sane empty default
   * so the editor UI can mount without crashing.
   *
   * @returns {Promise<{success, scheduleTemplate, legacyAvailableDays}>}
   *   scheduleTemplate shape:
   *     {
   *       weeklyPattern: { Sunday: [...], Monday: [...], ... },
   *       slotDuration: number,
   *       bufferTime: number,
   *       bookingWindowDays: number,
   *       exceptions: [...],
   *       isActive: boolean
   *     }
   */
  getScheduleTemplate: async () => {
    try {
      const response = await api.get('/doctor/schedule-template');
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message
        || error.message
        || 'حدث خطأ في تحميل جدول العمل';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  /**
   * PUT /api/doctor/schedule-template
   * Save a new schedule template AND regenerate the doctor's
   * availability_slots collection from it. Booked + blocked slots are
   * preserved; only future unbooked slots are deleted and replaced.
   *
   * @param {Object} scheduleTemplate — full template object
   * @returns {Promise<{success, message, scheduleTemplate, slots: {deleted, inserted, kept}}>}
   */
  updateScheduleTemplate: async (scheduleTemplate) => {
    try {
      const response = await api.put('/doctor/schedule-template', { scheduleTemplate });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message
        || error.message
        || 'حدث خطأ في حفظ جدول العمل';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  /**
   * POST /api/doctor/schedule-template/regenerate
   * Regenerate availability_slots from the CURRENT schedule template,
   * without changing the template itself. Useful for extending the
   * booking window forward or recovering from manual deletions.
   *
   * @param {number} [daysAhead] — optional override for the booking window
   * @returns {Promise<{success, message, slots: {deleted, inserted, kept}}>}
   */
  regenerateScheduleSlots: async (daysAhead) => {
    try {
      const payload = (daysAhead !== undefined && daysAhead !== null)
        ? { daysAhead }
        : {};
      const response = await api.post('/doctor/schedule-template/regenerate', payload);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message
        || error.message
        || 'حدث خطأ في إعادة توليد المواعيد';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ──────────────────────────────────────────
  // 4. NOTIFICATIONS
  // ──────────────────────────────────────────
  /**
   * GET /api/doctor/notifications
   */
  getMyNotifications: async () => {
    try {
      const response = await api.get('/doctor/notifications');
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل الإشعارات';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  /**
   * PATCH /api/doctor/notifications/:id/read
   */
  markNotificationRead: async (notificationId) => {
    try {
      const response = await api.patch(`/doctor/notifications/${notificationId}/read`);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ──────────────────────────────────────────
  // 5. PATIENT LOOKUP
  // ──────────────────────────────────────────
  /**
   * GET /api/doctor/search/:nationalId
   */
  searchPatient: async (nationalId) => {
    try {
      const response = await api.get(`/doctor/search/${nationalId}`);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'لم يتم العثور على المريض';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  /**
   * GET /api/doctor/patient/:nationalId/visits
   */
  getPatientVisits: async (nationalId) => {
    try {
      const response = await api.get(`/doctor/patient/${nationalId}/visits`);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل سجل الزيارات';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  /**
   * POST /api/doctor/patient/:nationalId/visit
   */
  savePatientVisit: async (nationalId, formData) => {
    try {
      const response = await api.post(`/doctor/patient/${nationalId}/visit`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        timeout: 30000
      });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في حفظ الزيارة';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ──────────────────────────────────────────
  // 6. AI TOOLS — ECG (Cardiologist)
  // ──────────────────────────────────────────
  /**
   * POST /api/ecg/analyze
   */
  analyzeECG: async (formData) => {
    try {
      const response = await api.post('/ecg/analyze', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        timeout: 60000
      });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحليل تخطيط القلب';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ──────────────────────────────────────────
  // 7. AI TOOLS — X-RAY (Orthopedist) ⚠ NOT YET IMPLEMENTED IN BACKEND
  // ──────────────────────────────────────────
  analyzeXRayHand: async (formData) => {
    try {
      const response = await api.post('/xray/analyze-hand', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        timeout: 60000
      });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحليل صورة الأشعة';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  analyzeXRayLeg: async (formData) => {
    try {
      const response = await api.post('/xray/analyze-leg', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        timeout: 60000
      });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحليل صورة الأشعة';
      throw { message: errorMessage, ...error.response?.data };
    }
  }
  ,

  // ════════════════════════════════════════════════════════════════
  // SECTION 11 — المختبرات وطلبات التحاليل
  // ────────────────────────────────────────────────────────────────
  // يُمكّن الطبيب من اختيار مختبر من قائمة وإنشاء طلب تحليل.
  // طلب التحليل يُربط بالزيارة عبر visitId، فيعرف فني المختبر
  // أن هذا الطلب جاء من زيارة معينة عند البحث عن المريض برقمه
  // الوطني في صفحة "تسجيل العينات" الخاصة به.
  //
  // الـ Backend Endpoints:
  //   GET  /api/laboratories               → قائمة المختبرات النشطة
  //   GET  /api/laboratories/:id           → مختبر واحد + testCatalog
  //   POST /api/lab-tests                  → إنشاء طلب تحليل جديد
  //
  // كل الـ endpoints تتطلب JWT بدور 'doctor'.
  // ════════════════════════════════════════════════════════════════

  /**
   * GET /api/laboratories
   *
   * يُرجع قائمة بكل المختبرات النشطة في النظام. اختيارياً يمكن
   * الفلترة حسب المحافظة لإظهار مختبرات منطقة المريض أولاً.
   *
   * الباك يجب أن يُرجع فقط المختبرات حيث:
   *   isActive = true AND isAcceptingTests = true
   *
   * @param {string} [governorate] - فلتر اختياري (مثل 'damascus', 'tartus')
   * @returns {Promise<{
   *   success: boolean,
   *   laboratories: Array<{
   *     _id: string,
   *     name: string,
   *     arabicName?: string,
   *     governorate: string,
   *     city: string,
   *     district?: string,
   *     address: string,
   *     phoneNumber: string,
   *     labType?: 'independent'|'hospital_based'|'clinic_based'|'specialized',
   *     averageRating?: number,
   *     totalReviews?: number,
   *     isAcceptingTests?: boolean,
   *     testCatalogCount?: number
   *   }>
   * }>}
   */
  getLaboratories: async (governorate) => {
    try {
      const params = governorate ? { governorate } : {};
      const response = await api.get('/laboratories', { params });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message
                        || error.message
                        || 'حدث خطأ في تحميل قائمة المختبرات';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  /**
   * GET /api/laboratories/:id
   *
   * يُرجع تفاصيل مختبر واحد بما فيها قائمة التحاليل التي يقدمها
   * (testCatalog مثل CBC, FBS, HbA1c). تُستخدم لإظهار "ماذا يقدم
   * هذا المختبر" حتى يختار الطبيب من قائمة حقيقية بدلاً من كتابة
   * نص حر.
   *
   * @param {string} laboratoryId
   * @returns {Promise<{
   *   success: boolean,
   *   laboratory: {
   *     _id: string,
   *     name: string,
   *     arabicName?: string,
   *     governorate: string,
   *     city: string,
   *     phoneNumber: string,
   *     testCatalog: Array<{
   *       testCode: string,        // مثل 'CBC', 'FBS', 'HbA1c'
   *       testName: string,        // الاسم بالإنجليزية
   *       arabicName?: string,     // الاسم بالعربية
   *       category?: 'blood'|'urine'|'stool'|'imaging'|'microbiology'|'molecular'|'biopsy'|'other',
   *       price?: number,
   *       turnaroundTime?: string,
   *       isAvailable?: boolean
   *     }>
   *   }
   * }>}
   */
  getLaboratoryById: async (laboratoryId) => {
    if (!laboratoryId) {
      throw { message: 'معرّف المختبر مطلوب' };
    }
    try {
      const response = await api.get(`/laboratories/${laboratoryId}`);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message
                        || error.message
                        || 'حدث خطأ في تحميل بيانات المختبر';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  /**
   * POST /api/lab-tests
   *
   * يُنشئ طلب تحليل جديد. الطبيب الحالي هو orderedBy. فني المختبر
   * المختار سيرى الطلب في قائمة الطلبات المعلقة عند بحثه عن المريض
   * بالرقم الوطني.
   *
   * يجب على الباك أن:
   *   1. يتحقق من الحقول المطلوبة (laboratoryId, testsOrdered, مرجع المريض)
   *   2. يُولد testNumber بصيغة: LAB-YYYYMMDD-XXXXX
   *   3. يضع status='ordered', orderDate=now, orderedBy=req.user._id
   *   4. يضع isViewedByDoctor=false, isViewedByPatient=false
   *   5. إذا priority='stat'، يُنشئ in-app notification لكل فنيي
   *      المختبر بـ priority='urgent' و type='lab_test_stat_priority'
   *   6. يُرجع وثيقة الـ lab test المُنشأة
   *
   * أسماء الحقول مطابقة لـ lab_tests collection في
   * patient360_db_final.js بالضبط — patientPersonId / patientChildId
   * (واحد منهم مطلوب)، وليس patientId. testsOrdered مصفوفة من
   * {testCode, testName, notes}.
   *
   * @param {{
   *   patientPersonId?: string,        // للبالغين (واحد منهم مطلوب)
   *   patientChildId?: string,         // للأطفال (واحد منهم مطلوب)
   *   laboratoryId: string,            // مطلوب — أي مختبر سيُجري التحاليل
   *   visitId?: string,                // اختياري — ربط بالزيارة
   *   testsOrdered: Array<{
   *     testCode: string,              // مثل 'CBC' أو 'CUSTOM-1'
   *     testName: string,              // اسم التحليل
   *     notes?: string                 // ملاحظات لكل تحليل (اختياري)
   *   }>,
   *   testCategory?: 'blood'|'urine'|'stool'|'imaging'|'biopsy'|'microbiology'|'molecular'|'other',
   *   priority?: 'routine'|'urgent'|'stat',  // الافتراضي 'routine'
   *   scheduledDate?: string,          // ISO date — موعد متوقع للمريض
   *   sampleType?: 'blood'|'urine'|'stool'|'tissue'|'swab'|'saliva'|'other',
   *   labNotes?: string                // ملاحظة عامة للمختبر
   * }} payload
   * @returns {Promise<{
   *   success: boolean,
   *   labTest: {
   *     _id: string,
   *     testNumber: string,            // مثل 'LAB-20260422-00001'
   *     status: 'ordered',
   *     priority: string,
   *     laboratoryId: string,
   *     orderDate: string,
   *     testsOrdered: Array<object>
   *   }
   * }>}
   */
  createLabTest: async (payload) => {
    // التحقق من جانب العميل قبل إرسال الطلب — يعطي رسائل عربية واضحة.
    if (!payload || typeof payload !== 'object') {
      throw { message: 'بيانات الطلب غير صالحة' };
    }
    
    if (!Array.isArray(payload.testsOrdered) || payload.testsOrdered.length === 0) {
      throw { message: 'الرجاء إضافة تحليل واحد على الأقل' };
    }
    if (!payload.patientPersonId && !payload.patientChildId) {
      throw { message: 'بيانات المريض غير مكتملة' };
    }

    try {
      const response = await api.post('/lab-tests', payload);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message
                        || error.message
                        || 'حدث خطأ في إرسال طلب التحاليل';
      throw { message: errorMessage, ...error.response?.data };
    }
  }
};

// ============================================
// ✅ ADMIN DASHBOARD APIs
// ============================================
//
// All endpoints route through the existing axios `api` instance and require
// the logged-in user to have the 'admin' role. The backend should verify
// the role from the JWT token before processing any request.
//
// ─────────────────────────────────────────────────────────────────────
// EXPECTED BACKEND CONTRACTS — for the backend team
// ─────────────────────────────────────────────────────────────────────
// All endpoints expect a Bearer token in the Authorization header AND
// require admin role authorization.
//
// Standard response envelope:
//   { success: true,  ...data }     (on success)
//   { success: false, message: '...' } (on failure)
//
// All errors are caught and rethrown with a normalized shape so the
// frontend can rely on `error.message` always being a usable Arabic string.
//
// Field naming convention: All fields match patient360_db_final.js exactly.
// Doctor request fields are FLAT (firstName, lastName, specialization, etc.)
// not nested (personalInfo.firstName, doctorInfo.specialization, etc.) —
// the backend should return the flat shape to match this contract.
// ============================================


export const adminAPI = {

  // ════════════════════════════════════════════════════════════════
  // SECTION 1 — DASHBOARD STATISTICS & SYSTEM HEALTH
  // ════════════════════════════════════════════════════════════════

  /**
   * GET /api/admin/statistics
   *
   * Returns the full set of KPIs and aggregated data for the home page.
   * Backend v3 returns: { success, statistics: { ... } }
   * This method UNWRAPS .statistics so the dashboard can read flat keys.
   *
   * @returns {Promise<{
   *   totalDoctors: number,
   *   activeDoctors: number,
   *   inactiveDoctors: number,
   *   totalPatients: number,
   *   activePatients: number,
   *   totalAdultPatients: number,
   *   totalChildPatients: number,
   *   totalChildren: number,
   *   totalHospitals: number,
   *   activeHospitals: number,
   *   totalPharmacies: number,
   *   activePharmacies: number,
   *   totalLaboratories: number,
   *   activeLaboratories: number,
   *   totalVisits: number,
   *   todayVisits: number,
   *   visitsThisMonth: number,
   *   monthVisits: number,
   *   pendingRequests: number,
   *   pendingDoctorRequests: number,
   *   pendingPharmacistRequests: number,
   *   pendingLabTechRequests: number,
   *   activeEmergencies: number,
   *   criticalAlerts: number,
   *   pendingReviews: number,
   *   activeSessions: number,
   *   doctorsBySpecialization: Array<{ specialization: string, count: number }>,
   *   recentActivity: Array<{ action, description, timestamp }>
   * }>}
   */
  getDashboardStatistics: async () => {
    try {
      const response = await api.get('/admin/statistics');
      // Backend v3 shape: { success: true, statistics: {...} }
      // Older fallback:   the data already at the root level
      return response.data?.statistics ?? response.data ?? {};
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل الإحصائيات';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  /**
   * GET /api/admin/system-health
   *
   * Returns system health indicators for the admin overview page.
   * Backend v3 returns: { success, health: { ... } }
   *
   * @returns {Promise<{
   *   apiStatus: 'online' | 'offline',
   *   dbStatus: 'connected' | 'disconnected',
   *   activeSessions: number,
   *   lastBackup: string | null,
   *   uptime?: number,
   *   memoryUsage?: object
   * }>}
   */
  getSystemHealth: async () => {
    try {
      const response = await api.get('/admin/system-health');
      return response.data?.health ?? response.data ?? {};
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل حالة النظام';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 2 — NOTIFICATIONS
  // ════════════════════════════════════════════════════════════════

  getMyNotifications: async () => {
    try {
      const response = await api.get('/admin/notifications');
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل الإشعارات';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  markNotificationRead: async (notificationId) => {
    try {
      const response = await api.patch(`/admin/notifications/${notificationId}/read`);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحديث الإشعار';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 3 — DOCTOR REQUESTS (Doctors + Pharmacists + Lab Techs)
  // ════════════════════════════════════════════════════════════════

  /**
   * GET /api/admin/doctor-requests
   *
   * Accepts optional query params:
   *   { page, limit, search, status, requestType, specialization }
   *
   * Returns the full set of registration requests for review.
   * Each request has a `requestType` discriminator: 'doctor' | 'pharmacist' | 'lab_technician'
   */
  getDoctorRequests: async (params = {}) => {
    try {
      const response = await api.get('/admin/doctor-requests', { params });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل الطلبات';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  acceptDoctorRequest: async (requestId, payload = {}) => {
    try {
      const response = await api.post(`/admin/doctor-requests/${requestId}/accept`, payload);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في قبول الطلب';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  rejectDoctorRequest: async (requestId, payload) => {
    try {
      const response = await api.post(`/admin/doctor-requests/${requestId}/reject`, payload);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في رفض الطلب';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 4 — DOCTORS MANAGEMENT
  // ════════════════════════════════════════════════════════════════

  /**
   * GET /api/admin/doctors
   * @param {{ page?, limit?, search?, specialization?, governorate?, isAvailable?, isActive? }} params
   */
  getDoctors: async (params = {}) => {
    try {
      const response = await api.get('/admin/doctors', { params });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل الأطباء';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  createDoctor: async (payload) => {
    try {
      const response = await api.post('/admin/doctors', payload);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في إنشاء الطبيب';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  deactivateDoctor: async (doctorId, payload) => {
    try {
      const response = await api.put(`/admin/doctors/${doctorId}/deactivate`, payload);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تعطيل الطبيب';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  reactivateDoctor: async (doctorId) => {
    try {
      const response = await api.put(`/admin/doctors/${doctorId}/reactivate`);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في إعادة تفعيل الطبيب';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 5 — PATIENTS MANAGEMENT
  // ════════════════════════════════════════════════════════════════

  /**
   * GET /api/admin/patients
   * @param {{ page?, limit?, search?, type?, bloodType?, governorate?, gender?, isActive? }} params
   */
  getPatients: async (params = {}) => {
    try {
      const response = await api.get('/admin/patients', { params });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل المرضى';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  deactivatePatient: async (patientId, payload) => {
    try {
      const response = await api.put(`/admin/patients/${patientId}/deactivate`, payload);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تعطيل المريض';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  reactivatePatient: async (patientId) => {
    try {
      const response = await api.put(`/admin/patients/${patientId}/reactivate`);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في إعادة تفعيل المريض';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 6 — CHILDREN MANAGEMENT
  // ════════════════════════════════════════════════════════════════

  /**
   * GET /api/admin/children
   * @param {{ page?, limit?, search?, governorate?, gender?, migrationStatus?, parentNationalId? }} params
   */
  getChildren: async (params = {}) => {
    try {
      const response = await api.get('/admin/children', { params });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل الأطفال';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  migrateChild: async (childId) => {
    try {
      const response = await api.post(`/admin/children/${childId}/migrate`);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في ترحيل الطفل';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 7 — FACILITIES (Hospitals + Pharmacies + Laboratories)
  // ════════════════════════════════════════════════════════════════

  // ─── HOSPITALS ──────────────────────────────────────────────────

  /**
   * GET /api/admin/hospitals
   * @param {{ page?, limit?, search?, hospitalType?, governorate?, hasEmergency?, hasICU?, isActive? }} params
   */
  getHospitals: async (params = {}) => {
    try {
      const response = await api.get('/admin/hospitals', { params });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل المستشفيات';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  createHospital: async (payload) => {
    try {
      const response = await api.post('/admin/hospitals', payload);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في إنشاء المستشفى';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  updateHospital: async (hospitalId, payload) => {
    try {
      const response = await api.put(`/admin/hospitals/${hospitalId}`, payload);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحديث المستشفى';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ─── PHARMACIES ─────────────────────────────────────────────────

  /**
   * GET /api/admin/pharmacies
   * @param {{ page?, limit?, search?, pharmacyType?, governorate?, isAcceptingOrders?, isActive? }} params
   */
  getPharmacies: async (params = {}) => {
    try {
      const response = await api.get('/admin/pharmacies', { params });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل الصيدليات';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  createPharmacy: async (payload) => {
    try {
      const response = await api.post('/admin/pharmacies', payload);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في إنشاء الصيدلية';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  updatePharmacy: async (pharmacyId, payload) => {
    try {
      const response = await api.put(`/admin/pharmacies/${pharmacyId}`, payload);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحديث الصيدلية';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ─── LABORATORIES ───────────────────────────────────────────────

  /**
   * GET /api/admin/laboratories
   * @param {{ page?, limit?, search?, laboratoryType?, governorate?, hasHomeService?, hasEmergencyService?, isActive? }} params
   */
  getLaboratories: async (params = {}) => {
    try {
      const response = await api.get('/admin/laboratories', { params });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل المختبرات';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  createLaboratory: async (payload) => {
    try {
      const response = await api.post('/admin/laboratories', payload);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في إنشاء المختبر';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  updateLaboratory: async (laboratoryId, payload) => {
    try {
      const response = await api.put(`/admin/laboratories/${laboratoryId}`, payload);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحديث المختبر';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 8 — EMERGENCY REPORTS
  // ════════════════════════════════════════════════════════════════

  getEmergencyReports: async (params = {}) => {
    try {
      const response = await api.get('/admin/emergency-reports', { params });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل تقارير الطوارئ';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 9 — REVIEWS MODERATION
  // ════════════════════════════════════════════════════════════════

  getReviews: async (params = {}) => {
    try {
      const response = await api.get('/admin/reviews', { params });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل التقييمات';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  moderateReview: async (reviewId, payload) => {
    try {
      const response = await api.put(`/admin/reviews/${reviewId}/moderate`, payload);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في إدارة التقييم';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 10 — AUDIT LOGS  (the "خارقة" search)
  // ════════════════════════════════════════════════════════════════

  /**
   * GET /api/admin/audit-logs
   *
   * The audit log is the spine of the system's accountability. The backend
   * supports rich query filtering — this method forwards every supported
   * filter as a query parameter.
   *
   * @param {{
   *   page?: number,
   *   limit?: number,
   *   search?: string,           // free-text in description, userEmail, action
   *   action?: string,           // e.g. 'LOGIN', 'ACCEPT_DOCTOR_REQUEST'
   *   userRole?: string,         // 'admin' | 'doctor' | 'patient' | ...
   *   userEmail?: string,
   *   resourceType?: string,
   *   ipAddress?: string,
   *   platform?: string,         // 'web' | 'mobile' | 'api'
   *   success?: boolean,
   *   patientPersonId?: string,
   *   patientChildId?: string,
   *   from?: string,             // ISO date — start of range
   *   to?: string                // ISO date — end of range
   * }} params
   */
  getAuditLogs: async (params = {}) => {
    try {
      const response = await api.get('/admin/audit-logs', { params });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل سجل النظام';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 11 — ACCOUNT ACTIVITY (NEW)
  // ════════════════════════════════════════════════════════════════

  /**
   * GET /api/admin/account-activity/:email
   *
   * Returns a full activity report for one account: login statistics,
   * security events, recent activity feed, suspicious activity flag.
   *
   * Used by the new "نشاط الحسابات" (Account Activity) tab — typically
   * launched from a patient's complaint about unauthorized access so the
   * admin can investigate.
   *
   * @param {string} email   — the account email to audit
   * @param {{ days?: number }} params  — default 30
   *
   * @returns {Promise<{
   *   success: boolean,
   *   report: {
   *     profile: {
   *       email: string,
   *       role: string,
   *       isActive: boolean,
   *       lastLoginAt: string | null,
   *       failedLoginAttempts: number,
   *       isLocked: boolean,
   *       lockedUntil: string | null
   *     },
   *     stats: {
   *       totalEvents: number,
   *       successfulLogins: number,
   *       failedLogins: number,
   *       uniqueIPs: number,
   *       uniqueDevices: number,
   *       platforms: { web: number, mobile: number, api: number }
   *     },
   *     securityEvents: Array<{ action, timestamp, ipAddress, success, details }>,
   *     recentActivity: Array<{ action, description, timestamp, ipAddress, platform, success }>,
   *     suspicious: {
   *       flagged: boolean,
   *       reasons: string[]
   *     }
   *   }
   * }>}
   */
  getUserActivityReport: async (email, params = {}) => {
    try {
      const response = await api.get(
        `/admin/account-activity/${encodeURIComponent(email)}`,
        { params: { days: 30, ...params } }
      );
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل تقرير النشاط';
      throw { message: errorMessage, ...error.response?.data };
    }
  }

};


// ============================================================================
// ✅ PHARMACIST DASHBOARD APIs
// ============================================================================
//
// All endpoints route through the existing axios `api` instance and require
// the logged-in user to have the 'pharmacist' role. The backend should verify
// the role from the JWT token before processing any request.
//
// The pharmacist's pharmacyId is resolved from their pharmacists profile
// (pharmacists.pharmacyId → pharmacies._id) and injected automatically into
// all pharmacy_dispensing records on the backend — the frontend never has to
// pass it explicitly.
//
// ─────────────────────────────────────────────────────────────────────
// EXPECTED BACKEND CONTRACTS — for the backend team
// ─────────────────────────────────────────────────────────────────────
// All endpoints expect a Bearer token in the Authorization header AND
// require pharmacist role authorization.
//
// Standard response envelope:
//   { success: true,  ...data }     (on success)
//   { success: false, message: '...' } (on failure)
//
// All errors are caught and rethrown with a normalized shape so the
// frontend can rely on `error.message` always being a usable Arabic string.
//
// Field naming convention: All fields match patient360_db_final.js exactly.
// Prescription medications use the per-item isDispensed flag from the
// prescriptions.medications[] schema — the backend flips this to true ONLY
// for medications the pharmacist actually dispensed (the checked ones).
// Unchecked medications remain isDispensed=false so other pharmacies can
// still dispense them — this is the core multi-pharmacy safety mechanism.
// ============================================================================

export const pharmacistAPI = {

  // ════════════════════════════════════════════════════════════════
  // SECTION 1 — DASHBOARD KPIs
  // ════════════════════════════════════════════════════════════════

  /**
   * GET /api/pharmacist/dashboard/kpis
   *
   * Returns the four KPI numbers shown on the home page tiles plus the
   * recent activity feed. Backend computes these by querying
   * pharmacy_dispensing filtered by pharmacistId and pharmacyId.
   *
   * @returns {Promise<{
   *   success: boolean,
   *   kpis: {
   *     dispensedToday: number,           // pharmacy_dispensing count for today
   *     dispensedThisMonth: number,       // pharmacy_dispensing count for current month
   *     prescriptionBasedToday: number,   // dispensingType='prescription_based' today
   *     otcToday: number,                 // dispensingType='otc' today
   *     totalRevenueToday: number,        // sum(totalCost) for today in SYP
   *     totalRevenueMonth: number         // sum(totalCost) for current month in SYP
   *   },
   *   recentActivity: Array<{
   *     _id: string,
   *     dispensingNumber: string,
   *     dispensingType: 'prescription_based' | 'otc',
   *     patientName?: string,
   *     medicationCount: number,
   *     totalCost: number,
   *     dispensingDate: string
   *   }>,
   *   pharmacy: {                         // the pharmacist's pharmacy info
   *     _id: string,
   *     name: string,
   *     arabicName?: string,
   *     governorate: string,
   *     city: string,
   *     phoneNumber: string
   *   }
   * }>}
   */
  getDashboardKPIs: async () => {
    try {
      const response = await api.get('/pharmacist/dashboard/kpis');
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل البيانات';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 2 — NOTIFICATIONS
  // ════════════════════════════════════════════════════════════════

  /**
   * GET /api/pharmacist/notifications
   *
   * Returns all notifications for the pharmacist from the notifications
   * collection. Filter by recipientType='pharmacist' or recipientId=current
   * pharmacist's accountId.
   *
   * @returns {Promise<{
   *   success: boolean,
   *   notifications: Array<{
   *     _id: string,
   *     type: string,                    // prescription_ready | expiring_stock | etc
   *     title: string,
   *     message: string,
   *     status: 'pending'|'sent'|'delivered'|'read'|'failed',
   *     priority: 'low'|'medium'|'high'|'urgent',
   *     relatedId?: string,
   *     relatedType?: string,
   *     createdAt: string
   *   }>
   * }>}
   */
  getMyNotifications: async () => {
    try {
      const response = await api.get('/pharmacist/notifications');
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل الإشعارات';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  /**
   * PATCH /api/pharmacist/notifications/:id/read
   *
   * Marks a notification as read (sets status='read', readAt=now).
   */
  markNotificationRead: async (notificationId) => {
    try {
      const response = await api.patch(`/pharmacist/notifications/${notificationId}/read`);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 3 — PATIENT LOOKUP (by national ID)
  // ════════════════════════════════════════════════════════════════

  /**
   * GET /api/pharmacist/patient/:nationalId
   *
   * Searches for a patient by their 11-digit Syrian national ID and returns
   * their profile along with ALL their active and partially-dispensed
   * prescriptions across ALL doctors/visits — not filtered by pharmacy.
   *
   * CRITICAL: This endpoint is the heart of the multi-pharmacy safety
   * mechanism. The prescriptions returned MUST include the per-medication
   * isDispensed flag so the frontend can grey out already-dispensed items
   * and prevent double-dispensing.
   *
   * @param {string} nationalId - 11-digit Syrian national ID
   * @returns {Promise<{
   *   success: boolean,
   *   patient: {
   *     _id: string,
   *     personId: string,
   *     firstName: string,
   *     fatherName?: string,
   *     lastName: string,
   *     nationalId: string,
   *     dateOfBirth?: string,
   *     gender: 'male'|'female',
   *     phoneNumber?: string,
   *     governorate?: string,
   *     // From patients collection (joined):
   *     bloodType?: string,
   *     allergies: string[],              // CRITICAL for safety checks
   *     chronicDiseases: string[],
   *     currentMedications: string[]
   *   },
   *   prescriptions: Array<{
   *     _id: string,
   *     prescriptionNumber: string,       // e.g. 'RX-20250414-00001'
   *     prescriptionDate: string,
   *     expiryDate: string,
   *     status: 'active'|'dispensed'|'partially_dispensed'|'expired'|'cancelled',
   *     verificationCode: string,         // 6-digit code (backend may hide this;
   *                                       // if hidden, use verifyPrescriptionCode)
   *     qrCode?: string,
   *     prescriptionNotes?: string,
   *     doctor: {                         // joined doctor info
   *       _id: string,
   *       firstName: string,
   *       lastName: string,
   *       specialization: string,
   *       medicalLicenseNumber: string
   *     },
   *     medications: Array<{
   *       medicationId?: string,
   *       medicationName: string,
   *       arabicName?: string,
   *       scientificName?: string,        // used for allergy cross-check
   *       category?: string,              // used for allergy cross-check
   *       dosage: string,
   *       frequency: string,
   *       duration: string,
   *       route?: string,
   *       instructions?: string,
   *       quantity?: number,
   *       isDispensed: boolean,           // ⭐ the multi-pharmacy safety flag
   *       dispensedAt?: string,
   *       dispensedByPharmacy?: string,   // which pharmacy dispensed it (for display)
   *       // Extended fields for safety checks (joined from medications collection):
   *       controlledSubstance?: boolean,  // triggers double-confirmation
   *       requiresPrescription?: boolean,
   *       interactions?: string[]         // list of interacting drug names
   *     }>
   *   }>
   * }>}
   */
  searchPatientByNationalId: async (nationalId) => {
    try {
      const response = await api.get(`/pharmacist/patient/${nationalId}`);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'لم يتم العثور على المريض';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 4 — PRESCRIPTION VERIFICATION
  // ════════════════════════════════════════════════════════════════

  /**
   * POST /api/pharmacist/prescriptions/:id/verify
   *
   * Verifies the 6-digit verification code against a prescription. Backend
   * should compare the submitted code against prescriptions.verificationCode
   * in constant time and return success/failure. This is separated from the
   * dispense call so the frontend can show a success state before the
   * pharmacist picks which medications to dispense.
   *
   * @param {string} prescriptionId
   * @param {{ verificationCode: string }} payload
   * @returns {Promise<{
   *   success: boolean,
   *   verified: boolean,
   *   message?: string
   * }>}
   */
  verifyPrescriptionCode: async (prescriptionId, payload) => {
    try {
      const response = await api.post(`/pharmacist/prescriptions/${prescriptionId}/verify`, payload);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'رمز التحقق غير صحيح';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 5 — DISPENSE PRESCRIPTION
  // ════════════════════════════════════════════════════════════════

  /**
   * POST /api/pharmacist/dispense
   *
   * Dispenses selected medications from a verified prescription. The backend
   * must do the following in a transaction:
   *   1. Re-verify the pharmacist is authorised (JWT role check)
   *   2. Re-verify prescription status is 'active' or 'partially_dispensed'
   *   3. Re-verify prescription is not expired (expiryDate > now)
   *   4. For each medication in medicationsDispensed:
   *        a. Mark prescriptions.medications[i].isDispensed = true
   *        b. Set prescriptions.medications[i].dispensedAt = now
   *        c. Decrement pharmacy_inventory stock (if tracked)
   *   5. If all medications now have isDispensed=true → status='dispensed'
   *      else → status='partially_dispensed'
   *   6. Create a new pharmacy_dispensing document with:
   *        - dispensingNumber auto-generated: DISP-YYYYMMDD-XXXXX
   *        - dispensingType='prescription_based'
   *        - prescriptionId and prescriptionNumber (denormalized)
   *        - pharmacyId from the pharmacist's profile
   *        - pharmacistId from the JWT
   *        - patientPersonId or patientChildId (whichever applies)
   *        - medicationsDispensed array (exactly what was sent)
   *   7. Set prescriptions.dispensingId = new dispensing doc _id
   *   8. Send FCM push to patient: 'prescription_dispensed'
   *   9. Return the new dispensing doc in the response
   *
   * IMPORTANT: Only medications in the medicationsDispensed array get
   * isDispensed=true. Unchecked medications remain isDispensed=false so
   * the patient can fulfill them at a different pharmacy.
   *
   * @param {{
   *   prescriptionId: string,
   *   patientPersonId?: string,         // one of these required
   *   patientChildId?: string,          // one of these required
   *   medicationsDispensed: Array<{
   *     medicationName: string,
   *     quantityDispensed: number,
   *     batchNumber?: string,
   *     expiryDate?: string,
   *     unitPrice?: number,
   *     isGenericSubstitute: boolean,
   *     pharmacistNotes?: string
   *   }>,
   *   totalCost: number,
   *   currency: 'SYP' | 'USD',
   *   paymentMethod: 'cash' | 'card' | 'insurance' | 'free',
   *   notes?: string
   * }} payload
   * @returns {Promise<{
   *   success: boolean,
   *   dispensing: {
   *     _id: string,
   *     dispensingNumber: string,
   *     dispensingType: 'prescription_based',
   *     prescriptionNumber: string,
   *     medicationsDispensed: Array<object>,
   *     totalCost: number,
   *     paymentMethod: string,
   *     dispensingDate: string
   *   },
   *   updatedPrescriptionStatus: 'dispensed' | 'partially_dispensed'
   * }>}
   */
  dispensePrescription: async (payload) => {
    try {
      const response = await api.post('/pharmacist/dispense', payload);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ أثناء صرف الوصفة';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 6 — DISPENSE OTC (Over The Counter — no prescription)
  // ════════════════════════════════════════════════════════════════

  /**
   * POST /api/pharmacist/dispense-otc
   *
   * Records an over-the-counter sale without a doctor's prescription.
   * The DB schema marks otcReason as REQUIRED — the backend must reject
   * the request if otcReason is empty or missing.
   *
   * Backend workflow:
   *   1. Re-verify pharmacist role
   *   2. Validate otcReason is present and non-empty
   *   3. Validate all medications have requiresPrescription=false
   *      (if known in medications collection) — optional safety check
   *   4. Create pharmacy_dispensing document with:
   *        - dispensingNumber auto-generated
   *        - dispensingType='otc'
   *        - pharmacyId + pharmacistId from JWT
   *        - patientPersonId (optional — may be null for walk-ins)
   *        - medicationsDispensed array
   *        - otcReason (required)
   *        - otcNotes (optional)
   *   5. If patientPersonId was provided → also append an entry to the
   *      patient's medication history view
   *   6. Return the new dispensing doc
   *
   * @param {{
   *   patientPersonId?: string,         // optional — null for walk-ins
   *   patientChildId?: string,          // optional
   *   medicationsDispensed: Array<{
   *     medicationId?: string,
   *     medicationName: string,
   *     arabicName?: string,
   *     quantityDispensed: number,
   *     unitPrice: number
   *   }>,
   *   totalCost: number,
   *   currency: 'SYP' | 'USD',
   *   paymentMethod: 'cash' | 'card' | 'insurance' | 'free',
   *   otcReason: string,                // REQUIRED per DB schema
   *   otcNotes?: string,
   *   notes?: string
   * }} payload
   * @returns {Promise<{
   *   success: boolean,
   *   dispensing: {
   *     _id: string,
   *     dispensingNumber: string,
   *     dispensingType: 'otc',
   *     medicationsDispensed: Array<object>,
   *     totalCost: number,
   *     dispensingDate: string
   *   }
   * }>}
   */
  dispenseOTC: async (payload) => {
    try {
      const response = await api.post('/pharmacist/dispense-otc', payload);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ أثناء الصرف';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 7 — DISPENSING HISTORY
  // ════════════════════════════════════════════════════════════════

  /**
   * GET /api/pharmacist/dispensing-history
   *
   * Returns all pharmacy_dispensing records created by this pharmacist,
   * sorted by dispensingDate descending (newest first). Optionally accepts
   * a ?type= query param to filter by dispensingType.
   *
   * @param {'all' | 'prescription_based' | 'otc'} [filter='all']
   * @returns {Promise<{
   *   success: boolean,
   *   history: Array<{
   *     _id: string,
   *     dispensingNumber: string,
   *     dispensingType: 'prescription_based' | 'otc',
   *     prescriptionNumber?: string,
   *     patientName?: string,
   *     patientNationalId?: string,
   *     medicationsDispensed: Array<{
   *       medicationName: string,
   *       quantityDispensed: number,
   *       unitPrice?: number,
   *       isGenericSubstitute?: boolean
   *     }>,
   *     totalCost: number,
   *     currency: string,
   *     paymentMethod: string,
   *     otcReason?: string,
   *     notes?: string,
   *     dispensingDate: string
   *   }>
   * }>}
   */
  getDispensingHistory: async (filter = 'all') => {
    try {
      const params = {};
      if (filter && filter !== 'all') params.type = filter;
      const response = await api.get('/pharmacist/dispensing-history', { params });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل السجل';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 8 — MEDICATION LOOKUP (for OTC autocomplete)
  // ════════════════════════════════════════════════════════════════

  /**
   * GET /api/pharmacist/medications/search?q=...
   *
   * Searches the medications catalog for OTC autocomplete. Should match
   * against tradeName, arabicTradeName, scientificName, and arabicScientificName.
   * Returns only medications where isAvailable=true and isDiscontinued=false.
   *
   * @param {string} query - 2+ characters
   * @returns {Promise<{
   *   success: boolean,
   *   medications: Array<{
   *     _id: string,
   *     medicationCode: string,
   *     tradeName: string,
   *     arabicTradeName?: string,
   *     scientificName: string,
   *     arabicScientificName?: string,
   *     strength?: string,
   *     dosageForm: string,
   *     category: string,
   *     requiresPrescription: boolean,
   *     controlledSubstance: boolean
   *   }>
   * }>}
   */
  searchMedications: async (query) => {
    try {
      const response = await api.get('/pharmacist/medications/search', { params: { q: query } });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في البحث عن الدواء';
      throw { message: errorMessage, ...error.response?.data };
    }
  }
};
// ============================================================================
// ✅ LAB DASHBOARD APIs
// ============================================================================
//
// All endpoints route through the existing axios `api` instance and require
// the logged-in user to have the 'lab_technician' role. The backend should
// verify the role from the JWT token before processing any request.
//
// The lab technician's laboratoryId is resolved from their lab_technicians
// profile (lab_technicians.laboratoryId → laboratories._id) and injected
// automatically into all lab_tests queries on the backend — the frontend
// never has to pass it explicitly.
//
// ─────────────────────────────────────────────────────────────────────
// EXPECTED BACKEND CONTRACTS — for the backend team
// ─────────────────────────────────────────────────────────────────────
// All endpoints expect a Bearer token in the Authorization header AND
// require lab_technician role authorization.
//
// Standard response envelope:
//   { success: true,  ...data }     (on success)
//   { success: false, message: '...' } (on failure)
//
// All errors are caught and rethrown with a normalized shape so the
// frontend can rely on `error.message` always being a usable Arabic string.
//
// Field naming convention: All fields match patient360_db_final.js exactly.
// The lab_tests collection schema is the source of truth for all status
// transitions and field names. The valid status enum is:
//   ordered → scheduled → sample_collected → in_progress → completed
//                                                        ↘ cancelled
//                                                        ↘ rejected
// ============================================================================

export const labAPI = {

  // ════════════════════════════════════════════════════════════════
  // SECTION 1 — DASHBOARD KPIs
  // ════════════════════════════════════════════════════════════════

  /**
   * GET /api/lab/dashboard/kpis
   *
   * Returns the four KPI numbers shown on the home page tiles plus the
   * recent activity feed. Backend computes these by querying lab_tests
   * filtered by laboratoryId (from the technician's profile) and by date.
   *
   * @returns {Promise<{
   *   success: boolean,
   *   kpis: {
   *     samplesCollectedToday: number,    // lab_tests.sampleCollectedAt is today AND sampleCollectedBy=current tech
   *     inProgress: number,               // lab_tests where laboratoryId=this lab AND status='in_progress'
   *     completedToday: number,           // lab_tests.completedAt is today AND completedBy=current tech
   *     completedThisMonth: number,       // lab_tests.completedAt in current month AND laboratoryId=this lab
   *     pendingResults: number,           // lab_tests.status='sample_collected' AND laboratoryId=this lab
   *     criticalAlerts: number            // lab_tests.isCritical=true AND status='completed' in last 24h
   *   },
   *   recentActivity: Array<{
   *     _id: string,
   *     testNumber: string,
   *     action: 'sample_collected' | 'completed' | 'in_progress',
   *     patientName?: string,
   *     testNames?: string[],
   *     timestamp: string,
   *     isCritical?: boolean
   *   }>,
   *   laboratory: {                       // the technician's laboratory info
   *     _id: string,
   *     name: string,
   *     arabicName?: string,
   *     governorate: string,
   *     city: string,
   *     phoneNumber: string,
   *     labType?: string
   *   }
   * }>}
   */
  getDashboardKPIs: async () => {
    try {
      const response = await api.get('/lab/dashboard/kpis');
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل البيانات';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 2 — NOTIFICATIONS
  // ════════════════════════════════════════════════════════════════

  /**
   * GET /api/lab/notifications
   *
   * Returns all notifications for the lab technician from the notifications
   * collection. Filter by recipientType='lab_technician' or recipientId=
   * current technician's accountId.
   *
   * @returns {Promise<{
   *   success: boolean,
   *   notifications: Array<{
   *     _id: string,
   *     type: string,
   *     title: string,
   *     message: string,
   *     status: 'pending'|'sent'|'delivered'|'read'|'failed',
   *     priority: 'low'|'medium'|'high'|'urgent',
   *     relatedId?: string,
   *     relatedType?: string,
   *     createdAt: string
   *   }>
   * }>}
   */
  getMyNotifications: async () => {
    try {
      const response = await api.get('/lab/notifications');
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل الإشعارات';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  /**
   * PATCH /api/lab/notifications/:id/read
   *
   * Marks a notification as read (sets status='read', readAt=now).
   */
  markNotificationRead: async (notificationId) => {
    try {
      const response = await api.patch(`/lab/notifications/${notificationId}/read`);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 3 — PATIENT LOOKUP (for sample collection)
  // ════════════════════════════════════════════════════════════════

  /**
   * GET /api/lab/patient/:nationalId
   *
   * Searches for a patient by their 11-digit Syrian national ID and returns
   * their profile along with all their lab_tests where laboratoryId matches
   * the current technician's lab AND status is one of:
   *   'ordered' | 'scheduled' | 'sample_collected' | 'in_progress'
   *
   * Completed tests are NOT returned here — they live in the History section.
   *
   * @param {string} nationalId - 11-digit Syrian national ID
   * @returns {Promise<{
   *   success: boolean,
   *   patient: {
   *     _id: string,
   *     personId?: string,
   *     childId?: string,
   *     firstName: string,
   *     fatherName?: string,
   *     lastName: string,
   *     nationalId: string,
   *     dateOfBirth?: string,
   *     gender: 'male'|'female',
   *     phoneNumber?: string,
   *     governorate?: string,
   *     bloodType?: string,
   *     allergies?: string[],
   *     chronicDiseases?: string[]
   *   },
   *   labTests: Array<{
   *     _id: string,
   *     testNumber: string,             // e.g. 'LAB-20250414-00001'
   *     orderDate: string,
   *     scheduledDate?: string,
   *     status: 'ordered'|'scheduled'|'sample_collected'|'in_progress',
   *     priority: 'routine'|'urgent'|'stat',
   *     testCategory?: string,          // blood|urine|stool|imaging|...
   *     testsOrdered: Array<{
   *       testCode: string,
   *       testName: string,
   *       notes?: string
   *     }>,
   *     orderedBy: {                    // joined doctor info
   *       _id: string,
   *       firstName: string,
   *       lastName: string,
   *       specialization?: string,
   *       medicalLicenseNumber?: string
   *     },
   *     sampleType?: string,
   *     sampleId?: string,              // present if status >= sample_collected
   *     sampleCollectedAt?: string,
   *     totalCost?: number,
   *     currency?: string
   *   }>
   * }>}
   */
  searchPatientByNationalId: async (nationalId) => {
    try {
      const response = await api.get(`/lab/patient/${nationalId}`);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'لم يتم العثور على المريض';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 4 — SAMPLE COLLECTION (status: ordered → sample_collected)
  // ════════════════════════════════════════════════════════════════

  /**
   * PUT /api/lab/tests/:id/collect-sample
   *
   * Records sample collection for a lab test. The backend should:
   *   1. Re-verify the technician is authorized (JWT role + laboratoryId match)
   *   2. Verify the lab test status is 'ordered' or 'scheduled'
   *   3. Update the lab_tests document:
   *        - status = 'sample_collected'
   *        - sampleId (lab-assigned barcode/ID)
   *        - sampleType (from enum)
   *        - sampleCollectedAt = now
   *        - sampleCollectedBy = current technician's lab_technicians._id
   *   4. Send FCM push to patient: 'sample_collected'
   *
   * @param {string} testId - lab_tests._id
   * @param {{
   *   sampleId: string,
   *   sampleType: 'blood'|'urine'|'stool'|'tissue'|'swab'|'saliva'|'other'
   * }} payload
   * @returns {Promise<{
   *   success: boolean,
   *   labTest: object   // updated lab_tests document
   * }>}
   */
  collectSample: async (testId, payload) => {
    try {
      const response = await api.put(`/lab/tests/${testId}/collect-sample`, payload);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تسجيل العينة';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 5 — TESTS READY FOR PROCESSING
  // ════════════════════════════════════════════════════════════════

  /**
   * GET /api/lab/tests/ready
   *
   * Returns all lab_tests where laboratoryId = this lab AND status is
   * 'sample_collected'. These are the tests waiting for the technician
   * to enter results.
   *
   * Sorted by priority (stat > urgent > routine) then by sampleCollectedAt
   * descending.
   *
   * @returns {Promise<{
   *   success: boolean,
   *   tests: Array<{
   *     _id: string,
   *     testNumber: string,
   *     status: 'sample_collected',
   *     priority: 'routine'|'urgent'|'stat',
   *     testCategory?: string,
   *     sampleId: string,
   *     sampleType: string,
   *     sampleCollectedAt: string,
   *     testsOrdered: Array<{
   *       testCode: string,
   *       testName: string,
   *       notes?: string
   *     }>,
   *     orderedBy: {
   *       firstName: string,
   *       lastName: string,
   *       specialization?: string
   *     },
   *     patientName?: string,
   *     patientNationalId?: string,
   *     patientDateOfBirth?: string,
   *     patientGender?: 'male'|'female'
   *   }>
   * }>}
   */
  getReadyTests: async () => {
    try {
      const response = await api.get('/lab/tests/ready');
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل التحاليل';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 6 — START PROCESSING (status: sample_collected → in_progress)
  // ════════════════════════════════════════════════════════════════

  /**
   * PUT /api/lab/tests/:id/start
   *
   * Marks a test as in progress when the technician begins entering results.
   * The backend should:
   *   1. Re-verify technician authorization
   *   2. Verify status is 'sample_collected'
   *   3. Update status to 'in_progress'
   *
   * @param {string} testId
   * @returns {Promise<{ success: boolean, labTest: object }>}
   */
  startProcessing: async (testId) => {
    try {
      const response = await api.put(`/lab/tests/${testId}/start`);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في بدء التحليل';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 7 — SUBMIT RESULTS (status: in_progress → completed)
  // ════════════════════════════════════════════════════════════════

  /**
   * PUT /api/lab/tests/:id/complete
   *
   * Submits the final test results AND uploads the result PDF in a single
   * multipart/form-data request. The backend should:
   *   1. Re-verify technician authorization and laboratoryId match
   *   2. Verify status is 'in_progress' or 'sample_collected'
   *   3. Validate testResults array is non-empty OR resultPdf is provided
   *   4. Save the PDF file to storage (S3, local, etc.) and get a URL
   *   5. Update the lab_tests document:
   *        - testResults (parsed from JSON in form field)
   *        - resultPdfUrl (storage URL)
   *        - resultPdfUploadedAt = now
   *        - resultPdfUploadedBy = current technician's _id
   *        - labNotes
   *        - isCritical (boolean from form field)
   *        - completedAt = now
   *        - completedBy = current technician's _id
   *        - status = 'completed'
   *        - isViewedByDoctor = false (triggers notification)
   *        - isViewedByPatient = false (triggers notification)
   *   6. Send FCM push to ordering doctor: 'lab_results_ready' or
   *      'lab_results_critical' if isCritical=true
   *   7. Send FCM push to patient: 'lab_results_ready'
   *
   * @param {string} testId
   * @param {FormData} formData - must contain:
   *   - testResults: JSON string of Array<{
   *       testCode: string,
   *       testName: string,
   *       value: string,
   *       numericValue?: number,
   *       unit?: string,
   *       referenceRange?: string,
   *       isAbnormal: boolean,
   *       isCritical: boolean
   *     }>
   *   - labNotes: string (may be empty)
   *   - isCritical: 'true' | 'false' (overall critical flag)
   *   - resultPdf: File (PDF only, max 10MB) — REQUIRED unless testResults non-empty
   * @returns {Promise<{
   *   success: boolean,
   *   labTest: {
   *     _id: string,
   *     testNumber: string,
   *     status: 'completed',
   *     completedAt: string,
   *     resultPdfUrl?: string,
   *     isCritical: boolean
   *   }
   * }>}
   */
  submitResults: async (testId, formData) => {
    try {
      const response = await api.put(`/lab/tests/${testId}/complete`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000   // PDF uploads can take longer than the default 10s
      });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في إرسال النتائج';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 8 — TEST HISTORY
  // ════════════════════════════════════════════════════════════════

  /**
   * GET /api/lab/tests
   *
   * Returns all lab_tests for this laboratory, optionally filtered by status.
   * Sorted by orderDate descending (newest first).
   *
   * @param {'all'|'completed'|'in_progress'|'sample_collected'|'ordered'} [filter='all']
   * @returns {Promise<{
   *   success: boolean,
   *   tests: Array<{
   *     _id: string,
   *     testNumber: string,
   *     status: string,
   *     priority: string,
   *     testCategory?: string,
   *     orderDate: string,
   *     scheduledDate?: string,
   *     sampleCollectedAt?: string,
   *     completedAt?: string,
   *     testsOrdered: Array<{ testCode: string, testName: string }>,
   *     patientName?: string,
   *     patientNationalId?: string,
   *     orderedByName?: string,
   *     sampleId?: string,
   *     resultPdfUrl?: string,
   *     isCritical?: boolean,
   *     isViewedByDoctor?: boolean,
   *     isViewedByPatient?: boolean,
   *     totalCost?: number,
   *     currency?: string
   *   }>
   * }>}
   */
  getMyTests: async (filter = 'all') => {
    try {
      const params = {};
      if (filter && filter !== 'all') params.status = filter;
      const response = await api.get('/lab/tests', { params });
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في تحميل السجل';
      throw { message: errorMessage, ...error.response?.data };
    }
  },

  // ════════════════════════════════════════════════════════════════
  // SECTION 9 — REJECT TEST (for unfit samples)
  // ════════════════════════════════════════════════════════════════

  /**
   * POST /api/lab/tests/:id/reject
   *
   * Rejects a test (e.g. sample is hemolyzed, insufficient volume, etc.).
   * The backend should:
   *   1. Re-verify technician authorization
   *   2. Update status to 'rejected'
   *   3. Save rejectionReason
   *   4. Send notification to the ordering doctor with the reason
   *
   * @param {string} testId
   * @param {{ rejectionReason: string }} payload
   * @returns {Promise<{ success: boolean }>}
   */
  rejectTest: async (testId, payload) => {
    try {
      const response = await api.post(`/lab/tests/${testId}/reject`, payload);
      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'حدث خطأ في رفض التحليل';
      throw { message: errorMessage, ...error.response?.data };
    }
  }
};

// ============================================
// VISIT APIs (Will implement in Week 2)
// ============================================
export const visitAPI = {
  // Create new visit
  create: async (visitData) => {
    try {
      const response = await api.post('/visits', visitData);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  // Get all visits for a patient
  getPatientVisits: async (patientId) => {
    try {
      const response = await api.get(`/visits/patient/${patientId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  // Get visit by ID
  getById: async (visitId) => {
    try {
      const response = await api.get(`/visits/${visitId}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  }
};

export default api;