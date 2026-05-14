/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Pharmacist Controller — Patient 360°
 *  ─────────────────────────────────────────────────────────────────────────
 *  Pharmacist self-service endpoints. Mounted at /api/pharmacist.
 *
 *  Functions:
 *    1. getMyProfile             — Pharmacist's own profile + pharmacy
 *    2. getMyDashboardStats      — Today's dispensing count, low stock alerts
 *    3. getMyDispensingHistory   — Pharmacist's dispensing log
 *    4. getMyPharmacyInventory   — Inventory at the pharmacist's pharmacy
 *    5. searchMedications        — Search drug catalog (for OTC selection)
 *    6. getLowStockAlerts        — Items needing restock at this pharmacy
 *    7. getExpiryAlerts          — Batches expiring within 30 days
 *
 *  Pharmacist account → Person → Pharmacist record relationship:
 *    Account.personId → Person._id ← Pharmacist.personId → Pharmacist.pharmacyId
 *
 *  Conventions kept:
 *    - Arabic error messages, emoji-marked console logs
 *    - { success, message, [data] } response shape
 *    - Try/catch in every async function
 * ═══════════════════════════════════════════════════════════════════════════
 */

const {
  Pharmacist, Pharmacy, PharmacyInventory, PharmacyDispensing,
  Medication, AuditLog, Person, Children, Patient, Prescription,
  Notification
} = require('../models');

// ============================================================================
// HELPER: Resolve pharmacist record from logged-in account
// ============================================================================

/**
 * Load the Pharmacist document for the currently logged-in user.
 * Throws if account is not linked to a pharmacist record.
 */
async function getPharmacistFromAccount(account) {
  if (!account.personId) {
    throw new Error('الحساب غير مرتبط بصيدلاني');
  }

  const pharmacist = await Pharmacist.findOne({ personId: account.personId });
  if (!pharmacist) {
    throw new Error('لم يتم العثور على ملف الصيدلاني');
  }

  return pharmacist;
}

// ============================================================================
// 1. GET MY PROFILE
// ============================================================================

/**
 * @route   GET /api/pharmacist/me
 * @desc    Pharmacist's own profile with their pharmacy info populated
 * @access  Private (pharmacist)
 */
exports.getMyProfile = async (req, res) => {
  try {
    const pharmacist = await Pharmacist.findOne({ personId: req.account.personId })
      .populate('personId', 'firstName fatherName lastName motherName nationalId phoneNumber')
      .populate('pharmacyId', 'name arabicName phoneNumber address governorate city operatingHours')
      .lean();

    if (!pharmacist) {
      return res.status(404).json({
        success: false,
        message: 'لم يتم العثور على ملف الصيدلاني'
      });
    }

    return res.json({
      success: true,
      pharmacist
    });
  } catch (error) {
    console.error('Get pharmacist profile error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب الملف الشخصي'
    });
  }
};

// ============================================================================
// 2. GET DASHBOARD STATS
// ============================================================================

/**
 * @route   GET /api/pharmacist/dashboard-stats
 * @desc    Today's dispensing KPIs + alerts for pharmacist's dashboard
 * @access  Private (pharmacist)
 */
exports.getMyDashboardStats = async (req, res) => {
  try {
    const pharmacist = await getPharmacistFromAccount(req.account);

    const startOfToday = new Date(new Date().setHours(0, 0, 0, 0));
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    // Run all stats in parallel for speed
    const [
      todayDispensingCount,
      monthDispensingCount,
      todayPrescriptionBased,
      todayOtc,
      lowStockItemsCount,
      expiryAlertsCount
    ] = await Promise.all([
      PharmacyDispensing.countDocuments({
        pharmacistId: pharmacist._id,
        dispensingDate: { $gte: startOfToday }
      }),
      PharmacyDispensing.countDocuments({
        pharmacistId: pharmacist._id,
        dispensingDate: { $gte: startOfMonth }
      }),
      PharmacyDispensing.countDocuments({
        pharmacistId: pharmacist._id,
        dispensingDate: { $gte: startOfToday },
        dispensingType: 'prescription_based'
      }),
      PharmacyDispensing.countDocuments({
        pharmacistId: pharmacist._id,
        dispensingDate: { $gte: startOfToday },
        dispensingType: 'otc'
      }),
      PharmacyInventory.countDocuments({
        pharmacyId: pharmacist.pharmacyId,
        lowStockAlert: true
      }),
      PharmacyInventory.countDocuments({
        pharmacyId: pharmacist.pharmacyId,
        expiryAlert: true
      })
    ]);

    return res.json({
      success: true,
      stats: {
        todayDispensingCount,
        monthDispensingCount,
        todayPrescriptionBased,
        todayOtc,
        lowStockItemsCount,
        expiryAlertsCount,
        totalPrescriptionsDispensed: pharmacist.totalPrescriptionsDispensed || 0
      }
    });
  } catch (error) {
    console.error('Get pharmacist stats error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'حدث خطأ في جلب الإحصائيات'
    });
  }
};

// ============================================================================
// 3. GET MY DISPENSING HISTORY
// ============================================================================

/**
 * @route   GET /api/pharmacist/dispensing-history
 * @desc    Pharmacist's own dispensing log, paginated
 * @access  Private (pharmacist)
 *
 * Query: page, limit, type (prescription_based | otc), startDate, endDate
 */
exports.getMyDispensingHistory = async (req, res) => {
  try {
    const pharmacist = await getPharmacistFromAccount(req.account);

    const { page = 1, limit = 20, type, startDate, endDate } = req.query;

    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const safeLimit = Math.min(parseInt(limit, 10) || 20, 100);

    const query = { pharmacistId: pharmacist._id };
    if (type && ['prescription_based', 'otc'].includes(type)) {
      query.dispensingType = type;
    }
    if (startDate || endDate) {
      query.dispensingDate = {};
      if (startDate) query.dispensingDate.$gte = new Date(startDate);
      if (endDate) query.dispensingDate.$lte = new Date(endDate);
    }

    const [dispensings, total] = await Promise.all([
      PharmacyDispensing.find(query)
        .populate('patientPersonId', 'firstName fatherName lastName nationalId')
        .populate('patientChildId', 'firstName fatherName lastName childRegistrationNumber')
        .sort({ dispensingDate: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean(),
      PharmacyDispensing.countDocuments(query)
    ]);

    // Flatten patient info so the frontend can read
    //   rec.patientName  &  rec.patientNationalId
    // directly, instead of digging into populated refs (which are sometimes
    // null for OTC dispensings with no linked patient).
    const history = dispensings.map(d => {
      const adult = d.patientPersonId;   // populated doc or null
      const child = d.patientChildId;    // populated doc or null
      const ref   = adult || child || null;

      const fullName = ref
        ? [ref.firstName, ref.fatherName, ref.lastName].filter(Boolean).join(' ')
        : null;

      const nationalId =
        adult?.nationalId ||
        child?.childRegistrationNumber ||
        null;

      return {
        ...d,
        patientName: fullName,
        patientNationalId: nationalId
      };
    });

    return res.json({
      success: true,
      count: total,
      page: safePage,
      pages: Math.ceil(total / safeLimit),
      history,          // key the frontend reads
      dispensings: history  // legacy alias — kept for backward compat
    });
  } catch (error) {
    console.error('Get dispensing history error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'حدث خطأ في جلب السجل'
    });
  }
};

// ============================================================================
// 4. GET MY PHARMACY INVENTORY
// ============================================================================

/**
 * @route   GET /api/pharmacist/inventory
 * @desc    Inventory at pharmacist's pharmacy with medication details
 * @access  Private (pharmacist)
 *
 * Query: page, limit, search (medication name), lowStockOnly (boolean)
 */
exports.getMyPharmacyInventory = async (req, res) => {
  try {
    const pharmacist = await getPharmacistFromAccount(req.account);

    const { page = 1, limit = 50, search, lowStockOnly } = req.query;

    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const safeLimit = Math.min(parseInt(limit, 10) || 50, 200);

    const query = { pharmacyId: pharmacist.pharmacyId };
    if (lowStockOnly === 'true') {
      query.lowStockAlert = true;
    }

    // Get inventory items first
    let inventoryItems = await PharmacyInventory.find(query)
      .populate('medicationId', 'tradeName arabicTradeName scientificName arabicScientificName strength dosageForm requiresPrescription controlledSubstance category')
      .sort({ updatedAt: -1 })
      .lean();

    // Filter by search term post-population (since we're searching populated fields)
    if (search) {
      const searchLower = search.toLowerCase();
      inventoryItems = inventoryItems.filter(item => {
        const med = item.medicationId;
        if (!med) return false;
        return (
          med.tradeName?.toLowerCase().includes(searchLower)
          || med.arabicTradeName?.toLowerCase().includes(searchLower)
          || med.scientificName?.toLowerCase().includes(searchLower)
          || med.arabicScientificName?.toLowerCase().includes(searchLower)
        );
      });
    }

    const total = inventoryItems.length;
    const start = (safePage - 1) * safeLimit;
    const paginated = inventoryItems.slice(start, start + safeLimit);

    return res.json({
      success: true,
      count: total,
      page: safePage,
      pages: Math.ceil(total / safeLimit),
      inventory: paginated
    });
  } catch (error) {
    console.error('Get inventory error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'حدث خطأ في جلب المخزون'
    });
  }
};

// ============================================================================
// 5. SEARCH MEDICATIONS (for OTC selection)
// ============================================================================

/**
 * @route   GET /api/pharmacist/medications/search?q=...&otcOnly=true
 * @desc    Search the medication catalog. Optionally filter to OTC drugs only
 *          (for the OTC dispensing flow where Rx-required drugs aren't valid).
 * @access  Private (pharmacist)
 *
 * Query: q (search term), otcOnly (boolean), limit
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

    const regex = new RegExp(q.trim(), 'i');
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
// 6. LOW STOCK ALERTS
// ============================================================================

/**
 * @route   GET /api/pharmacist/alerts/low-stock
 * @desc    Items at or below minimum stock at the pharmacist's pharmacy
 * @access  Private (pharmacist)
 */
exports.getLowStockAlerts = async (req, res) => {
  try {
    const pharmacist = await getPharmacistFromAccount(req.account);

    const lowStockItems = await PharmacyInventory.find({
      pharmacyId: pharmacist.pharmacyId,
      lowStockAlert: true
    })
      .populate('medicationId', 'tradeName arabicTradeName strength dosageForm')
      .sort({ currentStock: 1 })
      .lean();

    return res.json({
      success: true,
      count: lowStockItems.length,
      items: lowStockItems
    });
  } catch (error) {
    console.error('Get low stock error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'حدث خطأ في جلب التنبيهات'
    });
  }
};

// ============================================================================
// 7. EXPIRY ALERTS
// ============================================================================

/**
 * @route   GET /api/pharmacist/alerts/expiry
 * @desc    Inventory items with batches expiring within 30 days
 * @access  Private (pharmacist)
 */
exports.getExpiryAlerts = async (req, res) => {
  try {
    const pharmacist = await getPharmacistFromAccount(req.account);

    const expiryItems = await PharmacyInventory.find({
      pharmacyId: pharmacist.pharmacyId,
      expiryAlert: true
    })
      .populate('medicationId', 'tradeName arabicTradeName strength dosageForm')
      .lean();

    // Add a "soonest expiry" field for sorting/display
    const itemsWithSoonestExpiry = expiryItems.map(item => {
      const soonest = (item.batches || [])
        .filter(b => b.quantity > 0)
        .reduce((min, b) => {
          if (!min || (b.expiryDate && b.expiryDate < min)) return b.expiryDate;
          return min;
        }, null);
      return { ...item, soonestExpiryDate: soonest };
    });

    itemsWithSoonestExpiry.sort((a, b) => {
      if (!a.soonestExpiryDate) return 1;
      if (!b.soonestExpiryDate) return -1;
      return new Date(a.soonestExpiryDate) - new Date(b.soonestExpiryDate);
    });

    return res.json({
      success: true,
      count: itemsWithSoonestExpiry.length,
      items: itemsWithSoonestExpiry
    });
  } catch (error) {
    console.error('Get expiry alerts error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'حدث خطأ في جلب التنبيهات'
    });
  }
};

// ============================================================================
// 8. GET DASHBOARD KPIs (frontend-shaped)
// ============================================================================

/**
 * @route   GET /api/pharmacist/dashboard/kpis
 * @desc    Returns KPIs in the exact shape PharmacistDashboard.jsx expects:
 *            dispensedToday, totalRevenueToday, prescriptionBasedToday,
 *            otcToday, dispensedThisMonth, totalRevenueMonth.
 *          Also includes the pharmacist's pharmacy and a recentActivity list.
 * @access  Private (pharmacist)
 */
exports.getDashboardKPIs = async (req, res) => {
  try {
    const pharmacist = await getPharmacistFromAccount(req.account);

    const pharmacy = await Pharmacy.findById(pharmacist.pharmacyId)
      .select('name arabicName phoneNumber address governorate city operatingHours')
      .lean();

    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Aggregation pipeline to compute counts + revenue in one round-trip each
    const [todayAgg, monthAgg, recentActivity] = await Promise.all([
      PharmacyDispensing.aggregate([
        {
          $match: {
            pharmacistId: pharmacist._id,
            dispensingDate: { $gte: startOfToday }
          }
        },
        {
          $group: {
            _id: '$dispensingType',
            count: { $sum: 1 },
            revenue: { $sum: { $ifNull: ['$totalCost', 0] } }
          }
        }
      ]),

      PharmacyDispensing.aggregate([
        {
          $match: {
            pharmacistId: pharmacist._id,
            dispensingDate: { $gte: startOfMonth }
          }
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            revenue: { $sum: { $ifNull: ['$totalCost', 0] } }
          }
        }
      ]),

      PharmacyDispensing.find({ pharmacistId: pharmacist._id })
        .populate('patientPersonId', 'firstName lastName')
        .populate('patientChildId', 'firstName lastName')
        .sort({ dispensingDate: -1 })
        .limit(10)
        .lean()
    ]);

    // Unpack today's aggregation by dispensingType
    let prescriptionBasedToday = 0;
    let otcToday = 0;
    let totalRevenueToday = 0;
    for (const row of todayAgg) {
      totalRevenueToday += row.revenue || 0;
      if (row._id === 'prescription_based') prescriptionBasedToday = row.count;
      else if (row._id === 'otc') otcToday = row.count;
    }
    const dispensedToday = prescriptionBasedToday + otcToday;

    const monthRow = monthAgg[0] || { count: 0, revenue: 0 };

    return res.json({
      success: true,
      kpis: {
        dispensedToday,
        totalRevenueToday,
        prescriptionBasedToday,
        otcToday,
        dispensedThisMonth: monthRow.count,
        totalRevenueMonth: monthRow.revenue
      },
      pharmacy,
      recentActivity: recentActivity.map(d => ({
        _id: d._id,
        dispensingNumber: d.dispensingNumber,
        dispensingType: d.dispensingType,
        dispensingDate: d.dispensingDate,
        totalCost: d.totalCost,
        patientName: d.patientPersonId
          ? `${d.patientPersonId.firstName || ''} ${d.patientPersonId.lastName || ''}`.trim()
          : d.patientChildId
          ? `${d.patientChildId.firstName || ''} ${d.patientChildId.lastName || ''}`.trim()
          : 'بدون مريض'
      }))
    });
  } catch (error) {
    console.error('Get pharmacist KPIs error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'حدث خطأ في جلب المؤشرات'
    });
  }
};


// ============================================================================
// 9. GET NOTIFICATIONS
// ============================================================================

/**
 * @route   GET /api/pharmacist/notifications
 * @desc    In-app notifications for the pharmacist's account, latest first
 * @access  Private (pharmacist)
 */
exports.getNotifications = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

    const notifications = await Notification.find({
      recipientId: req.account._id
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const unreadCount = await Notification.countDocuments({
      recipientId: req.account._id,
      status: { $in: ['pending', 'sent', 'delivered'] }
    });

    return res.json({
      success: true,
      count: notifications.length,
      unreadCount,
      notifications
    });
  } catch (error) {
    console.error('Get pharmacist notifications error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب الإشعارات'
    });
  }
};


// ============================================================================
// 10. MARK NOTIFICATION READ
// ============================================================================

/**
 * @route   PATCH /api/pharmacist/notifications/:id/read
 * @desc    Mark one notification as read. Verifies ownership first so one
 *          pharmacist can't mark another account's notifications read.
 * @access  Private (pharmacist)
 */
exports.markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'معرّف غير صالح'
      });
    }

    const updated = await Notification.findOneAndUpdate(
      { _id: id, recipientId: req.account._id },
      { $set: { status: 'read', readAt: new Date() } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'الإشعار غير موجود'
      });
    }

    return res.json({ success: true, notification: updated });
  } catch (error) {
    console.error('Mark notification read error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ'
    });
  }
};


// ============================================================================
// 11. LOOKUP PATIENT BY NATIONAL ID
// ============================================================================

/**
 * @route   GET /api/pharmacist/patient/:nationalId
 * @desc    Find a patient by national ID (or child registration number) and
 *          return their active / partially-dispensed prescriptions so the
 *          pharmacist can select one to dispense.
 * @access  Private (pharmacist)
 */
exports.lookupPatient = async (req, res) => {
  try {
    const { nationalId } = req.params;

    // Identify as adult (11-digit national ID) vs child (CRN-...)
    let person = null;
    let child = null;
    let patientRef = null;

    if (/^\d{11}$/.test(nationalId)) {
      person = await Person.findOne({ nationalId }).lean();
      if (person) patientRef = { patientPersonId: person._id };
    } else if (nationalId.startsWith('CRN-')) {
      child = await Children.findOne({ childRegistrationNumber: nationalId }).lean();
      if (child) patientRef = { patientChildId: child._id };
    }

    if (!patientRef) {
      return res.status(404).json({
        success: false,
        message: 'لم يتم العثور على المريض'
      });
    }

    // Load medical profile (allergies / chronic diseases warn the pharmacist
    // about potential interactions when dispensing)
    const patientRecord = await Patient.findOne(
      person ? { personId: person._id } : { childId: child._id }
    ).lean();

    // Active prescriptions this pharmacist can dispense. A prescription is
    // "dispensable" when status is active or partially_dispensed AND it
    // hasn't expired. We sort most recent first.
    const now = new Date();
    const prescriptions = await Prescription.find({
      ...patientRef,
      status: { $in: ['active', 'partially_dispensed'] },
      $or: [
        { expiryDate: { $exists: false } },
        { expiryDate: null },
        { expiryDate: { $gte: now } }
      ]
    })
      .populate('doctorId', 'specialization medicalLicenseNumber')
      .populate('dentistId', 'specialization dentalLicenseNumber')
      .sort({ prescriptionDate: -1 })
      .lean();

    // Flatten the patient object so the frontend can read personId directly
    const identity = person || child;
    const patientPayload = {
      ...identity,
      personId: person?._id,
      childId: child?._id,
      isChild: !!child,
      bloodType: patientRecord?.bloodType,
      allergies: patientRecord?.allergies || [],
      chronicDiseases: patientRecord?.chronicDiseases || [],
      currentMedications: patientRecord?.currentMedications || []
    };

    return res.json({
      success: true,
      patient: patientPayload,
      prescriptions
    });
  } catch (error) {
    console.error('Pharmacist lookup patient error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في البحث عن المريض'
    });
  }
};


// ============================================================================
// 12. VERIFY PRESCRIPTION BY 6-DIGIT CODE (id-in-url variant)
// ============================================================================

/**
 * @route   POST /api/pharmacist/prescriptions/:id/verify
 * @desc    Verify the pharmacist-entered 6-digit code against a prescription.
 *          Runs state + expiry guards and returns `verified: true` when OK.
 *          The frontend uses this before showing the dispense controls.
 * @access  Private (pharmacist)
 */
exports.verifyPrescription = async (req, res) => {
  try {
    const { id } = req.params;
    const { verificationCode } = req.body || {};

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'معرّف الوصفة غير صالح'
      });
    }
    if (!verificationCode || String(verificationCode).length !== 6) {
      return res.status(400).json({
        success: false,
        message: 'رمز التحقق يجب أن يكون 6 أرقام'
      });
    }

    const prescription = await Prescription.findById(id);
    if (!prescription) {
      return res.status(404).json({
        success: false,
        message: 'الوصفة غير موجودة'
      });
    }

    // Constant-time-ish comparison on the stored code
    const stored = String(prescription.verificationCode || '');
    const entered = String(verificationCode);
    if (stored.length !== entered.length || stored !== entered) {
      return res.status(401).json({
        success: false,
        verified: false,
        message: 'رمز التحقق غير صحيح'
      });
    }

    if (prescription.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        verified: false,
        message: 'هذه الوصفة ملغاة'
      });
    }
    if (prescription.status === 'dispensed') {
      return res.status(400).json({
        success: false,
        verified: false,
        message: 'تم صرف هذه الوصفة بالكامل مسبقاً'
      });
    }
    if (prescription.expiryDate && new Date(prescription.expiryDate) < new Date()) {
      if (prescription.status !== 'expired') {
        prescription.status = 'expired';
        await prescription.save();
      }
      return res.status(400).json({
        success: false,
        verified: false,
        message: 'انتهت صلاحية هذه الوصفة'
      });
    }

    AuditLog.record({
      userId: req.account._id,
      userEmail: req.account.email,
      action: 'VERIFY_PRESCRIPTION_CODE',
      description: `Pharmacist verified ${prescription.prescriptionNumber}`,
      resourceType: 'prescription',
      resourceId: prescription._id,
      ipAddress: req.ip || 'unknown',
      success: true
    }).catch(() => {});

    return res.json({
      success: true,
      verified: true,
      prescription: prescription.toObject ? prescription.toObject() : prescription
    });
  } catch (error) {
    console.error('Verify prescription error:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ في التحقق من الوصفة'
    });
  }
};


// ============================================================================
// 13. DISPENSE PRESCRIPTION
// ============================================================================

/**
 * @route   POST /api/pharmacist/prescriptions/dispense
 * @desc    Create a PharmacyDispensing record for a prescription, then flag
 *          each dispensed medication on the prescription and set the
 *          prescription's status to 'dispensed' or 'partially_dispensed'.
 * @access  Private (pharmacist)
 *
 * Body: {
 *   prescriptionId,
 *   patientPersonId | patientChildId,
 *   medicationsDispensed: [
 *     { medicationName, quantityDispensed, batchNumber?, expiryDate?,
 *       unitPrice?, isGenericSubstitute?, pharmacistNotes? }
 *   ],
 *   totalCost?, currency?, paymentMethod?, notes?
 * }
 */
exports.dispensePrescription = async (req, res) => {
  try {
    const pharmacist = await getPharmacistFromAccount(req.account);

    const {
      prescriptionId,
      patientPersonId,
      patientChildId,
      medicationsDispensed,
      totalCost = 0,
      currency = 'SYP',
      paymentMethod = 'cash',
      notes
    } = req.body || {};

    if (!prescriptionId || !String(prescriptionId).match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'معرّف الوصفة غير صالح'
      });
    }

    if (!Array.isArray(medicationsDispensed) || medicationsDispensed.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'يجب اختيار دواء واحد على الأقل للصرف'
      });
    }

    const prescription = await Prescription.findById(prescriptionId);
    if (!prescription) {
      return res.status(404).json({
        success: false,
        message: 'الوصفة غير موجودة'
      });
    }

    if (prescription.status === 'dispensed') {
      return res.status(400).json({
        success: false,
        message: 'تم صرف هذه الوصفة بالكامل مسبقاً'
      });
    }
    if (prescription.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'هذه الوصفة ملغاة'
      });
    }

    // Build the dispensing document
    const now = new Date();
    const dispensingNumber = `DISP-${now.getFullYear()}`
      + `${String(now.getMonth() + 1).padStart(2, '0')}`
      + `${String(now.getDate()).padStart(2, '0')}`
      + `-${Math.floor(10000 + Math.random() * 90000)}`;

    // Normalize each line so required schema fields are present
    const normalizedMeds = medicationsDispensed
      .filter(m => m && m.medicationName && (m.quantityDispensed > 0))
      .map(m => ({
        medicationId: m.medicationId || undefined,
        medicationName: String(m.medicationName).trim(),
        quantityDispensed: parseInt(m.quantityDispensed, 10) || 1,
        batchNumber: m.batchNumber || undefined,
        expiryDate: m.expiryDate ? new Date(m.expiryDate) : undefined,
        unitPrice: typeof m.unitPrice === 'number' ? m.unitPrice : undefined,
        isGenericSubstitute: !!m.isGenericSubstitute,
        pharmacistNotes: m.pharmacistNotes || undefined
      }));

    if (normalizedMeds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'لا توجد أدوية صالحة للصرف'
      });
    }

    // Build patient reference — prefer body, fall back to the prescription
    const patientRef = {};
    if (patientPersonId) patientRef.patientPersonId = patientPersonId;
    else if (patientChildId) patientRef.patientChildId = patientChildId;
    else if (prescription.patientPersonId) patientRef.patientPersonId = prescription.patientPersonId;
    else if (prescription.patientChildId) patientRef.patientChildId = prescription.patientChildId;

    const dispensing = await PharmacyDispensing.create({
      dispensingNumber,
      pharmacyId: pharmacist.pharmacyId,
      pharmacistId: pharmacist._id,
      ...patientRef,
      dispensingType: 'prescription_based',
      prescriptionId: prescription._id,
      prescriptionNumber: prescription.prescriptionNumber,
      medicationsDispensed: normalizedMeds,
      dispensingDate: now,
      totalCost: Number(totalCost) || 0,
      currency,
      paymentMethod,
      notes: notes || undefined
    });

    // Mark the dispensed medications on the prescription itself. Match on
    // medicationName case-insensitively; if the pharmacist dispensed everything
    // we flip the whole prescription to 'dispensed', otherwise partially.
    const dispensedNames = new Set(
      normalizedMeds.map(m => m.medicationName.toLowerCase())
    );

    let anyRemaining = false;
    prescription.medications.forEach((med) => {
      if (dispensedNames.has(String(med.medicationName || '').toLowerCase())) {
        med.isDispensed = true;
        med.dispensedAt = now;
      }
      if (!med.isDispensed) anyRemaining = true;
    });

    prescription.status = anyRemaining ? 'partially_dispensed' : 'dispensed';
    prescription.dispensingId = dispensing._id;
    await prescription.save();

    // Increment pharmacist totalPrescriptionsDispensed counter
    await Pharmacist.findByIdAndUpdate(pharmacist._id, {
      $inc: { totalPrescriptionsDispensed: 1 }
    }).catch(() => {});

    AuditLog.record({
      userId: req.account._id,
      userEmail: req.account.email,
      action: 'DISPENSE_PRESCRIPTION',
      description: `Dispensed ${normalizedMeds.length} medications from ${prescription.prescriptionNumber}`,
      resourceType: 'pharmacy_dispensing',
      resourceId: dispensing._id,
      ipAddress: req.ip || 'unknown',
      success: true
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      message: 'تم صرف الوصفة بنجاح',
      dispensing,
      prescriptionStatus: prescription.status
    });
  } catch (error) {
    console.error('Dispense prescription error:', error);

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: Object.values(error.errors).map(e => e.message)[0] || 'بيانات غير صحيحة'
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء الصرف'
    });
  }
};


// ============================================================================
// 14. OTC DISPENSING (Over-The-Counter, no prescription)
// ============================================================================

/**
 * @route   POST /api/pharmacist/otc
 * @desc    Log a dispensing event that isn't backed by a prescription.
 *          Schema requires otcReason — we return 400 if missing.
 *          Patient is optional; if no patient provided the record is still
 *          created so the pharmacy has an inventory / sales trail.
 * @access  Private (pharmacist)
 */
exports.dispenseOTC = async (req, res) => {
  try {
    const pharmacist = await getPharmacistFromAccount(req.account);

    const {
      patientPersonId,
      patientChildId,
      medicationsDispensed,
      totalCost = 0,
      currency = 'SYP',
      paymentMethod = 'cash',
      otcReason,
      otcNotes,
      notes
    } = req.body || {};

    if (!Array.isArray(medicationsDispensed) || medicationsDispensed.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'يجب إضافة دواء واحد على الأقل'
      });
    }

    if (!otcReason || !String(otcReason).trim()) {
      return res.status(400).json({
        success: false,
        message: 'سبب الصرف بدون وصفة مطلوب'
      });
    }

    const normalizedMeds = medicationsDispensed
      .filter(m => m && m.medicationName && (m.quantityDispensed > 0))
      .map(m => ({
        medicationId: m.medicationId || undefined,
        medicationName: String(m.medicationName).trim(),
        quantityDispensed: parseInt(m.quantityDispensed, 10) || 1,
        batchNumber: m.batchNumber || undefined,
        expiryDate: m.expiryDate ? new Date(m.expiryDate) : undefined,
        unitPrice: typeof m.unitPrice === 'number' ? m.unitPrice : undefined,
        isGenericSubstitute: false,
        pharmacistNotes: m.pharmacistNotes || undefined
      }));

    if (normalizedMeds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'لا توجد أدوية صالحة للصرف'
      });
    }

    const now = new Date();
    const dispensingNumber = `DISP-${now.getFullYear()}`
      + `${String(now.getMonth() + 1).padStart(2, '0')}`
      + `${String(now.getDate()).padStart(2, '0')}`
      + `-${Math.floor(10000 + Math.random() * 90000)}`;

    // Only attach a patient reference if one was actually provided
    const patientRef = {};
    if (patientPersonId) patientRef.patientPersonId = patientPersonId;
    else if (patientChildId) patientRef.patientChildId = patientChildId;

    const dispensing = await PharmacyDispensing.create({
      dispensingNumber,
      pharmacyId: pharmacist.pharmacyId,
      pharmacistId: pharmacist._id,
      ...patientRef,
      dispensingType: 'otc',
      medicationsDispensed: normalizedMeds,
      dispensingDate: now,
      totalCost: Number(totalCost) || 0,
      currency,
      paymentMethod,
      otcReason: String(otcReason).trim(),
      otcNotes: otcNotes ? String(otcNotes).trim() : undefined,
      notes: notes || undefined
    });

    AuditLog.record({
      userId: req.account._id,
      userEmail: req.account.email,
      action: 'DISPENSE_OTC',
      description: `OTC sale: ${normalizedMeds.length} items, reason: ${otcReason}`,
      resourceType: 'pharmacy_dispensing',
      resourceId: dispensing._id,
      ipAddress: req.ip || 'unknown',
      success: true
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      message: 'تم تسجيل الصرف بدون وصفة',
      dispensing
    });
  } catch (error) {
    console.error('OTC dispensing error:', error);

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: Object.values(error.errors).map(e => e.message)[0] || 'بيانات غير صحيحة'
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء الصرف'
    });
  }
};