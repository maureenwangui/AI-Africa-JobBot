require('dotenv').config();

const bcrypt = require('bcryptjs');

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {

  const email = 'maureenwangui@ymail.com';

  const password = 'Wangui@21';

  const hashed = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({

    where: { email },

    update: {

      password: hashed,

      role: 'ADMIN',

      plan: 'PROFESSIONAL',

      subscriptionStatus: 'ACTIVE',

      updatedAt: new Date(),

    },

    create: {

      name: 'Maureen Wangui',

      email,

      password: hashed,

      role: 'ADMIN',

      plan: 'PROFESSIONAL',

      subscriptionStatus: 'ACTIVE',

    },

  });

  console.log('Admin user ready');

  console.log('Email:', user.email);

  console.log('Role:', user.role);

  console.log('Plan:', user.plan);

  console.log('Subscription:', user.subscriptionStatus);

}

main()

  .catch((err) => {

    console.error(err);

    process.exit(1);

  })

  .finally(async () => {

    await prisma.$disconnect();

  });