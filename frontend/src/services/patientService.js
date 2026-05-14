// src/services/patientService.js
/**
 * Patient Service
 * 
 * Handles all patient-related operations:
 * - Get all patients
 * - Get patient by ID
 * - Update patient data
 * - Search patients
 * - Save medical data (ECG, medications, vitals, etc.)
 * 
 * CURRENT: Uses localStorage
 * FUTURE: Backend developer will replace with API calls
 */

/**
 * Get all patients
 * 
 * BACKEND API NEEDED:
 * GET /api/patients
 * Headers: { Authorization: "Bearer <token>" }
 * Response: { patients: [...] }
 */
export const getAllPatients = async () => {
  try {
    // ========================================
    // CURRENT IMPLEMENTATION (localStorage)
    // ========================================
    const patients = JSON.parse(localStorage.getItem('patients') || '[]');
    return {
      success: true,
      patients
    };
    
    // ========================================
    // FUTURE IMPLEMENTATION (Backend API)
    // ========================================
    // const token = localStorage.getItem('authToken');
    // 
    // const response = await fetch(`${API_URL}/api/patients`, {
    //   headers: {
    //     'Authorization': `Bearer ${token}`
    //   }
    // });
    // 
    // const data = await response.json();
    // return data;
    
  } catch (error) {
    console.error('Get all patients error:', error);
    return {
      success: false,
      patients: [],
      message: 'حدث خطأ في جلب بيانات المرضى'
    };
  }
};

/**
 * Get patient by ID or nationalId
 * 
 * BACKEND API NEEDED:
 * GET /api/patients/:id
 * OR
 * GET /api/patients/by-national-id/:nationalId
 * Headers: { Authorization: "Bearer <token>" }
 * Response: { patient: {...} }
 */
export const getPatientById = async (identifier, byNationalId = false) => {
  try {
    // ========================================
    // CURRENT IMPLEMENTATION (localStorage)
    // ========================================
    const patients = JSON.parse(localStorage.getItem('patients') || '[]');
    
    const patient = byNationalId
      ? patients.find(p => p.nationalId === identifier)
      : patients.find(p => p.id === identifier);
    
    if (patient) {
      return {
        success: true,
        patient
      };
    } else {
      return {
        success: false,
        message: 'لم يتم العثور على المريض'
      };
    }
    
    // ========================================
    // FUTURE IMPLEMENTATION (Backend API)
    // ========================================
    // const token = localStorage.getItem('authToken');
    // const endpoint = byNationalId 
    //   ? `${API_URL}/api/patients/by-national-id/${identifier}`
    //   : `${API_URL}/api/patients/${identifier}`;
    // 
    // const response = await fetch(endpoint, {
    //   headers: {
    //     'Authorization': `Bearer ${token}`
    //   }
    // });
    // 
    // const data = await response.json();
    // return data;
    
  } catch (error) {
    console.error('Get patient error:', error);
    return {
      success: false,
      message: 'حدث خطأ في جلب بيانات المريض'
    };
  }
};

/**
 * Update patient medical data
 * This is THE MAIN FUNCTION used by doctors
 * 
 * BACKEND API NEEDED:
 * PUT /api/patients/:id/medical-data
 * Headers: { Authorization: "Bearer <token>" }
 * Body: {
 *   vitalSigns: {...},
 *   doctorOpinion: "...",
 *   ecgResults: {...},
 *   aiPrediction: {...},
 *   prescribedMedications: [...]
 * }
 * Response: { success: true, patient: {...} }
 */
export const updatePatientMedicalData = async (patientIdentifier, medicalData) => {
  try {
    // ========================================
    // CURRENT IMPLEMENTATION (localStorage)
    // ========================================
    const patients = JSON.parse(localStorage.getItem('patients') || '[]');
    
    // Find patient by nationalId or id
    const patientIndex = patients.findIndex(p => 
      p.nationalId === patientIdentifier || p.id === patientIdentifier
    );
    
    if (patientIndex === -1) {
      return {
        success: false,
        message: 'لم يتم العثور على المريض'
      };
    }
    
    // Update patient with medical data
    patients[patientIndex] = {
      ...patients[patientIndex],
      ...medicalData,
      lastUpdated: new Date().toISOString()
    };
    
    // Save to localStorage
    localStorage.setItem('patients', JSON.stringify(patients));
    
    // Also update in users array if exists
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const userIndex = users.findIndex(u => u.id === patients[patientIndex].id);
    if (userIndex !== -1) {
      users[userIndex] = { ...users[userIndex], ...patients[patientIndex] };
      localStorage.setItem('users', JSON.stringify(users));
    }
    
    return {
      success: true,
      patient: patients[patientIndex],
      message: 'تم حفظ البيانات بنجاح'
    };
    
    // ========================================
    // FUTURE IMPLEMENTATION (Backend API)
    // ========================================
    // const token = localStorage.getItem('authToken');
    // 
    // const response = await fetch(`${API_URL}/api/patients/${patientIdentifier}/medical-data`, {
    //   method: 'PUT',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'Authorization': `Bearer ${token}`
    //   },
    //   body: JSON.stringify(medicalData)
    // });
    // 
    // const data = await response.json();
    // return data;
    
  } catch (error) {
    console.error('Update patient medical data error:', error);
    return {
      success: false,
      message: 'حدث خطأ في حفظ البيانات'
    };
  }
};

/**
 * Add medication to patient
 * 
 * BACKEND API NEEDED:
 * POST /api/patients/:id/medications
 * Headers: { Authorization: "Bearer <token>" }
 * Body: {
 *   medicationName: "...",
 *   dosage: "...",
 *   frequency: "...",
 *   duration: "..."
 * }
 * Response: { success: true, patient: {...} }
 */
export const addMedication = async (patientId, medication) => {
  try {
    // ========================================
    // CURRENT IMPLEMENTATION (localStorage)
    // ========================================
    const patients = JSON.parse(localStorage.getItem('patients') || '[]');
    const patientIndex = patients.findIndex(p => p.id === patientId || p.nationalId === patientId);
    
    if (patientIndex === -1) {
      return { success: false, message: 'لم يتم العثور على المريض' };
    }
    
    // Initialize medications array if doesn't exist
    if (!patients[patientIndex].prescribedMedications) {
      patients[patientIndex].prescribedMedications = [];
    }
    
    // Add medication
    patients[patientIndex].prescribedMedications.push(medication);
    patients[patientIndex].lastUpdated = new Date().toISOString();
    
    localStorage.setItem('patients', JSON.stringify(patients));
    
    return {
      success: true,
      patient: patients[patientIndex]
    };
    
    // ========================================
    // FUTURE IMPLEMENTATION (Backend API)
    // ========================================
    // const token = localStorage.getItem('authToken');
    // 
    // const response = await fetch(`${API_URL}/api/patients/${patientId}/medications`, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'Authorization': `Bearer ${token}`
    //   },
    //   body: JSON.stringify(medication)
    // });
    // 
    // return await response.json();
    
  } catch (error) {
    console.error('Add medication error:', error);
    return { success: false, message: 'حدث خطأ في إضافة الدواء' };
  }
};

/**
 * Get patient's medical history
 * 
 * BACKEND API NEEDED:
 * GET /api/patients/:id/history
 * Headers: { Authorization: "Bearer <token>" }
 * Response: {
 *   visits: [...],
 *   medications: [...],
 *   ecgResults: [...],
 *   labTests: [...]
 * }
 */
export const getPatientHistory = async (patientId) => {
  try {
    // ========================================
    // CURRENT IMPLEMENTATION (localStorage)
    // ========================================
    const result = await getPatientById(patientId);
    
    if (!result.success) {
      return result;
    }
    
    const patient = result.patient;
    
    return {
      success: true,
      history: {
        vitalSigns: patient.vitalSigns || null,
        ecgResults: patient.ecgResults || null,
        aiPrediction: patient.aiPrediction || null,
        prescribedMedications: patient.prescribedMedications || [],
        doctorOpinion: patient.doctorOpinion || null,
        lastUpdated: patient.lastUpdated || null,
        lastUpdatedBy: patient.lastUpdatedBy || null
      }
    };
    
    // ========================================
    // FUTURE IMPLEMENTATION (Backend API)
    // ========================================
    // const token = localStorage.getItem('authToken');
    // 
    // const response = await fetch(`${API_URL}/api/patients/${patientId}/history`, {
    //   headers: {
    //     'Authorization': `Bearer ${token}`
    //   }
    // });
    // 
    // return await response.json();
    
  } catch (error) {
    console.error('Get patient history error:', error);
    return { success: false, message: 'حدث خطأ في جلب السجل الطبي' };
  }
};

/**
 * Search patients by name or nationalId
 * 
 * BACKEND API NEEDED:
 * GET /api/patients/search?q=<query>
 * Headers: { Authorization: "Bearer <token>" }
 * Response: { patients: [...] }
 */
export const searchPatients = async (query) => {
  try {
    // ========================================
    // CURRENT IMPLEMENTATION (localStorage)
    // ========================================
    const patients = JSON.parse(localStorage.getItem('patients') || '[]');
    
    const searchLower = query.toLowerCase();
    const results = patients.filter(p =>
      p.firstName.toLowerCase().includes(searchLower) ||
      p.lastName.toLowerCase().includes(searchLower) ||
      p.nationalId.includes(query) ||
      p.email.toLowerCase().includes(searchLower)
    );
    
    return {
      success: true,
      patients: results
    };
    
    // ========================================
    // FUTURE IMPLEMENTATION (Backend API)
    // ========================================
    // const token = localStorage.getItem('authToken');
    // 
    // const response = await fetch(`${API_URL}/api/patients/search?q=${encodeURIComponent(query)}`, {
    //   headers: {
    //     'Authorization': `Bearer ${token}`
    //   }
    // });
    // 
    // return await response.json();
    
  } catch (error) {
    console.error('Search patients error:', error);
    return { success: false, patients: [], message: 'حدث خطأ في البحث' };
  }
};

/**
 * Get current patient data (for patient viewing their own data)
 * This ensures patient always sees latest data
 * 
 * BACKEND API NEEDED:
 * GET /api/patients/me
 * Headers: { Authorization: "Bearer <token>" }
 * Response: { patient: {...} }
 */
export const getCurrentPatientData = async () => {
  try {
    // ========================================
    // CURRENT IMPLEMENTATION (localStorage)
    // ========================================
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    
    if (!currentUser || currentUser.role !== 'patient') {
      return {
        success: false,
        message: 'يجب تسجيل الدخول كمريض'
      };
    }
    
    // Reload from patients array to get latest data
    const patients = JSON.parse(localStorage.getItem('patients') || '[]');
    const updatedPatient = patients.find(p => 
      p.nationalId === currentUser.nationalId || 
      p.id === currentUser.id ||
      p.email === currentUser.email
    );
    
    if (updatedPatient) {
      return {
        success: true,
        patient: updatedPatient
      };
    } else {
      return {
        success: true,
        patient: currentUser
      };
    }
    
    // ========================================
    // FUTURE IMPLEMENTATION (Backend API)
    // ========================================
    // const token = localStorage.getItem('authToken');
    // 
    // const response = await fetch(`${API_URL}/api/patients/me`, {
    //   headers: {
    //     'Authorization': `Bearer ${token}`
    //   }
    // });
    // 
    // return await response.json();
    
  } catch (error) {
    console.error('Get current patient data error:', error);
    return {
      success: false,
      message: 'حدث خطأ في جلب البيانات'
    };
  }
};