// ============================================================================
// PATIENT 360° — FIX SEED DATA FIELD NAMES
// ============================================================================
// Run from backend folder:  node fix-fields.js
// Fixes: patientPersonId → patientId (to match Mongoose Visit model)
// ============================================================================

const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/PATIENT360';

async function fixFields() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to PATIENT360\n');
    const db = mongoose.connection.db;

    // ── Fix visits: rename patientPersonId → patientId ────────────────
    const visitResult = await db.collection('visits').updateMany(
      { patientPersonId: { $exists: true }, patientId: { $exists: false } },
      [{ $set: { patientId: '$patientPersonId' } }]
    );
    console.log(`✅ visits: ${visitResult.modifiedCount} docs fixed (patientPersonId → patientId)`);

    // ── Fix appointments: rename patientPersonId → patientId ──────────
    const aptResult = await db.collection('appointments').updateMany(
      { patientPersonId: { $exists: true }, patientId: { $exists: false } },
      [{ $set: { patientId: '$patientPersonId' } }]
    );
    console.log(`✅ appointments: ${aptResult.modifiedCount} docs fixed (patientPersonId → patientId)`);

    // ── Fix prescriptions: rename patientPersonId → patientId ─────────
    const rxResult = await db.collection('prescriptions').updateMany(
      { patientPersonId: { $exists: true }, patientId: { $exists: false } },
      [{ $set: { patientId: '$patientPersonId' } }]
    );
    console.log(`✅ prescriptions: ${rxResult.modifiedCount} docs fixed (patientPersonId → patientId)`);

    // ── Fix lab_tests: rename patientPersonId → patientId ─────────────
    const labResult = await db.collection('lab_tests').updateMany(
      { patientPersonId: { $exists: true }, patientId: { $exists: false } },
      [{ $set: { patientId: '$patientPersonId' } }]
    );
    console.log(`✅ lab_tests: ${labResult.modifiedCount} docs fixed (patientPersonId → patientId)`);

    // ── Fix pharmacy_dispensing: rename patientPersonId → patientId ────
    const dispResult = await db.collection('pharmacy_dispensing').updateMany(
      { patientPersonId: { $exists: true }, patientId: { $exists: false } },
      [{ $set: { patientId: '$patientPersonId' } }]
    );
    console.log(`✅ pharmacy_dispensing: ${dispResult.modifiedCount} docs fixed (patientPersonId → patientId)`);

    // ── Verify: count visits with patientId for our test patient ───────
    const patient = await db.collection('persons').findOne({ nationalId: '33333333333' });
    if (patient) {
      const visitCount = await db.collection('visits').countDocuments({ patientId: patient._id });
      const aptCount = await db.collection('appointments').countDocuments({ patientId: patient._id });
      const rxCount = await db.collection('prescriptions').countDocuments({ patientId: patient._id });
      const labCount = await db.collection('lab_tests').countDocuments({ patientId: patient._id });

      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('  VERIFICATION (sara.alali — 33333333333)');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`  Visits:        ${visitCount} (expected: 4)`);
      console.log(`  Appointments:  ${aptCount} (expected: 8)`);
      console.log(`  Prescriptions: ${rxCount} (expected: 3)`);
      console.log(`  Lab Tests:     ${labCount} (expected: 4)`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected');
    process.exit(0);
  }
}

fixFields();
