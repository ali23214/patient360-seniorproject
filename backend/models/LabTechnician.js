/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  LabTechnician Model — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Lab technician professional profile.
 *
 *  Critical fix vs. previous version:
 *    laboratoryId is now REQUIRED at the schema level. The locked DB schema
 *    (patient360_db_final.js) requires it, but it was missing in the old
 *    version which silently allowed orphan lab tech records that couldn't
 *    be queried by laboratory.
 *
 *  Relationships:
 *    LabTechnician.personId → Person._id (the human)
 *    LabTechnician.laboratoryId → Laboratory._id (the lab they work at)
 *    Account.personId === LabTechnician.personId (login → tech profile)
 *
 *  Conventions:
 *    - Strict schema validation per locked DB definition
 *    - Indexed for performance (personId unique, laboratoryId, license)
 *    - Instance methods: recordTestCompleted (denormalized counter)
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');

const labTechnicianSchema = new mongoose.Schema(
  {
    // ── Profile reference ───────────────────────────────────────────────────
    personId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Person',
      required: [true, 'personId مطلوب'],
      unique: true,
      index: true
    },

    // ── Professional credentials ────────────────────────────────────────────
    licenseNumber: {
      type: String,
      required: [true, 'رقم رخصة فني المختبر مطلوب'],
      unique: true,
      trim: true,
      index: true
    },

    // CRITICAL FIX — laboratoryId now REQUIRED
    // Without this, lab tech records are unqueryable by lab and the workflow
    // breaks (lab tech can't see "tests at my lab")
    laboratoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Laboratory',
      required: [true, 'يجب تحديد المختبر التابع له'],
      index: true
    },

    // ── Education & specialization ──────────────────────────────────────────
    degree: {
      type: String,
      enum: {
        values: ['Diploma', 'BSc Medical Laboratory', 'MSc Medical Laboratory'],
        message: 'الشهادة العلمية غير صالحة'
      }
    },

    specialization: {
      type: String,
      enum: {
        values: [
          'Clinical Chemistry',
          'Hematology',
          'Microbiology',
          'Immunology',
          'Molecular Biology',
          'Histopathology'
        ],
        message: 'التخصص غير صالح'
      }
    },

    position: {
      type: String,
      enum: {
        values: ['senior_technician', 'technician', 'assistant'],
        message: 'المنصب غير صالح'
      },
      default: 'technician'
    },

    yearsOfExperience: {
      type: Number,
      min: [0, 'سنوات الخبرة لا يمكن أن تكون سالبة'],
      default: 0
    },

    // ── Status & statistics ─────────────────────────────────────────────────
    isAvailable: {
      type: Boolean,
      default: true
    },

    // Denormalized counter — incremented per test completion for fast
    // dashboard rendering (avoids aggregating lab_tests on every page load)
    totalTestsPerformed: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    timestamps: true,
    collection: 'lab_technicians' // Match the locked DB schema name
  }
);

// ============================================================================
// INSTANCE METHODS
// ============================================================================

/**
 * Increment the totalTestsPerformed counter atomically.
 * Called by labTestController when a test is marked completed.
 *
 * Atomic via $inc — safe under concurrent test completions.
 *
 * @returns {Promise<LabTechnician>} updated document
 */
labTechnicianSchema.methods.recordTestCompleted = async function () {
  return this.constructor.findByIdAndUpdate(
    this._id,
    { $inc: { totalTestsPerformed: 1 } },
    { new: true }
  );
};

// ============================================================================
// EXPORT
// ============================================================================

module.exports = mongoose.model('LabTechnician', labTechnicianSchema);