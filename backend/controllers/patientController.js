const patientService = require('../services/patientService');

/**
 * Patient Controller
 * Handles HTTP requests for patient operations
 */

/**
 * @route   GET /api/patient/profile
 * @desc    Get complete patient profile
 * @access  Private (Patient only)
 */
exports.getProfile = async (req, res) => {
  try {
    const patientId = req.user.patientId;

    const result = await patientService.getPatientProfile(patientId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Error in getProfile controller:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء جلب بيانات المريض'
    });
  }
};

/**
 * @route   PUT /api/patient/profile
 * @desc    Update patient profile (limited fields)
 * @access  Private (Patient only)
 */
exports.updateProfile = async (req, res) => {
  try {
    const patientId = req.user.patientId;
    const updates = req.body;

    const result = await patientService.updatePatientProfile(patientId, updates);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Error in updateProfile controller:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء تحديث بيانات المريض'
    });
  }
};

/**
 * @route   GET /api/patient/medical-history
 * @desc    Get medical history summary
 * @access  Private (Patient only)
 */
exports.getMedicalHistory = async (req, res) => {
  try {
    const patientId = req.user.patientId;

    const result = await patientService.getMedicalHistory(patientId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Error in getMedicalHistory controller:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء جلب التاريخ الطبي'
    });
  }
};