/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  drugNormalizationService
 *  ─────────────────────────────────────────────────────────────────────────
 *  Bridges the gap between how OUR database stores patient data (free-text
 *  strings, mixed Arabic/English, brand names, dosages included) and what
 *  Kinan's pipeline expects (uppercase drug classes for allergies, lowercase
 *  generic names for current medications).
 *
 *  Example transformation:
 *
 *    DB stores:
 *      allergies          : ["Penicillin", "Aspirin", "Peanuts"]
 *      currentMedications : ["Brufen 400mg", "بنادول", "Augmentin 1g"]
 *
 *    Pipeline expects:
 *      allergies          : ["PENICILLIN"]       // 'Aspirin' → NSAID; 'Peanuts' dropped
 *      currentMedications : ["ibuprofen", "paracetamol", "amoxicillin"]
 *
 *  Anything we can't resolve is silently dropped — the pipeline tolerates
 *  unknowns, and feeding it garbage would only add noise.
 *
 *  Single source of truth for the alias maps: data/drugAliases.json,
 *  generated from Kinan's mock_drugs.json + brand_drugs.json.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const path = require('path');
const aliasDb = require(path.join(__dirname, '..', '..', 'data', 'drugRisk', 'drugAliases.json'));

// Destructure once at module load — these never change at runtime.
const { aliasToGeneric, aliasToClass, knownGenerics, knownClasses } = aliasDb;

const KNOWN_GENERICS_SET = new Set(knownGenerics);
const KNOWN_CLASSES_SET = new Set(knownClasses);

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Strip dosage suffixes, trailing/leading punctuation, and lowercase.
 * "Brufen 400mg"  → "brufen"
 * "بنادول ٥٠٠"     → "بنادول"
 * "  Augmentin 1g " → "augmentin"
 */
function cleanInputToken(raw) {
  if (typeof raw !== 'string') return '';
  let s = raw.trim().toLowerCase();
  // Remove common dosage patterns: "400mg", "1g", "5ml", "٥٠٠ مغ" etc.
  s = s.replace(/\d+\s*(mg|g|ml|mcg|iu|mg\/ml|%|مغ|غ|مل)\b/gi, '');
  // Remove standalone numbers (e.g. "بنادول 500")
  s = s.replace(/[\d٠-٩]+/g, '');
  // Collapse whitespace, trim punctuation
  s = s.replace(/[.,;:()/\\-]/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Normalize a patient's allergies array (free-text from DB) to the
 * uppercase drug-class enum array the pipeline expects.
 *
 * Unrecognized entries (non-drug allergies like "Peanuts", "Dust") are
 * dropped — the pipeline only checks drug-class conflicts.
 *
 * @param {string[]} rawAllergies  — patient.allergies from MongoDB
 * @returns {string[]} normalized allergy classes (deduped, sorted)
 */
function normalizeAllergies(rawAllergies) {
  if (!Array.isArray(rawAllergies)) return [];
  const result = new Set();

  for (const raw of rawAllergies) {
    const cleaned = cleanInputToken(raw);
    if (!cleaned) continue;

    // (1) Direct class hit? "NSAID", "PENICILLIN", "Penicillin", "بنسلين"
    if (aliasToClass[cleaned]) {
      result.add(aliasToClass[cleaned]);
      continue;
    }

    // (2) Class name as-is uppercase (paranoid fallback)
    const upper = cleaned.toUpperCase();
    if (KNOWN_CLASSES_SET.has(upper)) {
      result.add(upper);
      continue;
    }

    // (3) The allergy might be a generic drug ("aspirin") — look up its
    //     class via the alias map.
    if (aliasToClass[cleaned]) {
      result.add(aliasToClass[cleaned]);
    }
    // Otherwise silently drop — it's a non-drug allergy (food, dust, etc.)
  }

  return [...result].sort();
}

/**
 * Normalize a patient's current medications array (free-text from DB,
 * possibly including brand names, dosages, Arabic, etc.) to the lowercase
 * generic-name array the pipeline expects.
 *
 * Brand names with multiple active ingredients (e.g. Augmentin = amoxicillin
 * + clavulanate) produce only the PRIMARY generic — the pipeline checks
 * interactions by generic name, and adding clavulanate would just create
 * false positives.
 *
 * @param {string[]} rawMedications  — patient.currentMedications from MongoDB
 * @returns {string[]} normalized generic names (deduped, sorted)
 */
function normalizeCurrentMedications(rawMedications) {
  if (!Array.isArray(rawMedications)) return [];
  const result = new Set();

  for (const raw of rawMedications) {
    const cleaned = cleanInputToken(raw);
    if (!cleaned) continue;

    // (1) Direct alias/brand/generic hit
    if (aliasToGeneric[cleaned]) {
      result.add(aliasToGeneric[cleaned]);
      continue;
    }

    // (2) Maybe the cleaning was too aggressive — try the raw lowercase
    const rawLower = String(raw).trim().toLowerCase();
    if (aliasToGeneric[rawLower]) {
      result.add(aliasToGeneric[rawLower]);
      continue;
    }

    // Otherwise silently drop — unknown drug
  }

  return [...result].sort();
}

/**
 * Build the complete patient_profile object that the FastAPI pipeline
 * expects. Pulls allergies + current_medications through the normalizers
 * above and passes chronic/genetic diseases through as-is (Kinan confirmed
 * the pipeline currently ignores them but accepts them in the schema).
 *
 * @param {Object} patientDoc  — Mongoose patient document
 *                                (with .allergies, .chronicDiseases,
 *                                 .currentMedications, etc.)
 * @returns {Object} pipeline-ready patient_profile
 */
function buildPatientProfile(patientDoc) {
  if (!patientDoc) {
    return {
      allergies: [],
      chronic_diseases: [],
      genetic_diseases: [],
      current_medications: [],
    };
  }

  return {
    allergies: normalizeAllergies(patientDoc.allergies),
    chronic_diseases: Array.isArray(patientDoc.chronicDiseases)
      ? patientDoc.chronicDiseases.filter(Boolean)
      : [],
    genetic_diseases: Array.isArray(patientDoc.familyHistory)
      ? patientDoc.familyHistory.filter(Boolean)
      : [],
    current_medications: normalizeCurrentMedications(patientDoc.currentMedications),
  };
}

/**
 * Quick pre-check: would the user's input text mention a drug we even
 * support? Used to decide whether to skip the FastAPI call entirely
 * (out-of-scope drugs return "غير مؤكد" anyway — saves a network roundtrip).
 *
 * This is a HEURISTIC, not a guarantee. The pipeline's actual extraction
 * is more sophisticated; we just look for any known alias as a substring.
 *
 * @param {string} text  — the free-text input
 * @returns {boolean} true if at least one supported drug seems mentioned
 */
function mentionsSupportedDrug(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  const lower = text.toLowerCase();
  // We only need a single hit, so bail early.
  for (const alias of Object.keys(aliasToGeneric)) {
    if (alias.length >= 3 && lower.includes(alias)) return true;
  }
  return false;
}

module.exports = {
  normalizeAllergies,
  normalizeCurrentMedications,
  buildPatientProfile,
  mentionsSupportedDrug,
  // Exported for tests + the health endpoint
  _stats: {
    aliasCount: Object.keys(aliasToGeneric).length,
    classCount: KNOWN_CLASSES_SET.size,
    genericCount: KNOWN_GENERICS_SET.size,
  },
};
