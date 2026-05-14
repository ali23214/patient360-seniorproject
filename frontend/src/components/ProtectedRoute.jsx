import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * ProtectedRoute — يحمي الصفحات الخاصة من الوصول غير المصرح به.
 *
 * يتحقق من وجود JWT في localStorage قبل عرض الصفحة.
 * إذا كان غير موجود → redirect إلى /login فوراً (replace).
 *
 * يمكن تمرير `allowedRoles` للتحقق من دور المستخدم.
 * مثال:
 *   <ProtectedRoute allowedRoles={['patient']}>
 *     <PatientDashboard />
 *   </ProtectedRoute>
 */
function ProtectedRoute({ children, allowedRoles }) {
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');

  // الطبقة الأولى: التوكن لازم يكون موجود
  if (!token) {
    return <Navigate to="/" replace />;
  }

  // الطبقة الثانية: التحقق من الدور (إذا تم تحديده)
  if (allowedRoles && allowedRoles.length > 0) {
    try {
      const user = userStr ? JSON.parse(userStr) : null;
      const userRoles = user?.roles || [];

      // المستخدم لازم يكون عنده على الأقل دور واحد من المسموح
      const hasAllowedRole = allowedRoles.some(role => userRoles.includes(role));

      if (!hasAllowedRole) {
        // امسح كل شي وارجع للـ login
        localStorage.clear();
        sessionStorage.clear();
        return <Navigate to="/" replace />;
      }
    } catch (err) {
      // localStorage فيه data معطوبة — امسح كل شي
      localStorage.clear();
      sessionStorage.clear();
      return <Navigate to="/" replace />;
    }
  }

  return children;
}

export default ProtectedRoute;