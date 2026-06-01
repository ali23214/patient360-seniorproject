# Backend Developer Guide - Patient 360° Project

## ⚠️ IMPORTANT: What NOT to Do

### ❌ DO NOT Copy Frontend Code to Claude
**Copying React components (pages) to Claude to generate backend code is NOT the right approach because:**

1. **Wrong Context**: Frontend code contains UI logic, styling, and React-specific code that has NOTHING to do with backend
2. **Confusing Information**: Claude will see JSX, CSS classes, state management - all irrelevant to backend
3. **Missing Requirements**: The actual API requirements are hidden inside service calls
4. **Inefficient**: You'll spend time cleaning up frontend code from backend suggestions
5. **Poor Results**: Backend generated this way won't match what frontend expects

## ✅ What You SHOULD Do Instead

### Step 1: Clone the Frontend Repository
```bash
git clone <repository-url>
cd patient-360-frontend
```

### Step 2: Read These Files ONLY (In Order)

#### 📋 Priority 1: API Documentation (READ THIS FIRST)
```
Location: /docs/API_DOCUMENTATION.md
```
This file contains:
- All API endpoints needed
- Request/response formats
- Authentication requirements
- Data models
- Error handling

**👉 Give THIS file to Claude, not the React pages!**

#### 📋 Priority 2: Service Layer Files (Your Contract)
```
Location: /src/services/authService.js
Location: /src/services/patientService.js
```
These files show you:
- Exactly what data frontend expects
- Function signatures you need to match
- Response format (success/error structure)

**These are your "contract" with the frontend.**

#### 📋 Priority 3: Architecture Guide (Optional, for context)
```
Location: /docs/ARCHITECTURE_GUIDE.md
```
Explains the overall system design.

### Step 3: Understand the Service Layer Pattern

The frontend uses a **service layer pattern**. This means:

**Frontend Components** → **Services** → **Backend APIs**

```
┌─────────────────────┐
│  React Components   │
│  (UI Logic)         │
└──────────┬──────────┘
           │ calls
           ▼
┌─────────────────────┐
│  Service Layer      │  ← This is your CONTRACT
│  (Data Operations)  │  ← Match these functions
└──────────┬──────────┘
           │ HTTP requests
           ▼
┌─────────────────────┐
│  Backend APIs       │  ← This is what YOU build
│  (Your Code)        │
└─────────────────────┘
```

### Step 4: Your Backend Checklist

#### ✅ Phase 1: Setup (Week 1)
- [ ] Choose backend framework (Node.js/Express, Python/Django, Java/Spring, etc.)
- [ ] Setup database (PostgreSQL, MySQL, MongoDB)
- [ ] Setup project structure
- [ ] Configure CORS for frontend connection
- [ ] Setup authentication (JWT recommended)

#### ✅ Phase 2: Database Models (Week 1)
Create these models based on API_DOCUMENTATION.md:
- [ ] User model (shared: email, password, role, firstName, lastName)
- [ ] Doctor model (extends User: specialization, medicalLicenseNumber)
- [ ] Patient model (extends User: nationalId, dateOfBirth, phone, address)
- [ ] PatientMedicalData model (vitalSigns, ecgResults, aiPrediction, medications)
- [ ] Visit model (optional, for future)

#### ✅ Phase 3: Authentication APIs (Week 1-2)
Create these endpoints to match authService.js:
- [ ] POST `/api/auth/register` - Register new user
- [ ] POST `/api/auth/login` - Login user
- [ ] POST `/api/auth/logout` - Logout user
- [ ] GET `/api/auth/me` - Get current user
- [ ] GET `/api/auth/check` - Check if authenticated

#### ✅ Phase 4: Patient APIs (Week 2)
Create these endpoints to match patientService.js:
- [ ] GET `/api/patients` - Get all patients (doctor only)
- [ ] GET `/api/patients/:id` - Get patient by ID
- [ ] PUT `/api/patients/:id/medical-data` - Update patient medical data
- [ ] GET `/api/patients/me` - Get current patient data (patient only)

#### ✅ Phase 5: Testing & Integration (Week 2-3)
- [ ] Test all endpoints with Postman
- [ ] Document actual API URLs
- [ ] Share API base URL with frontend developer
- [ ] Frontend developer updates service files with your API URLs
- [ ] Joint testing with frontend

## 🎯 The Right Workflow with Claude

### Option 1: Give Claude the API Documentation
```
You: "I need to build a backend for a medical system. Here is the 
API documentation that shows all endpoints I need to create.
[Paste API_DOCUMENTATION.md]
Please help me create [specific endpoint]"
```

### Option 2: Show Claude a Service Function
```
You: "The frontend has this service function:

async function getPatientById(nationalId) {
  // This will call: GET /api/patients/:nationalId
  // Expected response: { success: true, patient: {...} }
}

Help me create the Express.js endpoint that matches this."
```

### Option 3: Show Claude the Data Structure
```
You: "The frontend expects patient data in this format:
{
  id: 123,
  firstName: "John",
  lastName: "Doe",
  email: "john@example.com",
  role: "patient",
  nationalId: "123456789",
  vitalSigns: { ... },
  prescribedMedications: [ ... ]
}

Help me create the MongoDB schema for this."
```

## 📚 Example: How to Work with Claude (Backend)

### ❌ WRONG Approach
```
You: "Here is my React component DoctorDashboard.jsx [pastes 1000 lines]
Create backend for this."

Claude: *gets confused by JSX, useState, useEffect, CSS classes*
```

### ✅ RIGHT Approach
```
You: "I need to create a REST API with these endpoints:
[Paste relevant section from API_DOCUMENTATION.md]

Technology: Node.js + Express + MongoDB
Please help me create the user registration endpoint."

Claude: *gives you clean backend code*
```

## 🗂️ Recommended File Structure for Backend

```
backend/
├── src/
│   ├── config/
│   │   ├── database.js       # Database connection
│   │   └── auth.js            # JWT configuration
│   ├── models/
│   │   ├── User.js            # User model
│   │   ├── Doctor.js          # Doctor model
│   │   ├── Patient.js         # Patient model
│   │   └── MedicalData.js     # Medical data model
│   ├── controllers/
│   │   ├── authController.js  # Authentication logic
│   │   └── patientController.js # Patient CRUD logic
│   ├── routes/
│   │   ├── authRoutes.js      # Auth endpoints
│   │   └── patientRoutes.js   # Patient endpoints
│   ├── middleware/
│   │   ├── auth.js            # JWT verification
│   │   └── roleCheck.js       # Role-based access control
│   └── app.js                 # Express app setup
├── package.json
└── .env                       # Environment variables
```

## 🔗 Frontend-Backend Connection Process

### Step 1: Backend Developer Creates APIs
```javascript
// Backend: server.js
app.post('/api/auth/login', loginController);
// Returns: { success: true, user: {...}, token: "jwt-token" }
```

### Step 2: Backend Developer Provides API URL
```
Backend URL: https://api.patient360.com
or
Backend URL: http://localhost:5000
```

### Step 3: Frontend Developer Updates Service Files
```javascript
// Frontend: src/services/authService.js
const API_URL = 'https://api.patient360.com'; // ← Backend URL here

export async function login(email, password) {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  return await response.json();
}
```

### Step 4: Testing Together
```bash
# Frontend (port 3000)
npm start

# Backend (port 5000)
npm run dev
```

## 📖 What to Ask Claude (Backend Developer)

### Good Questions for Claude:
1. "Help me create a MongoDB schema for a Patient model with these fields: [list fields]"
2. "Create an Express.js endpoint for POST /api/auth/login with JWT authentication"
3. "How do I implement role-based access control in Express middleware?"
4. "Create a controller function that updates patient medical data with validation"
5. "How do I setup CORS to allow requests from http://localhost:3000?"

### Bad Questions for Claude:
1. ❌ "Here's a React component, create backend for it" (Too vague, wrong context)
2. ❌ "Convert this JSX to backend API" (Doesn't make sense)
3. ❌ "Here's useState and useEffect, create database" (Wrong information)

## 🎯 Your Mission (Backend Developer)

**Your job is to create APIs that match the expectations in the service files.**

Think of it like this:
- Frontend says: "I will call GET /api/patients/123 and expect { success: true, patient: {...} }"
- You create: An endpoint that responds exactly like that

**You DON'T need to understand React, JSX, or CSS.**
**You ONLY need to understand the API contract in the documentation.**

## 📞 Communication with Frontend Developer

### What Backend Developer Should Share:
1. ✅ API Base URL (e.g., http://localhost:5000)
2. ✅ Any changes to response format
3. ✅ Authentication token format
4. ✅ Any additional endpoints you created
5. ✅ Error codes and messages

### What Backend Developer Should Ask:
1. "What format do you expect for error messages?"
2. "Should I paginate the patients list?"
3. "Do you need any additional fields in the response?"
4. "What's the maximum file size for ECG uploads?"

## 🚀 Quick Start Command for Backend Developer

```bash
# 1. Read the API documentation
cat docs/API_DOCUMENTATION.md

# 2. Read the service files (your contract)
cat src/services/authService.js
cat src/services/patientService.js

# 3. Start your backend project
mkdir backend
cd backend
npm init -y
npm install express mongoose jsonwebtoken bcrypt cors dotenv

# 4. Start coding based on API_DOCUMENTATION.md
```

## 📊 Success Criteria

You've successfully completed the backend when:
- [ ] All endpoints in API_DOCUMENTATION.md are implemented
- [ ] Frontend developer can update service files with your API URL
- [ ] Authentication works (login/register/logout)
- [ ] Doctor can search and update patient data
- [ ] Patient can view their own data
- [ ] No CORS errors
- [ ] All responses match the expected format

## 🎓 Key Takeaway

**The frontend code (React pages) is NOT your specification.**
**The API_DOCUMENTATION.md file IS your specification.**

Give Claude the API documentation, not the React components!

---

Good luck! 🚀

If you have questions, ask the frontend developer about:
- Expected data format
- Authentication flow
- Any unclear requirements in the documentation

Do NOT try to reverse-engineer requirements from React code!