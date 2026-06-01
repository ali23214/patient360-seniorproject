// ============================================================================
// PATIENT360 — Seed Script: Hospitals, Pharmacies, Laboratories
// ============================================================================
//
// HOW TO RUN:
//   mongosh PATIENT360 < seed-facilities.js
//
// Or from inside mongosh:
//   use PATIENT360
//   load('seed-facilities.js')
//
// This script is IDEMPOTENT — it checks for existing records by
// registrationNumber before inserting, so it's safe to run multiple times.
// ============================================================================

// use PATIENT360;

print("\n=================================================================");
print("  PATIENT360 — Seeding Hospitals, Pharmacies, Laboratories       ");
print("=================================================================\n");

const now = new Date();

// ============================================================================
// 1. HOSPITALS (5 hospitals across Syria)
// ============================================================================

print("Seeding hospitals...\n");

const hospitals = [
  {
    name: "Al-Mouwasat University Hospital",
    arabicName: "مستشفى المواساة الجامعي",
    registrationNumber: "HOSP-SY-001",
    hospitalLicense: "HL-DMQ-2024-001",
    hospitalType: "university",
    specializations: ["cardiology", "surgery", "internal_medicine", "pediatrics", "orthopedics", "neurology", "oncology"],
    phoneNumber: "0111234567",
    emergencyPhoneNumber: "0111234568",
    email: "info@mouwasat.edu.sy",
    website: "https://mouwasat.edu.sy",
    address: "شارع المتنبي، المزة",
    governorate: "damascus",
    city: "دمشق",
    district: "المزة",
    numberOfBeds: NumberInt(450),
    numberOfOperatingRooms: NumberInt(18),
    hasEmergency: true,
    hasICU: true,
    hasLaboratory: true,
    hasPharmacy: true,
    hasRadiology: true,
    operatingHours: [
      { day: "Sunday",    openTime: "00:00", closeTime: "23:59", is24Hours: true },
      { day: "Monday",    openTime: "00:00", closeTime: "23:59", is24Hours: true },
      { day: "Tuesday",   openTime: "00:00", closeTime: "23:59", is24Hours: true },
      { day: "Wednesday", openTime: "00:00", closeTime: "23:59", is24Hours: true },
      { day: "Thursday",  openTime: "00:00", closeTime: "23:59", is24Hours: true },
      { day: "Friday",    openTime: "00:00", closeTime: "23:59", is24Hours: true },
      { day: "Saturday",  openTime: "00:00", closeTime: "23:59", is24Hours: true }
    ],
    servicesOffered: ["طوارئ", "عناية مركزة", "جراحة قلب مفتوح", "أشعة مقطعية", "رنين مغناطيسي", "مختبر شامل", "صيدلية"],
    isActive: true,
    isAcceptingPatients: true,
    averageRating: 4.5,
    totalReviews: NumberInt(120),
    createdAt: now,
    updatedAt: now
  },
  {
    name: "Al-Assad University Hospital",
    arabicName: "مستشفى الأسد الجامعي",
    registrationNumber: "HOSP-SY-002",
    hospitalLicense: "HL-DMQ-2024-002",
    hospitalType: "university",
    specializations: ["surgery", "internal_medicine", "dermatology", "ophthalmology", "otolaryngology", "psychiatry"],
    phoneNumber: "0112345678",
    emergencyPhoneNumber: "0112345679",
    email: "info@assad-hospital.edu.sy",
    address: "طريق المطار، دمشق",
    governorate: "damascus",
    city: "دمشق",
    district: "طريق المطار",
    numberOfBeds: NumberInt(600),
    numberOfOperatingRooms: NumberInt(22),
    hasEmergency: true,
    hasICU: true,
    hasLaboratory: true,
    hasPharmacy: true,
    hasRadiology: true,
    operatingHours: [
      { day: "Sunday",    openTime: "00:00", closeTime: "23:59", is24Hours: true },
      { day: "Monday",    openTime: "00:00", closeTime: "23:59", is24Hours: true },
      { day: "Tuesday",   openTime: "00:00", closeTime: "23:59", is24Hours: true },
      { day: "Wednesday", openTime: "00:00", closeTime: "23:59", is24Hours: true },
      { day: "Thursday",  openTime: "00:00", closeTime: "23:59", is24Hours: true },
      { day: "Friday",    openTime: "00:00", closeTime: "23:59", is24Hours: true },
      { day: "Saturday",  openTime: "00:00", closeTime: "23:59", is24Hours: true }
    ],
    servicesOffered: ["طوارئ", "عناية مركزة", "جراحة عامة", "عيادات خارجية", "مختبر", "أشعة", "صيدلية"],
    isActive: true,
    isAcceptingPatients: true,
    averageRating: 4.2,
    totalReviews: NumberInt(95),
    createdAt: now,
    updatedAt: now
  },
  {
    name: "Aleppo University Hospital",
    arabicName: "مستشفى حلب الجامعي",
    registrationNumber: "HOSP-SY-003",
    hospitalLicense: "HL-ALP-2024-001",
    hospitalType: "university",
    specializations: ["general_practice", "surgery", "pediatrics", "gynecology", "cardiology"],
    phoneNumber: "0212345678",
    emergencyPhoneNumber: "0212345679",
    email: "info@aleppo-university-hospital.sy",
    address: "حي الجامعة، حلب",
    governorate: "aleppo",
    city: "حلب",
    district: "حي الجامعة",
    numberOfBeds: NumberInt(380),
    numberOfOperatingRooms: NumberInt(14),
    hasEmergency: true,
    hasICU: true,
    hasLaboratory: true,
    hasPharmacy: true,
    hasRadiology: true,
    operatingHours: [
      { day: "Sunday",    openTime: "00:00", closeTime: "23:59", is24Hours: true },
      { day: "Monday",    openTime: "00:00", closeTime: "23:59", is24Hours: true },
      { day: "Tuesday",   openTime: "00:00", closeTime: "23:59", is24Hours: true },
      { day: "Wednesday", openTime: "00:00", closeTime: "23:59", is24Hours: true },
      { day: "Thursday",  openTime: "00:00", closeTime: "23:59", is24Hours: true },
      { day: "Friday",    openTime: "00:00", closeTime: "23:59", is24Hours: true },
      { day: "Saturday",  openTime: "00:00", closeTime: "23:59", is24Hours: true }
    ],
    servicesOffered: ["طوارئ", "عناية مركزة", "ولادة", "جراحة", "مختبر", "صيدلية"],
    isActive: true,
    isAcceptingPatients: true,
    averageRating: 4.0,
    totalReviews: NumberInt(67),
    createdAt: now,
    updatedAt: now
  },
  {
    name: "Al-Shami Hospital",
    arabicName: "المستشفى الشامي",
    registrationNumber: "HOSP-SY-004",
    hospitalLicense: "HL-DMQ-2024-003",
    hospitalType: "private",
    specializations: ["cardiology", "endocrinology", "gastroenterology", "nephrology"],
    phoneNumber: "0113456789",
    email: "info@shami-hospital.sy",
    address: "شارع بغداد، باب توما",
    governorate: "damascus",
    city: "دمشق",
    district: "باب توما",
    numberOfBeds: NumberInt(120),
    numberOfOperatingRooms: NumberInt(6),
    hasEmergency: true,
    hasICU: true,
    hasLaboratory: true,
    hasPharmacy: true,
    hasRadiology: false,
    operatingHours: [
      { day: "Sunday",    openTime: "08:00", closeTime: "20:00", is24Hours: false },
      { day: "Monday",    openTime: "08:00", closeTime: "20:00", is24Hours: false },
      { day: "Tuesday",   openTime: "08:00", closeTime: "20:00", is24Hours: false },
      { day: "Wednesday", openTime: "08:00", closeTime: "20:00", is24Hours: false },
      { day: "Thursday",  openTime: "08:00", closeTime: "20:00", is24Hours: false },
      { day: "Saturday",  openTime: "09:00", closeTime: "14:00", is24Hours: false }
    ],
    servicesOffered: ["عيادات خارجية", "تنظير", "قسطرة قلبية", "غسيل كلى", "مختبر", "صيدلية"],
    isActive: true,
    isAcceptingPatients: true,
    averageRating: 4.3,
    totalReviews: NumberInt(45),
    createdAt: now,
    updatedAt: now
  },
  {
    name: "Latakia National Hospital",
    arabicName: "المستشفى الوطني باللاذقية",
    registrationNumber: "HOSP-SY-005",
    hospitalLicense: "HL-LTK-2024-001",
    hospitalType: "government",
    specializations: ["general_practice", "surgery", "pediatrics", "gynecology", "orthopedics"],
    phoneNumber: "0412345678",
    emergencyPhoneNumber: "0412345679",
    email: "info@latakia-national.sy",
    address: "شارع الجمهورية، اللاذقية",
    governorate: "latakia",
    city: "اللاذقية",
    district: "الجمهورية",
    numberOfBeds: NumberInt(250),
    numberOfOperatingRooms: NumberInt(10),
    hasEmergency: true,
    hasICU: true,
    hasLaboratory: true,
    hasPharmacy: true,
    hasRadiology: true,
    operatingHours: [
      { day: "Sunday",    openTime: "00:00", closeTime: "23:59", is24Hours: true },
      { day: "Monday",    openTime: "00:00", closeTime: "23:59", is24Hours: true },
      { day: "Tuesday",   openTime: "00:00", closeTime: "23:59", is24Hours: true },
      { day: "Wednesday", openTime: "00:00", closeTime: "23:59", is24Hours: true },
      { day: "Thursday",  openTime: "00:00", closeTime: "23:59", is24Hours: true },
      { day: "Friday",    openTime: "00:00", closeTime: "23:59", is24Hours: true },
      { day: "Saturday",  openTime: "00:00", closeTime: "23:59", is24Hours: true }
    ],
    servicesOffered: ["طوارئ", "عناية مركزة", "ولادة", "عظمية", "مختبر", "أشعة", "صيدلية"],
    isActive: true,
    isAcceptingPatients: true,
    averageRating: 3.8,
    totalReviews: NumberInt(52),
    createdAt: now,
    updatedAt: now
  }
];

hospitals.forEach((h) => {
  const exists = db.hospitals.findOne({ registrationNumber: h.registrationNumber });
  if (exists) {
    print("  ⏭ Hospital already exists: " + h.arabicName);
  } else {
    db.hospitals.insertOne(h);
    print("  ✅ Inserted hospital: " + h.arabicName);
  }
});


// ============================================================================
// 2. PHARMACIES (6 pharmacies across Syria — GeoJSON location REQUIRED)
// ============================================================================

print("\nSeeding pharmacies...\n");

const pharmacies = [
  {
    name: "Al-Shifa Pharmacy",
    arabicName: "صيدلية الشفاء",
    registrationNumber: "PH-SY-001",
    pharmacyLicense: "PHL-DMQ-2024-001",
    phoneNumber: "0931234567",
    email: "shifa@pharmacy.sy",
    pharmacyType: "community",
    governorate: "damascus",
    city: "دمشق",
    district: "المزة",
    address: "شارع المزة، بناء 15",
    location: { type: "Point", coordinates: [36.2540, 33.5050] },
    operatingHours: [
      { day: "Sunday",    openTime: "08:00", closeTime: "22:00", is24Hours: false },
      { day: "Monday",    openTime: "08:00", closeTime: "22:00", is24Hours: false },
      { day: "Tuesday",   openTime: "08:00", closeTime: "22:00", is24Hours: false },
      { day: "Wednesday", openTime: "08:00", closeTime: "22:00", is24Hours: false },
      { day: "Thursday",  openTime: "08:00", closeTime: "22:00", is24Hours: false },
      { day: "Friday",    openTime: "10:00", closeTime: "18:00", is24Hours: false },
      { day: "Saturday",  openTime: "09:00", closeTime: "20:00", is24Hours: false }
    ],
    isActive: true,
    isAcceptingOrders: true,
    averageRating: 4.6,
    totalReviews: NumberInt(38),
    createdAt: now,
    updatedAt: now
  },
  {
    name: "Damascus Central Pharmacy",
    arabicName: "صيدلية دمشق المركزية",
    registrationNumber: "PH-SY-002",
    pharmacyLicense: "PHL-DMQ-2024-002",
    phoneNumber: "0932345678",
    email: "central@pharmacy.sy",
    pharmacyType: "community",
    governorate: "damascus",
    city: "دمشق",
    district: "باب توما",
    address: "شارع بغداد، باب توما، بناء 7",
    location: { type: "Point", coordinates: [36.3190, 33.5130] },
    operatingHours: [
      { day: "Sunday",    openTime: "00:00", closeTime: "23:59", is24Hours: true },
      { day: "Monday",    openTime: "00:00", closeTime: "23:59", is24Hours: true },
      { day: "Tuesday",   openTime: "00:00", closeTime: "23:59", is24Hours: true },
      { day: "Wednesday", openTime: "00:00", closeTime: "23:59", is24Hours: true },
      { day: "Thursday",  openTime: "00:00", closeTime: "23:59", is24Hours: true },
      { day: "Friday",    openTime: "00:00", closeTime: "23:59", is24Hours: true },
      { day: "Saturday",  openTime: "00:00", closeTime: "23:59", is24Hours: true }
    ],
    isActive: true,
    isAcceptingOrders: true,
    averageRating: 4.3,
    totalReviews: NumberInt(55),
    createdAt: now,
    updatedAt: now
  },
  {
    name: "Al-Hayat Pharmacy",
    arabicName: "صيدلية الحياة",
    registrationNumber: "PH-SY-003",
    pharmacyLicense: "PHL-DMQ-2024-003",
    phoneNumber: "0933456789",
    email: "hayat@pharmacy.sy",
    pharmacyType: "community",
    governorate: "damascus",
    city: "دمشق",
    district: "المالكي",
    address: "شارع أبو رمانة، بناء 22",
    location: { type: "Point", coordinates: [36.2830, 33.5200] },
    operatingHours: [
      { day: "Sunday",    openTime: "08:30", closeTime: "21:00", is24Hours: false },
      { day: "Monday",    openTime: "08:30", closeTime: "21:00", is24Hours: false },
      { day: "Tuesday",   openTime: "08:30", closeTime: "21:00", is24Hours: false },
      { day: "Wednesday", openTime: "08:30", closeTime: "21:00", is24Hours: false },
      { day: "Thursday",  openTime: "08:30", closeTime: "21:00", is24Hours: false },
      { day: "Saturday",  openTime: "09:00", closeTime: "15:00", is24Hours: false }
    ],
    isActive: true,
    isAcceptingOrders: true,
    averageRating: 4.7,
    totalReviews: NumberInt(29),
    createdAt: now,
    updatedAt: now
  },
  {
    name: "Aleppo Al-Amal Pharmacy",
    arabicName: "صيدلية الأمل - حلب",
    registrationNumber: "PH-SY-004",
    pharmacyLicense: "PHL-ALP-2024-001",
    phoneNumber: "0934567890",
    email: "amal.aleppo@pharmacy.sy",
    pharmacyType: "community",
    governorate: "aleppo",
    city: "حلب",
    district: "العزيزية",
    address: "حي العزيزية، شارع النيل",
    location: { type: "Point", coordinates: [37.1600, 36.2000] },
    operatingHours: [
      { day: "Sunday",    openTime: "09:00", closeTime: "21:00", is24Hours: false },
      { day: "Monday",    openTime: "09:00", closeTime: "21:00", is24Hours: false },
      { day: "Tuesday",   openTime: "09:00", closeTime: "21:00", is24Hours: false },
      { day: "Wednesday", openTime: "09:00", closeTime: "21:00", is24Hours: false },
      { day: "Thursday",  openTime: "09:00", closeTime: "21:00", is24Hours: false },
      { day: "Saturday",  openTime: "10:00", closeTime: "16:00", is24Hours: false }
    ],
    isActive: true,
    isAcceptingOrders: true,
    averageRating: 4.1,
    totalReviews: NumberInt(22),
    createdAt: now,
    updatedAt: now
  },
  {
    name: "Homs Al-Nour Pharmacy",
    arabicName: "صيدلية النور - حمص",
    registrationNumber: "PH-SY-005",
    pharmacyLicense: "PHL-HMS-2024-001",
    phoneNumber: "0935678901",
    email: "nour.homs@pharmacy.sy",
    pharmacyType: "community",
    governorate: "homs",
    city: "حمص",
    district: "الإنشاءات",
    address: "شارع الحضارة، حمص",
    location: { type: "Point", coordinates: [36.7200, 34.7300] },
    operatingHours: [
      { day: "Sunday",    openTime: "08:00", closeTime: "20:00", is24Hours: false },
      { day: "Monday",    openTime: "08:00", closeTime: "20:00", is24Hours: false },
      { day: "Tuesday",   openTime: "08:00", closeTime: "20:00", is24Hours: false },
      { day: "Wednesday", openTime: "08:00", closeTime: "20:00", is24Hours: false },
      { day: "Thursday",  openTime: "08:00", closeTime: "20:00", is24Hours: false }
    ],
    isActive: true,
    isAcceptingOrders: true,
    averageRating: 4.0,
    totalReviews: NumberInt(18),
    createdAt: now,
    updatedAt: now
  },
  {
    name: "Latakia Coast Pharmacy",
    arabicName: "صيدلية الساحل - اللاذقية",
    registrationNumber: "PH-SY-006",
    pharmacyLicense: "PHL-LTK-2024-001",
    phoneNumber: "0936789012",
    email: "coast.latakia@pharmacy.sy",
    pharmacyType: "community",
    governorate: "latakia",
    city: "اللاذقية",
    district: "الأمريكان",
    address: "شارع 8 آذار، اللاذقية",
    location: { type: "Point", coordinates: [35.7800, 35.5300] },
    operatingHours: [
      { day: "Sunday",    openTime: "08:00", closeTime: "22:00", is24Hours: false },
      { day: "Monday",    openTime: "08:00", closeTime: "22:00", is24Hours: false },
      { day: "Tuesday",   openTime: "08:00", closeTime: "22:00", is24Hours: false },
      { day: "Wednesday", openTime: "08:00", closeTime: "22:00", is24Hours: false },
      { day: "Thursday",  openTime: "08:00", closeTime: "22:00", is24Hours: false },
      { day: "Friday",    openTime: "10:00", closeTime: "18:00", is24Hours: false },
      { day: "Saturday",  openTime: "09:00", closeTime: "20:00", is24Hours: false }
    ],
    isActive: true,
    isAcceptingOrders: true,
    averageRating: 4.4,
    totalReviews: NumberInt(31),
    createdAt: now,
    updatedAt: now
  }
];

pharmacies.forEach((p) => {
  const exists = db.pharmacies.findOne({ registrationNumber: p.registrationNumber });
  if (exists) {
    print("  ⏭ Pharmacy already exists: " + p.arabicName);
  } else {
    db.pharmacies.insertOne(p);
    print("  ✅ Inserted pharmacy: " + p.arabicName);
  }
});


// ============================================================================
// 3. LABORATORIES (5 laboratories across Syria — GeoJSON + testCatalog)
// ============================================================================

print("\nSeeding laboratories...\n");

const laboratories = [
  {
    name: "Damascus Central Laboratory",
    arabicName: "مختبر دمشق المركزي",
    registrationNumber: "LAB-SY-001",
    labLicense: "LL-DMQ-2024-001",
    labType: "independent",
    phoneNumber: "0941234567",
    email: "info@damascus-lab.sy",
    governorate: "damascus",
    city: "دمشق",
    district: "المزة",
    address: "شارع المزة، بناء 30",
    location: { type: "Point", coordinates: [36.2600, 33.5080] },
    testCatalog: [
      { testCode: "CBC",   testName: "Complete Blood Count",     arabicName: "تعداد دم شامل",       category: "blood",   price: 15000, turnaroundTime: "2 hours",  isAvailable: true },
      { testCode: "FBS",   testName: "Fasting Blood Sugar",      arabicName: "سكر صيامي",            category: "blood",   price: 8000,  turnaroundTime: "1 hour",   isAvailable: true },
      { testCode: "HbA1c", testName: "Hemoglobin A1c",           arabicName: "خضاب سكري",            category: "blood",   price: 25000, turnaroundTime: "4 hours",  isAvailable: true },
      { testCode: "LFT",   testName: "Liver Function Tests",     arabicName: "وظائف الكبد",          category: "blood",   price: 30000, turnaroundTime: "3 hours",  isAvailable: true },
      { testCode: "RFT",   testName: "Renal Function Tests",     arabicName: "وظائف الكلى",          category: "blood",   price: 25000, turnaroundTime: "3 hours",  isAvailable: true },
      { testCode: "TSH",   testName: "Thyroid Stimulating Hormone", arabicName: "هرمون الغدة الدرقية", category: "blood", price: 20000, turnaroundTime: "6 hours",  isAvailable: true },
      { testCode: "UA",    testName: "Urinalysis",                arabicName: "تحليل بول",            category: "urine",   price: 10000, turnaroundTime: "1 hour",   isAvailable: true },
      { testCode: "LIPID", testName: "Lipid Profile",             arabicName: "شحوم الدم",            category: "blood",   price: 20000, turnaroundTime: "3 hours",  isAvailable: true },
      { testCode: "CRP",   testName: "C-Reactive Protein",       arabicName: "بروتين الالتهاب",      category: "blood",   price: 15000, turnaroundTime: "2 hours",  isAvailable: true }
    ],
    operatingHours: [
      { day: "Sunday",    openTime: "07:00", closeTime: "19:00", is24Hours: false },
      { day: "Monday",    openTime: "07:00", closeTime: "19:00", is24Hours: false },
      { day: "Tuesday",   openTime: "07:00", closeTime: "19:00", is24Hours: false },
      { day: "Wednesday", openTime: "07:00", closeTime: "19:00", is24Hours: false },
      { day: "Thursday",  openTime: "07:00", closeTime: "19:00", is24Hours: false },
      { day: "Saturday",  openTime: "08:00", closeTime: "14:00", is24Hours: false }
    ],
    isActive: true,
    isAcceptingTests: true,
    averageRating: 4.5,
    totalReviews: NumberInt(42),
    createdAt: now,
    updatedAt: now
  },
  {
    name: "Al-Hayat Medical Laboratory",
    arabicName: "مختبر الحياة الطبي",
    registrationNumber: "LAB-SY-002",
    labLicense: "LL-DMQ-2024-002",
    labType: "independent",
    phoneNumber: "0942345678",
    email: "hayat-lab@medical.sy",
    governorate: "damascus",
    city: "دمشق",
    district: "المالكي",
    address: "شارع أبو رمانة، بناء 8",
    location: { type: "Point", coordinates: [36.2850, 33.5180] },
    testCatalog: [
      { testCode: "CBC",   testName: "Complete Blood Count",  arabicName: "تعداد دم شامل",  category: "blood",         price: 12000, turnaroundTime: "1.5 hours", isAvailable: true },
      { testCode: "FBS",   testName: "Fasting Blood Sugar",   arabicName: "سكر صيامي",       category: "blood",         price: 7000,  turnaroundTime: "45 min",    isAvailable: true },
      { testCode: "CULT",  testName: "Culture & Sensitivity",  arabicName: "زرع وتحسس",      category: "microbiology",  price: 35000, turnaroundTime: "48 hours",  isAvailable: true },
      { testCode: "STOOL", testName: "Stool Analysis",         arabicName: "تحليل براز",      category: "stool",         price: 10000, turnaroundTime: "2 hours",   isAvailable: true },
      { testCode: "UA",    testName: "Urinalysis",             arabicName: "تحليل بول",       category: "urine",         price: 8000,  turnaroundTime: "1 hour",    isAvailable: true },
      { testCode: "HIV",   testName: "HIV Antibody Test",      arabicName: "فحص الإيدز",      category: "blood",         price: 25000, turnaroundTime: "24 hours",  isAvailable: true }
    ],
    operatingHours: [
      { day: "Sunday",    openTime: "07:30", closeTime: "18:00", is24Hours: false },
      { day: "Monday",    openTime: "07:30", closeTime: "18:00", is24Hours: false },
      { day: "Tuesday",   openTime: "07:30", closeTime: "18:00", is24Hours: false },
      { day: "Wednesday", openTime: "07:30", closeTime: "18:00", is24Hours: false },
      { day: "Thursday",  openTime: "07:30", closeTime: "18:00", is24Hours: false },
      { day: "Saturday",  openTime: "08:00", closeTime: "13:00", is24Hours: false }
    ],
    isActive: true,
    isAcceptingTests: true,
    averageRating: 4.3,
    totalReviews: NumberInt(28),
    createdAt: now,
    updatedAt: now
  },
  {
    name: "Aleppo Modern Laboratory",
    arabicName: "مختبر حلب الحديث",
    registrationNumber: "LAB-SY-003",
    labLicense: "LL-ALP-2024-001",
    labType: "independent",
    phoneNumber: "0943456789",
    email: "modern-lab@aleppo.sy",
    governorate: "aleppo",
    city: "حلب",
    district: "الحمدانية",
    address: "حي الحمدانية، شارع النصر",
    location: { type: "Point", coordinates: [37.1500, 36.1900] },
    testCatalog: [
      { testCode: "CBC",   testName: "Complete Blood Count",  arabicName: "تعداد دم شامل",  category: "blood",  price: 10000, turnaroundTime: "2 hours",  isAvailable: true },
      { testCode: "FBS",   testName: "Fasting Blood Sugar",   arabicName: "سكر صيامي",       category: "blood",  price: 6000,  turnaroundTime: "1 hour",   isAvailable: true },
      { testCode: "LFT",   testName: "Liver Function Tests",  arabicName: "وظائف الكبد",     category: "blood",  price: 25000, turnaroundTime: "4 hours",  isAvailable: true },
      { testCode: "RFT",   testName: "Renal Function Tests",  arabicName: "وظائف الكلى",     category: "blood",  price: 22000, turnaroundTime: "3 hours",  isAvailable: true },
      { testCode: "UA",    testName: "Urinalysis",            arabicName: "تحليل بول",       category: "urine",  price: 8000,  turnaroundTime: "1 hour",   isAvailable: true }
    ],
    operatingHours: [
      { day: "Sunday",    openTime: "08:00", closeTime: "17:00", is24Hours: false },
      { day: "Monday",    openTime: "08:00", closeTime: "17:00", is24Hours: false },
      { day: "Tuesday",   openTime: "08:00", closeTime: "17:00", is24Hours: false },
      { day: "Wednesday", openTime: "08:00", closeTime: "17:00", is24Hours: false },
      { day: "Thursday",  openTime: "08:00", closeTime: "17:00", is24Hours: false }
    ],
    isActive: true,
    isAcceptingTests: true,
    averageRating: 4.0,
    totalReviews: NumberInt(19),
    createdAt: now,
    updatedAt: now
  },
  {
    name: "Homs Clinical Laboratory",
    arabicName: "مختبر حمص السريري",
    registrationNumber: "LAB-SY-004",
    labLicense: "LL-HMS-2024-001",
    labType: "independent",
    phoneNumber: "0944567890",
    email: "clinical-lab@homs.sy",
    governorate: "homs",
    city: "حمص",
    district: "الوعر",
    address: "حي الوعر، شارع الثورة",
    location: { type: "Point", coordinates: [36.6800, 34.7400] },
    testCatalog: [
      { testCode: "CBC",   testName: "Complete Blood Count",  arabicName: "تعداد دم شامل",  category: "blood",  price: 10000, turnaroundTime: "2 hours",  isAvailable: true },
      { testCode: "FBS",   testName: "Fasting Blood Sugar",   arabicName: "سكر صيامي",       category: "blood",  price: 6000,  turnaroundTime: "1 hour",   isAvailable: true },
      { testCode: "UA",    testName: "Urinalysis",            arabicName: "تحليل بول",       category: "urine",  price: 7000,  turnaroundTime: "1 hour",   isAvailable: true },
      { testCode: "TSH",   testName: "Thyroid Stimulating Hormone", arabicName: "هرمون الغدة الدرقية", category: "blood", price: 18000, turnaroundTime: "6 hours", isAvailable: true }
    ],
    operatingHours: [
      { day: "Sunday",    openTime: "07:00", closeTime: "16:00", is24Hours: false },
      { day: "Monday",    openTime: "07:00", closeTime: "16:00", is24Hours: false },
      { day: "Tuesday",   openTime: "07:00", closeTime: "16:00", is24Hours: false },
      { day: "Wednesday", openTime: "07:00", closeTime: "16:00", is24Hours: false },
      { day: "Thursday",  openTime: "07:00", closeTime: "16:00", is24Hours: false }
    ],
    isActive: true,
    isAcceptingTests: true,
    averageRating: 3.9,
    totalReviews: NumberInt(15),
    createdAt: now,
    updatedAt: now
  },
  {
    name: "Latakia Diagnostic Laboratory",
    arabicName: "مختبر اللاذقية التشخيصي",
    registrationNumber: "LAB-SY-005",
    labLicense: "LL-LTK-2024-001",
    labType: "independent",
    phoneNumber: "0945678901",
    email: "diagnostic-lab@latakia.sy",
    governorate: "latakia",
    city: "اللاذقية",
    district: "الصليبة",
    address: "شارع بغداد، اللاذقية",
    location: { type: "Point", coordinates: [35.7850, 35.5250] },
    testCatalog: [
      { testCode: "CBC",   testName: "Complete Blood Count",   arabicName: "تعداد دم شامل",       category: "blood",        price: 11000, turnaroundTime: "2 hours",  isAvailable: true },
      { testCode: "FBS",   testName: "Fasting Blood Sugar",    arabicName: "سكر صيامي",            category: "blood",        price: 7000,  turnaroundTime: "1 hour",   isAvailable: true },
      { testCode: "HbA1c", testName: "Hemoglobin A1c",         arabicName: "خضاب سكري",            category: "blood",        price: 22000, turnaroundTime: "4 hours",  isAvailable: true },
      { testCode: "UA",    testName: "Urinalysis",             arabicName: "تحليل بول",            category: "urine",        price: 8000,  turnaroundTime: "1 hour",   isAvailable: true },
      { testCode: "PCR",   testName: "PCR Test",               arabicName: "فحص PCR",              category: "molecular",    price: 50000, turnaroundTime: "24 hours", isAvailable: true },
      { testCode: "BIOPSY",testName: "Tissue Biopsy",          arabicName: "خزعة نسيجية",          category: "biopsy",       price: 75000, turnaroundTime: "72 hours", isAvailable: true }
    ],
    operatingHours: [
      { day: "Sunday",    openTime: "07:00", closeTime: "18:00", is24Hours: false },
      { day: "Monday",    openTime: "07:00", closeTime: "18:00", is24Hours: false },
      { day: "Tuesday",   openTime: "07:00", closeTime: "18:00", is24Hours: false },
      { day: "Wednesday", openTime: "07:00", closeTime: "18:00", is24Hours: false },
      { day: "Thursday",  openTime: "07:00", closeTime: "18:00", is24Hours: false },
      { day: "Saturday",  openTime: "08:00", closeTime: "13:00", is24Hours: false }
    ],
    isActive: true,
    isAcceptingTests: true,
    averageRating: 4.2,
    totalReviews: NumberInt(24),
    createdAt: now,
    updatedAt: now
  }
];

laboratories.forEach((l) => {
  const exists = db.laboratories.findOne({ registrationNumber: l.registrationNumber });
  if (exists) {
    print("  ⏭ Laboratory already exists: " + l.arabicName);
  } else {
    db.laboratories.insertOne(l);
    print("  ✅ Inserted laboratory: " + l.arabicName);
  }
});


// ============================================================================
// 4. VERIFICATION REPORT
// ============================================================================

print("\n=================================================================");
print("  SEED COMPLETE — Verification                                   ");
print("=================================================================\n");

const hCount = db.hospitals.countDocuments();
const pCount = db.pharmacies.countDocuments();
const lCount = db.laboratories.countDocuments();

print("  Hospitals:     " + hCount + " documents");
print("  Pharmacies:    " + pCount + " documents");
print("  Laboratories:  " + lCount + " documents");

print("\n  Sample pharmacy (nearest Damascus center):");
const sample = db.pharmacies.findOne(
  { location: { $near: { $geometry: { type: "Point", coordinates: [36.2765, 33.5138] }, $maxDistance: 50000 } } },
  { arabicName: 1, governorate: 1, city: 1 }
);
if (sample) {
  print("    → " + sample.arabicName + " (" + sample.city + ", " + sample.governorate + ")");
} else {
  print("    → No nearby pharmacy found (2dsphere index may not exist yet)");
}

print("\n=================================================================");
print("  Done! All facilities seeded successfully.                      ");
print("=================================================================\n");