// ============================================
// PATIENT360 - DATABASE SEEDING SCRIPT
// Seeds Syrian data: Patients, Doctors, Admins, Visits
// ============================================

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Import models
const Person = require('./models/Person');
const Account = require('./models/Account');
const Patient = require('./models/Patient');
const Doctor = require('./models/Doctor');
const Admin = require('./models/Admin');
const Visit = require('./models/Visit');

// ============================================
// DATABASE CONNECTION
// ============================================
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
    process.exit(1);
  }
};

// ============================================
// CLEAR DATABASE
// ============================================
const clearDatabase = async () => {
  console.log('\n🗑️  CLEARING DATABASE...\n');
  
  await Visit.deleteMany({});
  console.log('✅ Visits cleared');
  
  await Patient.deleteMany({});
  console.log('✅ Patients cleared');
  
  await Doctor.deleteMany({});
  console.log('✅ Doctors cleared');
  
  await Admin.deleteMany({});
  console.log('✅ Admins cleared');
  
  await Account.deleteMany({});
  console.log('✅ Accounts cleared');
  
  await Person.deleteMany({});
  console.log('✅ Persons cleared');
  
  console.log('\n✅ Database cleared successfully!\n');
};

// ============================================
// SEED ADMINS
// ============================================
const seedAdmins = async () => {
  console.log('👑 SEEDING ADMINS...\n');
  
  const admins = [
    {
      person: {
        nationalId: '12345678901',
        firstName: 'أحمد',
        lastName: 'الخطيب',
        dateOfBirth: new Date('1985-03-15'),
        gender: 'male',
        phoneNumber: '0944123456',
        address: 'دمشق - المزة',
        governorate: 'damascus',
        city: 'دمشق',
        isMinor: false
      },
      account: {
        email: 'admin1@patient360.sy',
        password: 'Admin@123',
        roles: ['admin']
      }
    },
    {
      person: {
        nationalId: '12345678902',
        firstName: 'فاطمة',
        lastName: 'السعيد',
        dateOfBirth: new Date('1990-07-22'),
        gender: 'female',
        phoneNumber: '0955234567',
        address: 'حلب - العزيزية',
        governorate: 'aleppo',
        city: 'حلب',
        isMinor: false
      },
      account: {
        email: 'admin2@patient360.sy',
        password: 'Admin@456',
        roles: ['admin']
      }
    }
  ];

  const createdAdmins = [];

  for (let i = 0; i < admins.length; i++) {
    const person = await Person.create(admins[i].person);
    const account = await Account.create({
      ...admins[i].account,
      personId: person._id,
      isActive: true
    });
    const admin = await Admin.create({ personId: person._id });
    
    createdAdmins.push({ person, account, admin });
    console.log(`✅ Admin ${i + 1}: ${person.firstName} ${person.lastName}`);
  }

  console.log(`\n✅ Created ${createdAdmins.length} admins\n`);
  return createdAdmins;
};

// ============================================
// SEED DOCTORS
// ============================================
const seedDoctors = async () => {
  console.log('👨‍⚕️ SEEDING DOCTORS...\n');
  
  const doctors = [
    {
      person: {
        nationalId: '23456789012',
        firstName: 'محمد',
        lastName: 'العمر',
        dateOfBirth: new Date('1980-05-10'),
        gender: 'male',
        phoneNumber: '0933345678',
        address: 'دمشق - المالكي',
        governorate: 'damascus',
        city: 'دمشق',
        isMinor: false
      },
      account: {
        email: 'dr.omar@patient360.sy',
        password: 'Doctor@123',
        roles: ['doctor']
      },
      doctor: {
        medicalLicenseNumber: 'DMD12345678',
        specialization: 'Cardiologist',
        subSpecialization: 'Interventional Cardiology',
        yearsOfExperience: 15,
        hospitalAffiliation: 'مشفى الشامي - دمشق',
        availableDays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'],
        consultationFee: 50000,
        availableTimes: { start: '09:00', end: '17:00' }
      }
    },
    {
      person: {
        nationalId: '23456789013',
        firstName: 'ليلى',
        lastName: 'حسن',
        dateOfBirth: new Date('1985-08-20'),
        gender: 'female',
        phoneNumber: '0944456789',
        address: 'حلب - الفرقان',
        governorate: 'aleppo',
        city: 'حلب',
        isMinor: false
      },
      account: {
        email: 'dr.hassan@patient360.sy',
        password: 'Doctor@456',
        roles: ['doctor']
      },
      doctor: {
        medicalLicenseNumber: 'ALP23456789',
        specialization: 'Pediatrician',
        subSpecialization: 'Neonatology',
        yearsOfExperience: 10,
        hospitalAffiliation: 'مشفى الكندي - حلب',
        availableDays: ['Sunday', 'Tuesday', 'Thursday'],
        consultationFee: 40000,
        availableTimes: { start: '10:00', end: '16:00' }
      }
    },
    {
      person: {
        nationalId: '23456789014',
        firstName: 'خالد',
        lastName: 'المحمود',
        dateOfBirth: new Date('1978-12-05'),
        gender: 'male',
        phoneNumber: '0955567890',
        address: 'حمص - الخالدية',
        governorate: 'homs',
        city: 'حمص',
        isMinor: false
      },
      account: {
        email: 'dr.mahmoud@patient360.sy',
        password: 'Doctor@789',
        roles: ['doctor']
      },
      doctor: {
        medicalLicenseNumber: 'HMS34567890',
        specialization: 'Orthopedic Surgeon',
        subSpecialization: 'Sports Medicine',
        yearsOfExperience: 18,
        hospitalAffiliation: 'مشفى الباسل - حمص',
        availableDays: ['Monday', 'Wednesday', 'Friday'],
        consultationFee: 60000,
        availableTimes: { start: '08:00', end: '14:00' }
      }
    },
    {
      person: {
        nationalId: '23456789015',
        firstName: 'نور',
        lastName: 'الدين',
        dateOfBirth: new Date('1982-04-18'),
        gender: 'female',
        phoneNumber: '0966678901',
        address: 'اللاذقية - الزراعة',
        governorate: 'latakia',
        city: 'اللاذقية',
        isMinor: false
      },
      account: {
        email: 'dr.nour@patient360.sy',
        password: 'Doctor@321',
        roles: ['doctor']
      },
      doctor: {
        medicalLicenseNumber: 'LAT45678901',
        specialization: 'Dermatologist',
        subSpecialization: 'Cosmetic Dermatology',
        yearsOfExperience: 12,
        hospitalAffiliation: 'مشفى تشرين الجامعي - اللاذقية',
        availableDays: ['Sunday', 'Monday', 'Tuesday', 'Thursday'],
        consultationFee: 45000,
        availableTimes: { start: '09:30', end: '15:30' }
      }
    }
  ];

  const createdDoctors = [];

  for (let i = 0; i < doctors.length; i++) {
    const person = await Person.create(doctors[i].person);
    const account = await Account.create({
      ...doctors[i].account,
      personId: person._id,
      isActive: true
    });
    const doctor = await Doctor.create({
      ...doctors[i].doctor,
      personId: person._id
    });
    
    createdDoctors.push({ person, account, doctor });
    console.log(`✅ Doctor ${i + 1}: د. ${person.firstName} ${person.lastName} - ${doctors[i].doctor.specialization}`);
  }

  console.log(`\n✅ Created ${createdDoctors.length} doctors\n`);
  return createdDoctors;
};

// ============================================
// SEED PATIENTS (INCLUDING FAMILIES)
// ============================================
const seedPatients = async () => {
  console.log('👥 SEEDING PATIENTS...\n');
  
  const patients = [
    // ==================== FAMILY 1: Dad + 2 Children ====================
    {
      person: {
        nationalId: '34567890123',
        firstName: 'عمر',
        lastName: 'الشامي',
        dateOfBirth: new Date('1988-06-15'),
        gender: 'male',
        phoneNumber: '0977789012',
        address: 'دمشق - كفرسوسة',
        governorate: 'damascus',
        city: 'دمشق',
        isMinor: false
      },
      account: {
        email: 'omar.shami@gmail.com',
        password: 'Patient@123',
        roles: ['patient']
      },
      patient: {
        bloodType: 'O+',
        height: 178,
        weight: 82,
        smokingStatus: 'non-smoker',
        allergies: ['البنسلين'],
        chronicDiseases: [],
        familyHistory: ['ضغط الدم - الأب'],
        emergencyContact: {
          name: 'سارة الشامي',
          relationship: 'الزوجة',
          phoneNumber: '0988890123'
        }
      }
    },
    {
      person: {
        parentNationalId: '34567890123',
        firstName: 'أحمد',
        lastName: 'الشامي',
        dateOfBirth: new Date('2015-03-20'),
        gender: 'male',
        phoneNumber: '0977789012',
        address: 'دمشق - كفرسوسة',
        governorate: 'damascus',
        city: 'دمشق',
        isMinor: true
      },
      account: {
        email: 'ahmad.shami.child@gmail.com',
        password: 'Child@123',
        roles: ['patient']
      },
      patient: {
        bloodType: 'O+',
        height: 145,
        weight: 38,
        smokingStatus: 'non-smoker',
        allergies: [],
        chronicDiseases: [],
        familyHistory: [],
        emergencyContact: {
          name: 'عمر الشامي',
          relationship: 'الأب',
          phoneNumber: '0977789012'
        }
      }
    },
    {
      person: {
        parentNationalId: '34567890123',
        firstName: 'ليلى',
        lastName: 'الشامي',
        dateOfBirth: new Date('2018-09-10'),
        gender: 'female',
        phoneNumber: '0977789012',
        address: 'دمشق - كفرسوسة',
        governorate: 'damascus',
        city: 'دمشق',
        isMinor: true
      },
      account: {
        email: 'layla.shami.child@gmail.com',
        password: 'Child@456',
        roles: ['patient']
      },
      patient: {
        bloodType: 'A+',
        height: 118,
        weight: 22,
        smokingStatus: 'non-smoker',
        allergies: ['الفول السوداني'],
        chronicDiseases: [],
        familyHistory: [],
        emergencyContact: {
          name: 'عمر الشامي',
          relationship: 'الأب',
          phoneNumber: '0977789012'
        }
      }
    },
    
    // ==================== FAMILY 2: Dad + 1 Child ====================
    {
      person: {
        nationalId: '34567890124',
        firstName: 'ياسر',
        lastName: 'حمود',
        dateOfBirth: new Date('1992-11-08'),
        gender: 'male',
        phoneNumber: '0933901234',
        address: 'حلب - السليمانية',
        governorate: 'aleppo',
        city: 'حلب',
        isMinor: false
      },
      account: {
        email: 'yasser.hammoud@gmail.com',
        password: 'Patient@789',
        roles: ['patient']
      },
      patient: {
        bloodType: 'B+',
        height: 175,
        weight: 78,
        smokingStatus: 'former smoker',
        allergies: [],
        chronicDiseases: ['الربو'],
        familyHistory: ['السكري - الأم'],
        emergencyContact: {
          name: 'منى حمود',
          relationship: 'الزوجة',
          phoneNumber: '0944012345'
        }
      }
    },
    {
      person: {
        parentNationalId: '34567890124',
        firstName: 'زين',
        lastName: 'حمود',
        dateOfBirth: new Date('2019-05-12'),
        gender: 'male',
        phoneNumber: '0933901234',
        address: 'حلب - السليمانية',
        governorate: 'aleppo',
        city: 'حلب',
        isMinor: true
      },
      account: {
        email: 'zain.hammoud.child@gmail.com',
        password: 'Child@789',
        roles: ['patient']
      },
      patient: {
        bloodType: 'B+',
        height: 105,
        weight: 18,
        smokingStatus: 'non-smoker',
        allergies: [],
        chronicDiseases: [],
        familyHistory: ['الربو - الأب'],
        emergencyContact: {
          name: 'ياسر حمود',
          relationship: 'الأب',
          phoneNumber: '0933901234'
        }
      }
    },
    
    // ==================== INDIVIDUAL PATIENTS ====================
    {
      person: {
        nationalId: '34567890125',
        firstName: 'سلمى',
        lastName: 'العلي',
        dateOfBirth: new Date('1995-02-28'),
        gender: 'female',
        phoneNumber: '0955123456',
        address: 'حمص - الإنشاءات',
        governorate: 'homs',
        city: 'حمص',
        isMinor: false
      },
      account: {
        email: 'salma.ali@gmail.com',
        password: 'Patient@321',
        roles: ['patient']
      },
      patient: {
        bloodType: 'AB+',
        height: 165,
        weight: 60,
        smokingStatus: 'non-smoker',
        allergies: ['الأسبرين'],
        chronicDiseases: [],
        familyHistory: [],
        emergencyContact: {
          name: 'فادي العلي',
          relationship: 'الأخ',
          phoneNumber: '0966234567'
        }
      }
    },
    {
      person: {
        nationalId: '34567890126',
        firstName: 'طارق',
        lastName: 'الحسن',
        dateOfBirth: new Date('1970-08-14'),
        gender: 'male',
        phoneNumber: '0977345678',
        address: 'اللاذقية - الرمل الجنوبي',
        governorate: 'latakia',
        city: 'اللاذقية',
        isMinor: false
      },
      account: {
        email: 'tarek.hassan@gmail.com',
        password: 'Patient@654',
        roles: ['patient']
      },
      patient: {
        bloodType: 'A-',
        height: 172,
        weight: 85,
        smokingStatus: 'current smoker',
        allergies: [],
        chronicDiseases: ['ضغط الدم', 'السكري من النوع 2'],
        familyHistory: ['أمراض القلب - الأب', 'السكري - الأم'],
        emergencyContact: {
          name: 'ريم الحسن',
          relationship: 'الزوجة',
          phoneNumber: '0988456789'
        }
      }
    },
    {
      person: {
        nationalId: '34567890127',
        firstName: 'نادين',
        lastName: 'القاسم',
        dateOfBirth: new Date('2000-12-05'),
        gender: 'female',
        phoneNumber: '0933567890',
        address: 'دمشق - الميدان',
        governorate: 'damascus',
        city: 'دمشق',
        isMinor: false
      },
      account: {
        email: 'nadine.qassem@gmail.com',
        password: 'Patient@987',
        roles: ['patient']
      },
      patient: {
        bloodType: 'O-',
        height: 160,
        weight: 55,
        smokingStatus: 'non-smoker',
        allergies: [],
        chronicDiseases: [],
        familyHistory: [],
        emergencyContact: {
          name: 'لينا القاسم',
          relationship: 'الأم',
          phoneNumber: '0944678901'
        }
      }
    },
    {
      person: {
        nationalId: '34567890128',
        firstName: 'بشار',
        lastName: 'الخوري',
        dateOfBirth: new Date('1983-04-22'),
        gender: 'male',
        phoneNumber: '0955789012',
        address: 'حماة - المدينة',
        governorate: 'hama',
        city: 'حماة',
        isMinor: false
      },
      account: {
        email: 'bashar.khoury@gmail.com',
        password: 'Patient@147',
        roles: ['patient']
      },
      patient: {
        bloodType: 'B-',
        height: 180,
        weight: 90,
        smokingStatus: 'non-smoker',
        allergies: ['المورفين'],
        chronicDiseases: [],
        familyHistory: [],
        emergencyContact: {
          name: 'جمال الخوري',
          relationship: 'الأخ',
          phoneNumber: '0966890123'
        }
      }
    },
    {
      person: {
        nationalId: '34567890129',
        firstName: 'رنا',
        lastName: 'السيد',
        dateOfBirth: new Date('1998-07-30'),
        gender: 'female',
        phoneNumber: '0977901234',
        address: 'طرطوس - الكورنيش',
        governorate: 'tartus',
        city: 'طرطوس',
        isMinor: false
      },
      account: {
        email: 'rana.sayed@gmail.com',
        password: 'Patient@258',
        roles: ['patient']
      },
      patient: {
        bloodType: 'A+',
        height: 168,
        weight: 62,
        smokingStatus: 'non-smoker',
        allergies: [],
        chronicDiseases: [],
        familyHistory: [],
        emergencyContact: {
          name: 'علي السيد',
          relationship: 'الأب',
          phoneNumber: '0988012345'
        }
      }
    }
  ];

  const createdPatients = [];

  for (let i = 0; i < patients.length; i++) {
    const person = await Person.create(patients[i].person);
    const account = await Account.create({
      ...patients[i].account,
      personId: person._id,
      isActive: true
    });
    const patient = await Patient.create({
      ...patients[i].patient,
      personId: person._id
    });
    
    createdPatients.push({ person, account, patient });
    
    const identifier = person.nationalId || person.childId;
    console.log(`✅ Patient ${i + 1}: ${person.firstName} ${person.lastName} - ${identifier}`);
  }

  console.log(`\n✅ Created ${createdPatients.length} patients (5 families + 5 individuals)\n`);
  return createdPatients;
};

// ============================================
// SEED VISITS
// ============================================
const seedVisits = async (patients, doctors) => {
  console.log('🏥 SEEDING VISITS...\n');
  
  // Get some patient and doctor IDs
  const patient1 = patients[0].person._id; // عمر الشامي
  const patient2 = patients[1].person._id; // أحمد الشامي (child)
  const patient3 = patients[3].person._id; // ياسر حمود
  const patient4 = patients[5].person._id; // سلمى العلي
  const patient5 = patients[6].person._id; // طارق الحسن
  
  const doctor1 = doctors[0].doctor._id; // Cardiologist
  const doctor2 = doctors[1].doctor._id; // Pediatrician
  const doctor3 = doctors[2].doctor._id; // Orthopedic Surgeon
  const doctor4 = doctors[3].doctor._id; // Dermatologist

  const visits = [
    {
      patientId: patient1,
      doctorId: doctor1,
      visitDate: new Date('2025-01-10'),
      visitType: 'regular',
      status: 'completed',
      chiefComplaint: 'ألم في الصدر وضيق في التنفس عند بذل المجهود',
      diagnosis: 'ذبحة صدرية مستقرة - يحتاج لمتابعة دورية',
      prescribedMedications: [
        {
          medicationName: 'أسبرين',
          dosage: '81 mg',
          frequency: 'مرة واحدة يومياً',
          duration: 'مستمر'
        },
        {
          medicationName: 'أتورفاستاتين',
          dosage: '20 mg',
          frequency: 'مرة واحدة مساءً',
          duration: '3 أشهر'
        }
      ],
      doctorNotes: 'ينصح بتخفيف الوزن والمشي اليومي لمدة 30 دقيقة. مراجعة بعد شهر لإجراء تخطيط قلب جهد.'
    },
    {
      patientId: patient2,
      doctorId: doctor2,
      visitDate: new Date('2025-01-12'),
      visitType: 'regular',
      status: 'completed',
      chiefComplaint: 'حرارة مرتفعة وسعال منذ 3 أيام',
      diagnosis: 'التهاب في الجهاز التنفسي العلوي - فيروسي',
      prescribedMedications: [
        {
          medicationName: 'باراسيتامول',
          dosage: '250 mg',
          frequency: 'كل 6 ساعات عند الحاجة',
          duration: '5 أيام'
        },
        {
          medicationName: 'شراب للسعال',
          dosage: '5 ml',
          frequency: '3 مرات يومياً',
          duration: '7 أيام'
        }
      ],
      doctorNotes: 'الحالة فيروسية ولا تحتاج مضاد حيوي. الإكثار من السوائل والراحة. مراجعة إذا استمرت الحرارة أكثر من 3 أيام.'
    },
    {
      patientId: patient3,
      doctorId: doctor3,
      visitDate: new Date('2025-01-08'),
      visitType: 'followup',
      status: 'completed',
      chiefComplaint: 'ألم في الركبة اليمنى بعد السقوط من الدرج',
      diagnosis: 'التواء في الرباط الجانبي - درجة أولى',
      prescribedMedications: [
        {
          medicationName: 'إيبوبروفين',
          dosage: '400 mg',
          frequency: '3 مرات يومياً بعد الطعام',
          duration: '10 أيام'
        },
        {
          medicationName: 'كريم ديكلوفيناك',
          dosage: 'دهان موضعي',
          frequency: '3 مرات يومياً',
          duration: '2 أسبوع'
        }
      ],
      doctorNotes: 'استخدام كمادات باردة في أول 48 ساعة ثم كمادات دافئة. تجنب الأحمال الثقيلة. جلسات علاج طبيعي بعد أسبوع.'
    },
    {
      patientId: patient4,
      doctorId: doctor4,
      visitDate: new Date('2025-01-15'),
      visitType: 'regular',
      status: 'completed',
      chiefComplaint: 'طفح جلدي وحكة في اليدين والوجه',
      diagnosis: 'أكزيما تماسية - حساسية من مواد التنظيف',
      prescribedMedications: [
        {
          medicationName: 'كريم كورتيزون',
          dosage: 'طبقة رقيقة',
          frequency: 'مرتين يومياً',
          duration: '7 أيام'
        },
        {
          medicationName: 'مرهم مرطب',
          dosage: 'حسب الحاجة',
          frequency: '3-4 مرات يومياً',
          duration: '2 أسبوع'
        },
        {
          medicationName: 'سيتريزين',
          dosage: '10 mg',
          frequency: 'مرة واحدة مساءً',
          duration: '5 أيام'
        }
      ],
      doctorNotes: 'تجنب استخدام مواد التنظيف مباشرة. استخدام قفازات عند التنظيف. ترطيب اليدين بشكل مستمر.'
    },
    {
      patientId: patient5,
      doctorId: doctor1,
      visitDate: new Date('2025-01-05'),
      visitType: 'emergency',
      status: 'completed',
      chiefComplaint: 'ألم حاد في الصدر مع تعرق وغثيان',
      diagnosis: 'احتشاء عضلة قلبية حاد - تم التعامل معه في الطوارئ',
      prescribedMedications: [
        {
          medicationName: 'كلوبيدوقرل',
          dosage: '75 mg',
          frequency: 'مرة واحدة يومياً',
          duration: 'سنة كاملة'
        },
        {
          medicationName: 'بيزوبرولول',
          dosage: '5 mg',
          frequency: 'مرة واحدة صباحاً',
          duration: 'مستمر'
        },
        {
          medicationName: 'رامبريل',
          dosage: '5 mg',
          frequency: 'مرة واحدة يومياً',
          duration: 'مستمر'
        }
      ],
      doctorNotes: 'تم إجراء قسطرة قلبية ووضع دعامة. يجب المتابعة الدورية كل أسبوعين لمدة 3 أشهر. الالتزام التام بالأدوية والنظام الغذائي. ممنوع التدخين نهائياً.'
    }
  ];

  const createdVisits = [];

  for (let i = 0; i < visits.length; i++) {
    const visit = await Visit.create(visits[i]);
    createdVisits.push(visit);
    
    const patient = await Person.findById(visit.patientId);
    const doctor = await Doctor.findById(visit.doctorId).populate('personId');
    
    console.log(`✅ Visit ${i + 1}: ${patient.firstName} ${patient.lastName} → د. ${doctor.personId.firstName} ${doctor.personId.lastName}`);
  }

  console.log(`\n✅ Created ${createdVisits.length} visits\n`);
  return createdVisits;
};

// ============================================
// MAIN SEEDING FUNCTION
// ============================================
const seedDatabase = async () => {
  console.log('\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🌱 PATIENT360 - DATABASE SEEDING');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n');

  try {
    // Connect to database
    await connectDB();
    
    // Clear existing data
    await clearDatabase();
    
    // Seed data in order
    const admins = await seedAdmins();
    const doctors = await seedDoctors();
    const patients = await seedPatients();
    const visits = await seedVisits(patients, doctors);
    
    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SEEDING SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Admins:    ${admins.length}`);
    console.log(`✅ Doctors:   ${doctors.length}`);
    console.log(`✅ Patients:  ${patients.length}`);
    console.log(`✅ Visits:    ${visits.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n');
    
    console.log('📝 TEST ACCOUNTS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👑 Admin 1:   admin1@patient360.sy / Admin@123');
    console.log('👑 Admin 2:   admin2@patient360.sy / Admin@456');
    console.log('👨‍⚕️ Doctor 1:  dr.omar@patient360.sy / Doctor@123');
    console.log('👨‍⚕️ Doctor 2:  dr.hassan@patient360.sy / Doctor@456');
    console.log('👥 Patient 1: omar.shami@gmail.com / Patient@123');
    console.log('👥 Patient 2: yasser.hammoud@gmail.com / Patient@789');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n');
    console.log('✅ Database seeding completed successfully!');
    console.log('\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ SEEDING FAILED');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('\n');
    process.exit(1);
  }
};

// Run the seeder
seedDatabase();
