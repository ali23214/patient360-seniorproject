const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

exports.simpleSignup = async (req, res) => {
  try {
    console.log('========================================');
    console.log('🔵 Simple Signup Started');
    console.log('📦 Body:', JSON.stringify(req.body, null, 2));
    console.log('========================================');

    const {
      nationalId, firstName, lastName, dateOfBirth, gender, phoneNumber, address,
      email, password,
      bloodType, height, weight, smokingStatus, allergies, chronicDiseases, familyHistory,
      emergencyContactName, emergencyContactRelationship, emergencyContactPhone
    } = req.body;

    // التحقق من الحقول المطلوبة
    if (!nationalId || !firstName || !lastName || !dateOfBirth || !gender || !phoneNumber || !email || !password) {
      console.log('❌ Missing required fields');
      return res.status(400).json({
        success: false,
        message: 'جميع الحقول المطلوبة يجب أن تكون موجودة'
      });
    }

    if (!emergencyContactName || !emergencyContactRelationship || !emergencyContactPhone) {
      console.log('❌ Missing emergency contact');
      return res.status(400).json({
        success: false,
        message: 'معلومات جهة الاتصال للطوارئ مطلوبة'
      });
    }

    console.log('✅ All required fields present');

    // التحقق من التكرار
    console.log('🔍 Checking for duplicates...');
    
    const existingPerson = await mongoose.connection.db.collection('persons').findOne({ nationalId });
    if (existingPerson) {
      console.log('❌ National ID already exists');
      return res.status(400).json({
        success: false,
        message: 'رقم الهوية الوطنية مستخدم بالفعل'
      });
    }

    const existingAccount = await mongoose.connection.db.collection('accounts').findOne({ 
      email: email.toLowerCase() 
    });
    if (existingAccount) {
      console.log('❌ Email already exists');
      return res.status(400).json({
        success: false,
        message: 'البريد الإلكتروني مستخدم بالفعل'
      });
    }

    console.log('✅ No duplicates found');

    // تشفير كلمة المرور
    console.log('🔐 Hashing password...');
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('✅ Password hashed');

    // إدخال Person
    console.log('📝 Inserting Person...');
    const personResult = await mongoose.connection.db.collection('persons').insertOne({
      nationalId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      dateOfBirth: new Date(dateOfBirth),
      gender,
      phoneNumber: phoneNumber.replace(/\s/g, ''),
      address: address ? address.trim() : '',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log('✅ Person inserted:', personResult.insertedId);

    // إدخال Account
    console.log('📝 Inserting Account...');
    const accountResult = await mongoose.connection.db.collection('accounts').insertOne({
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      roles: ['patient'],
      personId: personResult.insertedId,
      isActive: true,
      lastLogin: null,
      loginAttempts: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log('✅ Account inserted:', accountResult.insertedId);

    // إدخال Patient
    console.log('📝 Inserting Patient...');
    const patientData = {
      personId: personResult.insertedId,
      emergencyContact: {
        name: emergencyContactName.trim(),
        relationship: emergencyContactRelationship.trim(),
        phoneNumber: emergencyContactPhone.replace(/\s/g, '')
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    if (bloodType) patientData.bloodType = bloodType;
    if (height) patientData.height = parseFloat(height);
    if (weight) patientData.weight = parseFloat(weight);
    if (smokingStatus) patientData.smokingStatus = smokingStatus;
    if (allergies && allergies.trim()) {
      patientData.allergies = allergies.split(',').map(a => a.trim()).filter(a => a);
    }
    if (chronicDiseases && chronicDiseases.trim()) {
      patientData.chronicDiseases = chronicDiseases.split(',').map(c => c.trim()).filter(c => c);
    }
    if (familyHistory && familyHistory.trim()) {
      patientData.familyHistory = familyHistory.split(',').map(f => f.trim()).filter(f => f);
    }

    const patientResult = await mongoose.connection.db.collection('patients').insertOne(patientData);
    console.log('✅ Patient inserted:', patientResult.insertedId);

    console.log('========================================');
    console.log('🎉 SUCCESS - All data saved!');
    console.log('========================================');

    res.status(201).json({
      success: true,
      message: 'تم إنشاء الحساب بنجاح!',
      data: {
        personId: personResult.insertedId.toString(),
        accountId: accountResult.insertedId.toString(),
        patientId: patientResult.insertedId.toString(),
        email: email.toLowerCase()
      }
    });

  } catch (error) {
    console.error('========================================');
    console.error('❌ ERROR:');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    console.error('========================================');

    res.status(500).json({
      success: false,
      message: 'حدث خطأ: ' + error.message
    });
  }
};