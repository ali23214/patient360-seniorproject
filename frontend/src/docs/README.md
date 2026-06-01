# Documentation Folder

This folder contains technical documentation for the Patient 360° project.

## 📚 Files in This Folder

### 1. API_DOCUMENTATION.md ⭐ **Most Important**
**For:** Backend Developer  
**Purpose:** Complete API specification  
**Contains:**
- All endpoint URLs and methods
- Request body formats
- Response formats
- Authentication requirements
- Data models (User, Doctor, Patient)
- Error codes
- Example requests/responses

**👉 Backend developer should give THIS file to Claude AI, not React pages!**

---

### 2. ARCHITECTURE_GUIDE.md
**For:** Backend Developer & Frontend Developer  
**Purpose:** Explains the system architecture  
**Contains:**
- Service layer pattern explanation
- Why we use this pattern
- Benefits for development
- Frontend structure overview
- Backend integration strategy
- Phase 1 (localStorage) vs Phase 2 (API) comparison

---

### 3. REFACTORING_GUIDE.md
**For:** Frontend Developer  
**Purpose:** Documentation of refactoring process  
**Contains:**
- Before/after code examples
- What changed in each component
- Why we refactored
- How to maintain the pattern
- Benefits achieved

---

## 🎯 Who Should Read What?

### Backend Developer (Starting New)
**Read in this order:**
1. Go to `/backend-guides` folder first ← **Start here!**
2. Then come back and read `API_DOCUMENTATION.md`
3. Optionally read `ARCHITECTURE_GUIDE.md` for context

### Frontend Developer (Maintaining)
**Read in this order:**
1. `ARCHITECTURE_GUIDE.md` - Understand the pattern
2. `REFACTORING_GUIDE.md` - See examples
3. `API_DOCUMENTATION.md` - Know what backend provides

### New Team Member
**Read all files in this order:**
1. `ARCHITECTURE_GUIDE.md` - Big picture
2. `API_DOCUMENTATION.md` - Technical spec
3. `REFACTORING_GUIDE.md` - Implementation details

---

## 🚀 Quick Links

- **For Backend Developer:** Start at `/backend-guides/README.md`
- **For API Details:** Read `API_DOCUMENTATION.md`
- **For Architecture:** Read `ARCHITECTURE_GUIDE.md`

---

## 📝 Note

These are **technical documents**. For project overview, installation, and usage instructions, see the main `README.md` in the root folder.

---

**Last Updated:** November 2024  
**Project:** Patient 360° - Medical Management System