const bcrypt = require('bcryptjs');

const hashFromDB = '$2b$12$T9lFA7rZvvUcEYBufvLrPuXODfBkscIHsBxQ8LWYUiIvTG/qKlFz.';
const password = 'Mmm@2026';

bcrypt.compare(password, hashFromDB).then(match => {
  console.log('Password matches hash:', match);
  if (!match) {
    console.log('🔴 الـ hash لا يطابق الكلمة. سنعمل hash جديد:');
    bcrypt.hash(password, 12).then(newHash => {
      console.log('NEW HASH:', newHash);
    });
  } else {
    console.log('🟢 الـ hash صحيح — المشكلة في مكان آخر.');
  }
});
