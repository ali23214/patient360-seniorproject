// backend/utils/sendEmail.js
// Email Service for Patient360 - Forget Password Feature

const nodemailer = require('nodemailer');

/**
 * Send email using Nodemailer
 * @param {Object} options - Email options
 * @param {string} options.email - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.message - Email HTML content
 */
const sendEmail = async (options) => {
  try {
    // Create transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });

    // Email options
    const mailOptions = {
      from: `Patient 360° <${process.env.EMAIL_USER}>`,
      to: options.email,
      subject: options.subject,
      html: options.message
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    
    console.log('✅ Email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };

  } catch (error) {
    console.error('❌ Email sending failed:', error);
    throw new Error('فشل إرسال البريد الإلكتروني');
  }
};

/**
 * Generate 6-digit OTP
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Create beautiful email template for OTP
 */
const createOTPEmailTemplate = (otp, email) => {
  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>رمز التحقق - Patient 360°</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa; direction: rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f7fa; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); overflow: hidden;">
          
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 32px; font-weight: bold;">
                🏥 Patient 360°
              </h1>
              <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">
                نظام إدارة الرعاية الصحية المتكامل
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #2d3748; margin: 0 0 20px 0; font-size: 24px; text-align: center;">
                رمز التحقق لاستعادة كلمة المرور
              </h2>
              
              <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0; text-align: center;">
                تم طلب استعادة كلمة المرور لحسابك. استخدم رمز التحقق التالي:
              </p>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 30px; display: inline-block;">
                      <p style="color: #ffffff; margin: 0 0 10px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 2px;">
                        رمز التحقق
                      </p>
                      <p style="color: #ffffff; margin: 0; font-size: 48px; font-weight: bold; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                        ${otp}
                      </p>
                    </div>
                  </td>
                </tr>
              </table>

              <div style="background-color: #fff5f5; border-right: 4px solid #f56565; padding: 16px; margin: 30px 0; border-radius: 8px;">
                <p style="color: #c53030; margin: 0; font-size: 14px;">
                  <span style="font-size: 20px; margin-left: 10px;">⏱️</span>
                  <strong>مهم:</strong> رمز التحقق صالح لمدة 10 دقائق فقط
                </p>
              </div>

              <div style="background-color: #ebf8ff; border-right: 4px solid #4299e1; padding: 16px; margin: 20px 0; border-radius: 8px;">
                <p style="color: #2c5282; margin: 0; font-size: 14px;">
                  <span style="font-size: 20px; margin-left: 10px;">🔒</span>
                  <strong>تنبيه أمني:</strong> إذا لم تطلب هذا الرمز، يرجى تجاهل هذه الرسالة
                </p>
              </div>

              <p style="color: #718096; font-size: 14px; text-align: center; margin: 30px 0 0 0;">
                تم إرسال هذا الرمز إلى:<br>
                <strong style="color: #2d3748;">${email}</strong>
              </p>
            </td>
          </tr>

          <tr>
            <td style="background-color: #f7fafc; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="color: #718096; font-size: 14px; margin: 0 0 10px 0;">
                © 2025 Patient 360° - جميع الحقوق محفوظة
              </p>
              <p style="color: #a0aec0; font-size: 12px; margin: 0;">
                هذه رسالة آلية، يرجى عدم الرد عليها
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

module.exports = {
  sendEmail,
  generateOTP,
  createOTPEmailTemplate
};
