/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Counter Model — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Collection: counters
 *  Purpose   : Atomic, race-condition-safe sequence generation.
 *
 *  PROBLEM SOLVED
 *  ──────────────
 *  The previous CRN generator used `countDocuments(...)` then `+1` — a
 *  read-then-write pattern that breaks under concurrent registrations.
 *  Two simultaneous sign-ups could each read the same count N, then both
 *  try to create CRN-{date}-{N+1}, triggering MongoDB's E11000 duplicate-
 *  key error on the unique `childRegistrationNumber` index.
 *
 *  SOLUTION
 *  ────────
 *  `findOneAndUpdate` with `$inc` is atomic at the document level —
 *  MongoDB guarantees no two concurrent operations can read the same seq
 *  value. Reference:
 *    https://www.mongodb.com/docs/manual/reference/method/db.collection.findOneAndUpdate/
 *
 *  DOCUMENT SHAPE
 *  ──────────────
 *    {
 *      _id: "child_20260525",    // domain_yyyymmdd
 *      seq: 7,                    // next CRN will be CRN-20260525-00008
 *      createdAt: Date,
 *      updatedAt: Date
 *    }
 *
 *  NAMING CONVENTION
 *  ─────────────────
 *  Domain-prefixed keys keep this collection reusable for any future
 *  sequence need without collisions:
 *    "child_YYYYMMDD"      — children registered on a given calendar day
 *    "<future>_<scope>"    — e.g. "visit_YYYYMMDD", "prescription_..."
 * ═══════════════════════════════════════════════════════════════════════════
 */

const mongoose = require('mongoose');

const { Schema } = mongoose;

const CounterSchema = new Schema(
  {
    _id: {
      type: String,
      required: true,
      trim: true,
    },
    seq: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    collection: 'counters',
    versionKey: false,
    timestamps: true,
  },
);

/**
 * Atomically increment and return the next sequence value for a given key.
 * Creates the counter document on first call via `upsert: true`.
 *
 * Concurrency guarantee:
 *   MongoDB serializes write operations on a single document. Even when
 *   100 requests hit this method simultaneously, each receives a distinct,
 *   monotonically-increasing value.
 *
 * @param {string} key — Counter identifier, e.g. "child_20260525"
 * @returns {Promise<number>} The new sequence number (starts at 1)
 * @throws {Error} If key is missing or not a string
 */
CounterSchema.statics.next = async function next(key) {
  if (!key || typeof key !== 'string') {
    throw new Error('Counter.next requires a non-empty string key');
  }

  const doc = await this.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );

  return doc.seq;
};

/**
 * Peek at a counter's current value without incrementing it.
 * Useful for diagnostics and admin dashboards.
 *
 * @param {string} key
 * @returns {Promise<number>} Current seq, or 0 if counter does not exist
 */
CounterSchema.statics.peek = async function peek(key) {
  if (!key || typeof key !== 'string') {
    throw new Error('Counter.peek requires a non-empty string key');
  }
  const doc = await this.findById(key).lean();
  return doc ? doc.seq : 0;
};

module.exports = mongoose.model('Counter', CounterSchema);
