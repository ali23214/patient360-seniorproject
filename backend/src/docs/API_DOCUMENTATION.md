# 📚 API DOCUMENTATION FOR BACKEND DEVELOPER

This document specifies ALL APIs needed for the medical system.

---

## 🔐 AUTHENTICATION APIs

### 1. Login
```
POST /api/auth/login
Content-Type: application/json

Request Body:
{
  "email": "doctor@test.com",
  "password": "123456"
}

Response (Success - 200):
{
  "success": true,
  "user": {
    "id": 1,
    "email": "doctor@test.com",
    "firstName": "أحمد",
    "lastName": "محمود",
    "role": "doctor",
    "specialization": "Cardiologist",
    "nationalId": "1111111111"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "message": "تم تسجيل الدخول بنجاح"
}

Response (Error - 401):
{
  "success": false,
  "message": "البريد الإلكتروني أو كلمة المرور غير صحيحة"
}
```

### 2. Register
```
POST /api/auth/register
Content-Type: application/json

Request Body (Patient):
{
  "email": "patient@test.com",
  "password": "123456",
  "firstName": "محمد",
  "lastName": "أحمد",
  "nationalId": "123456789",
  "role": "patient",
  "dateOfBirth": "1990-01-01",
  "gender": "male",
  "phone": "0501234567",
  "address": "الرياض"
}

Request Body (Doctor):
{
  "email": "doctor@test.com",
  "password": "123456",
  "firstName": "أحمد",
  "lastName": "محمود",
  "nationalId": "1111111111",
  "role": "doctor",
  "specialization": "Cardiologist",
  "medicalLicenseNumber": "MD12345678",
  "institution": "المستشفى الوطني"
}

Response (Success - 201):
{
  "success": true,
  "user": {...},
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "message": "تم التسجيل بنجاح"
}

Response (Error - 400):
{
  "success": false,
  "message": "البريد الإلكتروني مسجل مسبقاً"
}
```

### 3. Logout
```
POST /api/auth/logout
Authorization: Bearer <token>

Response (Success - 200):
{
  "success": true,
  "message": "تم تسجيل الخروج بنجاح"
}
```

### 4. Get Current User
```
GET /api/auth/me
Authorization: Bearer <token>

Response (Success - 200):
{
  "user": {
    "id": 1,
    "email": "doctor@test.com",
    "firstName": "أحمد",
    "lastName": "محمود",
    "role": "doctor",
    ...
  }
}
```

---

## 👥 PATIENT APIs

### 5. Get All Patients (Doctor only)
```
GET /api/patients
Authorization: Bearer <token>

Response (Success - 200):
{
  "success": true,
  "patients": [
    {
      "id": 1,
      "email": "patient@test.com",
      "firstName": "محمد",
      "lastName": "أحمد",
      "nationalId": "123456789",
      "dateOfBirth": "1990-01-01",
      "gender": "male",
      "phone": "0501234567",
      "address": "الرياض",
      "registrationDate": "2025-11-27T10:00:00.000Z",
      "lastUpdated": "2025-11-27T15:30:00.000Z",
      "lastUpdatedBy": "د. أحمد محمود"
    },
    ...
  ]
}
```

### 6. Get Patient by ID (Doctor only)
```
GET /api/patients/:id
Authorization: Bearer <token>

Response (Success - 200):
{
  "success": true,
  "patient": {
    "id": 1,
    "email": "patient@test.com",
    "firstName": "محمد",
    "lastName": "أحمد",
    "nationalId": "123456789",
    ...
  }
}

Response (Error - 404):
{
  "success": false,
  "message": "لم يتم العثور على المريض"
}
```

### 7. Get Patient by National ID (Doctor only)
```
GET /api/patients/by-national-id/:nationalId
Authorization: Bearer <token>

Response (Success - 200):
{
  "success": true,
  "patient": {...}
}
```

### 8. Update Patient Medical Data (Doctor only)
**THIS IS THE MOST IMPORTANT API!**
```
PUT /api/patients/:id/medical-data
Authorization: Bearer <token>
Content-Type: application/json

Request Body:
{
  "vitalSigns": {
    "bloodPressureSystolic": "145",
    "bloodPressureDiastolic": "95",
    "heartRate": "88",
    "spo2": "97",
    "bloodGlucose": "110",
    "temperature": "37.2",
    "weight": "75"
  },
  "doctorOpinion": "المريض يعاني من ارتفاع طفيف في ضغط الدم",
  "ecgResults": {
    "fileName": "ecg_report.pdf",
    "uploadDate": "2025-11-27T15:30:00.000Z",
    "heartRate": 88,
    "rhythm": "Sinus Rhythm",
    "prInterval": "160 ms",
    "qrsDuration": "90 ms",
    "qtInterval": "380 ms",
    "axis": "Normal Axis",
    "findings": "نتيجة التحليل الأولية",
    "interpretation": "تم التحليل بواسطة الذكاء الاصطناعي"
  },
  "aiPrediction": {
    "riskLevel": "متوسط",
    "riskScore": 45,
    "predictions": {
      "heartDisease": 35,
      "diabetes": 35,
      "hypertension": 55,
      "stroke": 25
    },
    "recommendations": [
      "متابعة ضغط الدم بشكل منتظم",
      "تقليل تناول الملح",
      "مراقبة مستوى السكر في الدم",
      "ممارسة الرياضة 30 دقيقة يومياً"
    ],
    "modelConfidence": 85,
    "analysisDate": "2025-11-27T15:30:00.000Z"
  },
  "prescribedMedications": [
    {
      "medicationName": "Aspirin",
      "dosage": "81 mg",
      "frequency": "مرة واحدة يومياً",
      "duration": "مستمر"
    },
    {
      "medicationName": "Amlodipine",
      "dosage": "5 mg",
      "frequency": "مرة واحدة يومياً",
      "duration": "30 يوم"
    }
  ],
  "lastUpdatedBy": "د. أحمد محمود"
}

Response (Success - 200):
{
  "success": true,
  "patient": {
    "id": 1,
    "firstName": "محمد",
    "lastName": "أحمد",
    "vitalSigns": {...},
    "doctorOpinion": "...",
    "ecgResults": {...},
    "aiPrediction": {...},
    "prescribedMedications": [...],
    "lastUpdated": "2025-11-27T15:30:00.000Z",
    "lastUpdatedBy": "د. أحمد محمود"
  },
  "message": "تم حفظ البيانات بنجاح"
}
```

### 9. Add Medication to Patient (Doctor only)
```
POST /api/patients/:id/medications
Authorization: Bearer <token>
Content-Type: application/json

Request Body:
{
  "medicationName": "Aspirin",
  "dosage": "81 mg",
  "frequency": "مرة واحدة يومياً",
  "duration": "مستمر"
}

Response (Success - 200):
{
  "success": true,
  "patient": {...}
}
```

### 10. Get Patient History (Doctor only)
```
GET /api/patients/:id/history
Authorization: Bearer <token>

Response (Success - 200):
{
  "success": true,
  "history": {
    "vitalSigns": {...},
    "ecgResults": {...},
    "aiPrediction": {...},
    "prescribedMedications": [...],
    "doctorOpinion": "...",
    "lastUpdated": "2025-11-27T15:30:00.000Z",
    "lastUpdatedBy": "د. أحمد محمود"
  }
}
```

### 11. Search Patients (Doctor only)
```
GET /api/patients/search?q=<query>
Authorization: Bearer <token>

Response (Success - 200):
{
  "success": true,
  "patients": [...]
}
```

### 12. Get Current Patient Data (Patient only)
```
GET /api/patients/me
Authorization: Bearer <token>

Response (Success - 200):
{
  "success": true,
  "patient": {
    "id": 1,
    "firstName": "محمد",
    "lastName": "أحمد",
    "vitalSigns": {...},
    "ecgResults": {...},
    "aiPrediction": {...},
    "prescribedMedications": [...],
    ...
  }
}
```

---

## 📤 FILE UPLOAD APIs

### 13. Upload ECG File
```
POST /api/uploads/ecg
Authorization: Bearer <token>
Content-Type: multipart/form-data

Form Data:
- file: <PDF file>
- patientId: 1

Response (Success - 200):
{
  "success": true,
  "fileUrl": "https://your-cdn.com/ecg/12345.pdf",
  "fileName": "ecg_report.pdf"
}
```

---

## 🔍 AUTHORIZATION RULES

### Doctor can:
- ✅ View all patients
- ✅ Search patients
- ✅ Update patient medical data
- ✅ Add medications
- ✅ Upload ECG files

### Patient can:
- ✅ View their own data only
- ❌ Cannot view other patients
- ❌ Cannot update medical data
- ❌ Cannot add medications

### Implement middleware:
```javascript
// Backend middleware example
const authorizeDoctor = (req, res, next) => {
  if (req.user.role !== 'doctor') {
    return res.status(403).json({
      success: false,
      message: 'غير مصرح - هذه الخدمة للأطباء فقط'
    });
  }
  next();
};

const authorizePatient = (req, res, next) => {
  if (req.user.role !== 'patient') {
    return res.status(403).json({
      success: false,
      message: 'غير مصرح - هذه الخدمة للمرضى فقط'
    });
  }
  next();
};

// Usage:
app.get('/api/patients', authenticateToken, authorizeDoctor, getAllPatients);
app.get('/api/patients/me', authenticateToken, authorizePatient, getCurrentPatientData);
```

---

## 🗄️ DATABASE SCHEMA SUGGESTION

### Users Collection/Table
```javascript
{
  id: Number (Primary Key),
  email: String (Unique),
  password: String (Hashed),
  firstName: String,
  lastName: String,
  nationalId: String (Unique),
  role: String (enum: 'patient', 'doctor'),
  
  // Patient-specific fields
  dateOfBirth: Date,
  gender: String,
  phone: String,
  address: String,
  
  // Doctor-specific fields
  specialization: String,
  medicalLicenseNumber: String,
  institution: String,
  
  // Medical data (for patients)
  vitalSigns: Object,
  doctorOpinion: String,
  ecgResults: Object,
  aiPrediction: Object,
  prescribedMedications: Array,
  
  // Metadata
  registrationDate: Date,
  lastUpdated: Date,
  lastUpdatedBy: String
}
```

---

## 🔒 SECURITY REQUIREMENTS

1. **JWT Token Authentication**
   - Include `Authorization: Bearer <token>` in all protected routes
   - Token should expire after 24 hours
   - Refresh token mechanism recommended

2. **Password Hashing**
   - Use bcrypt with salt rounds >= 10
   - Never store plain text passwords

3. **Input Validation**
   - Validate all inputs (email format, nationalId length, etc.)
   - Sanitize inputs to prevent SQL injection

4. **Role-Based Access Control (RBAC)**
   - Doctor can only access doctor routes
   - Patient can only access their own data

5. **HTTPS Only**
   - All communication must be encrypted

---

## 📝 ERROR CODES

```javascript
200 - Success
201 - Created
400 - Bad Request (Invalid input)
401 - Unauthorized (Invalid credentials)
403 - Forbidden (No permission)
404 - Not Found
500 - Internal Server Error
```

---

## 🧪 TESTING ENDPOINTS

Use Postman/Insomnia to test:

```
Base URL: http://localhost:5000 (or your backend URL)

1. Register user:
POST http://localhost:5000/api/auth/register
Body: { email, password, ... }

2. Login:
POST http://localhost:5000/api/auth/login
Body: { email, password }
→ Copy token from response

3. Get patients (with token):
GET http://localhost:5000/api/patients
Headers: { Authorization: "Bearer <token>" }

4. Update patient:
PUT http://localhost:5000/api/patients/1/medical-data
Headers: { Authorization: "Bearer <token>" }
Body: { vitalSigns, medications, ... }
```

---

## 🚀 BACKEND TECHNOLOGIES RECOMMENDATION

### Option 1: Node.js + Express + MongoDB
```javascript
// Example structure
backend/
  ├── server.js
  ├── config/
  │   └── db.js
  ├── models/
  │   ├── User.js
  │   └── Patient.js
  ├── routes/
  │   ├── auth.js
  │   └── patients.js
  ├── controllers/
  │   ├── authController.js
  │   └── patientController.js
  └── middleware/
      ├── auth.js
      └── authorize.js
```

### Option 2: Python + Flask/Django + PostgreSQL
### Option 3: PHP + Laravel + MySQL

---

## 📞 FRONTEND-BACKEND COMMUNICATION

Frontend will use:
```javascript
// In services/patientService.js
const response = await fetch(`${API_URL}/api/patients/${patientId}/medical-data`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify(medicalData)
});

const data = await response.json();
```

Backend should respond with:
```javascript
{
  "success": true,
  "patient": {...},
  "message": "تم حفظ البيانات بنجاح"
}
```

---

## ✅ CHECKLIST FOR BACKEND DEVELOPER

- [ ] Set up database (MongoDB/PostgreSQL)
- [ ] Create User model/schema
- [ ] Implement JWT authentication
- [ ] Create all auth routes (/login, /register, /logout)
- [ ] Create patient routes (GET, POST, PUT)
- [ ] Implement authorization middleware
- [ ] Add input validation
- [ ] Test all endpoints with Postman
- [ ] Add CORS for frontend connection
- [ ] Deploy backend
- [ ] Give frontend developer API base URL

---

**This document provides EVERYTHING the backend developer needs to build the APIs!** 🎯