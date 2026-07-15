// middleware/auth.js
// Fixed: uses shared prisma singleton
// Fixed: req.user exposes lowercase role/plan for downstream compatibility
const jwt    = require('jsonwebtoken');
const prisma = require('../confiq/prisma');

const auth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const token   = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where:  { id: String(decoded.id) },
      select: { id: true, email: true, name: true, phone: true, role: true, plan: true, subscriptionStatus: true },
    });
    if (!user) return res.status(401).json({ error: 'User not found' });

    req.user = {
      id:                  user.id,
      email:               user.email,
      name:                user.name,
      phone:               user.phone,
      role:                user.role.toLowerCase(),
      plan:                user.plan.toLowerCase(),
      subscription_status: user.subscriptionStatus.toLowerCase(),
      _plan:               user.plan,
      _role:               user.role,
      _subscriptionStatus: user.subscriptionStatus,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const adminAuth = async (req, res, next) => {
  await auth(req, res, () => {
    if (!['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
};

module.exports = { auth, adminAuth };