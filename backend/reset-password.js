const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

(async () => {
  try {
    const newPassword = 'Admin123!';
    const hash = await bcrypt.hash(newPassword, 12);

    const result = await prisma.user.updateMany({
      where: { email: 'maureenwangui@ymail.com' },
      data:  { password: hash },
    });

    console.log('Rows updated:', result.count);
    console.log('New password:', newPassword);
  } catch (err) {
    console.error('❌ Failed:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();