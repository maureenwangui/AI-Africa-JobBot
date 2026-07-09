require('dotenv').config();

const bcrypt = require('bcryptjs');

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {

const hashed = await bcrypt.hash('Wangui@21', 12);

await prisma.user.update({

where: { email: '[maureenwangui@ymail.com](mailto:maureenwangui@ymail.com)' },

data: {

password: hashed,

role: 'ADMIN',

},

});

console.log('Password reset successful');

}

main()

.catch(console.error)

.finally(() => prisma.$disconnect());
