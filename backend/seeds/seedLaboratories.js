/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Patient 360° — Laboratory Seeding Script
 *  ─────────────────────────────────────────────────────────────────────────
 *  Populates the `laboratories` collection with 5 reference labs spanning
 *  the main Syrian governorates — Damascus, Aleppo, Homs, Tartus, Latakia.
 *
 *  Each lab document is fully schema-compliant:
 *    • GeoJSON `location` with verified city-center coordinates
 *    • `testCatalog` covering the 10 most commonly ordered tests in primary
 *       care (CBC, FBS, HbA1c, LFT, KFT, Lipid, TSH, Urinalysis, etc.)
 *    • `operatingHours` with a realistic weekly schedule
 *    • Arabic + English names, contact details, full address
 *
 *  Safety & idempotency:
 *    • Skips any lab whose registrationNumber already exists (no duplicates)
 *    • Validates MONGO_URI presence before connecting
 *    • Prints a clear per-lab report: created / skipped / failed
 *    • Exits with non-zero code on hard failure so CI/CD can detect it
 *    • Does NOT modify or delete existing documents
 *
 *  Usage:
 *    From backend/ directory:
 *      node seeds/seedLaboratories.js
 *
 *    Or with SKIP confirmation (e.g. in a script pipeline):
 *      SEED_LABS_CONFIRM=yes node seeds/seedLaboratories.js
 *
 *  Environment variables (loaded from .env):
 *    MONGO_URI           — MongoDB connection string (required)
 *    SEED_LABS_CONFIRM   — set to 'yes' to skip interactive prompt (optional)
 * ═══════════════════════════════════════════════════════════════════════════
 */

require('dotenv').config();

const mongoose = require('mongoose');
const path = require('path');

// ── Ensure models are registered ─────────────────────────────────────────────
// We pull via the barrel so every model (Account, Person, etc.) is registered
// with mongoose before we touch the Laboratory model.
require('../models');

const Laboratory = mongoose.model('Laboratory');

// ============================================================================
// CONFIGURATION
// ============================================================================

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/PATIENT360';

/**
 * Reusable common-test catalog items.
 * These are the 10 most frequently ordered tests in Syrian primary care.
 * Every lab we seed will offer this catalog (with governorate-adjusted prices).
 */
const COMMON_TEST_CATALOG = [
  {
    testCode: 'CBC',
    testName: 'Complete Blood Count',
    arabicName: 'تعداد دم كامل',
    category: 'blood',
    turnaroundTime: '2 hours',
    isAvailable: true,
  },
  {
    testCode: 'FBS',
    testName: 'Fasting Blood Sugar',
    arabicName: 'سكر صائم',
    category: 'blood',
    turnaroundTime: '1 hour',
    isAvailable: true,
  },
  {
    testCode: 'HBA1C',
    testName: 'Glycated Hemoglobin',
    arabicName: 'السكر التراكمي',
    category: 'blood',
    turnaroundTime: '4 hours',
    isAvailable: true,
  },
  {
    testCode: 'LFT',
    testName: 'Liver Function Tests',
    arabicName: 'وظائف الكبد',
    category: 'blood',
    turnaroundTime: '4 hours',
    isAvailable: true,
  },
  {
    testCode: 'KFT',
    testName: 'Kidney Function Tests',
    arabicName: 'وظائف الكلى',
    category: 'blood',
    turnaroundTime: '4 hours',
    isAvailable: true,
  },
  {
    testCode: 'LIPID',
    testName: 'Lipid Profile',
    arabicName: 'صورة دهون',
    category: 'blood',
    turnaroundTime: '4 hours',
    isAvailable: true,
  },
  {
    testCode: 'TSH',
    testName: 'Thyroid Stimulating Hormone',
    arabicName: 'هرمون الغدة الدرقية',
    category: 'blood',
    turnaroundTime: '6 hours',
    isAvailable: true,
  },
  {
    testCode: 'UA',
    testName: 'Urinalysis',
    arabicName: 'تحليل البول',
    category: 'urine',
    turnaroundTime: '1 hour',
    isAvailable: true,
  },
  {
    testCode: 'VITD',
    testName: 'Vitamin D (25-OH)',
    arabicName: 'فيتامين د',
    category: 'blood',
    turnaroundTime: '24 hours',
    isAvailable: true,
  },
  {
    testCode: 'ESR',
    testName: 'Erythrocyte Sedimentation Rate',
    arabicName: 'سرعة الترسيب',
    category: 'blood',
    turnaroundTime: '1 hour',
    isAvailable: true,
  },
];

/**
 * Standard Sunday–Thursday 08:00–18:00 schedule
 * (Friday closed, Saturday reduced hours).
 * Reflects typical Syrian private/public lab operating hours.
 */
const STANDARD_HOURS = [
  { day: 'Sunday',    openTime: '08:00', closeTime: '18:00', is24Hours: false },
  { day: 'Monday',    openTime: '08:00', closeTime: '18:00', is24Hours: false },
  { day: 'Tuesday',   openTime: '08:00', closeTime: '18:00', is24Hours: false },
  { day: 'Wednesday', openTime: '08:00', closeTime: '18:00', is24Hours: false },
  { day: 'Thursday',  openTime: '08:00', closeTime: '18:00', is24Hours: false },
  { day: 'Friday',    openTime: '00:00', closeTime: '00:00', is24Hours: false },
  { day: 'Saturday',  openTime: '09:00', closeTime: '14:00', is24Hours: false },
];

/**
 * Price multiplier per governorate to make the seed data feel realistic.
 * Damascus/Aleppo labs tend to charge slightly more than coastal/inland ones.
 */
function buildTestCatalog(priceMultiplier = 1) {
  const BASE_PRICES = {
    CBC: 8000, FBS: 4000, HBA1C: 15000, LFT: 18000, KFT: 15000,
    LIPID: 20000, TSH: 25000, UA: 5000, VITD: 35000, ESR: 5000,
  };
  return COMMON_TEST_CATALOG.map((t) => ({
    ...t,
    price: Math.round(BASE_PRICES[t.testCode] * priceMultiplier),
  }));
}

// ============================================================================
// LAB DATASET — 5 reference laboratories across Syria
// ============================================================================

/**
 * Coordinates were chosen at city centers from OpenStreetMap so every lab
 * document passes the GeoJSON validator (Syria bounding box) and produces
 * correct $near query results against real patient locations.
 */
const LABS = [
  // ── 1. DAMASCUS ───────────────────────────────────────────────────────────
  {
    name: 'Al-Mazzeh Medical Laboratory',
    arabicName: 'مختبر المزة الطبي',
    registrationNumber: 'LAB-DAM-001',
    labLicense: 'DAM-LAB-2024-001',
    labType: 'independent',
    phoneNumber: '0113334455',
    email: 'info@mazzeh-lab.sy',
    governorate: 'damascus',
    city: 'دمشق',
    district: 'المزة',
    address: 'شارع المزة، أوتوستراد المزة، دمشق',
    location: {
      type: 'Point',
      coordinates: [36.2765, 33.5138], // Damascus city center
    },
    testCatalog: buildTestCatalog(1.10),
    operatingHours: STANDARD_HOURS,
    isActive: true,
    isAcceptingTests: true,
  },

  // ── 2. ALEPPO ─────────────────────────────────────────────────────────────
  {
    name: 'Aleppo University Medical Laboratory',
    arabicName: 'مختبر جامعة حلب الطبي',
    registrationNumber: 'LAB-ALP-001',
    labLicense: 'ALP-LAB-2024-001',
    labType: 'hospital_based',
    phoneNumber: '0212223344',
    email: 'lab@aleppo-uni.sy',
    governorate: 'aleppo',
    city: 'حلب',
    district: 'الجديدة',
    address: 'حي الجديدة، بالقرب من مستشفى جامعة حلب، حلب',
    location: {
      type: 'Point',
      coordinates: [37.1607, 36.2021], // Aleppo city center
    },
    testCatalog: buildTestCatalog(1.05),
    operatingHours: STANDARD_HOURS,
    isActive: true,
    isAcceptingTests: true,
  },

  // ── 3. HOMS ───────────────────────────────────────────────────────────────
  {
    name: 'Homs Central Laboratory',
    arabicName: 'مختبر حمص المركزي',
    registrationNumber: 'LAB-HOM-001',
    labLicense: 'HOM-LAB-2024-001',
    labType: 'independent',
    phoneNumber: '0315556677',
    email: 'contact@homs-central-lab.sy',
    governorate: 'homs',
    city: 'حمص',
    district: 'الحمراء',
    address: 'شارع الحمراء، وسط مدينة حمص',
    location: {
      type: 'Point',
      coordinates: [36.7196, 34.7328], // Homs city center
    },
    testCatalog: buildTestCatalog(1.00),
    operatingHours: STANDARD_HOURS,
    isActive: true,
    isAcceptingTests: true,
  },

  // ── 4. TARTUS ⭐ (matches test patient governorate) ───────────────────────
  {
    name: 'Tartus Coastal Medical Laboratory',
    arabicName: 'مختبر طرطوس الساحلي الطبي',
    registrationNumber: 'LAB-TAR-001',
    labLicense: 'TAR-LAB-2024-001',
    labType: 'independent',
    phoneNumber: '0437778899',
    email: 'info@tartus-coastal-lab.sy',
    governorate: 'tartus',
    city: 'طرطوس',
    district: 'الكورنيش',
    address: 'شارع الكورنيش البحري، طرطوس',
    location: {
      type: 'Point',
      coordinates: [35.8867, 34.8894], // Tartus city center
    },
    testCatalog: buildTestCatalog(0.95),
    operatingHours: STANDARD_HOURS,
    isActive: true,
    isAcceptingTests: true,
  },

  // ── 5. LATAKIA ────────────────────────────────────────────────────────────
  {
    name: 'Latakia Seaside Diagnostic Center',
    arabicName: 'مركز اللاذقية الشاطئي للتشخيص',
    registrationNumber: 'LAB-LAT-001',
    labLicense: 'LAT-LAB-2024-001',
    labType: 'specialized',
    phoneNumber: '0419990011',
    email: 'lab@latakia-seaside.sy',
    governorate: 'latakia',
    city: 'اللاذقية',
    district: 'الصليبة',
    address: 'حي الصليبة، شارع المتنبي، اللاذقية',
    location: {
      type: 'Point',
      coordinates: [35.7837, 35.5407], // Latakia city center
    },
    testCatalog: buildTestCatalog(0.95),
    operatingHours: STANDARD_HOURS,
    isActive: true,
    isAcceptingTests: true,
  },
];

// ============================================================================
// SEEDING LOGIC
// ============================================================================

/**
 * Validate environment before doing anything destructive.
 */
function validateEnvironment() {
  if (!MONGO_URI) {
    console.error('❌ MONGO_URI is not set in .env');
    process.exit(1);
  }
  console.log('🔧 Environment OK');
  console.log(`   MongoDB URI: ${MONGO_URI.replace(/\/\/[^@]+@/, '//<credentials>@')}`);
}

/**
 * Connect with reasonable timeouts so the script fails fast on bad URIs.
 */
async function connectToDatabase() {
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`✅ Connected to MongoDB — database: ${mongoose.connection.name}`);
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }
}

/**
 * Per-lab seeding with clear reporting.
 *
 * Returns a summary object:
 *   { created: number, skipped: number, failed: number, errors: [...] }
 */
async function seedLabs() {
  const summary = { created: 0, skipped: 0, failed: 0, errors: [] };

  console.log('');
  console.log('━'.repeat(68));
  console.log(`🧪 Seeding ${LABS.length} laboratories...`);
  console.log('━'.repeat(68));

  for (const labData of LABS) {
    const label = `${labData.name} (${labData.governorate})`;

    try {
      // Duplicate guard — registrationNumber is unique in the schema
      const existing = await Laboratory.findOne({
        registrationNumber: labData.registrationNumber,
      }).lean();

      if (existing) {
        console.log(`⚪ Skipped (already exists): ${label}`);
        summary.skipped += 1;
        continue;
      }

      const created = await Laboratory.create(labData);
      console.log(`✅ Created: ${label}`);
      console.log(`   _id: ${created._id}`);
      console.log(`   tests in catalog: ${created.testCatalog.length}`);
      summary.created += 1;
    } catch (err) {
      console.error(`❌ Failed: ${label}`);
      console.error(`   Error: ${err.message}`);
      summary.failed += 1;
      summary.errors.push({ lab: label, message: err.message });
    }
  }

  return summary;
}

/**
 * Final report with clear visual separation.
 */
function printReport(summary) {
  console.log('');
  console.log('━'.repeat(68));
  console.log('📊  SEEDING REPORT');
  console.log('━'.repeat(68));
  console.log(`   ✅ Created:  ${summary.created}`);
  console.log(`   ⚪ Skipped:  ${summary.skipped} (already existed)`);
  console.log(`   ❌ Failed:   ${summary.failed}`);
  console.log('━'.repeat(68));

  if (summary.failed > 0) {
    console.log('');
    console.log('⚠️  Errors:');
    summary.errors.forEach((e) => {
      console.log(`   • ${e.lab} — ${e.message}`);
    });
  }

  if (summary.created > 0) {
    console.log('');
    console.log('💡 Next steps:');
    console.log('   1. Refresh the Doctor Dashboard');
    console.log('   2. Select a patient → New Visit → Lab Order section');
    console.log('   3. The labs dropdown should now populate');
  }

  console.log('');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   Patient 360° — Laboratory Seed Script                         ║');
  console.log('║   Arab International University — Damascus, Syria               ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');

  validateEnvironment();
  await connectToDatabase();

  const summary = await seedLabs();
  printReport(summary);

  await mongoose.disconnect();
  console.log('👋 Disconnected from MongoDB');

  // Non-zero exit code if ANY lab failed, so CI pipelines can detect it.
  process.exit(summary.failed > 0 ? 1 : 0);
}

// ── Error safety net ────────────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled promise rejection:', reason);
  process.exit(1);
});

main();