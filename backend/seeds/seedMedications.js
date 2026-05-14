/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Medication Seed Script — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Seeds the medications collection with ~25 commonly prescribed Syrian drugs.
 *
 *  Sources for drug names, generics, and Arabic translations:
 *    • Syrian Ministry of Health published drug registry conventions
 *    • WHO INN (International Non-proprietary Names) database
 *    • Common brand names from Syrian manufacturers (e.g. Tamico, Asia,
 *      Diamond, Ibn Hayyan, Alpha, Unipharma)
 *
 *  This list is intentionally broad — covers the most common categories
 *  (analgesics, antibiotics, cardiovascular, antidiabetic, etc.) so that
 *  the pharmacist UI has realistic data for testing.
 *
 *  Run with:
 *    node backend/seeds/seedMedications.js
 *
 *  Idempotent — uses medicationCode as the unique key. Re-running will
 *  update existing entries rather than creating duplicates.
 * ═══════════════════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Medication = require('../models/Medication');

const MEDICATIONS = [
  // ── Analgesics & Antipyretics ──────────────────────────────────────────
  {
    medicationCode: 'MED-00001',
    tradeName: 'Panadol',
    arabicTradeName: 'بانادول',
    scientificName: 'Paracetamol',
    arabicScientificName: 'باراسيتامول',
    manufacturer: 'GSK / various local',
    strength: '500mg',
    dosageForm: 'tablet',
    category: 'analgesic',
    activeIngredients: ['Paracetamol'],
    contraindications: ['Severe liver disease', 'Hypersensitivity'],
    sideEffects: ['Nausea (rare)', 'Liver toxicity at high doses'],
    requiresPrescription: false,
    storageConditions: 'Store below 25°C',
  },
  {
    medicationCode: 'MED-00002',
    tradeName: 'Brufen',
    arabicTradeName: 'بروفين',
    scientificName: 'Ibuprofen',
    arabicScientificName: 'إيبوبروفين',
    manufacturer: 'Abbott / various',
    strength: '400mg',
    dosageForm: 'tablet',
    category: 'analgesic',
    activeIngredients: ['Ibuprofen'],
    contraindications: ['Active peptic ulcer', 'Severe heart failure', 'Third trimester pregnancy'],
    interactions: ['Warfarin', 'Aspirin', 'Methotrexate'],
    sideEffects: ['Gastric irritation', 'Headache', 'Dizziness'],
    requiresPrescription: false,
    storageConditions: 'Store below 25°C',
  },
  {
    medicationCode: 'MED-00003',
    tradeName: 'Voltaren',
    arabicTradeName: 'فولتارين',
    scientificName: 'Diclofenac Sodium',
    arabicScientificName: 'ديكلوفيناك صوديوم',
    manufacturer: 'Novartis / various',
    strength: '50mg',
    dosageForm: 'tablet',
    category: 'analgesic',
    activeIngredients: ['Diclofenac Sodium'],
    contraindications: ['Peptic ulcer', 'Severe heart failure'],
    interactions: ['Warfarin', 'Lithium', 'Methotrexate'],
    requiresPrescription: true,
  },
  {
    medicationCode: 'MED-00004',
    tradeName: 'Aspirin',
    arabicTradeName: 'أسبرين',
    scientificName: 'Acetylsalicylic Acid',
    arabicScientificName: 'حمض أستيل ساليسيليك',
    manufacturer: 'Bayer / various',
    strength: '100mg',
    dosageForm: 'tablet',
    category: 'cardiovascular',
    activeIngredients: ['Acetylsalicylic Acid'],
    contraindications: ['Children under 16 (Reye syndrome risk)', 'Active bleeding'],
    interactions: ['Warfarin', 'Ibuprofen', 'Methotrexate'],
    requiresPrescription: false,
  },

  // ── Antibiotics ────────────────────────────────────────────────────────
  {
    medicationCode: 'MED-00005',
    tradeName: 'Amoxil',
    arabicTradeName: 'أموكسيل',
    scientificName: 'Amoxicillin',
    arabicScientificName: 'أموكسيسيلين',
    manufacturer: 'GSK / Tamico',
    strength: '500mg',
    dosageForm: 'capsule',
    category: 'antibiotic',
    activeIngredients: ['Amoxicillin'],
    contraindications: ['Penicillin allergy', 'Mononucleosis'],
    interactions: ['Methotrexate', 'Oral contraceptives'],
    sideEffects: ['Diarrhea', 'Nausea', 'Rash'],
    requiresPrescription: true,
    storageConditions: 'Store below 25°C',
  },
  {
    medicationCode: 'MED-00006',
    tradeName: 'Augmentin',
    arabicTradeName: 'أوغمنتين',
    scientificName: 'Amoxicillin + Clavulanic Acid',
    arabicScientificName: 'أموكسيسيلين + حمض كلافولانيك',
    manufacturer: 'GSK / Asia',
    strength: '625mg',
    dosageForm: 'tablet',
    category: 'antibiotic',
    activeIngredients: ['Amoxicillin', 'Clavulanic Acid'],
    contraindications: ['Penicillin allergy', 'Severe liver disease'],
    interactions: ['Methotrexate', 'Allopurinol'],
    requiresPrescription: true,
  },
  {
    medicationCode: 'MED-00007',
    tradeName: 'Zithromax',
    arabicTradeName: 'زيثروماكس',
    scientificName: 'Azithromycin',
    arabicScientificName: 'أزيثروميسين',
    manufacturer: 'Pfizer / Diamond',
    strength: '500mg',
    dosageForm: 'tablet',
    category: 'antibiotic',
    activeIngredients: ['Azithromycin'],
    contraindications: ['Macrolide allergy', 'Severe liver disease'],
    interactions: ['Warfarin', 'Digoxin', 'Statins'],
    requiresPrescription: true,
  },
  {
    medicationCode: 'MED-00008',
    tradeName: 'Ciproxin',
    arabicTradeName: 'سيبروكسين',
    scientificName: 'Ciprofloxacin',
    arabicScientificName: 'سيبروفلوكساسين',
    manufacturer: 'Bayer / Ibn Hayyan',
    strength: '500mg',
    dosageForm: 'tablet',
    category: 'antibiotic',
    activeIngredients: ['Ciprofloxacin'],
    contraindications: ['Pregnancy', 'Children under 18 (tendon rupture risk)'],
    interactions: ['Warfarin', 'Theophylline', 'Antacids', 'Iron supplements'],
    requiresPrescription: true,
  },

  // ── Antihypertensives ──────────────────────────────────────────────────
  {
    medicationCode: 'MED-00009',
    tradeName: 'Concor',
    arabicTradeName: 'كونكور',
    scientificName: 'Bisoprolol Fumarate',
    arabicScientificName: 'بيسوبرولول فومارات',
    manufacturer: 'Merck / Alpha',
    strength: '5mg',
    dosageForm: 'tablet',
    category: 'antihypertensive',
    activeIngredients: ['Bisoprolol Fumarate'],
    contraindications: ['Bradycardia', 'Severe asthma', 'Heart block'],
    interactions: ['Verapamil', 'Diltiazem', 'Insulin'],
    requiresPrescription: true,
  },
  {
    medicationCode: 'MED-00010',
    tradeName: 'Norvasc',
    arabicTradeName: 'نورفاسك',
    scientificName: 'Amlodipine',
    arabicScientificName: 'أملوديبين',
    manufacturer: 'Pfizer / Unipharma',
    strength: '5mg',
    dosageForm: 'tablet',
    category: 'antihypertensive',
    activeIngredients: ['Amlodipine Besylate'],
    contraindications: ['Severe hypotension', 'Cardiogenic shock'],
    interactions: ['Simvastatin', 'Cyclosporine'],
    requiresPrescription: true,
  },
  {
    medicationCode: 'MED-00011',
    tradeName: 'Capoten',
    arabicTradeName: 'كابوتين',
    scientificName: 'Captopril',
    arabicScientificName: 'كابتوبريل',
    manufacturer: 'Bristol-Myers Squibb / various',
    strength: '25mg',
    dosageForm: 'tablet',
    category: 'antihypertensive',
    activeIngredients: ['Captopril'],
    contraindications: ['Pregnancy', 'Bilateral renal artery stenosis', 'History of angioedema'],
    interactions: ['Potassium supplements', 'NSAIDs', 'Lithium'],
    requiresPrescription: true,
  },

  // ── Antidiabetic ───────────────────────────────────────────────────────
  {
    medicationCode: 'MED-00012',
    tradeName: 'Glucophage',
    arabicTradeName: 'جلوكوفاج',
    scientificName: 'Metformin',
    arabicScientificName: 'ميتفورمين',
    manufacturer: 'Merck / Tamico',
    strength: '850mg',
    dosageForm: 'tablet',
    category: 'antidiabetic',
    activeIngredients: ['Metformin Hydrochloride'],
    contraindications: ['Severe renal impairment', 'Metabolic acidosis', 'Heart failure'],
    interactions: ['Iodinated contrast agents', 'Alcohol'],
    sideEffects: ['GI upset', 'Lactic acidosis (rare but serious)'],
    requiresPrescription: true,
  },
  {
    medicationCode: 'MED-00013',
    tradeName: 'Lantus',
    arabicTradeName: 'لانتوس',
    scientificName: 'Insulin Glargine',
    arabicScientificName: 'إنسولين جلارجين',
    manufacturer: 'Sanofi',
    strength: '100 IU/ml',
    dosageForm: 'injection',
    category: 'antidiabetic',
    activeIngredients: ['Insulin Glargine'],
    contraindications: ['Hypoglycemia'],
    interactions: ['Beta blockers (mask hypoglycemia)', 'Corticosteroids'],
    requiresPrescription: true,
    storageConditions: 'Refrigerate 2-8°C; in use can be at room temp up to 28 days',
  },

  // ── Cardiovascular ─────────────────────────────────────────────────────
  {
    medicationCode: 'MED-00014',
    tradeName: 'Crestor',
    arabicTradeName: 'كريستور',
    scientificName: 'Rosuvastatin',
    arabicScientificName: 'روزوفاستاتين',
    manufacturer: 'AstraZeneca / Diamond',
    strength: '10mg',
    dosageForm: 'tablet',
    category: 'cardiovascular',
    activeIngredients: ['Rosuvastatin Calcium'],
    contraindications: ['Active liver disease', 'Pregnancy', 'Breastfeeding'],
    interactions: ['Cyclosporine', 'Gemfibrozil', 'Warfarin'],
    requiresPrescription: true,
  },
  {
    medicationCode: 'MED-00015',
    tradeName: 'Plavix',
    arabicTradeName: 'بلافيكس',
    scientificName: 'Clopidogrel',
    arabicScientificName: 'كلوبيدوغريل',
    manufacturer: 'Sanofi / Asia',
    strength: '75mg',
    dosageForm: 'tablet',
    category: 'cardiovascular',
    activeIngredients: ['Clopidogrel Bisulfate'],
    contraindications: ['Active bleeding', 'Severe liver impairment'],
    interactions: ['Omeprazole', 'Warfarin', 'NSAIDs'],
    requiresPrescription: true,
  },

  // ── Gastrointestinal ───────────────────────────────────────────────────
  {
    medicationCode: 'MED-00016',
    tradeName: 'Nexium',
    arabicTradeName: 'نيكسيوم',
    scientificName: 'Esomeprazole',
    arabicScientificName: 'إيزوميبرازول',
    manufacturer: 'AstraZeneca / Unipharma',
    strength: '40mg',
    dosageForm: 'capsule',
    category: 'gastrointestinal',
    activeIngredients: ['Esomeprazole Magnesium'],
    contraindications: ['Hypersensitivity to PPIs'],
    interactions: ['Clopidogrel', 'Diazepam', 'Methotrexate'],
    requiresPrescription: true,
  },
  {
    medicationCode: 'MED-00017',
    tradeName: 'Motilium',
    arabicTradeName: 'موتيليوم',
    scientificName: 'Domperidone',
    arabicScientificName: 'دومبيريدون',
    manufacturer: 'Janssen / various',
    strength: '10mg',
    dosageForm: 'tablet',
    category: 'gastrointestinal',
    activeIngredients: ['Domperidone'],
    contraindications: ['Cardiac arrhythmias', 'Prolactinoma'],
    interactions: ['Erythromycin', 'Ketoconazole', 'QT-prolonging drugs'],
    requiresPrescription: true,
  },

  // ── Respiratory ────────────────────────────────────────────────────────
  {
    medicationCode: 'MED-00018',
    tradeName: 'Ventolin',
    arabicTradeName: 'فينتولين',
    scientificName: 'Salbutamol',
    arabicScientificName: 'سالبوتامول',
    manufacturer: 'GSK / Asia',
    strength: '100mcg/dose',
    dosageForm: 'inhaler',
    category: 'respiratory',
    activeIngredients: ['Salbutamol Sulfate'],
    contraindications: ['Hypersensitivity'],
    interactions: ['Beta blockers', 'Diuretics'],
    requiresPrescription: true,
  },
  {
    medicationCode: 'MED-00019',
    tradeName: 'Symbicort',
    arabicTradeName: 'سيمبيكورت',
    scientificName: 'Budesonide + Formoterol',
    arabicScientificName: 'بوديزونيد + فورموتيرول',
    manufacturer: 'AstraZeneca',
    strength: '160/4.5mcg',
    dosageForm: 'inhaler',
    category: 'respiratory',
    activeIngredients: ['Budesonide', 'Formoterol Fumarate'],
    contraindications: ['Acute asthma attack (not for rescue use)'],
    interactions: ['Beta blockers', 'Ketoconazole'],
    requiresPrescription: true,
  },

  // ── Antihistamines ─────────────────────────────────────────────────────
  {
    medicationCode: 'MED-00020',
    tradeName: 'Claritine',
    arabicTradeName: 'كلاريتين',
    scientificName: 'Loratadine',
    arabicScientificName: 'لوراتادين',
    manufacturer: 'Bayer / Tamico',
    strength: '10mg',
    dosageForm: 'tablet',
    category: 'antihistamine',
    activeIngredients: ['Loratadine'],
    contraindications: ['Hypersensitivity'],
    requiresPrescription: false,
  },

  // ── Vitamins & Supplements ─────────────────────────────────────────────
  {
    medicationCode: 'MED-00021',
    tradeName: 'Centrum',
    arabicTradeName: 'سنتروم',
    scientificName: 'Multivitamin + Minerals',
    arabicScientificName: 'فيتامينات ومعادن متعددة',
    manufacturer: 'Pfizer',
    strength: 'Multi',
    dosageForm: 'tablet',
    category: 'vitamin',
    activeIngredients: ['Various vitamins and minerals'],
    requiresPrescription: false,
  },
  {
    medicationCode: 'MED-00022',
    tradeName: 'Vitamin D3',
    arabicTradeName: 'فيتامين د3',
    scientificName: 'Cholecalciferol',
    arabicScientificName: 'كوليكالسيفيرول',
    manufacturer: 'Various',
    strength: '50000 IU',
    dosageForm: 'capsule',
    category: 'vitamin',
    activeIngredients: ['Cholecalciferol'],
    contraindications: ['Hypercalcemia', 'Hypervitaminosis D'],
    requiresPrescription: false,
  },

  // ── Antidepressants ────────────────────────────────────────────────────
  {
    medicationCode: 'MED-00023',
    tradeName: 'Prozac',
    arabicTradeName: 'بروزاك',
    scientificName: 'Fluoxetine',
    arabicScientificName: 'فلوكستين',
    manufacturer: 'Eli Lilly / various',
    strength: '20mg',
    dosageForm: 'capsule',
    category: 'antidepressant',
    activeIngredients: ['Fluoxetine Hydrochloride'],
    contraindications: ['MAOI use within 14 days', 'Pimozide'],
    interactions: ['MAOIs', 'Tramadol', 'Warfarin', 'NSAIDs'],
    requiresPrescription: true,
  },

  // ── Hormonal ───────────────────────────────────────────────────────────
  {
    medicationCode: 'MED-00024',
    tradeName: 'Eltroxin',
    arabicTradeName: 'إلتروكسين',
    scientificName: 'Levothyroxine Sodium',
    arabicScientificName: 'ليفوثيروكسين صوديوم',
    manufacturer: 'GSK / various',
    strength: '50mcg',
    dosageForm: 'tablet',
    category: 'hormonal',
    activeIngredients: ['Levothyroxine Sodium'],
    contraindications: ['Untreated adrenal insufficiency', 'Acute MI'],
    interactions: ['Iron', 'Calcium', 'Antacids', 'Warfarin'],
    requiresPrescription: true,
  },

  // ── Controlled (example for testing controlled substance flow) ─────────
  {
    medicationCode: 'MED-00025',
    tradeName: 'Tramal',
    arabicTradeName: 'ترامال',
    scientificName: 'Tramadol',
    arabicScientificName: 'ترامادول',
    manufacturer: 'Grünenthal / various',
    strength: '50mg',
    dosageForm: 'capsule',
    category: 'analgesic',
    activeIngredients: ['Tramadol Hydrochloride'],
    contraindications: ['Severe respiratory depression', 'MAOI use', 'Severe liver/kidney disease'],
    interactions: ['MAOIs', 'SSRIs', 'Carbamazepine', 'Warfarin'],
    sideEffects: ['Drowsiness', 'Constipation', 'Dependence risk'],
    requiresPrescription: true,
    controlledSubstance: true,
  },
];

/**
 * Upsert each medication by medicationCode. Idempotent.
 */
async function seed() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/PATIENT360';

  // eslint-disable-next-line no-console
  console.log(`Connecting to ${mongoUri}...`);
  await mongoose.connect(mongoUri);

  let created = 0;
  let updated = 0;

  for (const med of MEDICATIONS) {
    const existing = await Medication.findOne({ medicationCode: med.medicationCode });
    if (existing) {
      await Medication.updateOne({ medicationCode: med.medicationCode }, { $set: med });
      updated += 1;
    } else {
      await Medication.create(med);
      created += 1;
    }
  }

  // eslint-disable-next-line no-console
  console.log(`✓ Seeded medications. Created: ${created}, Updated: ${updated}`);
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Medication seed failed:', err);
  process.exit(1);
});