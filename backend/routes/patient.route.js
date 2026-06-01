import axios from 'axios';

// Base API URL
const API_URL = 'http://localhost:5000/api';

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests if it exists
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

// Auth API calls
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  signup: (userData) => api.post('/auth/signup', userData),
  register: (userData) => api.post('/auth/signup', userData), // Same as signup
  logout: () => api.post('/auth/logout'),
  verify: () => api.get('/auth/verify')
};

// Patients API calls
export const patientsAPI = {
  getAll: () => api.get('/patient'),
  getById: (id) => api.get(`/patient/${id}`),
  searchById: (patientId) => api.get(`/patient/search/${patientId}`),
  create: (patientData) => api.post('/patient', patientData),
  update: (id, patientData) => api.put(`/patient/${id}`, patientData),
  delete: (id) => api.delete(`/patient/${id}`),
  addVitalSigns: (id, vitalsData) => api.post(`/patient/${id}/vitals`, vitalsData),
  addDiagnosis: (id, diagnosisData) => api.post(`/patient/${id}/diagnosis`, diagnosisData)
};

export default api;