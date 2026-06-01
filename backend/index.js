/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Patient 360° — Backend Entry Point
 *  ─────────────────────────────────────────────────────────────────────────
 *  Syrian National Medical Platform — Arab International University
 *
 *  Stack:
 *    Node.js + Express 5 + MongoDB + Mongoose 8 + JWT auth
 *
 *  Boot sequence:
 *    1. Load environment variables
 *    2. Connect to MongoDB
 *    3. Register all 26 Mongoose models (via models/index.js barrel)
 *    4. Apply security middleware (helmet, cors)
 *    5. Apply body parsers + request logging
 *    6. Serve static uploads
 *    7. Mount all API routes
 *    8. Register error handlers
 *    9. Start HTTP listener
 *
 *  Optional env flags:
 *    SYNC_INDEXES=true   → calls mongoose.syncIndexes() on every model at boot
 *                          (useful after schema changes; slower startup)
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ============================================================================
// 1. ENVIRONMENT & CORE DEPENDENCIES
// ============================================================================

require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const fcmService = require('./services/fcmService');
const cronJobs = require('./services/cronJobs');
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/PATIENT360';

// ============================================================================
// 2. APP SETUP — express + security middleware
// ============================================================================

const app = express();

// Trust the first proxy (needed for req.ip behind nginx, AWS ALB, etc.)
app.set('trust proxy', 1);

// Security headers
// Content Security Policy is disabled because we serve images from /uploads
// that need to be embeddable cross-origin during dev/demo
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// CORS — allow the React frontend(s) and mobile app
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
}));

// Body parsers
// Raise the limit to 15 MB so multipart uploads (lab PDFs, emergency images)
// don't fail at the parser level before reaching multer.
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Request logging — concise format in production, dev-friendly in development
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));

// ============================================================================
// 3. STATIC UPLOADS — make sure all upload directories exist
// ============================================================================

const UPLOADS_ROOT = path.join(__dirname, 'uploads');
const UPLOAD_SUBDIRS = [
  'ecg',
  'doctor-documents',
  'lab-results',
  'emergency',
  'profile-photos',
  'visit-photos',
  'xray'
];

// Create upload directories if they don't exist (idempotent on every boot)
UPLOAD_SUBDIRS.forEach(subdir => {
  const fullPath = path.join(UPLOADS_ROOT, subdir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`📁 Created upload directory: uploads/${subdir}`);
  }
});

// Serve uploads as static files. Note: in production you should put nginx or
// a CDN in front of this — Express isn't optimized for static file serving.
app.use('/uploads', express.static(UPLOADS_ROOT, {
  maxAge: NODE_ENV === 'production' ? '1d' : 0,
  fallthrough: true
}));

// ============================================================================
// 4. DATABASE CONNECTION
// ============================================================================

async function connectDatabase() {
  try {
    await mongoose.connect(MONGO_URI, {
      // Mongoose 8 has sensible defaults — only override if needed
    });
    console.log(`✅ MongoDB connected: ${mongoose.connection.host}`);
    console.log(`   Database: ${mongoose.connection.name}`);
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }
}

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB disconnected');
});

// ============================================================================
// 5. REGISTER ALL 25 MODELS
// ============================================================================

// Importing the barrel registers every model with mongoose so subsequent
// require()s of any model return the same compiled instance.
require('./models');
console.log('✅ All Mongoose models registered (25 collections)');

// Optionally sync indexes — useful after schema changes during development.
// Skip this in production; instead run a one-off migration script.
async function syncAllIndexes() {
  if (process.env.SYNC_INDEXES !== 'true') return;

  console.log('🔄 SYNC_INDEXES=true → syncing indexes for all models...');
  const modelNames = mongoose.modelNames();

  for (const name of modelNames) {
    try {
      await mongoose.model(name).syncIndexes();
      console.log(`   ✓ ${name} indexes synced`);
    } catch (err) {
      console.error(`   ✗ ${name} index sync failed:`, err.message);
    }
  }
  console.log('✅ Index sync complete');
}

// ============================================================================
// 6. ROUTE MOUNTING
// ============================================================================

// ── Existing routes (from before this refactor) ─────────────────────────────
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const patientRoutes = require('./routes/patient');
const doctorRoutes = require('./routes/doctor');          // ← ADD THIS
const visitRoutes = require('./routes/visit');
const ecgRoutes = require('./routes/ecg');

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/patient', patientRoutes);
app.use('/api/doctor', doctorRoutes);                     // ← ADD THIS
app.use('/api/visits', visitRoutes);
app.use('/api/ecg', ecgRoutes);

// ── New routes — Batch B1: Prescriptions ────────────────────────────────────
const prescriptionRoutes = require('./routes/prescription');
app.use('/api/prescriptions', prescriptionRoutes);

// ── New routes — Batch B2: Pharmacist + Dispensing ──────────────────────────
const pharmacistRoutes = require('./routes/pharmacist');
const dispensingRoutes = require('./routes/dispensing');
app.use('/api/pharmacist', pharmacistRoutes);
app.use('/api/dispensing', dispensingRoutes);

// ── New routes — Batch B3: Lab tech + Lab tests ─────────────────────────────
const labTechnicianRoutes = require('./routes/labTechnician');
const labTestRoutes = require('./routes/labTest');
app.use('/api/lab-technician', labTechnicianRoutes);
app.use('/api/lab-tests', labTestRoutes);
// ─── NEW: Frontend-facing lab layer (matches labAPI contract) ───
const labRoutes = require('./routes/lab');
app.use('/api/lab', labRoutes);

// ── New routes — Batch B4: Appointments + Slots ─────────────────────────────
const slotRoutes = require('./routes/availabilitySlot');
const appointmentRoutes = require('./routes/appointment');
app.use('/api/slots', slotRoutes);
app.use('/api/appointments', appointmentRoutes);

// ── New routes — Batch B5: Emergency + Notifications ────────────────────────
const emergencyRoutes = require('./routes/emergency');
const notificationRoutes = require('./routes/notification');
app.use('/api/emergency', emergencyRoutes);

// Notifications — primary path + mobile-compatible /api/auth/fcm-token alias
app.use('/api/notifications', notificationRoutes.notificationsRouter || notificationRoutes);
if (notificationRoutes.authFcmRouter) {
  app.use('/api/auth', notificationRoutes.authFcmRouter);
  console.log('✅ FCM token alias mounted at /api/auth/fcm-token');
}

// ── X-Ray fracture detection (Kinan model, FastAPI on port 8002) ────────────
// Thin proxy: Express handles auth + multer, then forwards to FastAPI and
// returns the model response unchanged. See routes/xray.js for details.
const xrayRoutes = require('./routes/xray');
app.use('/api/xray', xrayRoutes);

// ── Drug-risk check (Kinan rule-based pipeline, FastAPI on port 8001) ───────
// Patient + doctor both call this. The backend builds patient_profile from
// MongoDB (allergies, current meds), normalizes it to the pipeline's
// expected enums, then calls FastAPI and persists the check for audit.
const drugRiskRoutes = require('./routes/drugRisk/drugRisk');
app.use('/api/drug-risk', drugRiskRoutes);

// ── Knee OA classification (Kinan DenseNet121 3-class, FastAPI on port 8003) ─
// Orthopedist doctors upload knee X-rays. The backend forwards the image to
// FastAPI, validates the response, and persists each analysis in the
// `knee_xray_analyses` collection for audit + patient history.
const kneeXrayRoutes = require('./routes/kneeXray/kneeXray');
app.use('/api/knee-xray', kneeXrayRoutes);

// ── Dental Caries detection (Pak Team EfficientNetV2-B0, FastAPI on port 8004) ─
// Dentists (and doctors, defensively) upload tooth X-ray images. The backend
// forwards them to FastAPI, validates the response, and persists each
// analysis in the `dental_caries_analyses` collection for audit + history.
const dentalCariesRoutes = require('./routes/dentalCaries/dentalCaries');
app.use('/api/dental-caries', dentalCariesRoutes);

// ── Medications admin CRUD (post-B6 addition) ───────────────────────────────
const medicationRoutes = require('./routes/medication');
app.use('/api/medications', medicationRoutes);

console.log('✅ All API routes mounted');

// ── Facility search — public endpoints for signup autocomplete ──────────────
const facilitySearch = require('./routes/facilitySearch');
app.use('/api/pharmacies', facilitySearch.pharmacyRouter);
app.use('/api/laboratories', facilitySearch.laboratoryRouter);

// ── Facility Requests (v2.2) — public submit + admin manage ─────────────────
// Used by SignUp.jsx to:
//   • Search existing pharmacies/labs: /api/facilities/{pharmacies|laboratories}/search
//   • Submit a new facility registration request: /api/facilities/requests
// Admin endpoints live under /api/admin/facility-requests (mounted in admin routes).
const facilitiesRoutes = require('./routes/facilities');
app.use('/api/facilities', facilitiesRoutes);
console.log('✅ Facility requests routes mounted at /api/facilities');

// ============================================================================
// 7. ROOT + HEALTH ENDPOINTS
// ============================================================================

// Root — returns a friendly catalog of all mounted endpoints
app.get('/', (req, res) => {
  res.json({
    success: true,
    name: 'Patient 360° Backend API',
    arabicName: 'منصة Patient 360°',
    version: '2.0.0',
    environment: NODE_ENV,
    endpoints: {
      auth: {
        signup: 'POST   /api/auth/signup',
        login: 'POST   /api/auth/login',
        logout: 'POST   /api/auth/logout',
        verify: 'GET    /api/auth/verify',
        verifyToken: 'GET    /api/auth/verify-token',
        forgotPassword: 'POST   /api/auth/forgot-password',
        verifyOTP: 'POST   /api/auth/verify-otp',
        resetPassword: 'POST   /api/auth/reset-password',
        updateLastLogin: 'POST   /api/auth/update-last-login',
        registerDoctor: 'POST   /api/auth/register-doctor',
        registerPharmacist: 'POST   /api/auth/register-pharmacist',
        registerLabTech: 'POST   /api/auth/register-lab-technician',
        checkDoctorStatus: 'GET    /api/auth/check-doctor-status',
        checkProStatus: 'GET    /api/auth/check-professional-status'
      },
      admin: {
        statistics: 'GET    /api/admin/statistics',
        doctors: 'GET    /api/admin/doctors',
        doctorRequests: 'GET    /api/admin/doctor-requests',
        approveRequest: 'POST   /api/admin/doctor-requests/:id/accept',
        rejectRequest: 'POST   /api/admin/doctor-requests/:id/reject',
        patients: 'GET    /api/admin/patients',
        children: 'GET    /api/admin/children',
        migrateChild: 'POST   /api/admin/children/:id/migrate',
        hospitals: 'GET    /api/admin/hospitals',
        pharmacies: 'GET    /api/admin/pharmacies',
        laboratories: 'GET    /api/admin/laboratories',
        facilityRequests: 'GET    /api/admin/facility-requests',
        approveFacility: 'POST   /api/admin/facility-requests/:id/approve',
        rejectFacility: 'POST   /api/admin/facility-requests/:id/reject',
        auditLogs: 'GET    /api/admin/audit-logs',
        userActivity: 'GET    /api/admin/audit-logs/user-activity?email='
      },
      patient: {
        me: 'GET    /api/patient/me',
        myVisits: 'GET    /api/patient/me/visits',
        myLabTests: 'GET    /api/patient/me/lab-tests',
        myPrescriptions: 'GET    /api/patient/me/prescriptions',
        myAppointments: 'GET    /api/patient/me/appointments',
        medicalSummary: 'GET    /api/patient/me/medical-summary',
        lookupByID: 'GET    /api/patient/:nationalId-or-CRN'
      },
      visits: {
        create: 'POST   /api/visits',
        getById: 'GET    /api/visits/:id',
        complete: 'POST   /api/visits/:id/complete',
        update: 'PATCH  /api/visits/:id'
      },
      ecg: {
        analyze: 'POST   /api/ecg/analyze (multipart, cardiologist only)',
        test: 'GET    /api/ecg/test',
        getVisitECG: 'GET    /api/ecg/visit/:visitId'
      },
      xray: {
        analyzeHand: 'POST   /api/xray/analyze-hand (multipart, doctor only)',
        analyzeLeg: 'POST   /api/xray/analyze-leg (multipart, doctor only)',
        health: 'GET    /api/xray/health (doctor/admin)'
      },
      prescriptions: {
        create: 'POST   /api/prescriptions',
        getById: 'GET    /api/prescriptions/:id',
        verifyByQR: 'POST   /api/prescriptions/verify-qr (pharmacist)',
        verifyByCode: 'POST   /api/prescriptions/verify-code (pharmacist)',
        cancel: 'POST   /api/prescriptions/:id/cancel',
        checkInteractions: 'POST   /api/prescriptions/check-interactions',
        byDoctor: 'GET    /api/prescriptions/doctor/:doctorId',
        byPatient: 'GET    /api/prescriptions/patient/:identifier'
      },
      pharmacist: {
        myProfile: 'GET    /api/pharmacist/me',
        dashboard: 'GET    /api/pharmacist/dashboard-stats',
        inventory: 'GET    /api/pharmacist/inventory',
        lowStock: 'GET    /api/pharmacist/alerts/low-stock',
        expiry: 'GET    /api/pharmacist/alerts/expiry',
        history: 'GET    /api/pharmacist/dispensing-history',
        searchMeds: 'GET    /api/pharmacist/medications/search?q='
      },
      dispensing: {
        dispenseRx: 'POST   /api/dispensing/prescription',
        dispenseOTC: 'POST   /api/dispensing/otc',
        restock: 'POST   /api/dispensing/inventory/restock',
        getById: 'GET    /api/dispensing/:id'
      },
      labTechnician: {
        myProfile: 'GET    /api/lab-technician/me',
        dashboard: 'GET    /api/lab-technician/dashboard-stats',
        pendingOrders: 'GET    /api/lab-technician/pending-orders',
        todaySchedule: 'GET    /api/lab-technician/today-schedule',
        myTests: 'GET    /api/lab-technician/tests-performed'
      },
      labTests: {
        create: 'POST   /api/lab-tests',
        getById: 'GET    /api/lab-tests/:id',
        cancel: 'POST   /api/lab-tests/:id/cancel',
        collectSample: 'POST   /api/lab-tests/:id/collect-sample',
        startProcessing: 'POST   /api/lab-tests/:id/start-processing',
        enterResults: 'POST   /api/lab-tests/:id/enter-results',
        uploadPDF: 'POST   /api/lab-tests/:id/upload-pdf (multipart)',
        complete: 'POST   /api/lab-tests/:id/complete',
        reject: 'POST   /api/lab-tests/:id/reject',
        markViewed: 'POST   /api/lab-tests/:id/mark-viewed'
      },
      slots: {
        listAvailable: 'GET    /api/slots/available?doctorId=...&date=... (PUBLIC)',
        mySlots: 'GET    /api/slots/mine',
        create: 'POST   /api/slots',
        bulkGenerate: 'POST   /api/slots/generate',
        block: 'POST   /api/slots/:id/block',
        unblock: 'POST   /api/slots/:id/unblock',
        delete: 'DELETE /api/slots/:id'
      },
      appointments: {
        book: 'POST   /api/appointments',
        myAppointments: 'GET    /api/appointments/mine',
        providerSchedule: 'GET    /api/appointments/provider-schedule',
        getById: 'GET    /api/appointments/:id',
        cancel: 'POST   /api/appointments/:id/cancel',
        confirm: 'POST   /api/appointments/:id/confirm',
        checkIn: 'POST   /api/appointments/:id/check-in',
        complete: 'POST   /api/appointments/:id/complete',
        reschedule: 'POST   /api/appointments/:id/reschedule'
      },
      emergency: {
        submit: 'POST   /api/emergency (multipart)',
        myReports: 'GET    /api/emergency/mine',
        active: 'GET    /api/emergency/active (admin)',
        nearby: 'GET    /api/emergency/nearby?lng=...&lat=...&radiusKm=...',
        callAmbulance: 'POST   /api/emergency/:id/call-ambulance',
        resolve: 'POST   /api/emergency/:id/resolve',
        getById: 'GET    /api/emergency/:id'
      },
      notifications: {
        list: 'GET    /api/notifications',
        unreadCount: 'GET    /api/notifications/unread-count',
        markAsRead: 'POST   /api/notifications/:id/read',
        markAllRead: 'POST   /api/notifications/read-all',
        registerToken: 'POST   /api/notifications/push-token',
        removeToken: 'DELETE /api/notifications/push-token',
        dispatchCriticalLabs: 'POST   /api/notifications/dispatch/critical-labs (admin)'
      },
      medications: {
        list: 'GET    /api/medications',
        search: 'GET    /api/medications/search?q=...',
        categories: 'GET    /api/medications/categories',
        getById: 'GET    /api/medications/:id',
        create: 'POST   /api/medications (admin)',
        update: 'PATCH  /api/medications/:id (admin)',
        discontinue: 'DELETE /api/medications/:id (admin)'
      },
      drugRisk: {
        check:           'POST   /api/drug-risk/check (patient)',
        checkForPatient: 'POST   /api/drug-risk/check-for-patient (doctor)',
        myHistory:       'GET    /api/drug-risk/my-history (patient)',
        acknowledge:     'POST   /api/drug-risk/:id/acknowledge (doctor)',
        health:          'GET    /api/drug-risk/health'
      },
      kneeXray: {
        analyze:         'POST   /api/knee-xray/analyze (multipart, doctor only)',
        myHistory:       'GET    /api/knee-xray/history/me (doctor)',
        patientHistory:  'GET    /api/knee-xray/patient/:identifier (doctor)',
        getOne:          'GET    /api/knee-xray/:id (doctor)',
        health:          'GET    /api/knee-xray/health (doctor/admin)'
      },
      dentalCaries: {
        analyze:         'POST   /api/dental-caries/analyze (multipart: tooth_image, dentist/doctor)',
        myHistory:       'GET    /api/dental-caries/history/me (dentist/doctor)',
        patientHistory:  'GET    /api/dental-caries/patient/:identifier (dentist/doctor)',
        getOne:          'GET    /api/dental-caries/:id (dentist/doctor)',
        health:          'GET    /api/dental-caries/health (dentist/doctor/admin)'
      },
      facilities: {
        searchPharmacies:   'GET  /api/facilities/pharmacies/search?q=... (PUBLIC, signup)',
        searchLaboratories: 'GET  /api/facilities/laboratories/search?q=... (PUBLIC, signup)',
        submitRequest:      'POST /api/facilities/requests (PUBLIC, signup)'
      }
    }
  });
});

// Health check — simple, fast, no DB query
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// ============================================================================
// 8. ERROR HANDLERS — 404 + global
// ============================================================================

// 404 — must come AFTER all routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `المسار غير موجود: ${req.method} ${req.originalUrl}`
  });
});

// Global error handler — Express 5 catches async errors automatically
// Signature MUST have 4 args (err, req, res, next) for Express to recognize it
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);

  // Mongoose validation errors → 400
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      success: false,
      message: messages[0] || 'خطأ في البيانات'
    });
  }

  // Duplicate key (unique index violation) → 409
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'الحقل';
    return res.status(409).json({
      success: false,
      message: `${field} مستخدم مسبقاً`
    });
  }

  // Multer file size errors → 413
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      message: 'حجم الملف أكبر من المسموح'
    });
  }

  // CORS errors → 403
  if (err.message?.startsWith('CORS blocked')) {
    return res.status(403).json({
      success: false,
      message: 'الطلب مرفوض من قبل سياسة CORS'
    });
  }

  // Default 500
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'حدث خطأ في الخادم'
  });
});

// ============================================================================
// 9. START SERVER
// ============================================================================

async function start() {
  await connectDatabase();
  await syncAllIndexes(); // No-op unless SYNC_INDEXES=true

  fcmService.init();

  // Start scheduled background jobs (Damascus timezone)
  cronJobs.init();

  app.listen(PORT, () => {
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                                                                ║');
    console.log('║     Patient 360° Backend                                       ║');
    console.log('║     Syrian National Medical Platform                           ║');
    console.log('║     Arab International University                              ║');
    console.log('║                                                                ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`🚀 Server running:    http://localhost:${PORT}`);
    console.log(`🌍 Environment:       ${NODE_ENV}`);
    console.log(`🗄️  Database:          ${mongoose.connection.name}`);
    console.log(`📡 CORS origins:      ${allowedOrigins.join(', ')}`);
    console.log(`📚 API catalog:       http://localhost:${PORT}/`);
    console.log(`💚 Health check:      http://localhost:${PORT}/health`);
    console.log('');
  });
}

// Graceful shutdown on SIGINT/SIGTERM
['SIGINT', 'SIGTERM'].forEach(signal => {
  process.on(signal, async () => {
    console.log(`\n📴 Received ${signal} — shutting down gracefully...`);
    try {
      await mongoose.connection.close();
      console.log('✅ MongoDB connection closed');
    } catch (err) {
      console.error('Error closing MongoDB:', err);
    }
    process.exit(0);
  });
});

// Crash on unhandled promise rejections (fail loud, don't hide bugs)
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled promise rejection:', reason);
  process.exit(1);
});

start();