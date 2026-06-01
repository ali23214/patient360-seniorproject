// backend/utils/fileUpload.js
const path = require('path');
const fs = require('fs').promises;

/**
 * File Upload Manager for Patient360
 * Organizes uploads by: Type / Year / Month / Patient ID
 */

class FileUploadManager {
  
  /**
   * Generate organized file path
   * @param {String} uploadType - 'visit', 'ecg', 'doctor-request'
   * @param {String} patientId - Patient national ID or child ID
   * @param {String} originalFilename - Original uploaded filename
   * @returns {Object} { fullPath, relativePath, filename, directory }
   */
  static generateFilePath(uploadType, patientId, originalFilename) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    
    // Create timestamp: 2024-01-20T10-30-45
    const timestamp = now.toISOString()
      .replace(/[:.]/g, '-')
      .split('.')[0];
    
    // Random suffix: abc12345
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    
    // Extract file extension
    const ext = path.extname(originalFilename); // .jpg
    
    // Create unique filename
    const filename = `${uploadType}_${timestamp}_${randomSuffix}${ext}`;
    // Result: visit_2024-01-20T10-30-45_abc12345.jpg
    
    // Build directory structure
    const directory = path.join(
      'uploads',
      uploadType + 's', // visits, ecgs, doctor-requests
      String(year),
      month,
      `patient_${patientId}`
    );
    // Result: uploads/visits/2024/01/patient_12345678901
    
    const fullPath = path.join(directory, filename);
    const relativePath = fullPath.replace(/\\/g, '/'); // Windows compatibility
    
    return {
      fullPath,
      relativePath,
      filename,
      directory
    };
  }

  /**
   * Create directory if doesn't exist
   * @param {String} directory - Directory path
   */
  static async ensureDirectory(directory) {
    try {
      await fs.access(directory);
    } catch {
      // Directory doesn't exist, create it recursively
      await fs.mkdir(directory, { recursive: true });
      console.log('✅ Created directory:', directory);
    }
  }

  /**
   * Generate organized path for doctor request files
   * @param {String} requestId - Doctor request ID
   * @param {String} fieldName - 'medicalCertificate', 'licenseDocument', 'profilePhoto'
   * @param {String} originalFilename - Original filename
   */
  static generateDoctorRequestPath(requestId, fieldName, originalFilename) {
    const ext = path.extname(originalFilename);
    const timestamp = Date.now();
    
    const filename = `${fieldName}_${timestamp}${ext}`;
    
    const directory = path.join(
      'uploads',
      'doctor-requests',
      'pending',
      `request_${requestId}`
    );
    
    const fullPath = path.join(directory, filename);
    
    return {
      fullPath,
      relativePath: fullPath.replace(/\\/g, '/'),
      filename,
      directory
    };
  }

  /**
   * Move doctor request files from pending to approved
   * @param {String} requestId - Request ID
   * @param {String} doctorNationalId - Approved doctor national ID
   */
  static async moveDoctorRequestToApproved(requestId, doctorNationalId) {
    const pendingDir = path.join(
      'uploads', 
      'doctor-requests', 
      'pending', 
      `request_${requestId}`
    );
    
    const approvedDir = path.join(
      'uploads', 
      'doctor-requests', 
      'approved', 
      `doctor_${doctorNationalId}`
    );
    
    try {
      // Create approved directory
      await this.ensureDirectory(approvedDir);
      
      // Get all files in pending directory
      const files = await fs.readdir(pendingDir);
      
      // Move each file
      for (const file of files) {
        const oldPath = path.join(pendingDir, file);
        const newPath = path.join(approvedDir, file);
        await fs.rename(oldPath, newPath);
        console.log(`✅ Moved: ${file}`);
      }
      
      // Delete pending directory
      await fs.rmdir(pendingDir);
      console.log(`✅ Deleted pending directory: ${pendingDir}`);
      
      return approvedDir;
      
    } catch (error) {
      console.error('❌ Error moving doctor request files:', error);
      throw error;
    }
  }
}

module.exports = FileUploadManager;