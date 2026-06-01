const bcrypt = require('bcryptjs');

async function generateHash() {
  const newPassword = 'DD@#32ssss';

  const hash = await bcrypt.hash(newPassword, 10);
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔐 New Password:', newPassword);
  console.log('🔑 New Hash:');
  console.log(hash);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n📋 Copy the hash above and paste it in MongoDB Compass');
  console.log('   in the "password" field for your account.\n');
}

generateHash();