// src/pages/SimpleDashboard.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/common/Navbar';

const SimpleDashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Get current user from localStorage
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    
    if (!currentUser) {
      // If no user is logged in, redirect to login
      navigate('/');
      return;
    }
    
    setUser(currentUser);
  }, [navigate]);

  const handleLogout = () => {
    // Clear current user
    localStorage.removeItem('currentUser');
    alert('تم تسجيل الخروج بنجاح');
    navigate('/');
  };

  if (!user) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontFamily: 'Cairo, sans-serif'
      }}>
        <div>جاري التحميل...</div>
      </div>
    );
  }

  const getRoleName = (role) => {
    const names = {
      'doctor': 'طبيب',
      'patient': 'مريض',
      'pharmacist': 'صيدلاني',
      'laboratory': 'أخصائي مختبر'
    };
    return names[role] || role;
  };

  const getRoleColor = (role) => {
    const colors = {
      'doctor': { bg: '#125c7a', light: '#dbeafe' },
      'patient': { bg: '#10b981', light: '#dcfce7' },
      'pharmacist': { bg: '#a23f97', light: '#fce7f3' },
      'laboratory': { bg: '#f59e0b', light: '#fef3c7' }
    };
    return colors[role] || { bg: '#125c7a', light: '#dbeafe' };
  };

  const roleColor = getRoleColor(user.role);

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafb' }}>
      <Navbar />
      
      <div style={{ 
        padding: '100px 40px', 
        maxWidth: '1200px', 
        margin: '0 auto',
        fontFamily: 'Cairo, sans-serif'
      }}>
        {/* Welcome Header */}
        <div style={{ 
          background: `linear-gradient(135deg, ${roleColor.bg} 0%, ${roleColor.bg}dd 100%)`,
          color: 'white',
          padding: '40px',
          borderRadius: '16px',
          marginBottom: '30px',
          boxShadow: `0 10px 40px ${roleColor.bg}33`
        }}>
          <h1 style={{ fontSize: '2.5rem', marginBottom: '10px', fontWeight: '700' }}>
            مرحباً {user.firstName} {user.lastName} 👋
          </h1>
          <p style={{ fontSize: '1.3rem', opacity: 0.95 }}>
            لوحة تحكم {getRoleName(user.role)} - Patient 360°
          </p>
        </div>

        {/* Stats Cards */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '20px',
          marginBottom: '30px'
        }}>
          {user.role === 'doctor' && (
            <>
              <StatCard icon="👥" number="24" label="المرضى المسجلين" color={roleColor.bg} />
              <StatCard icon="📅" number="8" label="المواعيد اليوم" color={roleColor.bg} />
              <StatCard icon="💊" number="12" label="الوصفات الطبية" color={roleColor.bg} />
              <StatCard icon="📊" number="45" label="التقارير الطبية" color={roleColor.bg} />
            </>
          )}
          
          {user.role === 'patient' && (
            <>
              <StatCard icon="📅" number="3" label="المواعيد القادمة" color={roleColor.bg} />
              <StatCard icon="💊" number="5" label="الأدوية الحالية" color={roleColor.bg} />
              <StatCard icon="🔬" number="2" label="التحاليل المعلقة" color={roleColor.bg} />
              <StatCard icon="📋" number="12" label="السجلات الطبية" color={roleColor.bg} />
            </>
          )}
          
          {user.role === 'pharmacist' && (
            <>
              <StatCard icon="💊" number="156" label="الوصفات اليوم" color={roleColor.bg} />
              <StatCard icon="📦" number="850" label="الأدوية المتوفرة" color={roleColor.bg} />
              <StatCard icon="⚠️" number="12" label="أدوية قاربت النفاد" color={roleColor.bg} />
              <StatCard icon="✅" number="342" label="الطلبات المكتملة" color={roleColor.bg} />
            </>
          )}
          
          {user.role === 'laboratory' && (
            <>
              <StatCard icon="🔬" number="48" label="التحاليل اليوم" color={roleColor.bg} />
              <StatCard icon="⏳" number="15" label="قيد المعالجة" color={roleColor.bg} />
              <StatCard icon="✅" number="33" label="نتائج جاهزة" color={roleColor.bg} />
              <StatCard icon="📊" number="856" label="إجمالي التحاليل" color={roleColor.bg} />
            </>
          )}
        </div>

        {/* Account Information Card */}
        <div style={{ 
          background: 'white', 
          padding: '30px', 
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          marginBottom: '30px'
        }}>
          <h2 style={{ 
            fontSize: '1.5rem', 
            color: roleColor.bg, 
            marginBottom: '20px',
            borderBottom: '2px solid #f3f4f6',
            paddingBottom: '10px',
            fontWeight: '700'
          }}>
            معلومات الحساب
          </h2>
          
          <div style={{ display: 'grid', gap: '15px' }}>
            <InfoRow label="الاسم الكامل" value={`${user.firstName} ${user.lastName}`} />
            <InfoRow label="البريد الإلكتروني" value={user.email} ltr={true} />
            <InfoRow label="الدور" value={getRoleName(user.role)} />
            <InfoRow label="رقم الهاتف" value={user.phone} ltr={true} />
            {user.specialization && <InfoRow label="التخصص" value={user.specialization} />}
            {user.licenseNumber && <InfoRow label="رقم الترخيص" value={user.licenseNumber} />}
            {user.institution && <InfoRow label="المؤسسة" value={user.institution} />}
          </div>
          
          <button 
            onClick={handleLogout}
            style={{
              marginTop: '30px',
              padding: '12px 30px',
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              fontFamily: 'Cairo, sans-serif'
            }}
            onMouseOver={(e) => e.target.style.background = '#dc2626'}
            onMouseOut={(e) => e.target.style.background = '#ef4444'}
          >
            تسجيل الخروج 🚪
          </button>
        </div>

        {/* Quick Actions */}
        <div style={{ 
          background: 'white', 
          padding: '30px', 
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
        }}>
          <h2 style={{ 
            fontSize: '1.5rem', 
            color: roleColor.bg, 
            marginBottom: '20px',
            borderBottom: '2px solid #f3f4f6',
            paddingBottom: '10px',
            fontWeight: '700'
          }}>
            الميزات القادمة 🚀
          </h2>
          <ul style={{ 
            listStyle: 'none', 
            padding: 0,
            lineHeight: '2'
          }}>
            <li style={{ padding: '8px 0', color: '#6b7280' }}>✓ إدارة السجلات الطبية</li>
            <li style={{ padding: '8px 0', color: '#6b7280' }}>✓ جدولة المواعيد</li>
            <li style={{ padding: '8px 0', color: '#6b7280' }}>✓ إصدار الوصفات الطبية</li>
            <li style={{ padding: '8px 0', color: '#6b7280' }}>✓ التقارير والإحصائيات</li>
            <li style={{ padding: '8px 0', color: '#6b7280' }}>✓ نظام الإشعارات</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

// Helper Components
const StatCard = ({ icon, number, label, color }) => (
  <div style={{
    background: 'white',
    padding: '30px',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    textAlign: 'center',
    transition: 'transform 0.2s',
    cursor: 'pointer'
  }}
  onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
  onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
  >
    <div style={{ fontSize: '3rem', marginBottom: '10px' }}>{icon}</div>
    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: color }}>{number}</div>
    <div style={{ color: '#6b7280', marginTop: '5px' }}>{label}</div>
  </div>
);

const InfoRow = ({ label, value, ltr }) => (
  <div style={{ 
    display: 'flex', 
    justifyContent: 'space-between', 
    padding: '10px 0',
    borderTop: '1px solid #f3f4f6'
  }}>
    <strong style={{ color: '#374151' }}>{label}:</strong>
    <span style={{ 
      color: '#6b7280',
      direction: ltr ? 'ltr' : 'rtl'
    }}>{value}</span>
  </div>
);

export default SimpleDashboard;