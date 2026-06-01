// adminService.js - Admin Service Layer for Doctor Management

/**
 * Initialize default admin account
 * Call this on app startup
 */
export const initializeAdminAccount = () => {
  const users = JSON.parse(localStorage.getItem('users') || '[]');
  
  // Check if admin exists
  const adminExists = users.some(u => u.role === 'admin');
  
  if (!adminExists) {
    const adminAccount = {
      id: 1,
      email: 'admin@health.gov.sy',
      password: 'admin123', // In production, this should be hashed
      role: 'admin',
      firstName: 'مسؤول',
      lastName: 'النظام',
      nationalId: '0000000000',
      phoneNumber: '+963933527091',
      registrationDate: new Date().toISOString(),
      account: {
        isActive: true,
        createdAt: new Date().toISOString()
      }
    };
    
    users.push(adminAccount);
    localStorage.setItem('users', JSON.stringify(users));
    
    console.log('✅ Admin account created:', adminAccount.email);
  }
};

/**
 * Get all doctors
 */
export const getAllDoctors = () => {
  const users = JSON.parse(localStorage.getItem('users') || '[]');
  return users.filter(u => u.role === 'doctor');
};

/**
 * Create new doctor account
 */
export const createDoctor = (doctorData) => {
  const users = JSON.parse(localStorage.getItem('users') || '[]');
  
  // Check if email exists
  if (users.some(u => u.email === doctorData.email)) {
    return { success: false, message: 'البريد الإلكتروني مسجل مسبقاً' };
  }
  
  // Check if national ID exists
  if (users.some(u => u.nationalId === doctorData.nationalId)) {
    return { success: false, message: 'الرقم الوطني مسجل مسبقاً' };
  }
  
  // Check if medical license exists
  if (users.some(u => u.medicalLicenseNumber === doctorData.medicalLicenseNumber)) {
    return { success: false, message: 'رقم الترخيص الطبي مسجل مسبقاً' };
  }
  
  // Create doctor
  const doctor = {
    id: Date.now(),
    ...doctorData,
    role: 'doctor',
    specialization: 'أمراض القلب', // All are cardiologists
    registrationDate: new Date().toISOString(),
    account: {
      isActive: true,
      createdAt: new Date().toISOString()
    }
  };
  
  users.push(doctor);
  localStorage.setItem('users', JSON.stringify(users));
  
  return { success: true, doctor, message: 'تم إنشاء حساب الطبيب بنجاح' };
};

/**
 * Update doctor information
 */
export const updateDoctor = (doctorId, updatedData) => {
  const users = JSON.parse(localStorage.getItem('users') || '[]');
  const doctorIndex = users.findIndex(u => u.id === doctorId && u.role === 'doctor');
  
  if (doctorIndex === -1) {
    return { success: false, message: 'لم يتم العثور على الطبيب' };
  }
  
  // Update doctor
  users[doctorIndex] = {
    ...users[doctorIndex],
    ...updatedData,
    updatedAt: new Date().toISOString()
  };
  
  localStorage.setItem('users', JSON.stringify(users));
  
  return { success: true, doctor: users[doctorIndex], message: 'تم تحديث بيانات الطبيب' };
};

/**
 * Delete doctor account
 */
export const deleteDoctor = (doctorId) => {
  const users = JSON.parse(localStorage.getItem('users') || '[]');
  const filteredUsers = users.filter(u => u.id !== doctorId);
  
  if (users.length === filteredUsers.length) {
    return { success: false, message: 'لم يتم العثور على الطبيب' };
  }
  
  localStorage.setItem('users', JSON.stringify(filteredUsers));
  
  return { success: true, message: 'تم حذف حساب الطبيب' };
};

/**
 * Toggle doctor account status (activate/deactivate)
 */
export const toggleDoctorStatus = (doctorId) => {
  const users = JSON.parse(localStorage.getItem('users') || '[]');
  const doctorIndex = users.findIndex(u => u.id === doctorId && u.role === 'doctor');
  
  if (doctorIndex === -1) {
    return { success: false, message: 'لم يتم العثور على الطبيب' };
  }
  
  const currentStatus = users[doctorIndex].account?.isActive ?? true;
  users[doctorIndex].account = users[doctorIndex].account || {};
  users[doctorIndex].account.isActive = !currentStatus;
  users[doctorIndex].updatedAt = new Date().toISOString();
  
  localStorage.setItem('users', JSON.stringify(users));
  
  return { 
    success: true, 
    doctor: users[doctorIndex], 
    message: `تم ${!currentStatus ? 'تفعيل' : 'تعطيل'} حساب الطبيب` 
  };
};

/**
 * Search doctors
 */
export const searchDoctors = (searchTerm) => {
  const doctors = getAllDoctors();
  
  if (!searchTerm) return doctors;
  
  const term = searchTerm.toLowerCase();
  
  return doctors.filter(doctor => 
    doctor.firstName?.toLowerCase().includes(term) ||
    doctor.lastName?.toLowerCase().includes(term) ||
    doctor.email?.toLowerCase().includes(term) ||
    doctor.nationalId?.includes(term) ||
    doctor.medicalLicenseNumber?.includes(term) ||
    doctor.institution?.toLowerCase().includes(term)
  );
};

/**
 * Get doctor by ID
 */
export const getDoctorById = (doctorId) => {
  const users = JSON.parse(localStorage.getItem('users') || '[]');
  const doctor = users.find(u => u.id === doctorId && u.role === 'doctor');
  
  if (!doctor) {
    return { success: false, message: 'لم يتم العثور على الطبيب' };
  }
  
  return { success: true, doctor };
};

/**
 * Get statistics
 */
export const getAdminStatistics = () => {
  const users = JSON.parse(localStorage.getItem('users') || '[]');
  const doctors = users.filter(u => u.role === 'doctor');
  const patients = users.filter(u => u.role === 'patient');
  
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  
  const newDoctorsThisMonth = doctors.filter(d => {
    if (!d.registrationDate) return false;
    const regDate = new Date(d.registrationDate);
    return regDate.getMonth() === currentMonth && regDate.getFullYear() === currentYear;
  }).length;
  
  const activeDoctors = doctors.filter(d => d.account?.isActive !== false).length;
  
  return {
    totalDoctors: doctors.length,
    activeDoctors: activeDoctors,
    newThisMonth: newDoctorsThisMonth,
    totalPatients: patients.length
  };
};

/**
 * Generate random password
 */
export const generatePassword = (length = 12) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

export default {
  initializeAdminAccount,
  getAllDoctors,
  createDoctor,
  updateDoctor,
  deleteDoctor,
  toggleDoctorStatus,
  searchDoctors,
  getDoctorById,
  getAdminStatistics,
  generatePassword
};