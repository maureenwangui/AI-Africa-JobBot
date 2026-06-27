// make-admin.js — Run this ONCE to give yourself admin access
// Usage: node make-admin.js your@email.com
require('dotenv').config();
const getDb = require('./db/connection');

const email = process.argv[2];
if (!email) {
  console.error('❌ Usage: node make-admin.js your@email.com');
  process.exit(1);
}

const db = getDb();
const user = db.prepare('SELECT id, email, name, role FROM users WHERE email = ?').get(email.toLowerCase());

if (!user) {
  console.error(`❌ No user found with email: ${email}`);
  console.log('\nRegistered users:');
  const all = db.prepare('SELECT id, email, role FROM users').all();
  all.forEach(u => console.log(`  ${u.id}. ${u.email} (${u.role})`));
  process.exit(1);
}

if (user.role === 'admin') {
  console.log(`ℹ️  ${email} is already an admin`);
  process.exit(0);
}

db.prepare("UPDATE users SET role = 'admin', updated_at = datetime('now') WHERE id = ?").run(user.id);
console.log(`✅ Success! ${email} is now an admin`);
console.log(`\nAccess your admin panel at:`);
console.log(`  http://127.0.0.1:5500/admin.html`);
console.log(`\nLog in with your normal email and password.`);