// src/services/authService.js
/**
 * Authentication Service
 * 
 * Handles all authentication operations:
 * - Login
 * - Register
 * - Logout
 * - Get current user
 * 
 * CURRENT: Uses localStorage
 * FUTURE: Backend developer will replace with API calls
 */

/**
 * Login user
 * 
 * BACKEND API NEEDED:
 * POST /api/auth/login
 * Body: { email, password }
 * Response: { success: true, user: {...}, token: "..." }
 */
export const login = async (email, password) => {
  try {
    // ========================================
    // CURRENT IMPLEMENTATION (localStorage)
    // ========================================
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const user = users.find(u => u.email === email && u.password === password);
    
    if (user) {
      // Remove password from user object for security
      const { password, ...userWithoutPassword } = user;
      localStorage.setItem('currentUser', JSON.stringify(userWithoutPassword));
      
      return {
        success: true,
        user: userWithoutPassword,
        message: 'تم تسجيل الدخول بنجاح'
      };
    } else {
      return {
        success: false,
        message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
      };
    }
    
    // ========================================
    // FUTURE IMPLEMENTATION (Backend API)
    // ========================================
    // const response = await fetch(`${API_URL}/api/auth/login`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ email, password })
    // });
    // 
    // const data = await response.json();
    // 
    // if (data.success) {
    //   localStorage.setItem('authToken', data.token);
    //   localStorage.setItem('currentUser', JSON.stringify(data.user));
    // }
    // 
    // return data;
    
  } catch (error) {
    console.error('Login error:', error);
    return {
      success: false,
      message: 'حدث خطأ أثناء تسجيل الدخول'
    };
  }
};

/**
 * Register new user
 * 
 * BACKEND API NEEDED:
 * POST /api/auth/register
 * Body: { email, password, firstName, lastName, nationalId, role, ... }
 * Response: { success: true, user: {...}, token: "..." }
 */
export const register = async (userData) => {
  try {
    // ========================================
    // CURRENT IMPLEMENTATION (localStorage)
    // ========================================
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    
    // Check if email already exists
    const existingUser = users.find(u => u.email === userData.email);
    if (existingUser) {
      return {
        success: false,
        message: 'البريد الإلكتروني مسجل مسبقاً'
      };
    }
    
    // Check if nationalId already exists
    const existingNationalId = users.find(u => u.nationalId === userData.nationalId);
    if (existingNationalId) {
      return {
        success: false,
        message: 'الرقم الوطني مسجل مسبقاً'
      };
    }
    
    // Create new user
    const newUser = {
      id: Date.now(),
      ...userData,
      registrationDate: new Date().toISOString()
    };
    
    users.push(newUser);
    localStorage.setItem('users', JSON.stringify(users));
    
    // If patient, add to patients array
    if (userData.role === 'patient') {
      const patients = JSON.parse(localStorage.getItem('patients') || '[]');
      patients.push(newUser);
      localStorage.setItem('patients', JSON.stringify(patients));
    }
    
    // Remove password from response
    const { password, ...userWithoutPassword } = newUser;
    
    return {
      success: true,
      user: userWithoutPassword,
      message: 'تم التسجيل بنجاح'
    };
    
    // ========================================
    // FUTURE IMPLEMENTATION (Backend API)
    // ========================================
    // const response = await fetch(`${API_URL}/api/auth/register`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(userData)
    // });
    // 
    // const data = await response.json();
    // 
    // if (data.success) {
    //   localStorage.setItem('authToken', data.token);
    //   localStorage.setItem('currentUser', JSON.stringify(data.user));
    // }
    // 
    // return data;
    
  } catch (error) {
    console.error('Register error:', error);
    return {
      success: false,
      message: 'حدث خطأ أثناء التسجيل'
    };
  }
};

/**
 * Logout current user
 * 
 * BACKEND API NEEDED:
 * POST /api/auth/logout
 * Headers: { Authorization: "Bearer <token>" }
 * Response: { success: true }
 */
export const logout = async () => {
  try {
    // ========================================
    // CURRENT IMPLEMENTATION (localStorage)
    // ========================================
    localStorage.removeItem('currentUser');
    
    return {
      success: true,
      message: 'تم تسجيل الخروج بنجاح'
    };
    
    // ========================================
    // FUTURE IMPLEMENTATION (Backend API)
    // ========================================
    // const token = localStorage.getItem('authToken');
    // 
    // await fetch(`${API_URL}/api/auth/logout`, {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${token}`
    //   }
    // });
    // 
    // localStorage.removeItem('authToken');
    // localStorage.removeItem('currentUser');
    // 
    // return { success: true };
    
  } catch (error) {
    console.error('Logout error:', error);
    return {
      success: false,
      message: 'حدث خطأ أثناء تسجيل الخروج'
    };
  }
};

/**
 * Get current logged-in user
 * 
 * BACKEND API NEEDED:
 * GET /api/auth/me
 * Headers: { Authorization: "Bearer <token>" }
 * Response: { user: {...} }
 */
export const getCurrentUser = async () => {
  try {
    // ========================================
    // CURRENT IMPLEMENTATION (localStorage)
    // ========================================
    const userStr = localStorage.getItem('currentUser');
    return userStr ? JSON.parse(userStr) : null;
    
    // ========================================
    // FUTURE IMPLEMENTATION (Backend API)
    // ========================================
    // const token = localStorage.getItem('authToken');
    // 
    // if (!token) {
    //   return null;
    // }
    // 
    // const response = await fetch(`${API_URL}/api/auth/me`, {
    //   headers: {
    //     'Authorization': `Bearer ${token}`
    //   }
    // });
    // 
    // const data = await response.json();
    // return data.user;
    
  } catch (error) {
    console.error('Get current user error:', error);
    return null;
  }
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = () => {
  // CURRENT: Check localStorage
  return localStorage.getItem('currentUser') !== null;
  
  // FUTURE: Check token
  // return localStorage.getItem('authToken') !== null;
};

/**
 * Get auth token (for future API calls)
 */
export const getAuthToken = () => {
  // CURRENT: No token system
  return null;
  
  // FUTURE: Return token
  // return localStorage.getItem('authToken');
};