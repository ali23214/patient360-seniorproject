require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { Account } = require('./models');

(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/PATIENT360');
  console.log('✅ Connected to DB');

  const email = 'amr@gmail.com';
  const password = 'Mmm@2026';

  // Test 1: Raw findOne (NO select)
  const acc1 = await Account.findOne({ email });
  console.log('\n--- TEST 1: findOne without select ---');
  console.log('Has password field?', !!acc1?.password);
  console.log('Password value:', acc1?.password);

  // Test 2: findForLogin (WITH select +password)
  const acc2 = await Account.findForLogin(email);
  console.log('\n--- TEST 2: findForLogin ---');
  console.log('Has password field?', !!acc2?.password);
  console.log('Password (first 20 chars):', acc2?.password?.substring(0, 20));
  console.log('Password (full length):', acc2?.password?.length);

  // Test 3: Direct bcrypt compare
  if (acc2?.password) {
    const matchDirect = await bcrypt.compare(password, acc2.password);
    console.log('\n--- TEST 3: bcrypt.compare directly ---');
    console.log('Match:', matchDirect);
  }

  // Test 4: comparePassword method
  if (acc2) {
    try {
      const matchMethod = await acc2.comparePassword(password);
      console.log('\n--- TEST 4: comparePassword method ---');
      console.log('Match:', matchMethod);
    } catch (err) {
      console.log('\n--- TEST 4: comparePassword ERROR ---');
      console.log(err.message);
    }
  }

  // Test 5: Raw MongoDB query (bypass Mongoose entirely)
  const rawDoc = await mongoose.connection.db.collection('accounts').findOne(
    { email: 'amr@gmail.com' }
  );
  console.log('\n--- TEST 5: Raw MongoDB query ---');
  console.log('Raw password:', rawDoc?.password);
  console.log('Raw length:', rawDoc?.password?.length);

  if (rawDoc?.password) {
    const matchRaw = await bcrypt.compare(password, rawDoc.password);
    console.log('Match (raw):', matchRaw);
  }

  await mongoose.disconnect();
  process.exit(0);
})();
