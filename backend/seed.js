// ============================================================================
// PATIENT 360° — TEST DATA SEED SCRIPT
// ============================================================================
// Run from your BACKEND folder:   node seed.js
// This creates 6 test accounts — one for each role
// ============================================================================

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // or 'bcrypt' depending on your package

// ── Connection ────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/PATIENT360';

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to PATIENT360 database\n');

    const db = mongoose.connection.db;

    // Hash all passwords (same password for all test accounts)
    const PASSWORD = 'Test@1234';
    const hashedPassword = await bcrypt.hash(PASSWORD, 10);
    const now = new Date();

    console.log('🔐 Password for ALL test accounts:', PASSWORD);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // ══════════════════════════════════════════════════════════════
    // 1. ADMIN
    // ══════════════════════════════════════════════════════════════
    const adminPerson = await db.collection('persons').insertOne({
      nationalId: '11111111111',
      firstName: 'أحمد',
      fatherName: 'محمد',
      lastName: 'الأحمد',
      motherName: 'فاطمة محمد',
      dateOfBirth: new Date('1985-03-15'),
      gender: 'male',
      phoneNumber: '0911111111',
      email: 'admin@patient360.gov.sy',
      governorate: 'damascus',
      city: 'دمشق',
      address: 'شارع الثورة، دمشق',
      isActive: true,
      isDeleted: false,
      createdAt: now,
      updatedAt: now
    });

    const adminAccount = await db.collection('accounts').insertOne({
      email: 'admin@patient360.gov.sy',
      password: hashedPassword,
      roles: ['admin'],
      personId: adminPerson.insertedId,
      isActive: true,
      isVerified: true,
      emailVerified: true,
      language: 'ar',
      createdAt: now,
      updatedAt: now
    });

    await db.collection('admins').insertOne({
      personId: adminPerson.insertedId,
      adminLevel: 'super_admin',
      permissions: ['manage_doctors', 'manage_patients', 'view_logs', 'manage_pharmacies', 'manage_labs'],
      department: 'إدارة النظام',
      createdAt: now,
      updatedAt: now
    });

    console.log('✅ ADMIN created');
    console.log('   📧 Email:    admin@patient360.gov.sy');
    console.log('   🔑 Password: ' + PASSWORD);
    console.log('   🆔 National ID: 11111111111\n');

    // ══════════════════════════════════════════════════════════════
    // 2. DOCTOR (Cardiologist — has ECG feature)
    // ══════════════════════════════════════════════════════════════
    const doctorPerson = await db.collection('persons').insertOne({
      nationalId: '22222222222',
      firstName: 'خالد',
      fatherName: 'عبدالله',
      lastName: 'الحسن',
      motherName: 'مريم علي',
      dateOfBirth: new Date('1980-07-20'),
      gender: 'male',
      phoneNumber: '0922222222',
      email: 'khalid.alhassan@patient360.gov.sy',
      governorate: 'damascus',
      city: 'دمشق',
      address: 'حي المزة، دمشق',
      isActive: true,
      isDeleted: false,
      createdAt: now,
      updatedAt: now
    });

    const doctorAccount = await db.collection('accounts').insertOne({
      email: 'khalid.alhassan@patient360.gov.sy',
      password: hashedPassword,
      roles: ['doctor'],
      personId: doctorPerson.insertedId,
      isActive: true,
      isVerified: true,
      emailVerified: true,
      language: 'ar',
      createdAt: now,
      updatedAt: now
    });

    await db.collection('doctors').insertOne({
      personId: doctorPerson.insertedId,
      medicalLicenseNumber: 'SY-MED-2024-001',
      specialization: 'cardiology',
      subSpecialization: 'Interventional Cardiology',
      yearsOfExperience: 15,
      medicalDegree: 'MD',
      hospitalAffiliation: 'مشفى الأسد الجامعي',
      position: 'consultant',
      employmentType: 'full-time',
      availableDays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'],
      consultationFee: 50000,
      followUpFee: 25000,
      currency: 'SYP',
      isECGSpecialist: true,
      isAvailable: true,
      isAcceptingNewPatients: true,
      verificationStatus: 'verified',
      averageRating: 4.8,
      totalReviews: 45,
      createdAt: now,
      updatedAt: now
    });

    console.log('✅ DOCTOR (Cardiologist) created');
    console.log('   📧 Email:    khalid.alhassan@patient360.gov.sy');
    console.log('   🔑 Password: ' + PASSWORD);
    console.log('   🆔 National ID: 22222222222');
    console.log('   ❤️  ECG Analysis: ENABLED\n');

    // ══════════════════════════════════════════════════════════════
    // 3. PATIENT
    // ══════════════════════════════════════════════════════════════
    const patientPerson = await db.collection('persons').insertOne({
      nationalId: '33333333333',
      firstName: 'سارة',
      fatherName: 'يوسف',
      lastName: 'العلي',
      motherName: 'هدى أحمد',
      dateOfBirth: new Date('1995-11-10'),
      gender: 'female',
      phoneNumber: '0933333333',
      email: 'sara.alali@gmail.com',
      governorate: 'damascus',
      city: 'دمشق',
      address: 'حي الشعلان، دمشق',
      isActive: true,
      isDeleted: false,
      createdAt: now,
      updatedAt: now
    });

    const patientAccount = await db.collection('accounts').insertOne({
      email: 'sara.alali@gmail.com',
      password: hashedPassword,
      roles: ['patient'],
      personId: patientPerson.insertedId,
      isActive: true,
      isVerified: true,
      emailVerified: true,
      language: 'ar',
      createdAt: now,
      updatedAt: now
    });

    await db.collection('patients').insertOne({
      personId: patientPerson.insertedId,
      bloodType: 'A+',
      rhFactor: 'positive',
      height: 165,
      weight: 60,
      bmi: 22.0,
      smokingStatus: 'non-smoker',
      exerciseFrequency: 'moderate',
      chronicDiseases: ['ارتفاع ضغط الدم'],
      allergies: ['Penicillin', 'الأسبرين'],
      familyHistory: ['أمراض القلب (الأب)', 'السكري (الأم)'],
      previousSurgeries: [
        {
          surgeryName: 'استئصال الزائدة الدودية',
          surgeryDate: new Date('2018-06-15'),
          hospital: 'مشفى المواساة',
          notes: 'عملية ناجحة بدون مضاعفات'
        }
      ],
      currentMedications: ['Amlodipine 5mg', 'Aspirin 81mg'],
      emergencyContact: {
        name: 'يوسف العلي',
        relationship: 'الأب',
        phoneNumber: '0944444444'
      },
      totalVisits: 0,
      createdAt: now,
      updatedAt: now
    });

    console.log('✅ PATIENT created');
    console.log('   📧 Email:    sara.alali@gmail.com');
    console.log('   🔑 Password: ' + PASSWORD);
    console.log('   🆔 National ID: 33333333333');
    console.log('   🩸 Blood Type: A+');
    console.log('   ⚠️  Allergies: Penicillin, الأسبرين\n');

    // ══════════════════════════════════════════════════════════════
    // 4. PHARMACIST + PHARMACY
    // ══════════════════════════════════════════════════════════════
    const pharmacy = await db.collection('pharmacies').insertOne({
      name: 'Al-Shifa Pharmacy',
      arabicName: 'صيدلية الشفاء',
      registrationNumber: 'PH-DMQ-001',
      pharmacyLicense: 'PHL-2024-001',
      phoneNumber: '0115556666',
      email: 'alshifa@pharmacy.sy',
      pharmacyType: 'community',
      governorate: 'damascus',
      city: 'دمشق',
      district: 'المزة',
      address: 'شارع المزة، بناء 15',
      location: {
        type: 'Point',
        coordinates: [36.2765, 33.5138]
      },
      operatingHours: [
        { day: 'Sunday', openTime: '08:00', closeTime: '22:00', is24Hours: false },
        { day: 'Monday', openTime: '08:00', closeTime: '22:00', is24Hours: false },
        { day: 'Tuesday', openTime: '08:00', closeTime: '22:00', is24Hours: false },
        { day: 'Wednesday', openTime: '08:00', closeTime: '22:00', is24Hours: false },
        { day: 'Thursday', openTime: '08:00', closeTime: '22:00', is24Hours: false },
        { day: 'Friday', openTime: '10:00', closeTime: '20:00', is24Hours: false },
        { day: 'Saturday', openTime: '08:00', closeTime: '22:00', is24Hours: false }
      ],
      isActive: true,
      isAcceptingOrders: true,
      averageRating: 4.5,
      totalReviews: 23,
      createdAt: now,
      updatedAt: now
    });

    const pharmacistPerson = await db.collection('persons').insertOne({
      nationalId: '44444444444',
      firstName: 'ليلى',
      fatherName: 'حسن',
      lastName: 'المصري',
      motherName: 'سلمى خالد',
      dateOfBirth: new Date('1990-02-25'),
      gender: 'female',
      phoneNumber: '0944444444',
      email: 'layla.pharmacist@patient360.gov.sy',
      governorate: 'damascus',
      city: 'دمشق',
      address: 'حي المزة، دمشق',
      isActive: true,
      isDeleted: false,
      createdAt: now,
      updatedAt: now
    });

    await db.collection('accounts').insertOne({
      email: 'layla.pharmacist@patient360.gov.sy',
      password: hashedPassword,
      roles: ['pharmacist'],
      personId: pharmacistPerson.insertedId,
      isActive: true,
      isVerified: true,
      emailVerified: true,
      language: 'ar',
      createdAt: now,
      updatedAt: now
    });

    await db.collection('pharmacists').insertOne({
      personId: pharmacistPerson.insertedId,
      pharmacyLicenseNumber: 'PHARM-LIC-001',
      pharmacyId: pharmacy.insertedId,
      degree: 'PharmD',
      specialization: 'Clinical Pharmacy',
      yearsOfExperience: 8,
      employmentType: 'full-time',
      isAvailable: true,
      totalPrescriptionsDispensed: 0,
      createdAt: now,
      updatedAt: now
    });

    console.log('✅ PHARMACIST + PHARMACY created');
    console.log('   📧 Email:    layla.pharmacist@patient360.gov.sy');
    console.log('   🔑 Password: ' + PASSWORD);
    console.log('   🆔 National ID: 44444444444');
    console.log('   🏪 Pharmacy: صيدلية الشفاء\n');

    // ══════════════════════════════════════════════════════════════
    // 5. LAB TECHNICIAN + LABORATORY
    // ══════════════════════════════════════════════════════════════
    const laboratory = await db.collection('laboratories').insertOne({
      name: 'Damascus Central Lab',
      arabicName: 'مختبر دمشق المركزي',
      registrationNumber: 'LAB-DMQ-001',
      labLicense: 'LABL-2024-001',
      labType: 'independent',
      phoneNumber: '0117778888',
      email: 'centrallab@lab.sy',
      governorate: 'damascus',
      city: 'دمشق',
      district: 'ركن الدين',
      address: 'شارع بغداد، بناء 22',
      location: {
        type: 'Point',
        coordinates: [36.3065, 33.5238]
      },
      testCatalog: [
        { testCode: 'CBC', testName: 'Complete Blood Count', arabicName: 'تعداد دم شامل', category: 'blood', price: 15000, turnaroundTime: '2 hours', isAvailable: true },
        { testCode: 'FBS', testName: 'Fasting Blood Sugar', arabicName: 'سكر صائم', category: 'blood', price: 8000, turnaroundTime: '1 hour', isAvailable: true },
        { testCode: 'HbA1c', testName: 'Glycated Hemoglobin', arabicName: 'الخضاب السكري', category: 'blood', price: 25000, turnaroundTime: '4 hours', isAvailable: true },
        { testCode: 'LFT', testName: 'Liver Function Test', arabicName: 'وظائف الكبد', category: 'blood', price: 20000, turnaroundTime: '3 hours', isAvailable: true },
        { testCode: 'UA', testName: 'Urine Analysis', arabicName: 'تحليل بول', category: 'urine', price: 5000, turnaroundTime: '1 hour', isAvailable: true }
      ],
      operatingHours: [
        { day: 'Sunday', openTime: '07:00', closeTime: '20:00', is24Hours: false },
        { day: 'Monday', openTime: '07:00', closeTime: '20:00', is24Hours: false },
        { day: 'Tuesday', openTime: '07:00', closeTime: '20:00', is24Hours: false },
        { day: 'Wednesday', openTime: '07:00', closeTime: '20:00', is24Hours: false },
        { day: 'Thursday', openTime: '07:00', closeTime: '20:00', is24Hours: false },
        { day: 'Friday', openTime: '09:00', closeTime: '14:00', is24Hours: false },
        { day: 'Saturday', openTime: '07:00', closeTime: '20:00', is24Hours: false }
      ],
      isActive: true,
      isAcceptingTests: true,
      averageRating: 4.6,
      totalReviews: 34,
      createdAt: now,
      updatedAt: now
    });

    const labTechPerson = await db.collection('persons').insertOne({
      nationalId: '55555555555',
      firstName: 'عمر',
      fatherName: 'سامر',
      lastName: 'الخطيب',
      motherName: 'رنا محمود',
      dateOfBirth: new Date('1992-09-05'),
      gender: 'male',
      phoneNumber: '0955555555',
      email: 'omar.labtech@patient360.gov.sy',
      governorate: 'damascus',
      city: 'دمشق',
      address: 'حي ركن الدين، دمشق',
      isActive: true,
      isDeleted: false,
      createdAt: now,
      updatedAt: now
    });

    await db.collection('accounts').insertOne({
      email: 'omar.labtech@patient360.gov.sy',
      password: hashedPassword,
      roles: ['lab_technician'],
      personId: labTechPerson.insertedId,
      isActive: true,
      isVerified: true,
      emailVerified: true,
      language: 'ar',
      createdAt: now,
      updatedAt: now
    });

    await db.collection('lab_technicians').insertOne({
      personId: labTechPerson.insertedId,
      licenseNumber: 'LABTECH-001',
      laboratoryId: laboratory.insertedId,
      degree: 'BSc Medical Laboratory',
      specialization: 'Clinical Chemistry',
      position: 'senior_technician',
      yearsOfExperience: 10,
      isAvailable: true,
      totalTestsPerformed: 0,
      createdAt: now,
      updatedAt: now
    });

    console.log('✅ LAB TECHNICIAN + LABORATORY created');
    console.log('   📧 Email:    omar.labtech@patient360.gov.sy');
    console.log('   🔑 Password: ' + PASSWORD);
    console.log('   🆔 National ID: 55555555555');
    console.log('   🔬 Lab: مختبر دمشق المركزي\n');

    // ══════════════════════════════════════════════════════════════
    // 6. SECOND DOCTOR (General Practice — no ECG)
    // ══════════════════════════════════════════════════════════════
    const doctor2Person = await db.collection('persons').insertOne({
      nationalId: '66666666666',
      firstName: 'رنا',
      fatherName: 'فادي',
      lastName: 'السعيد',
      motherName: 'نور الحسين',
      dateOfBirth: new Date('1988-04-12'),
      gender: 'female',
      phoneNumber: '0966666666',
      email: 'rana.alsaeed@patient360.gov.sy',
      governorate: 'damascus',
      city: 'دمشق',
      address: 'حي المالكي، دمشق',
      isActive: true,
      isDeleted: false,
      createdAt: now,
      updatedAt: now
    });

    await db.collection('accounts').insertOne({
      email: 'rana.alsaeed@patient360.gov.sy',
      password: hashedPassword,
      roles: ['doctor'],
      personId: doctor2Person.insertedId,
      isActive: true,
      isVerified: true,
      emailVerified: true,
      language: 'ar',
      createdAt: now,
      updatedAt: now
    });

    await db.collection('doctors').insertOne({
      personId: doctor2Person.insertedId,
      medicalLicenseNumber: 'SY-MED-2024-002',
      specialization: 'general_practice',
      yearsOfExperience: 10,
      medicalDegree: 'MD',
      hospitalAffiliation: 'مشفى المواساة',
      position: 'specialist',
      employmentType: 'full-time',
      availableDays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'],
      consultationFee: 30000,
      followUpFee: 15000,
      currency: 'SYP',
      isECGSpecialist: false,
      isAvailable: true,
      isAcceptingNewPatients: true,
      verificationStatus: 'verified',
      averageRating: 4.5,
      totalReviews: 28,
      createdAt: now,
      updatedAt: now
    });

    console.log('✅ DOCTOR (General Practice) created');
    console.log('   📧 Email:    rana.alsaeed@patient360.gov.sy');
    console.log('   🔑 Password: ' + PASSWORD);
    console.log('   🆔 National ID: 66666666666\n');

    // ══════════════════════════════════════════════════════════════
    // SUMMARY
    // ══════════════════════════════════════════════════════════════
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  ✅ ALL TEST ACCOUNTS CREATED SUCCESSFULLY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('  🔑 Password for ALL accounts: ' + PASSWORD);
    console.log('');
    console.log('  👤 ADMIN:       admin@patient360.gov.sy');
    console.log('  👨‍⚕️ DOCTOR 1:    khalid.alhassan@patient360.gov.sy (Cardiology + ECG)');
    console.log('  👩‍⚕️ DOCTOR 2:    rana.alsaeed@patient360.gov.sy (General Practice)');
    console.log('  👩 PATIENT:     sara.alali@gmail.com');
    console.log('  💊 PHARMACIST:  layla.pharmacist@patient360.gov.sy');
    console.log('  🔬 LAB TECH:    omar.labtech@patient360.gov.sy');
    console.log('');
    console.log('  🏪 Pharmacy:    صيدلية الشفاء (Al-Shifa Pharmacy)');
    console.log('  🔬 Laboratory:  مختبر دمشق المركزي (Damascus Central Lab)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
    process.exit(0);
  }
}

seed();
