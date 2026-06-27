const bcrypt = require('bcryptjs');
const getDb = require('./db/connection');

(async () => {
  const db = getDb();

  const newPassword = 'Admin123!';
  const hash = await bcrypt.hash(newPassword, 12);

  const result = db.prepare(
    "UPDATE users SET password = ? WHERE email = ?"
  ).run(hash, 'maureenwangui@ymail.com');

  console.log('Rows updated:', result.changes);
  console.log('New password:', newPassword);
})();