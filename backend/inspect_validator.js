require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  console.log('MONGODB_URI from .env:', process.env.MONGODB_URI);

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to database:', mongoose.connection.db.databaseName);
  console.log('═══════════════════════════════════════════════════════════');

  // List databases on this MongoDB server
  const admin = mongoose.connection.db.admin();
  const dbs = await admin.listDatabases();
  console.log('All databases on this server:');
  dbs.databases.forEach(d => console.log('  -', d.name, `(${(d.sizeOnDisk/1024).toFixed(1)} KB)`));
  console.log('═══════════════════════════════════════════════════════════');

  // List collections in the connected database
  const cols = await mongoose.connection.db.listCollections().toArray();
  console.log(`Collections in "${mongoose.connection.db.databaseName}":`);
  if (cols.length === 0) {
    console.log('  (none — this database is empty!)');
  } else {
    cols.forEach(c => console.log('  -', c.name));
  }
  console.log('═══════════════════════════════════════════════════════════');

  // Check if emergency_reports exists in the OTHER possible database
  const otherDbName = mongoose.connection.db.databaseName === 'PATIENT360' ? 'patient360' : 'PATIENT360';
  const otherDb = mongoose.connection.client.db(otherDbName);
  const otherCols = await otherDb.listCollections().toArray();
  console.log(`Collections in "${otherDbName}" (the other one):`);
  if (otherCols.length === 0) {
    console.log('  (none)');
  } else {
    otherCols.forEach(c => console.log('  -', c.name));
  }
  console.log('═══════════════════════════════════════════════════════════');

  await mongoose.disconnect();
})();
