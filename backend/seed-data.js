// ============================================================================
// PATIENT 360° — FULL TEST DATA SEED
// ============================================================================
// Run from your BACKEND folder:   node seed-data.js
// Requires: seed.js already ran (accounts exist)
// Creates: visits, appointments, lab tests, prescriptions, availability slots
// ============================================================================

const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/PATIENT360';

async function seedData() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to PATIENT360\n');
    const db = mongoose.connection.db;

    // ══════════════════════════════════════════════════════════════
    // STEP 1: Look up existing records from seed.js
    // ══════════════════════════════════════════════════════════════
    const patient = await db.collection('persons').findOne({ nationalId: '33333333333' });
    const patientRecord = await db.collection('patients').findOne({ personId: patient._id });
    const doctor1 = await db.collection('persons').findOne({ nationalId: '22222222222' }); // cardiologist
    const doctor1Doc = await db.collection('doctors').findOne({ personId: doctor1._id });
    const doctor2 = await db.collection('persons').findOne({ nationalId: '66666666666' }); // general
    const doctor2Doc = await db.collection('doctors').findOne({ personId: doctor2._id });
    const pharmacist = await db.collection('persons').findOne({ nationalId: '44444444444' });
    const pharmacistDoc = await db.collection('pharmacists').findOne({ personId: pharmacist._id });
    const labTech = await db.collection('persons').findOne({ nationalId: '55555555555' });
    const labTechDoc = await db.collection('lab_technicians').findOne({ personId: labTech._id });
    const pharmacy = await db.collection('pharmacies').findOne({ registrationNumber: 'PH-DMQ-001' });
    const laboratory = await db.collection('laboratories').findOne({ registrationNumber: 'LAB-DMQ-001' });

    if (!patient || !doctor1Doc || !doctor2Doc) {
      console.error('❌ Run seed.js first to create accounts!');
      process.exit(1);
    }

    console.log('📋 Found existing records:');
    console.log(`   Patient:    ${patient.firstName} ${patient.lastName} (${patient._id})`);
    console.log(`   Doctor 1:   ${doctor1.firstName} ${doctor1.lastName} (${doctor1Doc._id})`);
    console.log(`   Doctor 2:   ${doctor2.firstName} ${doctor2.lastName} (${doctor2Doc._id})`);
    console.log(`   Pharmacist: ${pharmacist.firstName} ${pharmacist.lastName}`);
    console.log(`   Lab Tech:   ${labTech.firstName} ${labTech.lastName}\n`);

    const now = new Date();
    const daysAgo = (n) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
    const daysFromNow = (n) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

    // ══════════════════════════════════════════════════════════════
    // STEP 2: CREATE VISITS (4 past visits)
    // ══════════════════════════════════════════════════════════════
    console.log('📋 Creating visits...');

    const visit1 = await db.collection('visits').insertOne({
      visitType: 'regular',
      patientPersonId: patient._id,
      doctorId: doctor1Doc._id,
      visitDate: daysAgo(60),
      status: 'completed',
      chiefComplaint: 'ألم في الصدر عند بذل المجهود مع ضيق تنفس',
      diagnosis: 'ذبحة صدرية مستقرة - Stable Angina',
      vitalSigns: {
        bloodPressureSystolic: 145,
        bloodPressureDiastolic: 92,
        heartRate: 88,
        oxygenSaturation: 96,
        bloodGlucose: 110,
        temperature: 36.8,
        weight: 61,
        height: 165,
        respiratoryRate: 18
      },
      prescribedMedications: [
        { medicationName: 'Aspirin', dosage: '81mg', frequency: 'مرة يومياً', duration: 'مستمر', route: 'oral', instructions: 'بعد الفطور' },
        { medicationName: 'Atorvastatin', dosage: '20mg', frequency: 'مرة يومياً', duration: 'مستمر', route: 'oral', instructions: 'قبل النوم' },
        { medicationName: 'Nitroglycerin', dosage: '0.5mg', frequency: 'عند الحاجة', duration: 'عند اللزوم', route: 'sublingual', instructions: 'تحت اللسان عند الألم' }
      ],
      doctorNotes: 'المريضة تعاني من ذبحة صدرية مستقرة. ينصح بتخطيط قلب ومتابعة بعد شهر.',
      ecgAnalysis: {
        analyzedAt: daysAgo(60),
        topPrediction: 'ST/T change',
        recommendation: 'تغيرات في مقطع ST تستدعي متابعة - ينصح بإجراء اختبار الجهد',
        predictions: [
          { class: 'ST/T change', confidence: 72, arabicLabel: 'تغيرات ST/T', englishLabel: 'ST/T Change' },
          { class: 'Normal', confidence: 18, arabicLabel: 'طبيعي', englishLabel: 'Normal' },
          { class: 'MI', confidence: 7, arabicLabel: 'جلطة قلبية', englishLabel: 'Myocardial Infarction' },
          { class: 'Abnormal Heartbeat', confidence: 3, arabicLabel: 'نبض غير طبيعي', englishLabel: 'Abnormal Heartbeat' }
        ],
        modelVersion: 'v2.1'
      },
      followUpDate: daysAgo(30),
      followUpNotes: 'متابعة نتائج تخطيط القلب والتحاليل',
      createdAt: daysAgo(60),
      updatedAt: daysAgo(60)
    });

    const visit2 = await db.collection('visits').insertOne({
      visitType: 'follow_up',
      patientPersonId: patient._id,
      doctorId: doctor1Doc._id,
      visitDate: daysAgo(30),
      status: 'completed',
      chiefComplaint: 'متابعة - تحسن الألم بعد الأدوية',
      diagnosis: 'تحسن ملحوظ - متابعة العلاج الحالي',
      vitalSigns: {
        bloodPressureSystolic: 130,
        bloodPressureDiastolic: 85,
        heartRate: 76,
        oxygenSaturation: 98,
        bloodGlucose: 95,
        temperature: 36.6,
        weight: 60,
        height: 165,
        respiratoryRate: 16
      },
      prescribedMedications: [
        { medicationName: 'Aspirin', dosage: '81mg', frequency: 'مرة يومياً', duration: 'مستمر', route: 'oral', instructions: 'بعد الفطور' },
        { medicationName: 'Amlodipine', dosage: '5mg', frequency: 'مرة يومياً', duration: '3 أشهر', route: 'oral', instructions: 'صباحاً' }
      ],
      doctorNotes: 'تحسن ضغط الدم. نستمر بالعلاج الحالي ونضيف Amlodipine.',
      createdAt: daysAgo(30),
      updatedAt: daysAgo(30)
    });

    const visit3 = await db.collection('visits').insertOne({
      visitType: 'regular',
      patientPersonId: patient._id,
      doctorId: doctor2Doc._id,
      visitDate: daysAgo(15),
      status: 'completed',
      chiefComplaint: 'صداع متكرر مع إرهاق عام',
      diagnosis: 'صداع توتري - Tension Headache + نقص فيتامين D',
      vitalSigns: {
        bloodPressureSystolic: 125,
        bloodPressureDiastolic: 80,
        heartRate: 72,
        oxygenSaturation: 99,
        bloodGlucose: 88,
        temperature: 36.5,
        weight: 59,
        height: 165,
        respiratoryRate: 15
      },
      prescribedMedications: [
        { medicationName: 'Paracetamol', dosage: '500mg', frequency: 'عند الحاجة', duration: '10 أيام', route: 'oral', instructions: 'كل 6 ساعات عند الألم' },
        { medicationName: 'Vitamin D3', dosage: '50000IU', frequency: 'مرة أسبوعياً', duration: '8 أسابيع', route: 'oral', instructions: 'بعد الغداء' }
      ],
      doctorNotes: 'صداع توتري مع نقص فيتامين D. طلبت تحاليل دم شاملة.',
      followUpDate: daysFromNow(15),
      followUpNotes: 'مراجعة نتائج التحاليل',
      createdAt: daysAgo(15),
      updatedAt: daysAgo(15)
    });

    const visit4 = await db.collection('visits').insertOne({
      visitType: 'emergency',
      patientPersonId: patient._id,
      doctorId: doctor1Doc._id,
      visitDate: daysAgo(5),
      status: 'completed',
      chiefComplaint: 'خفقان مفاجئ مع دوخة',
      diagnosis: 'تسرع قلب فوق بطيني - SVT (Supraventricular Tachycardia)',
      vitalSigns: {
        bloodPressureSystolic: 150,
        bloodPressureDiastolic: 95,
        heartRate: 142,
        oxygenSaturation: 94,
        bloodGlucose: 130,
        temperature: 37.0,
        weight: 59,
        height: 165,
        respiratoryRate: 22
      },
      prescribedMedications: [
        { medicationName: 'Metoprolol', dosage: '25mg', frequency: 'مرتين يومياً', duration: '30 يوم', route: 'oral', instructions: 'صباحاً ومساءً مع الأكل' },
        { medicationName: 'Potassium Chloride', dosage: '600mg', frequency: 'مرة يومياً', duration: '14 يوم', route: 'oral', instructions: 'بعد الغداء' }
      ],
      doctorNotes: 'حالة SVT - تم إعطاء Adenosine في الطوارئ. المريضة مستقرة. يجب متابعة هولتر.',
      visitPhotoUrl: '/uploads/ecg_visit4_sample.jpg',
      createdAt: daysAgo(5),
      updatedAt: daysAgo(5)
    });

    console.log('✅ 4 visits created\n');

    // ══════════════════════════════════════════════════════════════
    // STEP 3: CREATE PRESCRIPTIONS (3 prescriptions)
    // ══════════════════════════════════════════════════════════════
    console.log('📜 Creating prescriptions...');

    await db.collection('prescriptions').insertOne({
      prescriptionNumber: 'RX-20250201-00001',
      patientPersonId: patient._id,
      doctorId: doctor1Doc._id,
      visitId: visit1.insertedId,
      prescriptionDate: daysAgo(60),
      expiryDate: daysAgo(30),
      medications: [
        { medicationName: 'Aspirin', dosage: '81mg', frequency: 'مرة يومياً', duration: 'مستمر', route: 'oral', instructions: 'بعد الفطور', quantity: 30, isDispensed: true, dispensedAt: daysAgo(59) },
        { medicationName: 'Atorvastatin', dosage: '20mg', frequency: 'مرة يومياً', duration: 'مستمر', route: 'oral', instructions: 'قبل النوم', quantity: 30, isDispensed: true, dispensedAt: daysAgo(59) },
        { medicationName: 'Nitroglycerin', dosage: '0.5mg', frequency: 'عند الحاجة', duration: 'عند اللزوم', route: 'sublingual', instructions: 'تحت اللسان', quantity: 25, isDispensed: true, dispensedAt: daysAgo(59) }
      ],
      status: 'dispensed',
      verificationCode: '482917',
      qrCode: 'RX-20250201-00001|482917',
      printCount: 1,
      prescriptionNotes: 'علاج ذبحة صدرية مستقرة',
      createdAt: daysAgo(60),
      updatedAt: daysAgo(59)
    });

    await db.collection('prescriptions').insertOne({
      prescriptionNumber: 'RX-20250315-00002',
      patientPersonId: patient._id,
      doctorId: doctor2Doc._id,
      visitId: visit3.insertedId,
      prescriptionDate: daysAgo(15),
      expiryDate: daysFromNow(15),
      medications: [
        { medicationName: 'Paracetamol', dosage: '500mg', frequency: 'عند الحاجة', duration: '10 أيام', route: 'oral', instructions: 'كل 6 ساعات عند الألم', quantity: 20, isDispensed: true, dispensedAt: daysAgo(14) },
        { medicationName: 'Vitamin D3', dosage: '50000IU', frequency: 'مرة أسبوعياً', duration: '8 أسابيع', route: 'oral', instructions: 'بعد الغداء', quantity: 8, isDispensed: true, dispensedAt: daysAgo(14) }
      ],
      status: 'dispensed',
      verificationCode: '739251',
      qrCode: 'RX-20250315-00002|739251',
      printCount: 1,
      createdAt: daysAgo(15),
      updatedAt: daysAgo(14)
    });

    await db.collection('prescriptions').insertOne({
      prescriptionNumber: 'RX-20250325-00003',
      patientPersonId: patient._id,
      doctorId: doctor1Doc._id,
      visitId: visit4.insertedId,
      prescriptionDate: daysAgo(5),
      expiryDate: daysFromNow(25),
      medications: [
        { medicationName: 'Metoprolol', dosage: '25mg', frequency: 'مرتين يومياً', duration: '30 يوم', route: 'oral', instructions: 'صباحاً ومساءً مع الأكل', quantity: 60, isDispensed: false },
        { medicationName: 'Potassium Chloride', dosage: '600mg', frequency: 'مرة يومياً', duration: '14 يوم', route: 'oral', instructions: 'بعد الغداء', quantity: 14, isDispensed: false }
      ],
      status: 'active',
      verificationCode: '156384',
      qrCode: 'RX-20250325-00003|156384',
      printCount: 0,
      prescriptionNotes: 'علاج SVT - حالة طارئة',
      createdAt: daysAgo(5),
      updatedAt: daysAgo(5)
    });

    console.log('✅ 3 prescriptions created (1 active, 2 dispensed)\n');

    // ══════════════════════════════════════════════════════════════
    // STEP 4: CREATE LAB TESTS (4 tests, different statuses)
    // ══════════════════════════════════════════════════════════════
    console.log('🔬 Creating lab tests...');

    // Completed test with results
    await db.collection('lab_tests').insertOne({
      testNumber: 'LAB-20250302-00001',
      patientPersonId: patient._id,
      orderedBy: doctor1Doc._id,
      visitId: visit1.insertedId,
      laboratoryId: laboratory._id,
      orderDate: daysAgo(58),
      testsOrdered: [
        { testCode: 'CBC', testName: 'تعداد دم شامل' },
        { testCode: 'LIPID', testName: 'دهون الدم' },
        { testCode: 'CRP', testName: 'بروتين التفاعل C' }
      ],
      testCategory: 'blood',
      priority: 'urgent',
      sampleType: 'blood',
      sampleId: 'SMP-001-2025',
      sampleCollectedAt: daysAgo(57),
      sampleCollectedBy: labTechDoc._id,
      status: 'completed',
      testResults: [
        { testCode: 'WBC', testName: 'كريات بيض', value: '7.2', numericValue: 7.2, unit: '×10³/µL', referenceRange: '4.0-11.0', isAbnormal: false, isCritical: false },
        { testCode: 'RBC', testName: 'كريات حمر', value: '4.5', numericValue: 4.5, unit: '×10⁶/µL', referenceRange: '3.8-5.2', isAbnormal: false, isCritical: false },
        { testCode: 'HGB', testName: 'خضاب الدم', value: '12.8', numericValue: 12.8, unit: 'g/dL', referenceRange: '12.0-16.0', isAbnormal: false, isCritical: false },
        { testCode: 'PLT', testName: 'صفيحات', value: '245', numericValue: 245, unit: '×10³/µL', referenceRange: '150-400', isAbnormal: false, isCritical: false },
        { testCode: 'CHOL', testName: 'كولسترول كلي', value: '242', numericValue: 242, unit: 'mg/dL', referenceRange: '<200', isAbnormal: true, isCritical: false },
        { testCode: 'LDL', testName: 'كولسترول ضار', value: '165', numericValue: 165, unit: 'mg/dL', referenceRange: '<130', isAbnormal: true, isCritical: false },
        { testCode: 'HDL', testName: 'كولسترول نافع', value: '42', numericValue: 42, unit: 'mg/dL', referenceRange: '>50', isAbnormal: true, isCritical: false },
        { testCode: 'TG', testName: 'شحوم ثلاثية', value: '175', numericValue: 175, unit: 'mg/dL', referenceRange: '<150', isAbnormal: true, isCritical: false },
        { testCode: 'CRP', testName: 'CRP', value: '3.8', numericValue: 3.8, unit: 'mg/L', referenceRange: '<5', isAbnormal: false, isCritical: false }
      ],
      resultPdfUrl: '/uploads/lab-results/LAB-20250302-00001.pdf',
      resultPdfUploadedAt: daysAgo(56),
      resultPdfUploadedBy: labTechDoc._id,
      labNotes: 'ارتفاع ملحوظ في الدهون — ينصح بمراجعة الطبيب',
      completedAt: daysAgo(56),
      completedBy: labTechDoc._id,
      isCritical: false,
      isViewedByDoctor: true,
      isViewedByPatient: true,
      doctorViewedAt: daysAgo(55),
      patientViewedAt: daysAgo(54),
      totalCost: 45000,
      currency: 'SYP',
      createdAt: daysAgo(58),
      updatedAt: daysAgo(56)
    });

    // Completed test — recent, UNREAD by patient
    await db.collection('lab_tests').insertOne({
      testNumber: 'LAB-20250320-00002',
      patientPersonId: patient._id,
      orderedBy: doctor2Doc._id,
      visitId: visit3.insertedId,
      laboratoryId: laboratory._id,
      orderDate: daysAgo(14),
      testsOrdered: [
        { testCode: 'FBS', testName: 'سكر صائم' },
        { testCode: 'HbA1c', testName: 'خضاب سكري' },
        { testCode: 'VIT-D', testName: 'فيتامين D' },
        { testCode: 'TSH', testName: 'هرمون الغدة الدرقية' }
      ],
      testCategory: 'blood',
      priority: 'routine',
      sampleType: 'blood',
      sampleId: 'SMP-002-2025',
      sampleCollectedAt: daysAgo(13),
      sampleCollectedBy: labTechDoc._id,
      status: 'completed',
      testResults: [
        { testCode: 'FBS', testName: 'سكر صائم', value: '92', numericValue: 92, unit: 'mg/dL', referenceRange: '70-100', isAbnormal: false, isCritical: false },
        { testCode: 'HbA1c', testName: 'خضاب سكري', value: '5.4', numericValue: 5.4, unit: '%', referenceRange: '<5.7', isAbnormal: false, isCritical: false },
        { testCode: 'VIT-D', testName: 'فيتامين D', value: '12', numericValue: 12, unit: 'ng/mL', referenceRange: '30-100', isAbnormal: true, isCritical: false },
        { testCode: 'TSH', testName: 'TSH', value: '2.8', numericValue: 2.8, unit: 'mIU/L', referenceRange: '0.4-4.0', isAbnormal: false, isCritical: false }
      ],
      resultPdfUrl: '/uploads/lab-results/LAB-20250320-00002.pdf',
      resultPdfUploadedAt: daysAgo(11),
      resultPdfUploadedBy: labTechDoc._id,
      labNotes: 'نقص حاد في فيتامين D. السكر والدرقية طبيعي.',
      completedAt: daysAgo(11),
      completedBy: labTechDoc._id,
      isCritical: false,
      isViewedByDoctor: true,
      isViewedByPatient: false,
      doctorViewedAt: daysAgo(10),
      totalCost: 55000,
      currency: 'SYP',
      createdAt: daysAgo(14),
      updatedAt: daysAgo(11)
    });

    // In-progress test
    await db.collection('lab_tests').insertOne({
      testNumber: 'LAB-20250328-00003',
      patientPersonId: patient._id,
      orderedBy: doctor1Doc._id,
      visitId: visit4.insertedId,
      laboratoryId: laboratory._id,
      orderDate: daysAgo(3),
      testsOrdered: [
        { testCode: 'TROPI', testName: 'تروبونين القلب', notes: 'فحص عاجل بعد حالة SVT' },
        { testCode: 'BNP', testName: 'ببتيد الدماغ الأذيني' },
        { testCode: 'K+', testName: 'بوتاسيوم الدم' },
        { testCode: 'Mg', testName: 'مغنيسيوم الدم' }
      ],
      testCategory: 'blood',
      priority: 'stat',
      sampleType: 'blood',
      sampleId: 'SMP-003-2025',
      sampleCollectedAt: daysAgo(3),
      sampleCollectedBy: labTechDoc._id,
      status: 'in_progress',
      isCritical: false,
      isViewedByDoctor: false,
      isViewedByPatient: false,
      totalCost: 80000,
      currency: 'SYP',
      createdAt: daysAgo(3),
      updatedAt: daysAgo(3)
    });

    // Ordered test (not yet collected)
    await db.collection('lab_tests').insertOne({
      testNumber: 'LAB-20250330-00004',
      patientPersonId: patient._id,
      orderedBy: doctor1Doc._id,
      laboratoryId: laboratory._id,
      orderDate: daysAgo(1),
      scheduledDate: daysFromNow(2),
      testsOrdered: [
        { testCode: 'HOLTER', testName: 'هولتر 24 ساعة', notes: 'متابعة SVT — تسجيل مستمر' }
      ],
      testCategory: 'other',
      priority: 'urgent',
      status: 'ordered',
      isCritical: false,
      isViewedByDoctor: false,
      isViewedByPatient: false,
      totalCost: 120000,
      currency: 'SYP',
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1)
    });

    console.log('✅ 4 lab tests created (1 completed+read, 1 completed+unread, 1 in-progress, 1 ordered)\n');

    // ══════════════════════════════════════════════════════════════
    // STEP 5: CREATE APPOINTMENTS (past + upcoming)
    // ══════════════════════════════════════════════════════════════
    console.log('📅 Creating appointments...');

    await db.collection('appointments').insertMany([
      // Past — completed
      {
        appointmentType: 'doctor',
        patientPersonId: patient._id,
        doctorId: doctor1Doc._id,
        appointmentDate: daysAgo(60),
        appointmentTime: '10:00',
        estimatedDuration: 30,
        reasonForVisit: 'ألم في الصدر عند بذل المجهود',
        status: 'completed',
        bookingMethod: 'online',
        priority: 'urgent',
        visitId: visit1.insertedId,
        createdAt: daysAgo(65),
        updatedAt: daysAgo(60)
      },
      // Past — completed
      {
        appointmentType: 'follow_up',
        patientPersonId: patient._id,
        doctorId: doctor1Doc._id,
        appointmentDate: daysAgo(30),
        appointmentTime: '11:00',
        estimatedDuration: 20,
        reasonForVisit: 'متابعة - ذبحة صدرية',
        status: 'completed',
        bookingMethod: 'phone',
        priority: 'routine',
        visitId: visit2.insertedId,
        createdAt: daysAgo(35),
        updatedAt: daysAgo(30)
      },
      // Past — cancelled
      {
        appointmentType: 'doctor',
        patientPersonId: patient._id,
        doctorId: doctor2Doc._id,
        appointmentDate: daysAgo(20),
        appointmentTime: '14:00',
        reasonForVisit: 'فحص عام',
        status: 'cancelled',
        bookingMethod: 'online',
        priority: 'routine',
        cancellationReason: 'patient_request',
        cancelledAt: daysAgo(22),
        createdAt: daysAgo(25),
        updatedAt: daysAgo(22)
      },
      // Past — completed (general doctor)
      {
        appointmentType: 'doctor',
        patientPersonId: patient._id,
        doctorId: doctor2Doc._id,
        appointmentDate: daysAgo(15),
        appointmentTime: '09:30',
        estimatedDuration: 25,
        reasonForVisit: 'صداع متكرر مع إرهاق',
        status: 'completed',
        bookingMethod: 'online',
        priority: 'routine',
        visitId: visit3.insertedId,
        createdAt: daysAgo(18),
        updatedAt: daysAgo(15)
      },
      // Past — emergency (completed)
      {
        appointmentType: 'emergency',
        patientPersonId: patient._id,
        doctorId: doctor1Doc._id,
        appointmentDate: daysAgo(5),
        appointmentTime: '18:00',
        reasonForVisit: 'خفقان مفاجئ مع دوخة — طوارئ',
        status: 'completed',
        bookingMethod: 'walk_in',
        priority: 'emergency',
        visitId: visit4.insertedId,
        createdAt: daysAgo(5),
        updatedAt: daysAgo(5)
      },
      // UPCOMING — confirmed
      {
        appointmentType: 'follow_up',
        patientPersonId: patient._id,
        doctorId: doctor1Doc._id,
        appointmentDate: daysFromNow(3),
        appointmentTime: '10:30',
        estimatedDuration: 20,
        reasonForVisit: 'متابعة حالة SVT ونتائج التحاليل',
        status: 'confirmed',
        bookingMethod: 'online',
        priority: 'urgent',
        createdAt: daysAgo(4),
        updatedAt: daysAgo(4)
      },
      // UPCOMING — scheduled
      {
        appointmentType: 'lab_test',
        patientPersonId: patient._id,
        laboratoryId: laboratory._id,
        appointmentDate: daysFromNow(5),
        appointmentTime: '08:00',
        reasonForVisit: 'هولتر 24 ساعة — متابعة تسرع القلب',
        status: 'scheduled',
        bookingMethod: 'online',
        priority: 'urgent',
        createdAt: daysAgo(1),
        updatedAt: daysAgo(1)
      },
      // UPCOMING — scheduled (regular)
      {
        appointmentType: 'doctor',
        patientPersonId: patient._id,
        doctorId: doctor2Doc._id,
        appointmentDate: daysFromNow(15),
        appointmentTime: '11:00',
        estimatedDuration: 25,
        reasonForVisit: 'مراجعة نتائج فيتامين D والمتابعة',
        status: 'scheduled',
        bookingMethod: 'online',
        priority: 'routine',
        createdAt: daysAgo(2),
        updatedAt: daysAgo(2)
      }
    ]);

    console.log('✅ 8 appointments created (5 past + 3 upcoming)\n');

    // ══════════════════════════════════════════════════════════════
    // STEP 6: CREATE AVAILABILITY SLOTS (for booking wizard)
    // ══════════════════════════════════════════════════════════════
    console.log('📅 Creating availability slots for booking wizard...');

    const slotsToInsert = [];
    // Doctor 1 (cardiologist) — slots for next 14 days
    for (let d = 1; d <= 14; d++) {
      const date = daysFromNow(d);
      const dayOfWeek = date.getDay(); // 0=Sun, 5=Fri, 6=Sat
      if (dayOfWeek === 5) continue; // Skip Friday

      slotsToInsert.push(
        { doctorId: doctor1Doc._id, date, startTime: '09:00', endTime: '09:30', slotDuration: 30, isAvailable: true, maxBookings: 1, currentBookings: 0, status: 'available', createdAt: now, updatedAt: now },
        { doctorId: doctor1Doc._id, date, startTime: '09:30', endTime: '10:00', slotDuration: 30, isAvailable: true, maxBookings: 1, currentBookings: 0, status: 'available', createdAt: now, updatedAt: now },
        { doctorId: doctor1Doc._id, date, startTime: '10:00', endTime: '10:30', slotDuration: 30, isAvailable: true, maxBookings: 1, currentBookings: d <= 3 ? 1 : 0, status: d <= 3 ? 'booked' : 'available', createdAt: now, updatedAt: now },
        { doctorId: doctor1Doc._id, date, startTime: '10:30', endTime: '11:00', slotDuration: 30, isAvailable: true, maxBookings: 1, currentBookings: 0, status: 'available', createdAt: now, updatedAt: now },
        { doctorId: doctor1Doc._id, date, startTime: '11:00', endTime: '11:30', slotDuration: 30, isAvailable: true, maxBookings: 1, currentBookings: 0, status: 'available', createdAt: now, updatedAt: now }
      );
    }

    // Doctor 2 (general practice) — slots for next 14 days
    for (let d = 1; d <= 14; d++) {
      const date = daysFromNow(d);
      const dayOfWeek = date.getDay();
      if (dayOfWeek === 5 || dayOfWeek === 6) continue; // Skip Fri + Sat

      slotsToInsert.push(
        { doctorId: doctor2Doc._id, date, startTime: '08:30', endTime: '09:00', slotDuration: 30, isAvailable: true, maxBookings: 1, currentBookings: 0, status: 'available', createdAt: now, updatedAt: now },
        { doctorId: doctor2Doc._id, date, startTime: '09:00', endTime: '09:30', slotDuration: 30, isAvailable: true, maxBookings: 1, currentBookings: d <= 2 ? 1 : 0, status: d <= 2 ? 'booked' : 'available', createdAt: now, updatedAt: now },
        { doctorId: doctor2Doc._id, date, startTime: '09:30', endTime: '10:00', slotDuration: 30, isAvailable: true, maxBookings: 1, currentBookings: 0, status: 'available', createdAt: now, updatedAt: now },
        { doctorId: doctor2Doc._id, date, startTime: '10:00', endTime: '10:30', slotDuration: 30, isAvailable: true, maxBookings: 1, currentBookings: 0, status: 'available', createdAt: now, updatedAt: now },
        { doctorId: doctor2Doc._id, date, startTime: '14:00', endTime: '14:30', slotDuration: 30, isAvailable: true, maxBookings: 1, currentBookings: 0, status: 'available', createdAt: now, updatedAt: now },
        { doctorId: doctor2Doc._id, date, startTime: '14:30', endTime: '15:00', slotDuration: 30, isAvailable: true, maxBookings: 1, currentBookings: 0, status: 'available', createdAt: now, updatedAt: now }
      );
    }

    await db.collection('availability_slots').insertMany(slotsToInsert);
    console.log(`✅ ${slotsToInsert.length} availability slots created for 2 doctors (next 14 days)\n`);

    // ══════════════════════════════════════════════════════════════
    // STEP 7: CREATE PHARMACY DISPENSING RECORDS
    // ══════════════════════════════════════════════════════════════
    console.log('💊 Creating pharmacy dispensing records...');

    await db.collection('pharmacy_dispensing').insertMany([
      {
        dispensingNumber: 'DISP-20250202-00001',
        pharmacyId: pharmacy._id,
        pharmacistId: pharmacistDoc._id,
        patientPersonId: patient._id,
        dispensingType: 'prescription_based',
        prescriptionNumber: 'RX-20250201-00001',
        medicationsDispensed: [
          { medicationName: 'Aspirin', quantityDispensed: 30, unitPrice: 500, isGenericSubstitute: false },
          { medicationName: 'Atorvastatin', quantityDispensed: 30, unitPrice: 3000, isGenericSubstitute: false },
          { medicationName: 'Nitroglycerin', quantityDispensed: 25, unitPrice: 5000, isGenericSubstitute: false }
        ],
        dispensingDate: daysAgo(59),
        totalCost: 230000,
        currency: 'SYP',
        paymentMethod: 'cash',
        createdAt: daysAgo(59),
        updatedAt: daysAgo(59)
      },
      {
        dispensingNumber: 'DISP-20250316-00002',
        pharmacyId: pharmacy._id,
        pharmacistId: pharmacistDoc._id,
        patientPersonId: patient._id,
        dispensingType: 'prescription_based',
        prescriptionNumber: 'RX-20250315-00002',
        medicationsDispensed: [
          { medicationName: 'Paracetamol', quantityDispensed: 20, unitPrice: 200, isGenericSubstitute: false },
          { medicationName: 'Vitamin D3 50000IU', quantityDispensed: 8, unitPrice: 8000, isGenericSubstitute: true, pharmacistNotes: 'بديل جنيس — نفس المادة الفعالة' }
        ],
        dispensingDate: daysAgo(14),
        totalCost: 68000,
        currency: 'SYP',
        paymentMethod: 'cash',
        createdAt: daysAgo(14),
        updatedAt: daysAgo(14)
      },
      {
        dispensingNumber: 'DISP-20250320-00003',
        pharmacyId: pharmacy._id,
        pharmacistId: pharmacistDoc._id,
        patientPersonId: patient._id,
        dispensingType: 'otc',
        medicationsDispensed: [
          { medicationName: 'Panadol Extra', quantityDispensed: 1, unitPrice: 3500, isGenericSubstitute: false },
          { medicationName: 'فيتامين سي 1000mg', quantityDispensed: 1, unitPrice: 12000, isGenericSubstitute: false }
        ],
        dispensingDate: daysAgo(10),
        totalCost: 15500,
        currency: 'SYP',
        paymentMethod: 'cash',
        otcReason: 'صداع خفيف وتعزيز المناعة',
        otcNotes: 'المريضة تعاني من إرهاق عام',
        createdAt: daysAgo(10),
        updatedAt: daysAgo(10)
      }
    ]);

    console.log('✅ 3 dispensing records created (2 prescription-based + 1 OTC)\n');

    // ══════════════════════════════════════════════════════════════
    // SUMMARY
    // ══════════════════════════════════════════════════════════════
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  ✅ ALL TEST DATA CREATED SUCCESSFULLY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('  📋 4 Visits (with vital signs, medications, ECG)');
    console.log('  📜 3 Prescriptions (1 active + 2 dispensed)');
    console.log('  🔬 4 Lab Tests (completed+read, completed+unread, in-progress, ordered)');
    console.log('  📅 8 Appointments (5 past + 3 upcoming)');
    console.log(`  🕐 ${slotsToInsert.length} Availability Slots (next 14 days for 2 doctors)`);
    console.log('  💊 3 Dispensing Records (2 prescription + 1 OTC)');
    console.log('');
    console.log('  Patient: sara.alali@gmail.com / Test@1234');
    console.log('  National ID: 33333333333');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
    process.exit(0);
  }
}

seedData();
