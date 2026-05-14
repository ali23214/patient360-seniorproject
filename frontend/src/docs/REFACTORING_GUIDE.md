# 🔧 STEP-BY-STEP REFACTORING GUIDE

## 🎯 GOAL:
Replace all `localStorage` calls in your components with service functions.

## ✅ REMEMBER:
- Backend hasn't started yet ✓
- Services already use localStorage ✓
- Components will be cleaner ✓
- Easy to switch to API later ✓

---

## 📁 FILES TO EDIT:

### 1. Login Page
### 2. Register Page
### 3. DoctorDashboard.jsx
### 4. PatientDashboard.jsx

---

## 🔍 HOW TO FIND localStorage CALLS:

Open each file and search for:
- `localStorage.getItem`
- `localStorage.setItem`
- `localStorage.removeItem`
- `JSON.parse(localStorage`
- `JSON.stringify`

Replace these with service function calls!

---

## 📝 EXAMPLE 1: LOGIN PAGE

### ❌ BEFORE (Your current code):

```javascript
// Login.jsx or Login.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    
    // ❌ BAD: Direct localStorage access
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const user = users.find(u => u.email === email && u.password === password);
    
    if (user) {
      // ❌ BAD: Direct localStorage access
      localStorage.setItem('currentUser', JSON.stringify(user));
      
      // Navigate based on role
      if (user.role === 'doctor') {
        navigate('/doctor-dashboard');
      } else if (user.role === 'patient') {
        navigate('/patient-dashboard');
      }
    } else {
      alert('البريد الإلكتروني أو كلمة المرور غير صحيحة');
    }
  };

  return (
    <form onSubmit={handleLogin}>
      <input 
        type="email" 
        value={email} 
        onChange={(e) => setEmail(e.target.value)} 
      />
      <input 
        type="password" 
        value={password} 
        onChange={(e) => setPassword(e.target.value)} 
      />
      <button type="submit">تسجيل الدخول</button>
    </form>
  );
};

export default Login;
```

---

### ✅ AFTER (Using authService):

```javascript
// Login.jsx or Login.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
// ✅ GOOD: Import service
import { login } from '../services/authService';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    // ✅ GOOD: Use service function
    const result = await login(email, password);
    
    setLoading(false);
    
    if (result.success) {
      // Navigate based on role
      if (result.user.role === 'doctor') {
        navigate('/doctor-dashboard');
      } else if (result.user.role === 'patient') {
        navigate('/patient-dashboard');
      }
    } else {
      alert(result.message);
    }
  };

  return (
    <form onSubmit={handleLogin}>
      <input 
        type="email" 
        value={email} 
        onChange={(e) => setEmail(e.target.value)} 
        disabled={loading}
      />
      <input 
        type="password" 
        value={password} 
        onChange={(e) => setPassword(e.target.value)} 
        disabled={loading}
      />
      <button type="submit" disabled={loading}>
        {loading ? 'جاري التحميل...' : 'تسجيل الدخول'}
      </button>
    </form>
  );
};

export default Login;
```

---

## 📝 EXAMPLE 2: REGISTER PAGE

### ❌ BEFORE (Your current code):

```javascript
// Register.jsx
const handleRegister = (e) => {
  e.preventDefault();
  
  // ❌ BAD: Direct localStorage access
  const users = JSON.parse(localStorage.getItem('users') || '[]');
  
  // Check if email exists
  const existingUser = users.find(u => u.email === email);
  if (existingUser) {
    alert('البريد الإلكتروني مسجل مسبقاً');
    return;
  }
  
  // Create new user
  const newUser = {
    id: Date.now(),
    email,
    password,
    firstName,
    lastName,
    nationalId,
    role,
    registrationDate: new Date().toISOString()
  };
  
  // ❌ BAD: Direct localStorage access
  users.push(newUser);
  localStorage.setItem('users', JSON.stringify(users));
  
  alert('تم التسجيل بنجاح');
  navigate('/login');
};
```

---

### ✅ AFTER (Using authService):

```javascript
// Register.jsx
// ✅ GOOD: Import service
import { register } from '../services/authService';

const handleRegister = async (e) => {
  e.preventDefault();
  setLoading(true);
  
  // ✅ GOOD: Use service function
  const result = await register({
    email,
    password,
    firstName,
    lastName,
    nationalId,
    role,
    dateOfBirth,
    gender,
    phone,
    address
  });
  
  setLoading(false);
  
  if (result.success) {
    alert(result.message);
    navigate('/login');
  } else {
    alert(result.message);
  }
};
```

---

## 📝 EXAMPLE 3: DOCTORDASHBOARD - KEY FUNCTIONS

### ❌ BEFORE (Your current code):

```javascript
// DoctorDashboard.jsx

// Search patient function
const handleSearchPatient = () => {
  // ❌ BAD: Direct localStorage access
  const patients = JSON.parse(localStorage.getItem('patients') || '[]');
  const patient = patients.find(p => p.nationalId === searchNationalId);
  
  if (patient) {
    setSelectedPatient(patient);
    setVitalSigns(patient.vitalSigns || {});
    setMedications(patient.prescribedMedications || []);
    // ... more code
  } else {
    alert('لم يتم العثور على المريض');
  }
};

// Save patient data function
const handleSavePatientData = () => {
  // ❌ BAD: Direct localStorage access
  const patients = JSON.parse(localStorage.getItem('patients') || '[]');
  const patientIndex = patients.findIndex(p => p.id === selectedPatient.id);
  
  patients[patientIndex] = {
    ...patients[patientIndex],
    vitalSigns,
    prescribedMedications: medications,
    doctorOpinion,
    ecgResults,
    aiPrediction,
    lastUpdated: new Date().toISOString(),
    lastUpdatedBy: currentUser.firstName + ' ' + currentUser.lastName
  };
  
  // ❌ BAD: Direct localStorage access
  localStorage.setItem('patients', JSON.stringify(patients));
  
  alert('تم حفظ البيانات بنجاح');
};
```

---

### ✅ AFTER (Using patientService):

```javascript
// DoctorDashboard.jsx

// ✅ GOOD: Import service at top of file
import { 
  getPatientById, 
  updatePatientMedicalData 
} from '../services/patientService';

// Search patient function
const handleSearchPatient = async () => {
  setLoading(true);
  
  // ✅ GOOD: Use service function
  const result = await getPatientById(searchNationalId, true); // true = search by nationalId
  
  setLoading(false);
  
  if (result.success) {
    const patient = result.patient;
    setSelectedPatient(patient);
    setVitalSigns(patient.vitalSigns || {
      bloodPressureSystolic: '',
      bloodPressureDiastolic: '',
      heartRate: '',
      spo2: '',
      bloodGlucose: '',
      temperature: '',
      weight: ''
    });
    setMedications(patient.prescribedMedications || []);
    setDoctorOpinion(patient.doctorOpinion || '');
    setEcgResults(patient.ecgResults || null);
    setAiPrediction(patient.aiPrediction || null);
  } else {
    alert(result.message);
  }
};

// Save patient data function
const handleSavePatientData = async () => {
  if (!selectedPatient) {
    alert('يجب اختيار مريض أولاً');
    return;
  }
  
  setSaving(true);
  
  // Prepare medical data
  const medicalData = {
    vitalSigns,
    prescribedMedications: medications,
    doctorOpinion,
    ecgResults,
    aiPrediction,
    lastUpdatedBy: `د. ${currentUser.firstName} ${currentUser.lastName}`
  };
  
  // ✅ GOOD: Use service function
  const result = await updatePatientMedicalData(
    selectedPatient.nationalId, 
    medicalData
  );
  
  setSaving(false);
  
  if (result.success) {
    alert(result.message);
    // Update selectedPatient with new data
    setSelectedPatient(result.patient);
  } else {
    alert(result.message);
  }
};
```

---

## 📝 EXAMPLE 4: PATIENTDASHBOARD - KEY FUNCTIONS

### ❌ BEFORE (Your current code):

```javascript
// PatientDashboard.jsx

useEffect(() => {
  // ❌ BAD: Direct localStorage access
  const currentUser = JSON.parse(localStorage.getItem('currentUser'));
  
  if (!currentUser) {
    navigate('/');
    return;
  }
  
  // ❌ BAD: Direct localStorage access
  const allPatients = JSON.parse(localStorage.getItem('patients') || '[]');
  const updatedPatient = allPatients.find(p => p.nationalId === currentUser.nationalId);
  
  const patientData = updatedPatient || currentUser;
  setUser(patientData);
  
  // Generate visits
  const realVisits = generateVisitsFromPatientData(patientData);
  setVisits(realVisits);
  
  setLoading(false);
}, [navigate]);
```

---

### ✅ AFTER (Using patientService):

```javascript
// PatientDashboard.jsx

// ✅ GOOD: Import services at top of file
import { getCurrentUser } from '../services/authService';
import { getCurrentPatientData } from '../services/patientService';

useEffect(() => {
  const loadPatientData = async () => {
    setLoading(true);
    
    // ✅ GOOD: Use service functions
    const currentUser = await getCurrentUser();
    
    if (!currentUser) {
      navigate('/');
      return;
    }
    
    if (currentUser.role !== 'patient') {
      alert('غير مصرح - هذه الصفحة للمرضى فقط');
      navigate('/');
      return;
    }
    
    // ✅ GOOD: Get latest patient data from service
    const result = await getCurrentPatientData();
    
    if (result.success) {
      const patientData = result.patient;
      setUser(patientData);
      
      // Generate visits from patient data
      const realVisits = generateVisitsFromPatientData(patientData);
      setVisits(realVisits);
      setFilteredVisits(realVisits);
    }
    
    setLoading(false);
  };
  
  loadPatientData();
}, [navigate]);
```

---

## 🎯 SUMMARY OF CHANGES:

### **What to Remove:**
❌ `localStorage.getItem()`
❌ `localStorage.setItem()`
❌ `localStorage.removeItem()`
❌ `JSON.parse(localStorage...)`
❌ `JSON.stringify(...)`

### **What to Add:**
✅ `import { ... } from '../services/authService'`
✅ `import { ... } from '../services/patientService'`
✅ `async/await` keywords
✅ `const result = await serviceFunction()`
✅ Check `result.success`

---

## 📋 CHECKLIST FOR EACH COMPONENT:

### Login.jsx:
- [ ] Import `login` from authService
- [ ] Replace localStorage code with `await login(email, password)`
- [ ] Check `result.success`
- [ ] Use `result.user` for navigation

### Register.jsx:
- [ ] Import `register` from authService
- [ ] Replace localStorage code with `await register(userData)`
- [ ] Check `result.success`

### DoctorDashboard.jsx:
- [ ] Import `getPatientById, updatePatientMedicalData` from patientService
- [ ] Replace search localStorage code with `await getPatientById()`
- [ ] Replace save localStorage code with `await updatePatientMedicalData()`
- [ ] Add loading states

### PatientDashboard.jsx:
- [ ] Import `getCurrentUser` from authService
- [ ] Import `getCurrentPatientData` from patientService
- [ ] Replace localStorage code in useEffect
- [ ] Use async function in useEffect

---

## 🚀 TESTING AFTER REFACTORING:

After each file refactoring:

1. **Save the file**
2. **Test in browser:**
   - Login still works? ✓
   - Register still works? ✓
   - Doctor can search patients? ✓
   - Doctor can save data? ✓
   - Patient sees data? ✓

3. **Check console for errors**
4. **If it works → Move to next file!**

---

## 💡 PRO TIP:

Refactor ONE file at a time:
1. Refactor Login.jsx → Test → ✓
2. Refactor Register.jsx → Test → ✓
3. Refactor DoctorDashboard.jsx → Test → ✓
4. Refactor PatientDashboard.jsx → Test → ✓

Don't refactor all at once!

---

**Next: I'll create complete refactored versions of DoctorDashboard and PatientDashboard for you!**