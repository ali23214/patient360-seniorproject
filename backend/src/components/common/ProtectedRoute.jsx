// src/components/common/ProtectedRoute.jsx
import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import authService from '../../services/authService';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const [isVerifying, setIsVerifying] = useState(true);
  const [isValid, setIsValid] = useState(false);

  useEffect(() => {
    const verifyAuth = async () => {
      // Check if user is authenticated
      const authenticated = await authService.verifyToken();
      
      if (!authenticated) {
        setIsValid(false);
        setIsVerifying(false);
        return;
      }

      // Get current user
      const user = authService.getCurrentUser();
      
      // Check if user has the required role
      if (allowedRoles && !allowedRoles.includes(user?.role)) {
        setIsValid(false);
      } else {
        setIsValid(true);
      }
      
      setIsVerifying(false);
    };

    verifyAuth();
  }, [allowedRoles]);

  // Show loading spinner while verifying
  if (isVerifying) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        flexDirection: 'column',
        gap: '20px',
        fontFamily: 'Cairo, sans-serif'
      }}>
        <div style={{
          width: '50px',
          height: '50px',
          border: '5px solid #f3f4f6',
          borderTop: '5px solid #125c7a',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <div style={{ fontSize: '1.2rem', color: '#125c7a' }}>جاري التحميل...</div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // If not valid, redirect to login
  if (!isValid) {
    return <Navigate to="/" replace />;
  }

  // If valid, render the protected component
  return children;
};

export default ProtectedRoute;