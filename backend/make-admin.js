// make-admin.js — Run this ONCE to give yourself admin access
// Usage: node make-admin.js your@email.com
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const email = process.argv[2];
if (!email) {
  console.error('❌ Usage: node make-admin.js your@email.com');
  process.exit(1);
}

async function main() {
  const user = await prisma.user.findFirst({
    where:  { email: email.toLowerCase() },
    select: { id: true, email: true, name: true, role: true },
  });

  if (!user) {
    console.error(`❌ No user found with email: ${email}`);
    console.log('\nRegistered users:');
    const all = await prisma.user.findMany({
      select: { id: true, email: true, role: true },
    });
    all.forEach(u => console.log(`  ${u.id}. ${u.email} (${u.role})`));
    process.exit(1);
  }

  if (user.role === 'admin') {
    console.log(`ℹ️  ${email} is already an admin`);
    process.exit(0);
  }

  await prisma.user.update({
    where: { id: user.id },
    data:  { role: 'admin', updated_at: new Date() },
  });

  console.log(`✅ Success! ${email} is now an admin`);
  console.log(`\nAccess your admin panel at:`);
  console.log(`  http://127.0.0.1:5500/admin.html`);
  console.log(`\nLog in with your normal email and password.`);
}

main()
  .catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());