/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  EmergencyReport Model — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Collection: emergency_reports
 *  Source of truth: patient360_db_final.js (collection 20)
 *
 *  Mobile app emergency AI feature. Patient describes their emergency via:
 *    • textDescription   — typed description
 *    • imageUrl          — photo (wound, rash, swelling)
 *    • voiceNoteUrl      — recorded audio (auto-transcribed to voiceTranscript)
 *
 *  AI model returns:
 *    • aiRiskLevel       — low | moderate | high | critical
 *    • aiFirstAid[]      — ordered list of first aid steps (Arabic)
 *    • aiConfidence      — 0.0 to 1.0 model confidence
 *
 *  Optional follow-up actions:
 *    • Patient can request ambulance dispatch from the app
 *    • Patient can later be linked to a follow-up Visit at the hospital
 *
 *  Location is REQUIRED (GeoJSON Point). Used for:
 *    • Ambulance dispatch routing
 *    • Mapping emergency hotspots for public health analysis
 *    • Regional response time tracking
 *
 *  Privacy note: voice notes and images of injuries are sensitive PHI
 *  (Protected Health Information). Storage URLs should point to encrypted
 *  buckets with strict access controls and audit logging on every read.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');

const { Schema } = mongoose;

// ── Enums ───────────────────────────────────────────────────────────────────

const INPUT_TYPES = ['text', 'image', 'voice', 'combined'];

const RISK_LEVELS = ['low', 'moderate', 'high', 'critical'];

const AMBULANCE_STATUSES = [
  'not_called', 'called', 'dispatched', 'en_route', 'arrived', 'cancelled',
];

const REPORT_STATUSES = [
  'active', 'resolved', 'false_alarm', 'referred_to_hospital',
];

const SYRIA_LNG_MIN = 35.5;
const SYRIA_LNG_MAX = 42.5;
const SYRIA_LAT_MIN = 32.0;
const SYRIA_LAT_MAX = 37.5;

// ── Sub-schema: GeoJSON Point ───────────────────────────────────────────────

const GeoJSONPointSchema = new Schema(
  {
    type: { type: String, enum: ['Point'], required: true, default: 'Point' },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator(coords) {
          if (!Array.isArray(coords) || coords.length !== 2) return false;
          const [lng, lat] = coords;
          if (typeof lng !== 'number' || typeof lat !== 'number') return false;
          return (
            lng >= SYRIA_LNG_MIN && lng <= SYRIA_LNG_MAX
            && lat >= SYRIA_LAT_MIN && lat <= SYRIA_LAT_MAX
          );
        },
        message: 'إحداثيات الطوارئ يجب أن تكون داخل سوريا [خط الطول، خط العرض]',
      },
    },
  },
  { _id: false },
);

// ── Main schema ──────────────────────────────────────────────────────────────

const EmergencyReportSchema = new Schema(
  {
    // ── Patient (XOR — at least adult patientPersonId is typical) ─────────
    patientPersonId: {
      type: Schema.Types.ObjectId,
      ref: 'Person',
      required: [true, 'معرّف المريض مطلوب'],
      index: true,
    },
    patientChildId: {
      type: Schema.Types.ObjectId,
      ref: 'Children',
      sparse: true,
      // Set when a parent reports an emergency on behalf of their child
    },

    reportedAt: { type: Date, default: Date.now, required: true },

    // ── Input ─────────────────────────────────────────────────────────────
    inputType: {
      type: String,
      enum: INPUT_TYPES,
      required: [true, 'نوع الإدخال مطلوب'],
    },
    textDescription: { type: String, trim: true },
    imageUrl: { type: String, trim: true },
    voiceNoteUrl: { type: String, trim: true },
    voiceTranscript: { type: String, trim: true },

    // ── AI model output ───────────────────────────────────────────────────
    aiRiskLevel: { type: String, enum: RISK_LEVELS, index: true },
    aiFirstAid: { type: [String], default: [] },
    aiConfidence: { type: Number, min: 0, max: 1 },
    aiRawResponse: { type: String }, // full JSON for debugging
    aiModelVersion: { type: String, trim: true },
    aiProcessedAt: { type: Date },

    // ── Location (REQUIRED for ambulance dispatch) ────────────────────────
    location: {
      type: GeoJSONPointSchema,
      required: [true, 'موقع الطوارئ مطلوب'],
    },
    locationAddress: { type: String, trim: true }, // reverse-geocoded
    locationAccuracy: { type: Number, min: 0 },    // GPS accuracy in meters

    // ── Ambulance ─────────────────────────────────────────────────────────
    ambulanceCalled: { type: Boolean, default: false },
    ambulanceCalledAt: { type: Date },
    ambulanceStatus: {
      type: String,
      enum: AMBULANCE_STATUSES,
      default: 'not_called',
    },
    ambulanceNotes: { type: String, trim: true },

    // ── Resolution ────────────────────────────────────────────────────────
    status: { type: String, enum: REPORT_STATUSES, default: 'active' },
    resolvedAt: { type: Date },
    resolutionNote: { type: String, trim: true },

    // ── Link to follow-up visit ───────────────────────────────────────────
    followUpVisitId: { type: Schema.Types.ObjectId, ref: 'Visit', sparse: true },
  },
  {
    timestamps: true,
    collection: 'emergency_reports',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ── Indexes ─────────────────────────────────────────────────────────────────

EmergencyReportSchema.index(
  { aiRiskLevel: 1, reportedAt: -1 },
  { name: 'idx_risk_date' },
);
EmergencyReportSchema.index(
  { ambulanceCalled: 1, ambulanceStatus: 1 },
  { name: 'idx_ambulance' },
);
EmergencyReportSchema.index({ status: 1 }, { name: 'idx_status' });
EmergencyReportSchema.index({ reportedAt: -1 }, { name: 'idx_date_desc' });

// 2dsphere — REQUIRED for ambulance routing and hotspot mapping
EmergencyReportSchema.index({ location: '2dsphere' }, { name: 'idx_location_geo' });

// ── Pre-validate: input must contain at least one description method ───────

EmergencyReportSchema.pre('validate', function ensureInputContent(next) {
  const hasText = !!(this.textDescription && this.textDescription.trim());
  const hasImage = !!this.imageUrl;
  const hasVoice = !!this.voiceNoteUrl;

  if (!hasText && !hasImage && !hasVoice) {
    return next(new Error('يجب تقديم وصف نصي أو صورة أو تسجيل صوتي على الأقل'));
  }

  // Validate inputType matches what was actually provided
  if (this.inputType === 'text' && !hasText) {
    return next(new Error('inputType=text لكن textDescription فارغ'));
  }
  if (this.inputType === 'image' && !hasImage) {
    return next(new Error('inputType=image لكن imageUrl فارغ'));
  }
  if (this.inputType === 'voice' && !hasVoice) {
    return next(new Error('inputType=voice لكن voiceNoteUrl فارغ'));
  }

  return next();
});

// ── Virtuals ────────────────────────────────────────────────────────────────

EmergencyReportSchema.virtual('isCritical').get(function () {
  return this.aiRiskLevel === 'critical' || this.aiRiskLevel === 'high';
});

EmergencyReportSchema.virtual('coordinates').get(function () {
  return this.location?.coordinates || null;
});

EmergencyReportSchema.virtual('responseTimeMinutes').get(function () {
  if (!this.ambulanceCalledAt || !this.reportedAt) return null;
  const diffMs = this.ambulanceCalledAt - this.reportedAt;
  return Number((diffMs / 60000).toFixed(1));
});

// ── Static methods ──────────────────────────────────────────────────────────

/**
 * Find active (unresolved) high-risk emergency reports near a location.
 * Used by the dispatcher dashboard to find emergencies that still need
 * an ambulance assigned.
 *
 * @param {number} longitude
 * @param {number} latitude
 * @param {number} [maxDistanceMeters=20000] - default 20km
 */
EmergencyReportSchema.statics.findActiveNearby = function findActiveNearby(longitude, latitude, maxDistanceMeters = 20000) {
  return this.find({
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [longitude, latitude] },
        $maxDistance: maxDistanceMeters,
      },
    },
    status: 'active',
    aiRiskLevel: { $in: ['high', 'critical'] },
  });
};

// ── Instance methods ────────────────────────────────────────────────────────

/**
 * Record that an ambulance was called. Stamps the time and updates status.
 */
EmergencyReportSchema.methods.callAmbulance = async function callAmbulance(notes) {
  this.ambulanceCalled = true;
  this.ambulanceCalledAt = new Date();
  this.ambulanceStatus = 'called';
  if (notes) this.ambulanceNotes = notes;
  return this.save();
};

/**
 * Mark the emergency as resolved with a closing note.
 *
 * @param {'resolved' | 'false_alarm' | 'referred_to_hospital'} resolution
 * @param {string} [note]
 */
EmergencyReportSchema.methods.resolve = async function resolve(resolution, note) {
  if (!['resolved', 'false_alarm', 'referred_to_hospital'].includes(resolution)) {
    throw new Error(`نوع الإغلاق غير صالح: ${resolution}`);
  }
  this.status = resolution;
  this.resolvedAt = new Date();
  if (note) this.resolutionNote = note;
  return this.save();
};

module.exports = mongoose.model('EmergencyReport', EmergencyReportSchema);