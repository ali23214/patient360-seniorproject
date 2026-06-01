/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Medication Controller — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Drug catalog management. Mounted at /api/medications.
 *
 *  Two audiences:
 *    • Admin: full CRUD over the drug catalog (create, update, soft-delete)
 *    • Authenticated users (doctor, pharmacist, lab tech): search & list
 *      the catalog when prescribing or dispensing
 *
 *  Why no patient access?
 *    Patients shouldn't browse the raw drug catalog — they see medications
 *    only via their own prescriptions (which already restrict to drugs they
 *    were prescribed). Exposing the full catalog could enable medication
 *    research that bypasses clinical safety advice.
 *
 *  Functions:
 *    1. createMedication        — Admin adds new drug to catalog
 *    2. updateMedication        — Admin edits drug record
 *    3. deleteMedication        — Admin soft-delete (sets isDiscontinued=true)
 *    4. getMedicationById       — Single drug detail
 *    5. listMedications         — Paginated list with filters
 *    6. searchMedications       — Search by trade/scientific name
 *    7. getMedicationCategories — Distinct categories for dropdown
 *
 *  Conventions kept:
 *    - Arabic error messages, emoji-marked console logs
 *    - { success, message, [data] } response shape
 *    - Try/catch in every async function
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { Medication, AuditLog } = require('../models');

// ============================================================================
// 1. CREATE MEDICATION (admin)
// ============================================================================

/**
 * @route   POST /api/medications
 * @desc    Add a new drug to the catalog
 * @access  Private (admin only)
 *
 * Body: complete medication object (see Medication.js schema for required fields).
 *       medicationCode is auto-generated if not provided.
 */
exports.createMedication = async (req, res) => {
  console.log('🔵 ========== CREATE MEDICATION ==========');

  try {
    const {
      medicationCode,
      syrianDrugCode,
      tradeName,
      arabicTradeName,
      scientificName,
      arabicScientificName,
      manufacturer,
      countryOfOrigin,
      strength,
      dosageForm,
      category,
      activeIngredients,
      interactions,
      contraindications,
      sideEffects,
      requiresPrescription,
      controlledSubstance,
      storageConditions
    } = req.body;

    // ── 1. VALIDATE REQUIRED FIELDS ───────────────────────────────────────
    if (!tradeName || !scientificName) {
      return res.status(400).json({
        success: false,
        message: 'الاسم التجاري والاسم العلمي مطلوبان'
      });
    }

    // ── 2. CHECK FOR DUPLICATES ───────────────────────────────────────────
    if (syrianDrugCode) {
      const existing = await Medication.findOne({ syrianDrugCode }).lean();
      if (existing) {
        return res.status(409).json({
          success: false,
          message: 'كود الدواء السوري مستخدم مسبقاً'
        });
      }
    }

    // ── 3. CREATE ─────────────────────────────────────────────────────────
    const medication = await Medication.create({
      medicationCode: medicationCode?.toUpperCase().trim() || undefined,
      syrianDrugCode: syrianDrugCode?.trim() || undefined,
      tradeName: tradeName.trim(),
      arabicTradeName: arabicTradeName?.trim(),
      scientificName: scientificName.trim(),
      arabicScientificName: arabicScientificName?.trim(),
      manufacturer: manufacturer?.trim(),
      countryOfOrigin: countryOfOrigin?.trim(),
      strength: strength?.trim(),
      dosageForm,
      category,
      activeIngredients: Array.isArray(activeIngredients)
        ? activeIngredients.map(i => i.trim()).filter(Boolean)
        : [],
      interactions: Array.isArray(interactions)
        ? interactions.map(i => i.trim()).filter(Boolean)
        : [],
      contraindications: Array.isArray(contraindications)
        ? contraindications.map(i => i.trim()).filter(Boolean)
        : [],
      sideEffects: Array.isArray(sideEffects)
        ? sideEffects.map(i => i.trim()).filter(Boolean)
        : [],
      requiresPrescription: requiresPrescription !== false,
      controlledSubstance: !!controlledSubstance,
      storageConditions: storageConditions?.trim(),
      isAvailable: true,
      isDiscontinued: false
    });

    console.log('✅ Medication created:', medication.tradeName);

    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'CREATE_MEDICATION',
      description: `Added ${medication.tradeName} to catalog`,
      resourceType: 'medication',
      resourceId: medication._id,
      ipAddress: req.ip || 'unknown',
      success: true,
      metadata: {
        medicationCode: medication.medicationCode,
        tradeName: medication.tradeName,
        category: medication.category
      }
    });

    return res.status(201).json({
      success: true,
      message: 'تم إضافة الدواء إلى القاعدة',
      medication
    });

  } catch (error) {
    console.error('❌ Create medication error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        message: messages[0] || 'خطأ في البيانات'
      });
    }

    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || 'الحقل';
      return res.status(409).json({
        success: false,
        message: `${field} مستخدم مسبقاً`
      });
    }

    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في إضافة الدواء'
    });
  }
};

// ============================================================================
// 2. UPDATE MEDICATION (admin)
// ============================================================================

/**
 * @route   PATCH /api/medications/:id
 * @desc    Update a medication record. Only mutable fields are accepted —
 *          medicationCode and syrianDrugCode cannot be changed after creation
 *          (would break referential integrity in prescriptions).
 * @access  Private (admin only)
 */
exports.updateMedication = async (req, res) => {
  try {
    const { id } = req.params;

    const medication = await Medication.findById(id);
    if (!medication) {
      return res.status(404).json({
        success: false,
        message: 'الدواء غير موجود'
      });
    }

    // Allowed-list of mutable fields
    const allowedUpdates = [
      'tradeName', 'arabicTradeName', 'scientificName', 'arabicScientificName',
      'manufacturer', 'countryOfOrigin', 'strength', 'dosageForm', 'category',
      'activeIngredients', 'interactions', 'contraindications', 'sideEffects',
      'requiresPrescription', 'controlledSubstance', 'storageConditions',
      'isAvailable'
    ];

    let changedFields = [];
    for (const key of allowedUpdates) {
      if (req.body[key] !== undefined) {
        medication[key] = req.body[key];
        changedFields.push(key);
      }
    }

    if (changedFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'لا توجد حقول للتحديث'
      });
    }

    await medication.save();

    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'UPDATE_MEDICATION',
      description: `Updated ${medication.tradeName}: ${changedFields.join(', ')}`,
      resourceType: 'medication',
      resourceId: medication._id,
      ipAddress: req.ip || 'unknown',
      success: true,
      metadata: { changedFields }
    });

    return res.json({
      success: true,
      message: 'تم تحديث الدواء',
      medication
    });
  } catch (error) {
    console.error('Update medication error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        message: messages[0] || 'خطأ في البيانات'
      });
    }
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في تحديث الدواء'
    });
  }
};

// ============================================================================
// 3. DELETE MEDICATION (admin — soft delete)
// ============================================================================

/**
 * @route   DELETE /api/medications/:id
 * @desc    Soft-delete a medication. Sets isDiscontinued=true so it can no
 *          longer be prescribed, but preserves historical references in old
 *          prescriptions and dispensing records.
 *
 *          We never hard-delete medications because doing so would orphan
 *          prescriptions and break the patient's medical history.
 * @access  Private (admin only)
 *
 * Body: { reason?: string }
 */
exports.deleteMedication = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const medication = await Medication.findById(id);
    if (!medication) {
      return res.status(404).json({
        success: false,
        message: 'الدواء غير موجود'
      });
    }

    if (medication.isDiscontinued) {
      return res.status(400).json({
        success: false,
        message: 'الدواء متوقف بالفعل'
      });
    }

    medication.isDiscontinued = true;
    medication.isAvailable = false;
    await medication.save();

    AuditLog.record({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'DISCONTINUE_MEDICATION',
      description: `Discontinued ${medication.tradeName}${reason ? ` — ${reason}` : ''}`,
      resourceType: 'medication',
      resourceId: medication._id,
      ipAddress: req.ip || 'unknown',
      success: true,
      metadata: { reason }
    });

    return res.json({
      success: true,
      message: 'تم إيقاف الدواء (لن يظهر في عمليات الصرف الجديدة)'
    });
  } catch (error) {
    console.error('Delete medication error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في إيقاف الدواء'
    });
  }
};

// ============================================================================
// 4. GET MEDICATION BY ID
// ============================================================================

/**
 * @route   GET /api/medications/:id
 * @desc    Single medication detail
 * @access  Private (any authenticated clinical role)
 */
exports.getMedicationById = async (req, res) => {
  try {
    const { id } = req.params;

    const medication = await Medication.findById(id).lean();
    if (!medication) {
      return res.status(404).json({
        success: false,
        message: 'الدواء غير موجود'
      });
    }

    return res.json({
      success: true,
      medication
    });
  } catch (error) {
    console.error('Get medication error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب الدواء'
    });
  }
};

// ============================================================================
// 5. LIST MEDICATIONS (paginated)
// ============================================================================

/**
 * @route   GET /api/medications
 * @desc    Paginated list of all medications. Excludes discontinued by default.
 * @access  Private (any authenticated clinical role)
 *
 * Query: page, limit, category, requiresPrescription, includeDiscontinued
 */
exports.listMedications = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      category,
      requiresPrescription,
      includeDiscontinued
    } = req.query;

    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const safeLimit = Math.min(parseInt(limit, 10) || 50, 200);

    const query = {};
    if (includeDiscontinued !== 'true') query.isDiscontinued = false;
    if (category) query.category = category;
    if (requiresPrescription === 'true') query.requiresPrescription = true;
    if (requiresPrescription === 'false') query.requiresPrescription = false;

    const [medications, total] = await Promise.all([
      Medication.find(query)
        .sort({ tradeName: 1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean(),
      Medication.countDocuments(query)
    ]);

    return res.json({
      success: true,
      count: total,
      page: safePage,
      pages: Math.ceil(total / safeLimit),
      medications
    });
  } catch (error) {
    console.error('List medications error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب الأدوية'
    });
  }
};

// ============================================================================
// 6. SEARCH MEDICATIONS
// ============================================================================

/**
 * @route   GET /api/medications/search?q=...
 * @desc    Search by trade name, scientific name, Arabic names. Used by the
 *          doctor's prescription form and pharmacist's OTC selection.
 * @access  Private (any authenticated clinical role)
 *
 * Query: q (>=2 chars), otcOnly, limit
 */
exports.searchMedications = async (req, res) => {
  try {
    const { q, otcOnly, limit = 20 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'يجب إدخال حرفين على الأقل للبحث'
      });
    }

    const safeLimit = Math.min(parseInt(limit, 10) || 20, 50);

    // Escape regex special chars to prevent ReDoS attacks
    const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');

    const query = {
      $or: [
        { tradeName: regex },
        { arabicTradeName: regex },
        { scientificName: regex },
        { arabicScientificName: regex }
      ],
      isAvailable: true,
      isDiscontinued: false
    };

    if (otcOnly === 'true') {
      query.requiresPrescription = false;
      query.controlledSubstance = false;
    }

    const medications = await Medication.find(query)
      .limit(safeLimit)
      .lean();

    return res.json({
      success: true,
      count: medications.length,
      medications
    });
  } catch (error) {
    console.error('Search medications error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في البحث'
    });
  }
};

// ============================================================================
// 7. GET CATEGORIES (for dropdown)
// ============================================================================

/**
 * @route   GET /api/medications/categories
 * @desc    Distinct categories present in the catalog. Used by frontend
 *          filter dropdowns.
 * @access  Private (any authenticated clinical role)
 */
exports.getMedicationCategories = async (req, res) => {
  try {
    const categories = await Medication.distinct('category', {
      isDiscontinued: false
    });

    return res.json({
      success: true,
      count: categories.length,
      categories: categories.filter(Boolean).sort()
    });
  } catch (error) {
    console.error('Get categories error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب التصنيفات'
    });
  }
};