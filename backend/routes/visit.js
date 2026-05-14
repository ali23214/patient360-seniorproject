// backend/routes/visit.js
// Visit routes with file upload support

const express = require('express');
const router = express.Router();
const Visit = require('../models/Visit');
const upload = require('../middleware/upload');
const { protect } = require('../middleware/auth');

// ==================== UPLOAD ATTACHMENT ====================
/**
 * @route   POST /api/visits/:visitId/attachments
 * @desc    Upload attachment to a visit
 * @access  Private (Doctor/Admin)
 */
router.post('/:visitId/attachments', 
  protect,
  upload.single('file'), // 'file' is the form field name
  async (req, res) => {
    try {
      const { visitId } = req.params;
      const { description } = req.body;

      // Check if file was uploaded
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'لم يتم رفع أي ملف'
        });
      }

      console.log('📤 File uploaded:', req.file.filename);

      // Find visit
      const visit = await Visit.findById(visitId);
      if (!visit) {
        return res.status(404).json({
          success: false,
          message: 'الزيارة غير موجودة'
        });
      }

      // Determine file type
      let fileType = 'document';
      if (req.file.mimetype.startsWith('image/')) {
        fileType = 'image';
      } else if (req.file.mimetype === 'application/pdf') {
        fileType = 'pdf';
      }

      // Create attachment object
      const attachment = {
        fileName: req.file.originalname,
        fileType: fileType,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        filePath: req.file.path,
        fileUrl: `/uploads/visits/${req.file.filename}`,
        description: description || '',
        uploadedBy: req.user._id,
        uploadedAt: new Date()
      };

      // Add attachment to visit
      visit.attachments.push(attachment);
      await visit.save();

      console.log('✅ Attachment added to visit');

      res.status(200).json({
        success: true,
        message: 'تم رفع الملف بنجاح',
        attachment: attachment
      });

    } catch (error) {
      console.error('❌ Upload error:', error);
      res.status(500).json({
        success: false,
        message: 'حدث خطأ أثناء رفع الملف',
        error: error.message
      });
    }
  }
);

// ==================== GET ATTACHMENTS ====================
/**
 * @route   GET /api/visits/:visitId/attachments
 * @desc    Get all attachments for a visit
 * @access  Private
 */
router.get('/:visitId/attachments', protect, async (req, res) => {
  try {
    const visit = await Visit.findById(req.params.visitId)
      .populate('attachments.uploadedBy', 'email');

    if (!visit) {
      return res.status(404).json({
        success: false,
        message: 'الزيارة غير موجودة'
      });
    }

    res.json({
      success: true,
      count: visit.attachments.length,
      attachments: visit.attachments
    });

  } catch (error) {
    console.error('❌ Get attachments error:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب المرفقات'
    });
  }
});

// ==================== DELETE ATTACHMENT ====================
/**
 * @route   DELETE /api/visits/:visitId/attachments/:attachmentId
 * @desc    Delete an attachment
 * @access  Private (Doctor/Admin)
 */
router.delete('/:visitId/attachments/:attachmentId', protect, async (req, res) => {
  try {
    const { visitId, attachmentId } = req.params;

    const visit = await Visit.findById(visitId);
    if (!visit) {
      return res.status(404).json({
        success: false,
        message: 'الزيارة غير موجودة'
      });
    }

    // Find attachment
    const attachment = visit.attachments.id(attachmentId);
    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: 'المرفق غير موجود'
      });
    }

    // Delete file from disk
    const fs = require('fs');
    if (fs.existsSync(attachment.filePath)) {
      fs.unlinkSync(attachment.filePath);
      console.log('🗑️ File deleted from disk');
    }

    // Remove from array
    visit.attachments.pull(attachmentId);
    await visit.save();

    console.log('✅ Attachment removed from visit');

    res.json({
      success: true,
      message: 'تم حذف المرفق بنجاح'
    });

  } catch (error) {
    console.error('❌ Delete attachment error:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ في حذف المرفق'
    });
  }
});

module.exports = router;
