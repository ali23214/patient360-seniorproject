# Backend Developer Checklist - Patient 360°

## 🚀 Start Here

### ⚠️ FIRST: Read This
- [ ] Read `BACKEND_DEVELOPER_GUIDE.md` (10 minutes)
- [ ] Read `WHAT_TO_GIVE_CLAUDE_BACKEND.md` (5 minutes)
- [ ] Understand: DO NOT copy React pages to Claude ❌

---

## 📚 Week 1: Setup & Authentication

### Day 1: Project Setup
- [ ] Clone the frontend repository
- [ ] Read `/docs/API_DOCUMENTATION.md` (30 minutes)
- [ ] Read `/src/services/authService.js` (10 minutes)
- [ ] Read `/src/services/patientService.js` (10 minutes)
- [ ] Choose your backend technology (Node.js, Python, Java, etc.)
- [ ] Create new backend project folder
- [ ] Initialize git repository for backend
- [ ] Setup basic project structure

**Give Claude:**
```
"I need to setup a backend project for a medical system.
Technology: [Your Choice]
[Paste API_DOCUMENTATION.md]
Help me create the project structure."
```

### Day 2: Database Setup
- [ ] Setup database (MongoDB, PostgreSQL, MySQL, etc.)
- [ ] Create User model/schema
- [ ] Create Doctor model/schema (extends User)
- [ ] Create Patient model/schema (extends User)
- [ ] Test database connection

**Give Claude:**
```
"Create a [Database Type] schema for User model with these fields:
[List fields from API_DOCUMENTATION.md]"
```

### Day 3: Authentication - Register
- [ ] Create POST `/api/auth/register` endpoint
- [ ] Implement password hashing
- [ ] Implement email validation
- [ ] Implement nationalId validation (for patients)
- [ ] Test with Postman

**Expected Response Format (from authService.js):**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "email": "user@example.com",
    "role": "patient",
    "firstName": "John",
    "lastName": "Doe"
  },
  "message": "Registration successful"
}
```

### Day 4: Authentication - Login
- [ ] Create POST `/api/auth/login` endpoint
- [ ] Implement credential validation
- [ ] Generate JWT token
- [ ] Test with Postman
- [ ] Test with wrong credentials

**Expected Response Format:**
```json
{
  "success": true,
  "user": { /* user object */ },
  "token": "jwt-token-string",
  "message": "Login successful"
}
```

### Day 5: Authentication - Other Endpoints
- [ ] Create GET `/api/auth/me` endpoint (get current user)
- [ ] Create POST `/api/auth/logout` endpoint
- [ ] Create GET `/api/auth/check` endpoint (check if authenticated)
- [ ] Create authentication middleware (verify JWT)
- [ ] Create role-check middleware (doctor vs patient)
- [ ] Test all auth endpoints

---

## 📚 Week 2: Patient APIs & Integration

### Day 6: Get All Patients (Doctor Only)
- [ ] Create GET `/api/patients` endpoint
- [ ] Implement authentication check
- [ ] Implement role check (only doctors)
- [ ] Return array of all patients
- [ ] Test with Postman (as doctor)
- [ ] Test access denied (as patient)

**Expected Response Format (from patientService.js):**
```json
{
  "success": true,
  "patients": [
    { /* patient object */ },
    { /* patient object */ }
  ]
}
```

### Day 7: Get Patient by ID
- [ ] Create GET `/api/patients/:id` endpoint
- [ ] Support search by nationalId OR patient ID
- [ ] Implement authentication check
- [ ] Implement role check (doctor can see any, patient can see only self)
- [ ] Test with Postman

**Expected Response Format:**
```json
{
  "success": true,
  "patient": {
    "id": 1,
    "firstName": "John",
    "lastName": "Doe",
    "nationalId": "123456789",
    "vitalSigns": { /* if exists */ },
    "prescribedMedications": [ /* if exists */ ],
    "ecgResults": { /* if exists */ },
    "aiPrediction": { /* if exists */ }
  }
}
```

### Day 8: Update Patient Medical Data (Doctor Only)
- [ ] Create PUT `/api/patients/:id/medical-data` endpoint
- [ ] Accept vitalSigns in request body
- [ ] Accept prescribedMedications array in request body
- [ ] Accept ecgResults in request body
- [ ] Accept aiPrediction in request body
- [ ] Save lastUpdated timestamp
- [ ] Save lastUpdatedBy (doctor name)
- [ ] Return updated patient object
- [ ] Test with Postman

**Expected Request Body (from patientService.js):**
```json
{
  "vitalSigns": {
    "bloodPressureSystolic": 120,
    "bloodPressureDiastolic": 80,
    "heartRate": 75,
    "temperature": 37.0,
    "spo2": 98
  },
  "prescribedMedications": [
    {
      "medicationName": "Aspirin",
      "dosage": "100mg",
      "frequency": "مرة يومياً",
      "duration": "30 يوم"
    }
  ],
  "ecgResults": { /* ECG data */ },
  "aiPrediction": { /* AI data */ }
}
```

**Expected Response:**
```json
{
  "success": true,
  "patient": { /* updated patient object */ },
  "message": "Patient data updated successfully"
}
```

### Day 9: Get Current Patient Data (Patient Only)
- [ ] Create GET `/api/patients/me` endpoint
- [ ] Get authenticated user from JWT
- [ ] Return current patient's data with all medical info
- [ ] Test with Postman (as patient)

### Day 10: CORS & Environment Setup
- [ ] Setup CORS to allow frontend URL
- [ ] Configure environment variables (.env file)
- [ ] Add API_PORT, DATABASE_URL, JWT_SECRET
- [ ] Test CORS with actual frontend request
- [ ] Create .env.example file

**CORS Configuration Example:**
```javascript
// Allow frontend to connect
app.use(cors({
  origin: 'http://localhost:3000', // Frontend URL
  credentials: true
}));
```

---

## 📚 Week 3: Testing & Documentation

### Day 11-12: API Testing
- [ ] Test all endpoints with Postman
- [ ] Create Postman collection
- [ ] Test authentication flow (register → login → access protected route)
- [ ] Test doctor flow (login → get patients → update patient)
- [ ] Test patient flow (login → get my data)
- [ ] Test error cases (wrong password, unauthorized access, etc.)

### Day 13: API Documentation
- [ ] Document actual API URL (e.g., http://localhost:5000)
- [ ] Document all endpoint URLs
- [ ] Document authentication header format
- [ ] Create README.md for backend
- [ ] Share API URL with frontend developer

**Example Documentation:**
```markdown
# Backend API Documentation

Base URL: http://localhost:5000

## Authentication
All protected routes require JWT token in header:
Authorization: Bearer <token>

## Endpoints
POST   /api/auth/register   - Register new user
POST   /api/auth/login      - Login user
GET    /api/auth/me         - Get current user
GET    /api/patients        - Get all patients (doctor only)
PUT    /api/patients/:id/medical-data - Update patient (doctor only)
GET    /api/patients/me     - Get my data (patient only)
```

### Day 14: Frontend Integration
- [ ] Share API base URL with frontend developer
- [ ] Frontend developer updates `src/services/authService.js`
- [ ] Frontend developer updates `src/services/patientService.js`
- [ ] Joint testing: Frontend calls your APIs
- [ ] Fix any integration issues
- [ ] Verify doctor can update patient data
- [ ] Verify patient can see updated data

---

## ✅ Completion Checklist

### Authentication ✓
- [x] Register endpoint works
- [x] Login endpoint works
- [x] JWT token is generated correctly
- [x] Authentication middleware works
- [x] Role-based access control works

### Patient APIs ✓
- [x] Doctor can get all patients
- [x] Doctor can search patient by nationalId
- [x] Doctor can update patient medical data
- [x] Patient can get their own data
- [x] Unauthorized access is blocked

### Integration ✓
- [x] CORS is configured correctly
- [x] Frontend can call backend APIs
- [x] Doctor can login and see patients list
- [x] Doctor can add medications, vital signs, ECG
- [x] Patient can login and see their data
- [x] Medications appear in patient dashboard

### Security ✓
- [x] Passwords are hashed (not stored in plain text)
- [x] JWT tokens are used for authentication
- [x] Role-based access control is enforced
- [x] Input validation is implemented
- [x] Error messages don't leak sensitive info

---

## 🆘 Common Issues & Solutions

### Issue 1: CORS Error
**Problem:** Frontend gets "CORS policy" error  
**Solution:** Add CORS middleware with frontend URL
```javascript
app.use(cors({ origin: 'http://localhost:3000' }));
```

### Issue 2: JWT Token Not Working
**Problem:** "Unauthorized" error on protected routes  
**Solution:** Check:
- JWT_SECRET is the same for sign and verify
- Token is sent as: `Authorization: Bearer <token>`
- Token is valid and not expired

### Issue 3: Patient Data Not Updating
**Problem:** Doctor saves data but patient doesn't see it  
**Solution:** Check:
- Data is actually saved to database
- GET /api/patients/me returns latest data
- Frontend is calling getCurrentPatientData() after login

### Issue 4: Wrong Response Format
**Problem:** Frontend gets errors or undefined data  
**Solution:** 
- Check response matches format in service files
- Always return `{ success: true/false, ... }`
- Include error messages: `{ success: false, message: "..." }`

---

## 💬 Questions to Ask Frontend Developer

1. "What is the frontend URL?" (for CORS setup)
2. "What format should error messages be?" (already documented, but confirm)
3. "Should I paginate the patients list?" (optional enhancement)
4. "What's the expected format for ECG file upload?" (if implementing file upload)
5. "Do you need any additional endpoints?" (for future features)

---

## 🎯 Final Step: Handoff

When everything is working:
- [ ] Push backend code to GitHub
- [ ] Share repository with frontend developer
- [ ] Share API base URL (production or staging)
- [ ] Share Postman collection
- [ ] Document any environment variables needed
- [ ] Celebrate! 🎉

---

## 📝 Notes

**Technology Flexibility:**
- This checklist works for ANY backend technology
- Node.js + Express + MongoDB (most common)
- Python + Django/Flask + PostgreSQL
- Java + Spring Boot + MySQL
- Ruby + Rails + PostgreSQL
- Choose what you know best!

**The Key:** Match the API contract in the service files!

---

## 🚨 Remember

❌ **DO NOT** copy React pages to Claude  
✅ **DO** give Claude the API_DOCUMENTATION.md  
✅ **DO** match the response format in service files  
✅ **DO** test each endpoint as you build  

**Good luck! The frontend is ready and waiting for you!** 🚀