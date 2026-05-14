import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import PatientDashboard from './pages/PatientDashboard';
import DoctorDashboard from './pages/DoctorDashboard';
import AdminDashboard from './pages/AdminDashboard';
import PharmacistDashboard from './pages/PharmacistDashboard';
import LabDashboard from './pages/LabDashboard';
import ProtectedRoute from './components/ProtectedRoute';

// Patient detail pages (Stage 1: appointment; Stages 2-4 will add visits / prescriptions / lab-results)
import AppointmentDetailPage from './pages/patient/AppointmentDetailPage';
import VisitDetailPage from './pages/patient/VisitDetailPage';
import PrescriptionDetailPage from './pages/patient/PrescriptionDetailPage';
import LabResultDetailPage from './pages/patient/LabResultDetailPage';

import { initializeAdminAccount } from './services/adminService';

/**
 * Main App Component
 * Handles routing for the Patient 360° application
 *
 * كل الـ Dashboards محمية بـ ProtectedRoute مع تحديد الدور المسموح،
 * بحيث لا يمكن للمستخدم الوصول لصفحة غير صفحته حتى لو كتب الـ URL يدوياً.
 *
 * Detail pages (e.g. AppointmentDetailPage) are also patient-only and
 * live under the /patient-dashboard/* URL prefix so the ProtectedRoute
 * guard stays consistent across the patient surface.
 */
function App() {
  useEffect(() => {
    initializeAdminAccount();
  }, []);

  return (
    <Router>
      <div className="App">
        <Routes>
          {/* Public Routes — صفحات عامة */}
          <Route path="/" element={<Login />} />
          <Route path="/signup" element={<SignUp />} />

          {/* Protected Routes — صفحات محمية حسب الدور */}
          <Route
            path="/patient-dashboard"
            element={
              <ProtectedRoute allowedRoles={['patient']}>
                <PatientDashboard />
              </ProtectedRoute>
            }
          />

          {/* Patient detail pages — same guard, separate URL space ──── */}
          <Route
            path="/patient-dashboard/appointments/:id"
            element={
              <ProtectedRoute allowedRoles={['patient']}>
                <AppointmentDetailPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/patient-dashboard/visits/:id"
            element={
              <ProtectedRoute allowedRoles={['patient']}>
                <VisitDetailPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/patient-dashboard/prescriptions/:id"
            element={
              <ProtectedRoute allowedRoles={['patient']}>
                <PrescriptionDetailPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/patient-dashboard/lab-results/:id"
            element={
              <ProtectedRoute allowedRoles={['patient']}>
                <LabResultDetailPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/doctor-dashboard"
            element={
              <ProtectedRoute allowedRoles={['doctor']}>
                <DoctorDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin-dashboard"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/pharmacist-dashboard"
            element={
              <ProtectedRoute allowedRoles={['pharmacist']}>
                <PharmacistDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/lab-dashboard"
            element={
              <ProtectedRoute allowedRoles={['lab_technician']}>
                <LabDashboard />
              </ProtectedRoute>
            }
          />

          {/* Catch all — redirect to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
