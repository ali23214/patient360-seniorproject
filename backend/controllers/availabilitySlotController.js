/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Availability Slot Controller — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Time slot management for doctors, dentists, labs. Mounted at /api/slots.
 *
 *  Workflow (v2 — Calendly-style):
 *    1. Doctor defines their schedule template (weeklyPattern + slotDuration
 *       + bookingWindowDays) at sign-up OR from their dashboard.
 *    2. Admin approval auto-runs `regenerateSlotsForDoctor()` so the doctor's
 *       calendar is populated from day one.
 *    3. Patient calls GET /api/slots/available?doctorId=...&date=... to see
 *       open slots.
 *    4. Patient books → atomicReserve happens via the appointment controller.
 *    5. Doctor can edit their template anytime from the dashboard — the
 *       controller deletes future UNBOOKED slots and regenerates from the
 *       new template. Booked slots are NEVER touched.
 *    6. Doctor can still manually create individual slots, block slots
 *       (vacation), or unblock them — legacy v1 behaviour preserved.
 *
 *  Functions:
 *    1. createSlot                — Create a single slot manually (legacy)
 *    2. generateSlots             — Bulk-generate from availableDays (legacy v1)
 *    3. getAvailableSlots         — Patient-facing: available slots for a provider
 *    4. getMySlots                — Provider's own slot list
 *    5. blockSlot                 — Doctor blocks a slot (vacation, sick day)
 *    6. unblockSlot               — Reverse blockSlot
 *    7. deleteSlot                — Delete a slot (only if no bookings)
 *    8. getScheduleTemplate       — NEW (v2): get my schedule template
 *    9. updateScheduleTemplate    — NEW (v2): save template + regenerate slots
 *   10. regenerateFromTemplate    — NEW (v2): regenerate without changing template
 *
 *  Conventions kept:
 *    - Arabic error messages, emoji-marked console logs
 *    - Try/catch in every async function
 * ═══════════════════════════════════════════════════════════════════════════
 */

const {
  AvailabilitySlot, Doctor, Dentist, Laboratory, Hospital, AuditLog
} = require('../models');

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Resolve the slot owner from the request body. Exactly one of doctorId,
 * dentistId, laboratoryId, hospitalId must be set.
 */
function resolveOwner(body) {
  const owners = {};
  if (body.doctorId) owners.doctorId = body.doctorId;
  if (body.dentistId) owners.dentistId = body.dentistId;
  if (body.laboratoryId) owners.laboratoryId = body.laboratoryId;
  if (body.hospitalId) owners.hospitalId = body.hospitalId;

  const ownerKeys = Object.keys(owners);
  if (ownerKeys.length === 0) {
    throw new Error('يجب تحديد doctorId أو dentistId أو laboratoryId أو hospitalId');
  }
  if (ownerKeys.length > 1) {
    throw new Error('يمكن تحديد مالك واحد فقط للموعد');
  }
  return owners;
}

/**
 * Generate HH:MM time strings between start and end at the given step.
 * generateTimeRange('09:00', '17:00', 30) → ['09:00', '09:30', ..., '16:30']
 */
function generateTimeRange(startTime, endTime, stepMinutes) {
  const result = [];
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;

  for (let m = startMin; m + stepMinutes <= endMin; m += stepMinutes) {
    const hh = Math.floor(m / 60).toString().padStart(2, '0');
    const mm = (m % 60).toString().padStart(2, '0');
    result.push(`${hh}:${mm}`);
  }
  return result;
}

/**
 * Add minutes to an HH:MM string.
 * addMinutes('09:30', 30) → '10:00'
 */
function addMinutes(hhmm, minutes) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60).toString().padStart(2, '0');
  const mm = (total % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Core regeneration routine — used by:
 *   • updateScheduleTemplate (after the template changes)
 *   • regenerateFromTemplate (manual button on the dashboard)
 *   • adminController.approveDoctorRequest (initial generation on approval)
 *
 * Algorithm:
 *   1. Compute today's midnight (boundary between past and future slots).
 *   2. Delete future slots that are NOT booked (currentBookings === 0)
 *      AND are NOT manually blocked (status !== 'blocked').
 *        - Booked slots are preserved so patients keep their appointments.
 *        - Blocked slots are preserved (those represent manual overrides).
 *   3. Call doctor.generateSlotsFromTemplate() to compute the new slot docs.
 *   4. Bulk-insert them with ordered: false so individual conflicts don't
 *      abort the whole batch (e.g. duplicate-key on rare race conditions).
 *
 * @param {Object} doctor         — populated Doctor mongoose document
 * @param {Object} [options]
 * @param {number} [options.daysAhead]  — override the template's window
 * @returns {Promise<{deleted: number, inserted: number, kept: number}>}
 */
async function regenerateSlotsForDoctor(doctor, options = {}) {
  if (!doctor || !doctor._id) {
    throw new Error('وثيقة الطبيب غير صالحة');
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // ── Step 1: count booked slots we'll preserve (for the response) ─────────
  const keptCount = await AvailabilitySlot.countDocuments({
    doctorId: doctor._id,
    date: { $gte: todayStart },
    $or: [
      { currentBookings: { $gt: 0 } },
      { status: 'blocked' }
    ]
  });

  // ── Step 2: delete future unbooked, non-blocked slots ────────────────────
  const deleteResult = await AvailabilitySlot.deleteMany({
    doctorId: doctor._id,
    date: { $gte: todayStart },
    currentBookings: { $lte: 0 },
    status: { $ne: 'blocked' }
  });

  console.log(
    `🗑️  Regenerate: deleted ${deleteResult.deletedCount} unbooked slots, ` +
    `kept ${keptCount} booked/blocked slots`
  );

  // ── Step 3: generate fresh slots from the template ───────────────────────
  const newSlots = doctor.generateSlotsFromTemplate(options);

  if (newSlots.length === 0) {
    console.log('ℹ️  Regenerate: template has no working periods, nothing to insert');
    return { deleted: deleteResult.deletedCount, inserted: 0, kept: keptCount };
  }

  // ── Step 4: filter out any slots that would overlap with kept (booked)
  // slots so we don't accidentally create a duplicate appointment time.
  // Index booked/blocked slots by date+startTime for O(1) lookup.
  const protectedSlots = await AvailabilitySlot.find({
    doctorId: doctor._id,
    date: { $gte: todayStart },
    $or: [
      { currentBookings: { $gt: 0 } },
      { status: 'blocked' }
    ]
  }).select('date startTime').lean();

  const protectedKeys = new Set();
  protectedSlots.forEach((s) => {
    const dateKey = new Date(s.date).toISOString().split('T')[0];
    protectedKeys.add(`${dateKey}|${s.startTime}`);
  });

  const slotsToInsert = newSlots.filter((slot) => {
    const dateKey = new Date(slot.date).toISOString().split('T')[0];
    return !protectedKeys.has(`${dateKey}|${slot.startTime}`);
  });

  if (slotsToInsert.length === 0) {
    console.log('ℹ️  Regenerate: all generated slots conflict with booked/blocked, nothing to insert');
    return { deleted: deleteResult.deletedCount, inserted: 0, kept: keptCount };
  }

  // ── Step 5: bulk insert ──────────────────────────────────────────────────
  let insertedCount = 0;
  try {
    const inserted = await AvailabilitySlot.insertMany(slotsToInsert, {
      ordered: false
    });
    insertedCount = inserted.length;
  } catch (err) {
    // insertMany with ordered:false may throw a BulkWriteError that still
    // contains insertedDocs — count what actually made it in.
    if (err && Array.isArray(err.insertedDocs)) {
      insertedCount = err.insertedDocs.length;
      console.warn(
        `⚠️  Regenerate: ${err.writeErrors?.length || 0} insert errors, ` +
        `${insertedCount} succeeded`
      );
    } else {
      throw err;
    }
  }

  console.log(`✅ Regenerate: inserted ${insertedCount} new slots`);

  return {
    deleted: deleteResult.deletedCount,
    inserted: insertedCount,
    kept: keptCount
  };
}

// Export the helper so adminController can call it during approval
exports.regenerateSlotsForDoctor = regenerateSlotsForDoctor;

// ============================================================================
// 1. CREATE SLOT (single)
// ============================================================================

/**
 * @route   POST /api/slots
 * @desc    Create a single availability slot
 * @access  Private (doctor, dentist, lab_technician, admin)
 *
 * Body:
 *   doctorId | dentistId | laboratoryId | hospitalId (one required)
 *   date          — date string (YYYY-MM-DD or ISO)
 *   startTime     — HH:MM
 *   endTime       — HH:MM
 *   slotDuration? — minutes (default 30)
 *   maxBookings?  — default 1
 */
exports.createSlot = async (req, res) => {
  try {
    const owners = resolveOwner(req.body);

    const { date, startTime, endTime, slotDuration, maxBookings } = req.body;

    if (!date || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'date, startTime, endTime مطلوبة'
      });
    }

    const slot = await AvailabilitySlot.create({
      ...owners,
      date: new Date(date),
      startTime: startTime.trim(),
      endTime: endTime.trim(),
      slotDuration: slotDuration || 30,
      maxBookings: maxBookings || 1,
      currentBookings: 0,
      isAvailable: true
    });

    return res.status(201).json({
      success: true,
      message: 'تم إنشاء الموعد بنجاح',
      slot
    });
  } catch (error) {
    console.error('Create slot error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        message: messages[0] || 'خطأ في البيانات'
      });
    }
    return res.status(400).json({
      success: false,
      message: error.message || 'حدث خطأ في إنشاء الموعد'
    });
  }
};

// ============================================================================
// 2. GENERATE SLOTS (bulk for next N days — LEGACY v1)
// ============================================================================

/**
 * @route   POST /api/slots/generate
 * @desc    Bulk-generate slots for the next N days based on availableDays.
 *          For each day in the range that matches availableDays, creates
 *          a series of slots from startTime to endTime at slotDuration intervals.
 *
 *          Skips days that already have slots to avoid duplicates.
 *
 *          ⚠️  LEGACY: kept for backwards compatibility. New code should use
 *              POST /api/doctor/schedule-template/regenerate which sources
 *              from the structured scheduleTemplate.
 * @access  Private (doctor, dentist, lab_technician, admin)
 *
 * Body:
 *   doctorId | dentistId | laboratoryId | hospitalId (one required)
 *   startTime         — HH:MM (e.g. "09:00")
 *   endTime           — HH:MM (e.g. "17:00")
 *   slotDuration      — minutes (e.g. 30 → 30-min slots)
 *   daysAhead?        — how many days to generate ahead (default 30, max 90)
 *   availableDays?    — override array; if not provided, reads from Doctor doc
 *   maxBookings?      — default 1
 *   skipExisting?     — default true; skips days that already have slots
 */
exports.generateSlots = async (req, res) => {
  console.log('🔵 ========== GENERATE SLOTS (legacy v1) ==========');

  try {
    const owners = resolveOwner(req.body);

    const {
      startTime, endTime, slotDuration,
      daysAhead = 30,
      availableDays: overrideDays,
      maxBookings = 1,
      skipExisting = true
    } = req.body;

    if (!startTime || !endTime || !slotDuration) {
      return res.status(400).json({
        success: false,
        message: 'startTime, endTime, slotDuration مطلوبة'
      });
    }

    const safeDaysAhead = Math.min(Math.max(parseInt(daysAhead, 10) || 30, 1), 90);

    // ── Resolve availableDays (from owner doc or override) ────────────────
    let availableDays = overrideDays;
    if (!availableDays) {
      let owner = null;
      if (owners.doctorId) owner = await Doctor.findById(owners.doctorId).lean();
      else if (owners.dentistId) owner = await Dentist.findById(owners.dentistId).lean();

      if (!owner) {
        return res.status(404).json({
          success: false,
          message: 'لم يتم العثور على المالك'
        });
      }

      availableDays = owner.availableDays || [];
    }

    if (!Array.isArray(availableDays) || availableDays.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'لم يتم تحديد أيام العمل (availableDays)'
      });
    }

    // ── Generate the time slots within a day ──────────────────────────────
    const timesOfDay = generateTimeRange(startTime, endTime, slotDuration);
    if (timesOfDay.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'مدة الموعد أكبر من نطاق الوقت'
      });
    }
    console.log(`📋 Will create ${timesOfDay.length} slots per matching day`);

    // ── Walk through each day in range ────────────────────────────────────
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const slotsToCreate = [];
    let skippedDays = 0;

    for (let dayOffset = 0; dayOffset < safeDaysAhead; dayOffset += 1) {
      const date = new Date(today);
      date.setDate(date.getDate() + dayOffset);

      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
      if (!availableDays.includes(dayName)) {
        continue;
      }

      // Skip if this day already has slots for this owner
      if (skipExisting) {
        const existingCount = await AvailabilitySlot.countDocuments({
          ...owners,
          date: {
            $gte: new Date(date.setHours(0, 0, 0, 0)),
            $lt: new Date(date.setHours(23, 59, 59, 999))
          }
        });
        if (existingCount > 0) {
          skippedDays += 1;
          continue;
        }
      }

      // Reset to start of day
      date.setHours(0, 0, 0, 0);

      for (const startHHMM of timesOfDay) {
        const endHHMM = addMinutes(startHHMM, slotDuration);
        slotsToCreate.push({
          ...owners,
          date: new Date(date),
          startTime: startHHMM,
          endTime: endHHMM,
          slotDuration,
          maxBookings,
          currentBookings: 0,
          isAvailable: true,
          status: 'available'
        });
      }
    }

    if (slotsToCreate.length === 0) {
      return res.json({
        success: true,
        message: 'لا توجد مواعيد جديدة للإنشاء (الأيام المتاحة لديها مواعيد بالفعل)',
        created: 0,
        skipped: skippedDays
      });
    }

    // ── Bulk insert ───────────────────────────────────────────────────────
    const created = await AvailabilitySlot.insertMany(slotsToCreate, {
      ordered: false // continue on individual failures
    });

    console.log(`✅ Created ${created.length} slots, skipped ${skippedDays} days`);

    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'GENERATE_SLOTS',
      description: `Generated ${created.length} availability slots`,
      ipAddress: req.ip || 'unknown',
      success: true,
      metadata: {
        ...owners,
        daysAhead: safeDaysAhead,
        slotDuration,
        created: created.length,
        skippedDays
      }
    });

    return res.status(201).json({
      success: true,
      message: `تم إنشاء ${created.length} موعد`,
      created: created.length,
      skipped: skippedDays
    });

  } catch (error) {
    console.error('❌ Generate slots error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'حدث خطأ في إنشاء المواعيد'
    });
  }
};

// ============================================================================
// 3. GET AVAILABLE SLOTS (patient-facing)
// ============================================================================

/**
 * @route   GET /api/slots/available
 * @desc    List available slots for a specific provider on a date or range.
 * @access  Public (patient browsing, no auth required for read-only)
 *
 * Query:
 *   doctorId | dentistId | laboratoryId | hospitalId (one required)
 *   date?         — specific date YYYY-MM-DD
 *   from? + to?   — date range
 */
exports.getAvailableSlots = async (req, res) => {
  try {
    const owners = {};
    if (req.query.doctorId) owners.doctorId = req.query.doctorId;
    if (req.query.dentistId) owners.dentistId = req.query.dentistId;
    if (req.query.laboratoryId) owners.laboratoryId = req.query.laboratoryId;
    if (req.query.hospitalId) owners.hospitalId = req.query.hospitalId;

    if (Object.keys(owners).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'يجب تحديد المالك (doctorId / dentistId / ...)'
      });
    }

    const { date, from, to } = req.query;

    const dateFilter = {};
    if (date) {
      const d = new Date(date);
      const startOfDay = new Date(d.setHours(0, 0, 0, 0));
      const endOfDay = new Date(d.setHours(23, 59, 59, 999));
      dateFilter.$gte = startOfDay;
      dateFilter.$lte = endOfDay;
    } else if (from || to) {
      if (from) dateFilter.$gte = new Date(from);
      if (to) dateFilter.$lte = new Date(to);
    } else {
      // Default: from today onwards
      dateFilter.$gte = new Date();
    }

    const slots = await AvailabilitySlot.find({
      ...owners,
      date: dateFilter,
      isAvailable: true,
      status: 'available',
      $expr: { $lt: ['$currentBookings', '$maxBookings'] }
    })
      .sort({ date: 1, startTime: 1 })
      .lean();

    return res.json({
      success: true,
      count: slots.length,
      slots
    });
  } catch (error) {
    console.error('Get available slots error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب المواعيد المتاحة'
    });
  }
};

// ============================================================================
// 4. GET MY SLOTS (provider view)
// ============================================================================

/**
 * @route   GET /api/slots/mine
 * @desc    Provider sees ALL their slots (available + booked + blocked)
 * @access  Private (doctor, dentist, lab_technician)
 *
 * Query: from?, to?, status?
 */
exports.getMySlots = async (req, res) => {
  try {
    let ownerQuery = null;

    if (req.user.roles.includes('doctor')) {
      const doctor = await Doctor.findOne({ personId: req.user.personId }).lean();
      if (doctor) ownerQuery = { doctorId: doctor._id };
    } else if (req.user.roles.includes('dentist')) {
      const dentist = await Dentist.findOne({ personId: req.user.personId }).lean();
      if (dentist) ownerQuery = { dentistId: dentist._id };
    }

    if (!ownerQuery) {
      return res.status(403).json({
        success: false,
        message: 'الحساب غير مرتبط بطبيب أو طبيب أسنان'
      });
    }

    const { from, to, status } = req.query;
    const dateFilter = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(to);

    const query = { ...ownerQuery };
    if (Object.keys(dateFilter).length > 0) query.date = dateFilter;
    if (status) query.status = status;

    const slots = await AvailabilitySlot.find(query)
      .sort({ date: 1, startTime: 1 })
      .lean();

    return res.json({
      success: true,
      count: slots.length,
      slots
    });
  } catch (error) {
    console.error('Get my slots error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب المواعيد'
    });
  }
};

// ============================================================================
// 5. BLOCK SLOT
// ============================================================================

/**
 * @route   POST /api/slots/:id/block
 * @desc    Doctor blocks a slot (e.g. vacation, sick day). Only allowed if
 *          no patient has already booked it.
 * @access  Private (doctor, dentist, admin)
 *
 * Body: { reason?: string }
 */
exports.blockSlot = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const slot = await AvailabilitySlot.findById(id);
    if (!slot) {
      return res.status(404).json({
        success: false,
        message: 'الموعد غير موجود'
      });
    }

    try {
      await slot.block(reason);
    } catch (modelError) {
      return res.status(400).json({
        success: false,
        message: modelError.message
      });
    }

    return res.json({
      success: true,
      message: 'تم حجب الموعد',
      slot
    });
  } catch (error) {
    console.error('Block slot error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في حجب الموعد'
    });
  }
};

// ============================================================================
// 6. UNBLOCK SLOT
// ============================================================================

/**
 * @route   POST /api/slots/:id/unblock
 * @desc    Reverse a block — slot becomes available again
 * @access  Private (doctor, dentist, admin)
 */
exports.unblockSlot = async (req, res) => {
  try {
    const { id } = req.params;

    const slot = await AvailabilitySlot.findById(id);
    if (!slot) {
      return res.status(404).json({
        success: false,
        message: 'الموعد غير موجود'
      });
    }

    try {
      await slot.unblock();
    } catch (modelError) {
      return res.status(400).json({
        success: false,
        message: modelError.message
      });
    }

    return res.json({
      success: true,
      message: 'تم إلغاء حجب الموعد',
      slot
    });
  } catch (error) {
    console.error('Unblock slot error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في إلغاء الحجب'
    });
  }
};

// ============================================================================
// 7. DELETE SLOT
// ============================================================================

/**
 * @route   DELETE /api/slots/:id
 * @desc    Delete a slot — only allowed if no current bookings
 * @access  Private (doctor, dentist, admin)
 */
exports.deleteSlot = async (req, res) => {
  try {
    const { id } = req.params;

    const slot = await AvailabilitySlot.findById(id);
    if (!slot) {
      return res.status(404).json({
        success: false,
        message: 'الموعد غير موجود'
      });
    }

    if (slot.currentBookings > 0) {
      return res.status(400).json({
        success: false,
        message: 'لا يمكن حذف موعد لديه حجوزات قائمة'
      });
    }

    await slot.deleteOne();

    return res.json({
      success: true,
      message: 'تم حذف الموعد'
    });
  } catch (error) {
    console.error('Delete slot error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في حذف الموعد'
    });
  }
};

// ============================================================================
// 8. GET MY SCHEDULE TEMPLATE — NEW v2 (Calendly-style)
// ============================================================================

/**
 * @route   GET /api/doctor/schedule-template
 * @desc    Return the logged-in doctor's structured schedule template.
 *          If the doctor has never set one, returns a sane empty default
 *          so the editor UI can mount without crashing.
 * @access  Private (Doctor only) — uses injectDoctorContext middleware
 */
exports.getScheduleTemplate = async (req, res) => {
  try {
    const doctorId = req.doctorId || req.body.doctorId;
    if (!doctorId) {
      return res.status(403).json({
        success: false,
        message: 'لم يتم تحديد هوية الطبيب'
      });
    }

    const doctor = await Doctor.findById(doctorId)
      .select('scheduleTemplate availableDays')
      .lean();

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'لم يتم العثور على ملف الطبيب'
      });
    }

    // Empty-state default — mirrors what the model's default factory would
    // produce, so the editor renders the same shape whether the doctor has
    // saved a template before or not.
    const fallback = {
      weeklyPattern: {
        Sunday: [], Monday: [], Tuesday: [], Wednesday: [],
        Thursday: [], Friday: [], Saturday: []
      },
      slotDuration: 20,
      bufferTime: 0,
      bookingWindowDays: 30,
      exceptions: [],
      isActive: true
    };

    return res.json({
      success: true,
      scheduleTemplate: doctor.scheduleTemplate || fallback,
      legacyAvailableDays: doctor.availableDays || []
    });
  } catch (error) {
    console.error('❌ getScheduleTemplate error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب جدول العمل'
    });
  }
};

// ============================================================================
// 9. UPDATE SCHEDULE TEMPLATE — NEW v2
// ============================================================================

/**
 * @route   PUT /api/doctor/schedule-template
 * @desc    Save a new schedule template for the logged-in doctor AND
 *          regenerate the availability_slots collection from it.
 *
 *          Booked + blocked slots are preserved. Only future, unbooked,
 *          non-blocked slots are deleted and replaced.
 *
 * @access  Private (Doctor only) — uses injectDoctorContext middleware
 *
 * Body: { scheduleTemplate: {...} } — matches the Doctor.scheduleTemplate
 *                                     sub-schema shape exactly
 */
exports.updateScheduleTemplate = async (req, res) => {
  console.log('🔵 ========== UPDATE SCHEDULE TEMPLATE ==========');

  try {
    const doctorId = req.doctorId || req.body.doctorId;
    if (!doctorId) {
      return res.status(403).json({
        success: false,
        message: 'لم يتم تحديد هوية الطبيب'
      });
    }

    const { scheduleTemplate } = req.body;
    if (!scheduleTemplate || typeof scheduleTemplate !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'بيانات جدول العمل غير صحيحة'
      });
    }

    // ── Basic structural validation ──────────────────────────────────────
    if (!scheduleTemplate.weeklyPattern || typeof scheduleTemplate.weeklyPattern !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'النمط الأسبوعي مفقود من جدول العمل'
      });
    }

    const VALID_DAYS = [
      'Sunday', 'Monday', 'Tuesday', 'Wednesday',
      'Thursday', 'Friday', 'Saturday'
    ];

    // Validate each day's periods (HH:MM format + endTime > startTime)
    const timePattern = /^\d{2}:\d{2}$/;
    for (const day of VALID_DAYS) {
      const periods = scheduleTemplate.weeklyPattern[day];
      if (periods && !Array.isArray(periods)) {
        return res.status(400).json({
          success: false,
          message: `فترات ${day} يجب أن تكون مصفوفة`
        });
      }
      if (Array.isArray(periods)) {
        for (let i = 0; i < periods.length; i += 1) {
          const p = periods[i];
          if (!p || !timePattern.test(p.startTime) || !timePattern.test(p.endTime)) {
            return res.status(400).json({
              success: false,
              message: `صيغة الوقت غير صحيحة في يوم ${day}`
            });
          }
          if (p.endTime <= p.startTime) {
            return res.status(400).json({
              success: false,
              message: `وقت النهاية يجب أن يكون بعد وقت البداية في يوم ${day}`
            });
          }
        }
      }
    }

    // Sanity-clamp the numeric settings (defence in depth — the model
    // schema also enforces these but we want a clear error response)
    const slotDuration = Math.max(5, Math.min(240, parseInt(scheduleTemplate.slotDuration, 10) || 20));
    const bufferTime = Math.max(0, Math.min(60, parseInt(scheduleTemplate.bufferTime, 10) || 0));
    const bookingWindowDays = Math.max(1, Math.min(90, parseInt(scheduleTemplate.bookingWindowDays, 10) || 30));

    // ── Load and update the doctor ───────────────────────────────────────
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'لم يتم العثور على ملف الطبيب'
      });
    }

    doctor.scheduleTemplate = {
      weeklyPattern: scheduleTemplate.weeklyPattern,
      slotDuration,
      bufferTime,
      bookingWindowDays,
      exceptions: Array.isArray(scheduleTemplate.exceptions) ? scheduleTemplate.exceptions : [],
      isActive: scheduleTemplate.isActive !== false,
      updatedAt: new Date()
    };

    await doctor.save(); // pre-save hook will sync availableDays for backward compat

    console.log(`✅ Template saved for doctor ${doctor._id}`);

    // ── Regenerate slots from the new template ───────────────────────────
    const result = await regenerateSlotsForDoctor(doctor);

    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'UPDATE_SCHEDULE_TEMPLATE',
      description: `Updated schedule template and regenerated slots`,
      resourceType: 'doctor',
      resourceId: doctor._id,
      ipAddress: req.ip || 'unknown',
      success: true,
      metadata: {
        slotDuration,
        bufferTime,
        bookingWindowDays,
        slotsDeleted: result.deleted,
        slotsInserted: result.inserted,
        slotsKept: result.kept
      }
    });

    return res.json({
      success: true,
      message: 'تم حفظ جدول العمل وإعادة توليد المواعيد بنجاح',
      scheduleTemplate: doctor.scheduleTemplate,
      slots: {
        deleted: result.deleted,
        inserted: result.inserted,
        kept: result.kept
      }
    });

  } catch (error) {
    console.error('❌ updateScheduleTemplate error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        message: messages[0] || 'بيانات جدول العمل غير صحيحة'
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || 'حدث خطأ في حفظ جدول العمل'
    });
  }
};

// ============================================================================
// 10. REGENERATE SLOTS FROM TEMPLATE — NEW v2
// ============================================================================

/**
 * @route   POST /api/doctor/schedule-template/regenerate
 * @desc    Regenerate the doctor's availability_slots from their CURRENT
 *          schedule template, without changing the template itself.
 *
 *          Useful when the doctor wants to extend the booking window
 *          forward without editing other settings, or after deleting
 *          mistaken manual slots.
 *
 * @access  Private (Doctor only) — uses injectDoctorContext middleware
 *
 * Body (optional): { daysAhead?: number }
 */
exports.regenerateFromTemplate = async (req, res) => {
  console.log('🔵 ========== REGENERATE FROM TEMPLATE ==========');

  try {
    const doctorId = req.doctorId || req.body.doctorId;
    if (!doctorId) {
      return res.status(403).json({
        success: false,
        message: 'لم يتم تحديد هوية الطبيب'
      });
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'لم يتم العثور على ملف الطبيب'
      });
    }

    if (!doctor.scheduleTemplate || !doctor.scheduleTemplate.isActive) {
      return res.status(400).json({
        success: false,
        message: 'لم يتم تعريف جدول عمل فعّال. الرجاء حفظ جدول أولاً.'
      });
    }

    // Optional override on the booking window for this regeneration
    const opts = {};
    if (req.body && req.body.daysAhead !== undefined) {
      opts.daysAhead = Math.max(1, Math.min(90, parseInt(req.body.daysAhead, 10)));
    }

    const result = await regenerateSlotsForDoctor(doctor, opts);

    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'REGENERATE_SLOTS_FROM_TEMPLATE',
      description: `Regenerated availability slots from existing schedule template`,
      resourceType: 'doctor',
      resourceId: doctor._id,
      ipAddress: req.ip || 'unknown',
      success: true,
      metadata: {
        slotsDeleted: result.deleted,
        slotsInserted: result.inserted,
        slotsKept: result.kept,
        daysAheadOverride: opts.daysAhead || null
      }
    });

    return res.json({
      success: true,
      message: `تم إعادة توليد ${result.inserted} موعد`,
      slots: {
        deleted: result.deleted,
        inserted: result.inserted,
        kept: result.kept
      }
    });

  } catch (error) {
    console.error('❌ regenerateFromTemplate error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'حدث خطأ في إعادة توليد المواعيد'
    });
  }
};
