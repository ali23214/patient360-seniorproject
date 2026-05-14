/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Admin Seeding Script — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Creates a complete admin user end-to-end:
 *    1. Person document (identity — adults table)
 *    2. Account document (login credentials, role='admin')
 *    3. Admin document (admin profile + permissions)
 *
 *  Why this is a script and not a route:
 *    Admins cannot self-signup via the public API for security reasons.
 *    The first admin must be seeded by someone with database access (you).
 *    Subsequent admins should be created through an admin-only endpoint.
 *
 *  Usage:
 *    node seeds/seedAdmin.js
 *
 *  Configuration:
 *    Edit the ADMIN_CONFIG object below before running.
 *    Or set environment variables to override:
 *      ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NATIONAL_ID,
 *      ADMIN_FIRST_NAME, ADMIN_LAST_NAME, ADMIN_LEVEL
 *
 *  Idempotent:
 *    If an admin already exists with the same email or nationalId, the script
 *    detects it and either skips or offers to update — never creates duplicates.
 *
 *  Safety:
 *    - Validates Syrian national ID format (11 digits)
 *    - Enforces strong password (min 8 chars, mixed case, number)
 *    - Uses bcrypt hashing (via Account model pre-validate hook)
 * ═══════════════════════════════════════════════════════════════════════════
 */

require('dotenv').config();

const mongoose = require('mongoose');

// Load all models via the barrel — registers them with mongoose
const { Person, Account, Admin } = require('../models');

// ============================================================================
// CONFIGURATION — edit this section or use environment variables
// ============================================================================

const ADMIN_CONFIG = {
  // Identity
  nationalId:   process.env.ADMIN_NATIONAL_ID || '11111111111',
  firstName:    process.env.ADMIN_FIRST_NAME  || 'مدير',
  fatherName:   process.env.ADMIN_FATHER_NAME || 'النظام',
  lastName:     process.env.ADMIN_LAST_NAME   || 'الرئيسي',
  motherName:   process.env.ADMIN_MOTHER_NAME || 'إدارة النظام',
  dateOfBirth:  process.env.ADMIN_DOB         || '1985-01-01',
  gender:       process.env.ADMIN_GENDER      || 'male',
  phoneNumber:  process.env.ADMIN_PHONE       || '0911111111',
  governorate:  process.env.ADMIN_GOVERNORATE || 'damascus',
  city:         process.env.ADMIN_CITY        || 'دمشق',
  address:      process.env.ADMIN_ADDRESS     || 'وزارة الصحة، دمشق',

  // Account credentials
  email:        process.env.ADMIN_EMAIL       || 'admin@patient360.gov.sy',
  password:     process.env.ADMIN_PASSWORD    || 'Admin@123456',

  // Admin-specific
  adminLevel:   process.env.ADMIN_LEVEL       || 'super_admin',
  department:   process.env.ADMIN_DEPARTMENT  || 'إدارة النظام',
  permissions:  [
    'manage_doctors',
    'manage_patients',
    'manage_pharmacies',
    'manage_laboratories',
    'manage_hospitals',
    'manage_medications',
    'view_audit_logs',
    'manage_admins',
    'view_statistics',
    'approve_doctor_requests',
    'deactivate_accounts',
    'manage_emergency_reports'
  ]
};

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/PATIENT360';

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

function validateConfig(config) {
  const errors = [];

  if (!/^\d{11}$/.test(config.nationalId)) {
    errors.push('nationalId must be exactly 11 digits');
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.email)) {
    errors.push('email format is invalid');
  }

  if (config.password.length < 8) {
    errors.push('password must be at least 8 characters');
  }
  if (!/[A-Z]/.test(config.password)) {
    errors.push('password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(config.password)) {
    errors.push('password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(config.password)) {
    errors.push('password must contain at least one digit');
  }

  if (!['male', 'female'].includes(config.gender)) {
    errors.push('gender must be "male" or "female"');
  }

  const validGovernorates = [
    'damascus', 'aleppo', 'homs', 'hama', 'latakia', 'tartus',
    'idlib', 'deir_ez_zor', 'raqqa', 'hasakah', 'daraa',
    'as_suwayda', 'quneitra', 'rif_dimashq'
  ];
  if (!validGovernorates.includes(config.governorate)) {
    errors.push(`governorate must be one of: ${validGovernorates.join(', ')}`);
  }

  if (!['super_admin', 'admin', 'moderator'].includes(config.adminLevel)) {
    errors.push('adminLevel must be one of: super_admin, admin, moderator');
  }

  return errors;
}

// ============================================================================
// MAIN SEED LOGIC
// ============================================================================

async function seedAdmin() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                ║');
  console.log('║     Patient 360° — Admin Seeding Script                       ║');
  console.log('║                                                                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  // ── 1. VALIDATE CONFIG ──────────────────────────────────────────────────
  console.log('📋 Validating admin configuration...');
  const configErrors = validateConfig(ADMIN_CONFIG);
  if (configErrors.length > 0) {
    console.error('❌ Configuration errors:');
    configErrors.forEach((err) => console.error(`   • ${err}`));
    process.exit(1);
  }
  console.log('✅ Configuration valid');
  console.log('');

  // ── 2. CONNECT TO MONGODB ───────────────────────────────────────────────
  console.log('🔌 Connecting to MongoDB...');
  console.log(`   URI: ${MONGO_URI}`);
  try {
    await mongoose.connect(MONGO_URI);
    console.log(`✅ Connected to ${mongoose.connection.name}`);
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }
  console.log('');

  // ── 3. CHECK FOR EXISTING ADMIN ─────────────────────────────────────────
  console.log('🔍 Checking for existing admin records...');

  const [existingPerson, existingAccount] = await Promise.all([
    Person.findOne({ nationalId: ADMIN_CONFIG.nationalId }),
    Account.findOne({ email: ADMIN_CONFIG.email.toLowerCase() })
  ]);

  if (existingAccount) {
    console.log('⚠️  An account with this email already exists:');
    console.log(`   Email: ${existingAccount.email}`);
    console.log(`   Roles: ${existingAccount.roles.join(', ')}`);
    console.log(`   Account ID: ${existingAccount._id}`);
    console.log('');

    if (existingAccount.roles.includes('admin')) {
      console.log('✅ This account already has the admin role. Nothing to do.');
    } else {
      console.log('⚠️  Account exists but lacks the admin role.');
      console.log('   To grant admin access, manually edit the account roles in MongoDB.');
    }

    await mongoose.connection.close();
    process.exit(0);
  }

  if (existingPerson) {
    console.log('⚠️  A person with this national ID already exists but no account is linked:');
    console.log(`   Person ID: ${existingPerson._id}`);
    console.log(`   Name: ${existingPerson.firstName} ${existingPerson.lastName}`);
    console.log('   Linking new admin account to this existing person...');
    console.log('');
  } else {
    console.log('✅ No conflicting records found. Proceeding with creation.');
    console.log('');
  }

  // ── 4. CREATE OR REUSE PERSON ───────────────────────────────────────────
  let person;
  if (existingPerson) {
    person = existingPerson;
  } else {
    console.log('👤 Creating Person document...');
    try {
      person = await Person.create({
        nationalId: ADMIN_CONFIG.nationalId,
        firstName: ADMIN_CONFIG.firstName,
        fatherName: ADMIN_CONFIG.fatherName,
        lastName: ADMIN_CONFIG.lastName,
        motherName: ADMIN_CONFIG.motherName,
        dateOfBirth: new Date(ADMIN_CONFIG.dateOfBirth),
        gender: ADMIN_CONFIG.gender,
        phoneNumber: ADMIN_CONFIG.phoneNumber,
        governorate: ADMIN_CONFIG.governorate,
        city: ADMIN_CONFIG.city,
        address: ADMIN_CONFIG.address,
        isActive: true
      });
      console.log(`✅ Person created: ${person._id}`);
    } catch (err) {
      console.error('❌ Failed to create Person document:');
      console.error(`   ${err.message}`);
      if (err.errors) {
        Object.entries(err.errors).forEach(([field, e]) => {
          console.error(`   • ${field}: ${e.message}`);
        });
      }
      await mongoose.connection.close();
      process.exit(1);
    }
  }
  console.log('');

  // ── 5. CREATE ACCOUNT ───────────────────────────────────────────────────
  console.log('🔐 Creating Account document...');
  let account;
  try {
    // Password is plaintext here — Account model's pre-validate hook hashes it
    account = await Account.create({
      email: ADMIN_CONFIG.email.toLowerCase(),
      password: ADMIN_CONFIG.password,
      roles: ['admin'],
      personId: person._id,
      isActive: true,
      isVerified: true,
      emailVerified: true
    });
    console.log(`✅ Account created: ${account._id}`);
    console.log(`   Email: ${account.email}`);
    console.log(`   Roles: ${account.roles.join(', ')}`);
  } catch (err) {
    console.error('❌ Failed to create Account document:');
    console.error(`   ${err.message}`);
    if (err.errors) {
      Object.entries(err.errors).forEach(([field, e]) => {
        console.error(`   • ${field}: ${e.message}`);
      });
    }

    // Cleanup: delete the Person we just created (if it was new)
    if (!existingPerson) {
      console.log('🧹 Rolling back: deleting orphan Person document...');
      await Person.findByIdAndDelete(person._id);
    }

    await mongoose.connection.close();
    process.exit(1);
  }
  console.log('');

  // ── 6. CREATE ADMIN PROFILE ─────────────────────────────────────────────
  console.log('👨‍💼 Creating Admin profile document...');
  let admin;
  try {
    admin = await Admin.create({
      personId: person._id,
      adminLevel: ADMIN_CONFIG.adminLevel,
      permissions: ADMIN_CONFIG.permissions,
      department: ADMIN_CONFIG.department
    });
    console.log(`✅ Admin profile created: ${admin._id}`);
    console.log(`   Level: ${admin.adminLevel}`);
    console.log(`   Permissions: ${admin.permissions.length} granted`);
  } catch (err) {
    console.error('❌ Failed to create Admin profile:');
    console.error(`   ${err.message}`);

    // Cleanup: delete Account and (if new) Person
    console.log('🧹 Rolling back: deleting Account and orphan Person...');
    await Account.findByIdAndDelete(account._id);
    if (!existingPerson) {
      await Person.findByIdAndDelete(person._id);
    }

    await mongoose.connection.close();
    process.exit(1);
  }
  console.log('');

  // ── 7. SUCCESS REPORT ───────────────────────────────────────────────────
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                ║');
  console.log('║                  ✅ ADMIN SEEDED SUCCESSFULLY ✅              ║');
  console.log('║                                                                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('📋 Login credentials:');
  console.log(`   Email:    ${ADMIN_CONFIG.email}`);
  console.log(`   Password: ${ADMIN_CONFIG.password}`);
  console.log('');
  console.log('🆔 Document IDs (for reference):');
  console.log(`   Person:  ${person._id}`);
  console.log(`   Account: ${account._id}`);
  console.log(`   Admin:   ${admin._id}`);
  console.log('');
  console.log('⚠️  SECURITY: Change this password after your first login!');
  console.log('   Use POST /api/auth/forgot-password → /api/auth/reset-password');
  console.log('');

  // ── 8. CLEAN SHUTDOWN ───────────────────────────────────────────────────
  await mongoose.connection.close();
  console.log('👋 MongoDB connection closed');
  process.exit(0);
}

// ============================================================================
// ENTRY POINT
// ============================================================================

seedAdmin().catch((err) => {
  console.error('');
  console.error('❌ UNEXPECTED ERROR:', err);
  console.error('');
  process.exit(1);
});