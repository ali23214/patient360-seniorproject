/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Dispensing Controller — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Pharmacy dispensing endpoints. Mounted at /api/dispensing.
 *
 *  Three workflows:
 *
 *  (A) Prescription-based dispensing:
 *      1. Pharmacist verified the Rx earlier (via prescriptionController)
 *      2. Calls POST /api/dispensing/prescription with selected line items
 *      3. For each medication line:
 *         - Look up inventory at this pharmacy
 *         - Decrement using FEFO (PharmacyInventory.dispense)
 *         - Mark prescription line item as dispensed
 *      4. Create pharmacy_dispensing record with batch traceability
 *      5. Update prescription.status (active → partially_dispensed → dispensed)
 *
 *  (B) OTC dispensing:
 *      1. Pharmacist selects medications (must have requiresPrescription=false)
 *      2. Calls POST /api/dispensing/otc with otcReason
 *      3. Same inventory decrement as (A)
 *      4. Create pharmacy_dispensing record with dispensingType='otc'
 *      5. NO prescription state change (no Rx involved)
 *
 *  (C) Inventory restock:
 *      1. Pharmacist receives a delivery
 *      2. Calls POST /api/dispensing/inventory/restock
 *      3. Adds new batch to PharmacyInventory.batches[]
 *      4. Pre-save hook recomputes alerts and total stock
 *
 *  ⚠️  TRANSACTION NOTE:
 *  We do NOT use MongoDB transactions because they require a replica set
 *  (most local Mongo installs don't have one). Instead, we use a "best-effort
 *  with rollback" approach: if inventory decrement fails, we delete the
 *  dispensing record we created. Not perfect, but acceptable for medium tier.
 *  For production hospital deployment, switch to a replica set + transactions.
 *
 *  Functions:
 *    1. dispensePrescription   — Fulfill an Rx with FEFO inventory
 *    2. dispenseOTC            — OTC dispense (no Rx)
 *    3. addInventoryBatch      — Receive delivery, add new batch
 *    4. getDispensingById      — Single dispensing record lookup
 * ═══════════════════════════════════════════════════════════════════════════
 */

const {
  PharmacyDispensing, Prescription, Pharmacist,
  PharmacyInventory, Medication, AuditLog
} = require('../models');

const { createNotification } = require('./notificationController');

// ============================================================================
// HELPER: Get pharmacist record from logged-in account
// ============================================================================

async function getPharmacistFromAccount(account) {
  const pharmacist = await Pharmacist.findOne({ personId: account.personId });
  if (!pharmacist) {
    throw new Error('لم يتم العثور على ملف الصيدلاني');
  }
  return pharmacist;
}

// ============================================================================
// HELPER: Decrement inventory using FEFO and return batch breakdown
// ============================================================================

/**
 * Decrement stock for a single medication at a pharmacy using FEFO
 * (First Expired First Out). Returns the batch breakdown for audit.
 *
 * @param {ObjectId} pharmacyId
 * @param {ObjectId} medicationId
 * @param {number}   quantity
 * @returns {Promise<Array<{batchNumber, expiryDate, quantity, unitPrice}>>}
 * @throws {Error}   if insufficient stock or inventory missing
 */
async function decrementInventory(pharmacyId, medicationId, quantity) {
  const inventory = await PharmacyInventory.findOne({
    pharmacyId,
    medicationId
  });

  if (!inventory) {
    throw new Error('هذا الدواء غير متوفر في مخزون الصيدلية');
  }

  if (inventory.currentStock < quantity) {
    throw new Error(
      `الكمية المتوفرة (${inventory.currentStock}) أقل من الكمية المطلوبة (${quantity})`
    );
  }

  // Use the model's dispense method (does FEFO + recomputes alerts)
  const drawnBatches = await inventory.dispense(quantity);

  return drawnBatches.map(b => ({
    ...b,
    unitPrice: inventory.unitPrice
  }));
}

// ============================================================================
// 1. DISPENSE PRESCRIPTION
// ============================================================================

/**
 * @route   POST /api/dispensing/prescription
 * @desc    Pharmacist dispenses one or more medications from an Rx.
 *          Supports partial dispensing (pharmacy out of one drug).
 * @access  Private (pharmacist)
 *
 * Body:
 *   prescriptionId (required)              — Rx to dispense from
 *   medications[] (required, >=1)          — line items being dispensed:
 *     {
 *       medicationIndex: number,            — index in prescription.medications[]
 *       medicationId: ObjectId,             — must match the Rx line
 *       quantityDispensed: number,
 *       isGenericSubstitute?: boolean,
 *       pharmacistNotes?: string
 *     }
 *   paymentMethod?    — cash | card | insurance | free (default cash)
 *   patientSignature? — base64 signature (optional)
 */
exports.dispensePrescription = async (req, res) => {
  console.log('🔵 ========== DISPENSE PRESCRIPTION ==========');

  let createdDispensing = null; // Track for rollback

  try {
    const pharmacist = await getPharmacistFromAccount(req.account);
    const {
      prescriptionId,
      medications,
      paymentMethod = 'cash',
      patientSignature
    } = req.body;

    // ── 1. VALIDATION ────────────────────────────────────────────────────
    if (!prescriptionId) {
      return res.status(400).json({
        success: false,
        message: 'معرّف الوصفة مطلوب'
      });
    }
    if (!Array.isArray(medications) || medications.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'يجب تحديد دواء واحد على الأقل للصرف'
      });
    }

    // ── 2. LOAD PRESCRIPTION ─────────────────────────────────────────────
    const prescription = await Prescription.findById(prescriptionId);
    if (!prescription) {
      return res.status(404).json({
        success: false,
        message: 'الوصفة غير موجودة'
      });
    }

    // ── 3. STATUS GATES ──────────────────────────────────────────────────
    if (prescription.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'الوصفة ملغاة'
      });
    }
    if (prescription.status === 'expired') {
      return res.status(400).json({
        success: false,
        message: 'انتهت صلاحية الوصفة'
      });
    }
    if (prescription.status === 'dispensed') {
      return res.status(400).json({
        success: false,
        message: 'تم صرف الوصفة بالكامل مسبقاً'
      });
    }
    if (prescription.expiryDate && new Date(prescription.expiryDate) < new Date()) {
      prescription.status = 'expired';
      await prescription.save();
      return res.status(400).json({
        success: false,
        message: 'انتهت صلاحية الوصفة'
      });
    }

    // ── 4. VALIDATE EACH LINE & CHECK NOT ALREADY DISPENSED ──────────────
    for (const item of medications) {
      const idx = item.medicationIndex;
      if (idx === undefined || idx < 0 || idx >= prescription.medications.length) {
        return res.status(400).json({
          success: false,
          message: `فهرس الدواء غير صالح: ${idx}`
        });
      }
      const rxLine = prescription.medications[idx];
      if (rxLine.isDispensed) {
        return res.status(400).json({
          success: false,
          message: `تم صرف ${rxLine.medicationName} مسبقاً`
        });
      }
      if (!item.quantityDispensed || item.quantityDispensed <= 0) {
        return res.status(400).json({
          success: false,
          message: `الكمية المصروفة لـ ${rxLine.medicationName} غير صحيحة`
        });
      }
    }

    // ── 5. CREATE DISPENSING RECORD (without medicationsDispensed yet) ───
    // We create the record first to get an _id, then fill in batches as we
    // decrement inventory. If any inventory step fails, we delete this record.
    const patientFields = {};
    if (prescription.patientPersonId) {
      patientFields.patientPersonId = prescription.patientPersonId;
    } else if (prescription.patientChildId) {
      patientFields.patientChildId = prescription.patientChildId;
    }

    const medicationsDispensed = [];
    let totalCost = 0;

    // ── 6. DECREMENT INVENTORY FOR EACH LINE (FEFO) ──────────────────────
    for (const item of medications) {
      const rxLine = prescription.medications[item.medicationIndex];
      const medId = item.medicationId || rxLine.medicationId;

      if (!medId) {
        // Skip inventory tracking if Rx didn't reference our catalog
        // (free-text drug name from doctor) — record it without inventory
        console.log(`⚠️  No medicationId for ${rxLine.medicationName} — skipping inventory`);
        medicationsDispensed.push({
          medicationName: rxLine.medicationName,
          quantityDispensed: item.quantityDispensed,
          isGenericSubstitute: item.isGenericSubstitute || false,
          pharmacistNotes: item.pharmacistNotes
        });
        continue;
      }

      try {
        const drawnBatches = await decrementInventory(
          pharmacist.pharmacyId,
          medId,
          item.quantityDispensed
        );

        // We may have drawn from multiple batches — record each
        for (const batch of drawnBatches) {
          const lineCost = (batch.unitPrice || 0) * batch.quantity;
          totalCost += lineCost;

          medicationsDispensed.push({
            medicationId: medId,
            medicationName: rxLine.medicationName,
            quantityDispensed: batch.quantity,
            batchNumber: batch.batchNumber,
            expiryDate: batch.expiryDate,
            unitPrice: batch.unitPrice,
            isGenericSubstitute: item.isGenericSubstitute || false,
            pharmacistNotes: item.pharmacistNotes
          });
        }

        // Mark this prescription line as dispensed
        await prescription.markMedicationDispensed(item.medicationIndex);

      } catch (invError) {
        console.error(`❌ Inventory error for ${rxLine.medicationName}:`, invError.message);
        // Roll back any dispensing record we created
        if (createdDispensing) {
          await PharmacyDispensing.findByIdAndDelete(createdDispensing._id);
        }
        return res.status(400).json({
          success: false,
          message: `${rxLine.medicationName}: ${invError.message}`
        });
      }
    }

    // ── 7. CREATE DISPENSING RECORD ──────────────────────────────────────
    createdDispensing = await PharmacyDispensing.create({
      pharmacyId: pharmacist.pharmacyId,
      pharmacistId: pharmacist._id,
      ...patientFields,
      dispensingType: 'prescription_based',
      prescriptionId: prescription._id,
      prescriptionNumber: prescription.prescriptionNumber,
      medicationsDispensed,
      dispensingDate: new Date(),
      totalCost: Number(totalCost.toFixed(2)),
      paymentMethod,
      patientSignature
    });

    // Link dispensing back to prescription
    prescription.dispensingId = createdDispensing._id;
    await prescription.save();

    // ── 8. UPDATE PHARMACIST STATS ───────────────────────────────────────
    await pharmacist.recordDispense();

    // ── 9. AUDIT LOG ─────────────────────────────────────────────────────
    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'DISPENSE_PRESCRIPTION',
      description: `Dispensed Rx ${prescription.prescriptionNumber}`,
      resourceType: 'prescription',
      resourceId: prescription._id,
      patientPersonId: prescription.patientPersonId,
      patientChildId: prescription.patientChildId,
      ipAddress: req.ip || 'unknown',
      success: true,
      metadata: {
        dispensingNumber: createdDispensing.dispensingNumber,
        itemCount: medicationsDispensed.length,
        totalCost
      }
    });

    console.log('✅ Dispensing complete:', createdDispensing.dispensingNumber);

    // ── PUSH NOTIFICATION TO PATIENT ────────────────────────────────────────
    try {
      const dispensedItemCount = createdDispensing.medicationsDispensed?.length || 0;
      createNotification({
        recipientPersonId: prescription.patientPersonId,
        recipientChildId:  prescription.patientChildId,
        recipientType: 'patient',
        notificationType: 'prescription_dispensed',
        title:       'تم صرف وصفتك',
        titleArabic: 'تم صرف وصفتك',
        body: `تم صرف وصفتك رقم ${prescription.prescriptionNumber} (${dispensedItemCount} دواء). يمكنك مراجعة التفاصيل.`,
        channels: ['push', 'in_app'],
        relatedType: 'prescription',
        relatedId:   prescription._id,
        deepLinkRoute: '/medications',
        priority: 'normal'
      }).catch(err => console.warn('⚠️  Notification failed:', err.message));
    } catch (notifError) {
      console.warn('⚠️  Notification dispatch error (non-fatal):', notifError.message);
    }

    return res.status(201).json({
      success: true,
      message: 'تم صرف الوصفة بنجاح',
      dispensing: {
        _id: createdDispensing._id,
        dispensingNumber: createdDispensing.dispensingNumber,
        prescriptionStatus: prescription.status,
        totalCost: createdDispensing.totalCost,
        medicationsDispensed: createdDispensing.medicationsDispensed
      }
    });

  } catch (error) {
    console.error('❌ Dispense Rx error:', error);

    // Final rollback attempt
    if (createdDispensing) {
      try {
        await PharmacyDispensing.findByIdAndDelete(createdDispensing._id);
      } catch (cleanupErr) {
        console.error('Rollback failed:', cleanupErr);
      }
    }

    return res.status(500).json({
      success: false,
      message: error.message || 'حدث خطأ في صرف الوصفة'
    });
  }
};

// ============================================================================
// 2. DISPENSE OTC (Over The Counter)
// ============================================================================

/**
 * @route   POST /api/dispensing/otc
 * @desc    Pharmacist dispenses medications WITHOUT a prescription.
 *          Each medication MUST have requiresPrescription=false.
 *          otcReason is required for audit purposes.
 * @access  Private (pharmacist)
 *
 * Body:
 *   patientPersonId | patientChildId (one required)
 *   medications[] (required, >=1):
 *     {
 *       medicationId: ObjectId   — required (must be in catalog for OTC)
 *       quantityDispensed: number
 *       pharmacistNotes?: string
 *     }
 *   otcReason (required)         — why dispensing without Rx
 *   otcNotes?
 *   paymentMethod?               — default cash
 *   patientSignature?
 */
exports.dispenseOTC = async (req, res) => {
  console.log('🔵 ========== DISPENSE OTC ==========');

  let createdDispensing = null;

  try {
    const pharmacist = await getPharmacistFromAccount(req.account);
    const {
      patientPersonId,
      patientChildId,
      medications,
      otcReason,
      otcNotes,
      paymentMethod = 'cash',
      patientSignature
    } = req.body;

    // ── 1. VALIDATION ────────────────────────────────────────────────────
    if (!patientPersonId && !patientChildId) {
      return res.status(400).json({
        success: false,
        message: 'يجب تحديد المريض'
      });
    }
    if (patientPersonId && patientChildId) {
      return res.status(400).json({
        success: false,
        message: 'لا يمكن تحديد مريض بالغ وطفل في نفس الوقت'
      });
    }
    if (!Array.isArray(medications) || medications.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'يجب تحديد دواء واحد على الأقل'
      });
    }
    if (!otcReason || otcReason.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'سبب الصرف بدون وصفة مطلوب'
      });
    }

    // ── 2. VERIFY EACH MEDICATION IS OTC-ELIGIBLE ────────────────────────
    for (const item of medications) {
      if (!item.medicationId) {
        return res.status(400).json({
          success: false,
          message: 'يجب تحديد medicationId لكل دواء OTC'
        });
      }
      if (!item.quantityDispensed || item.quantityDispensed <= 0) {
        return res.status(400).json({
          success: false,
          message: 'الكمية يجب أن تكون أكبر من صفر'
        });
      }

      const med = await Medication.findById(item.medicationId).lean();
      if (!med) {
        return res.status(404).json({
          success: false,
          message: `الدواء غير موجود في قاعدة البيانات`
        });
      }
      if (med.requiresPrescription) {
        return res.status(400).json({
          success: false,
          message: `${med.tradeName} يتطلب وصفة طبية ولا يمكن صرفه كـ OTC`
        });
      }
      if (med.controlledSubstance) {
        return res.status(400).json({
          success: false,
          message: `${med.tradeName} مادة خاضعة للرقابة ولا يمكن صرفها كـ OTC`
        });
      }
    }

    // ── 3. DECREMENT INVENTORY ───────────────────────────────────────────
    const medicationsDispensed = [];
    let totalCost = 0;

    for (const item of medications) {
      const med = await Medication.findById(item.medicationId).lean();

      try {
        const drawnBatches = await decrementInventory(
          pharmacist.pharmacyId,
          item.medicationId,
          item.quantityDispensed
        );

        for (const batch of drawnBatches) {
          const lineCost = (batch.unitPrice || 0) * batch.quantity;
          totalCost += lineCost;

          medicationsDispensed.push({
            medicationId: item.medicationId,
            medicationName: med.tradeName,
            quantityDispensed: batch.quantity,
            batchNumber: batch.batchNumber,
            expiryDate: batch.expiryDate,
            unitPrice: batch.unitPrice,
            isGenericSubstitute: false,
            pharmacistNotes: item.pharmacistNotes
          });
        }
      } catch (invError) {
        if (createdDispensing) {
          await PharmacyDispensing.findByIdAndDelete(createdDispensing._id);
        }
        return res.status(400).json({
          success: false,
          message: `${med.tradeName}: ${invError.message}`
        });
      }
    }

    // ── 4. CREATE DISPENSING RECORD ──────────────────────────────────────
    const patientFields = {};
    if (patientPersonId) patientFields.patientPersonId = patientPersonId;
    if (patientChildId) patientFields.patientChildId = patientChildId;

    createdDispensing = await PharmacyDispensing.create({
      pharmacyId: pharmacist.pharmacyId,
      pharmacistId: pharmacist._id,
      ...patientFields,
      dispensingType: 'otc',
      medicationsDispensed,
      dispensingDate: new Date(),
      totalCost: Number(totalCost.toFixed(2)),
      paymentMethod,
      otcReason: otcReason.trim(),
      otcNotes: otcNotes?.trim(),
      patientSignature
    });

    // ── 5. UPDATE PHARMACIST STATS ───────────────────────────────────────
    await pharmacist.recordDispense();

    // ── 6. AUDIT LOG ─────────────────────────────────────────────────────
    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'DISPENSE_OTC',
      description: `OTC dispense ${createdDispensing.dispensingNumber}`,
      resourceType: 'pharmacy_dispensing',
      resourceId: createdDispensing._id,
      patientPersonId,
      patientChildId,
      ipAddress: req.ip || 'unknown',
      success: true,
      metadata: {
        dispensingNumber: createdDispensing.dispensingNumber,
        otcReason,
        itemCount: medicationsDispensed.length,
        totalCost
      }
    });

    console.log('✅ OTC dispense complete:', createdDispensing.dispensingNumber);

    return res.status(201).json({
      success: true,
      message: 'تم صرف الدواء بنجاح',
      dispensing: {
        _id: createdDispensing._id,
        dispensingNumber: createdDispensing.dispensingNumber,
        totalCost: createdDispensing.totalCost,
        medicationsDispensed: createdDispensing.medicationsDispensed
      }
    });

  } catch (error) {
    console.error('❌ OTC dispense error:', error);
    if (createdDispensing) {
      try { await PharmacyDispensing.findByIdAndDelete(createdDispensing._id); }
      catch (e) { console.error('Rollback failed:', e); }
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'حدث خطأ في صرف الدواء'
    });
  }
};

// ============================================================================
// 3. ADD INVENTORY BATCH (restock)
// ============================================================================

/**
 * @route   POST /api/dispensing/inventory/restock
 * @desc    Pharmacist adds a new batch when receiving a delivery
 * @access  Private (pharmacist)
 *
 * Body:
 *   medicationId (required)
 *   batchNumber (required)
 *   quantity (required, >=1)
 *   expiryDate (required)
 *   supplier?
 *   unitCost?
 *   unitPrice?               — selling price (only set if first batch ever)
 *   minimumStock?            — only set if first batch ever
 */
exports.addInventoryBatch = async (req, res) => {
  console.log('🔵 ========== RESTOCK INVENTORY ==========');

  try {
    const pharmacist = await getPharmacistFromAccount(req.account);

    const {
      medicationId,
      batchNumber,
      quantity,
      expiryDate,
      supplier,
      unitCost,
      unitPrice,
      minimumStock
    } = req.body;

    // ── 1. VALIDATION ────────────────────────────────────────────────────
    if (!medicationId || !batchNumber || !quantity || !expiryDate) {
      return res.status(400).json({
        success: false,
        message: 'medicationId, batchNumber, quantity, expiryDate كلها مطلوبة'
      });
    }

    const med = await Medication.findById(medicationId).lean();
    if (!med) {
      return res.status(404).json({
        success: false,
        message: 'الدواء غير موجود في قاعدة البيانات'
      });
    }

    // ── 2. FIND OR CREATE INVENTORY DOC ──────────────────────────────────
    let inventory = await PharmacyInventory.findOne({
      pharmacyId: pharmacist.pharmacyId,
      medicationId
    });

    if (!inventory) {
      // First time stocking this medication — create the inventory doc
      inventory = await PharmacyInventory.create({
        pharmacyId: pharmacist.pharmacyId,
        medicationId,
        currentStock: 0,
        minimumStock: minimumStock || 10,
        unitPrice: unitPrice || 0,
        currency: 'SYP',
        batches: []
      });
    } else {
      // Existing — optionally update unitPrice / minimumStock
      if (unitPrice !== undefined) inventory.unitPrice = unitPrice;
      if (minimumStock !== undefined) inventory.minimumStock = minimumStock;
    }

    // ── 3. ADD BATCH (model method handles alert recompute) ──────────────
    await inventory.addBatch({
      batchNumber: batchNumber.trim(),
      quantity: parseInt(quantity, 10),
      expiryDate: new Date(expiryDate),
      supplier: supplier?.trim(),
      unitCost: unitCost ? parseFloat(unitCost) : undefined
    });

    console.log('✅ Restocked', med.tradeName, 'batch', batchNumber);

    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'INVENTORY_RESTOCK',
      description: `Restocked ${med.tradeName} batch ${batchNumber} qty ${quantity}`,
      resourceType: 'pharmacy_inventory',
      resourceId: inventory._id,
      ipAddress: req.ip || 'unknown',
      success: true,
      metadata: { medicationName: med.tradeName, batchNumber, quantity }
    });

    return res.json({
      success: true,
      message: 'تم إضافة المخزون بنجاح',
      inventory: {
        _id: inventory._id,
        medicationName: med.tradeName,
        currentStock: inventory.currentStock,
        lowStockAlert: inventory.lowStockAlert,
        expiryAlert: inventory.expiryAlert,
        batchCount: inventory.batches.length
      }
    });

  } catch (error) {
    console.error('❌ Restock error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'حدث خطأ في إضافة المخزون'
    });
  }
};

// ============================================================================
// 4. GET DISPENSING BY ID
// ============================================================================

/**
 * @route   GET /api/dispensing/:id
 * @desc    Lookup a single dispensing record
 * @access  Private (pharmacist who did it, admin)
 */
exports.getDispensingById = async (req, res) => {
  try {
    const { id } = req.params;

    const dispensing = await PharmacyDispensing.findById(id)
      .populate('pharmacyId', 'name arabicName')
      .populate('pharmacistId', 'pharmacyLicenseNumber')
      .populate('patientPersonId', 'firstName lastName nationalId')
      .populate('patientChildId', 'firstName lastName childRegistrationNumber')
      .populate('prescriptionId', 'prescriptionNumber prescriptionDate')
      .lean();

    if (!dispensing) {
      return res.status(404).json({
        success: false,
        message: 'سجل الصرف غير موجود'
      });
    }

    return res.json({
      success: true,
      dispensing
    });
  } catch (error) {
    console.error('Get dispensing error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب سجل الصرف'
    });
  }
};