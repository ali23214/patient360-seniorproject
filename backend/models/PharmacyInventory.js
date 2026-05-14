/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PharmacyInventory Model — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Collection: pharmacy_inventory
 *  Source of truth: patient360_db_final.js (collection 19)
 *
 *  Per-pharmacy stock levels. One document per (pharmacy × medication) pair.
 *
 *  Batch tracking: Each medication can have multiple batches in stock
 *  (different deliveries, different expiry dates). The pharmacist UI should:
 *    • Display the total currentStock (sum of all batches)
 *    • When dispensing, decrement from the batch nearest to expiry first
 *      (FEFO — First Expired First Out)
 *    • Flag batches expiring within 30 days
 *
 *  Stock alerts:
 *    • lowStockAlert  — true when currentStock <= minimumStock
 *    • expiryAlert    — true when any batch expires within 30 days
 *
 *  These flags are recomputed on every save by the pre-save hook so that
 *  the alerts dashboard query (`{ lowStockAlert: true }`) is fast.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');

const { Schema } = mongoose;

// ── Enums ───────────────────────────────────────────────────────────────────

const CURRENCIES = ['SYP', 'USD'];

// Batches expiring within this window trigger expiryAlert
const EXPIRY_WARNING_DAYS = 30;

// ── Sub-schema: batch ───────────────────────────────────────────────────────

const BatchSchema = new Schema(
  {
    batchNumber: {
      type: String,
      required: [true, 'رقم الدفعة مطلوب'],
      trim: true,
    },
    quantity: {
      type: Number,
      required: [true, 'كمية الدفعة مطلوبة'],
      min: [0, 'كمية الدفعة لا يمكن أن تكون سالبة'],
    },
    expiryDate: {
      type: Date,
      required: [true, 'تاريخ انتهاء الصلاحية مطلوب'],
    },
    receivedDate: { type: Date, default: Date.now },
    supplier: { type: String, trim: true },
    unitCost: { type: Number, min: 0 },
  },
  { _id: false },
);

// ── Main schema ──────────────────────────────────────────────────────────────

const PharmacyInventorySchema = new Schema(
  {
    // ── Identity (unique pair) ────────────────────────────────────────────
    pharmacyId: {
      type: Schema.Types.ObjectId,
      ref: 'Pharmacy',
      required: [true, 'الصيدلية مطلوبة'],
    },
    medicationId: {
      type: Schema.Types.ObjectId,
      ref: 'Medication',
      required: [true, 'الدواء مطلوب'],
    },

    // ── Stock levels ──────────────────────────────────────────────────────
    currentStock: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'المخزون الحالي لا يمكن أن يكون سالب'],
    },
    minimumStock: { type: Number, default: 10, min: 0 },
    maximumStock: { type: Number, min: 0 },

    // ── Alert flags (auto-computed by pre-save hook) ──────────────────────
    lowStockAlert: { type: Boolean, default: false, index: true },
    expiryAlert: { type: Boolean, default: false, index: true },

    // ── Pricing ───────────────────────────────────────────────────────────
    unitPrice: { type: Number, min: 0 },
    currency: { type: String, enum: CURRENCIES, default: 'SYP' },

    // ── Batch tracking ────────────────────────────────────────────────────
    batches: { type: [BatchSchema], default: [] },

    // ── Audit ─────────────────────────────────────────────────────────────
    lastRestockedAt: { type: Date },
  },
  {
    timestamps: true,
    collection: 'pharmacy_inventory',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ── Indexes ─────────────────────────────────────────────────────────────────

// One document per (pharmacy × medication) pair
PharmacyInventorySchema.index(
  { pharmacyId: 1, medicationId: 1 },
  { unique: true, name: 'idx_pharmacy_medication_unique' },
);
PharmacyInventorySchema.index(
  { pharmacyId: 1, lowStockAlert: 1 },
  { name: 'idx_pharmacy_lowStock' },
);
PharmacyInventorySchema.index(
  { 'batches.expiryDate': 1 },
  { name: 'idx_batch_expiry' },
);
PharmacyInventorySchema.index(
  { 'batches.batchNumber': 1 },
  { name: 'idx_batchNumber' },
);

// ── Pre-save: recompute alert flags + total stock from batches ──────────────

PharmacyInventorySchema.pre('save', function recomputeAlerts(next) {
  // Recompute currentStock as the sum of all batch quantities
  if (this.isModified('batches')) {
    this.currentStock = this.batches.reduce(
      (sum, batch) => sum + (batch.quantity || 0),
      0,
    );
  }

  // Low stock alert
  this.lowStockAlert = this.currentStock <= (this.minimumStock || 0);

  // Expiry alert: any batch expiring within EXPIRY_WARNING_DAYS
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + EXPIRY_WARNING_DAYS);
  this.expiryAlert = this.batches.some(
    (batch) => batch.expiryDate && batch.expiryDate <= cutoff && batch.quantity > 0,
  );

  next();
});

// ── Virtuals ────────────────────────────────────────────────────────────────

/**
 * Sorted batches with the nearest expiry first (for FEFO dispensing).
 */
PharmacyInventorySchema.virtual('batchesByExpiry').get(function () {
  return [...this.batches]
    .filter((b) => b.quantity > 0)
    .sort((a, b) => {
      if (!a.expiryDate) return 1;
      if (!b.expiryDate) return -1;
      return a.expiryDate - b.expiryDate;
    });
});

// ── Instance methods ────────────────────────────────────────────────────────

/**
 * Add new stock from a delivery. Creates a new batch and updates
 * lastRestockedAt. Triggers alert recomputation via pre-save.
 *
 * @param {object} batch - { batchNumber, quantity, expiryDate, supplier?, unitCost? }
 */
PharmacyInventorySchema.methods.addBatch = async function addBatch(batch) {
  if (!batch || !batch.batchNumber || !batch.quantity || !batch.expiryDate) {
    throw new Error('addBatch requires { batchNumber, quantity, expiryDate }');
  }
  this.batches.push({
    ...batch,
    receivedDate: batch.receivedDate || new Date(),
  });
  this.lastRestockedAt = new Date();
  return this.save();
};

/**
 * Dispense a quantity using FEFO (First Expired First Out) strategy.
 * Decrements from batches in order of nearest expiry first.
 *
 * @param {number} quantityToDispense
 * @returns {Promise<{batchNumber: string, expiryDate: Date, quantity: number}[]>}
 *          List of batches actually drawn from (for audit trail)
 */
PharmacyInventorySchema.methods.dispense = async function dispense(quantityToDispense) {
  if (typeof quantityToDispense !== 'number' || quantityToDispense <= 0) {
    throw new Error('quantityToDispense must be a positive number');
  }
  if (this.currentStock < quantityToDispense) {
    throw new Error(
      `Insufficient stock. Available: ${this.currentStock}, requested: ${quantityToDispense}`,
    );
  }

  const drawn = [];
  let remaining = quantityToDispense;

  // Sort in place: nearest expiry first
  const sortedBatches = [...this.batches]
    .filter((b) => b.quantity > 0)
    .sort((a, b) => a.expiryDate - b.expiryDate);

  for (const batch of sortedBatches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity, remaining);
    batch.quantity -= take;
    remaining -= take;
    drawn.push({
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate,
      quantity: take,
    });
  }

  // Remove fully depleted batches
  this.batches = this.batches.filter((b) => b.quantity > 0);

  await this.save();
  return drawn;
};

module.exports = mongoose.model('PharmacyInventory', PharmacyInventorySchema);