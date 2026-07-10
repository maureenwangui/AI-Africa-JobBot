// confiq/prisma.js — Prisma Client with connection pooling
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  // Only log errors in production — query logging adds latency
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// Connection pool — keeps connections alive between requests
// instead of opening a new connection every time
prisma.$connect()
  .then(() => console.log('✅ Connected to PostgreSQL via Prisma'))
  .catch(err => console.error('❌ Database connection failed:', err.message));

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

module.exports = prisma;