const jwt = require("jsonwebtoken");

const prisma = require('../confiq/prisma');

const auth = async (req, res, next) => {
  try {

    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "No token provided",
      });
    }

    const token = header.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: {
        id: decoded.id,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        plan: true,
        subscriptionStatus: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        error: "User not found",
      });
    }

    req.user = user;

    next();

  } catch (err) {

    console.error(err);

    return res.status(401).json({
      error: "Invalid or expired token",
    });

  }
};

const adminAuth = async (req, res, next) => {

  await auth(req, res, () => {

    const allowedRoles = ["ADMIN", "SUPER_ADMIN"];

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Admin access required",
      });
    }

    next();

  });

};

module.exports = {
  auth,
  adminAuth,
};