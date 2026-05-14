import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import PatientDashboard from './pages/PatientDashboard';
import DoctorDashboard from './pages/DoctorDashboard';
import AdminDashboard from './pages/AdminDashboard';
import { initializeAdminAccount } from './services/adminService';

/**
 * Main App Component
 * Handles routing for the Patient 360° application
 */
function App() {
  /**
   * Initialize admin account on app startup
   * Creates default admin user if not exists
   * Credentials: admin@health.gov.sy / admin123
   */
  useEffect(() => {
    initializeAdminAccount();
  }, []);

  return (
    <Router>
      <div className="App">
        <Routes>
          {/* Home/Login Route */}
          <Route path="/" element={<Login />} />
          
          {/* SignUp Route */}
          <Route path="/signup" element={<SignUp />} />
          
          {/* Patient Dashboard Route */}
          <Route path="/patient-dashboard" element={<PatientDashboard />} />
          
          {/* Doctor Dashboard Route */}
          <Route path="/doctor-dashboard" element={<DoctorDashboard />} />
          
          {/* Admin Dashboard Route */}
          <Route path="/admin-dashboard" element={<AdminDashboard />} />
          
          {/* Catch all - redirect to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;