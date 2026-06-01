# What to Give Claude AI for Backend Development

## 🎯 Quick Answer

**Give Claude THESE files (in this order):**

1. ✅ `/docs/API_DOCUMENTATION.md` - Your main specification
2. ✅ `/src/services/authService.js` - Shows expected authentication responses
3. ✅ `/src/services/patientService.js` - Shows expected patient data responses

**Do NOT give Claude:**
- ❌ React page files (DoctorDashboard.jsx, PatientDashboard.jsx)
- ❌ CSS files
- ❌ Component files
- ❌ Any JSX code

---

## 💬 Example Conversation with Claude

### ✅ CORRECT Way - Example 1: Starting Backend

```
You: "I need to build a REST API backend for a medical system. 
Here is the API documentation:

[Paste API_DOCUMENTATION.md here]

I want to use Node.js with Express and MongoDB.
Help me create the project structure and User model."

Claude: [Gives you clean backend code]
```

### ✅ CORRECT Way - Example 2: Specific Endpoint

```
You: "I need to create a login endpoint. Here's what the frontend expects:

Function: login(email, password)
Expected Response:
{
  success: true,
  user: {
    id: number,
    email: string,
    role: 'doctor' | 'patient',
    firstName: string,
    lastName: string
  },
  token: "jwt-token-string"
}

Create the Express.js endpoint with JWT authentication."

Claude: [Gives you the endpoint code]
```

### ✅ CORRECT Way - Example 3: Database Model

```
You: "Create a MongoDB Patient schema with these fields:
- id (unique)
- email (unique, required)
- password (hashed, required)
- role: 'patient'
- firstName, lastName
- nationalId (unique)
- dateOfBirth
- phone
- address
- vitalSigns (object)
- prescribedMedications (array)
- ecgResults (object)
- aiPrediction (object)

Include validation and timestamps."

Claude: [Gives you the Mongoose schema]
```

---

## ❌ WRONG Way (Don't Do This)

### ❌ Example 1: Pasting React Components
```
You: "Here is my DoctorDashboard component:

import React, { useState, useEffect } from 'react';
const DoctorDashboard = () => {
  const [patients, setPatients] = useState([]);
  [... 1000 lines of JSX code ...]
}

Create backend for this."

Claude: *Gets confused by React code, useState, JSX syntax, 
        CSS classes, and gives you irrelevant suggestions*
```

### ❌ Example 2: Asking Claude to Reverse Engineer
```
You: "Look at this frontend code and figure out what backend I need."

Claude: *Might miss important details, make wrong assumptions*
```

---

## 📋 Step-by-Step Process

### Step 1: Open the Frontend Repository
```bash
git clone <repository-url>
cd patient-360-frontend
```

### Step 2: Open These Files in Your Editor
```
1. docs/API_DOCUMENTATION.md (READ THIS FIRST)
2. src/services/authService.js
3. src/services/patientService.js
```

### Step 3: Start a New Chat with Claude AI
**Paste API_DOCUMENTATION.md** and say:

```
"I need to build a backend API based on this specification.
Technology: Node.js + Express + MongoDB
Help me get started with project setup."
```

### Step 4: For Each Endpoint, Ask Claude
```
"Based on the API documentation, help me create:
- POST /api/auth/register endpoint
- Include input validation
- Return format: { success: boolean, user: object, message: string }"
```

---

## 🎯 What Each File Contains

### API_DOCUMENTATION.md
- All endpoint URLs
- Request format (what to expect from frontend)
- Response format (what to send back)
- Authentication requirements
- Error codes
- **This is your Bible** 📖

### authService.js
- Shows exactly what format authentication responses need
- Shows what data frontend expects for user object
- Shows error handling format
- **Your contract for auth APIs**

### patientService.js
- Shows exactly what format patient data responses need
- Shows what the frontend expects when searching patients
- Shows what data to save when doctor updates patient
- **Your contract for patient APIs**

---

## 🔧 Example: Building Login Endpoint

### Step 1: Read authService.js
```javascript
// You see this in authService.js:
export async function login(email, password) {
  // Will call: POST /api/auth/login
  // Expected response:
  return {
    success: true,
    user: { id, email, role, firstName, lastName, ... },
    token: "jwt-token"
  };
}
```

### Step 2: Ask Claude
```
"Create an Express.js endpoint for POST /api/auth/login that:
1. Accepts email and password in request body
2. Validates credentials against MongoDB
3. Generates JWT token
4. Returns this format:
{
  success: true,
  user: { id, email, role, firstName, lastName },
  token: "jwt-token"
}

If login fails, return:
{
  success: false,
  message: "Invalid credentials"
}
"
```

### Step 3: Claude Gives You Clean Backend Code
```javascript
// Claude provides this:
router.post('/api/auth/login', async (req, res) => {
  // Clean, working backend code
});
```

---

## 📊 Information Flow

```
┌──────────────────────────────┐
│  API_DOCUMENTATION.md        │ ← Give this to Claude
│  (What endpoints to create)  │    (Your specification)
└──────────────────────────────┘
              ↓
┌──────────────────────────────┐
│  authService.js              │ ← Give this to Claude
│  patientService.js           │    (Expected format)
│  (What format to return)     │
└──────────────────────────────┘
              ↓
        Claude AI 🤖
              ↓
┌──────────────────────────────┐
│  Your Backend Code           │ ← Claude generates this
│  (Express + MongoDB)         │    (Clean backend code)
└──────────────────────────────┘
```

---

## ⚡ Quick Examples for Common Tasks

### Authentication Endpoint
```
"Based on API_DOCUMENTATION.md, create POST /api/auth/login with JWT"
```

### Get All Patients
```
"Create GET /api/patients that returns array of patient objects.
Only allow access if user role is 'doctor'."
```

### Update Patient Medical Data
```
"Create PUT /api/patients/:id/medical-data that accepts:
- vitalSigns object
- prescribedMedications array
- ecgResults object
- aiPrediction object

Return: { success: true, patient: updatedPatient }"
```

### Database Model
```
"Create Mongoose schema for Patient with fields from API_DOCUMENTATION.md"
```

---

## 🎓 Key Rules

1. ✅ **Give Claude the API specification** (API_DOCUMENTATION.md)
2. ✅ **Give Claude expected data formats** (service files)
3. ✅ **Ask Claude for specific endpoints** (one at a time)
4. ❌ **Don't give Claude React components** (wrong context)
5. ❌ **Don't ask Claude to guess requirements** (use documentation)

---

## 📞 If You're Stuck

Ask Claude:
- ✅ "How do I implement JWT authentication in Express?"
- ✅ "Create a middleware to check if user is a doctor"
- ✅ "How do I validate request body in Express?"
- ✅ "Create error handling middleware"

Don't Ask Claude:
- ❌ "What does this React component need?" (Read the docs instead)
- ❌ "Convert JSX to backend" (Doesn't make sense)

---

## 🎯 Success = Matching the Contract

Your backend is successful when:
- ✅ Endpoints match URLs in API_DOCUMENTATION.md
- ✅ Responses match format in service files
- ✅ Frontend can call your APIs without errors
- ✅ Authentication works
- ✅ Data is saved and retrieved correctly

---

**Remember: The service files are your CONTRACT.**
**Match the contract, and the frontend will work perfectly!** ✨