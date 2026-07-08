const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const prisma = new PrismaClient();

class AuthService {

  async register(data) {

    const {
      email,
      password,
      name,
      phone
    } = data;

    const existing = await prisma.user.findUnique({
      where: { email }
    });

    if (existing) {
      throw new Error("Email already registered");
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const verificationToken = crypto.randomBytes(32).toString("hex");

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        phone,
        verificationToken,
        profile: {
          create: {}
        },
        subscription: {
          create: {
            plan: "FREE",
            status: "PENDING",
            billingCycle: "monthly",
            applicationsLimit: 0
          }
        },
        usage: {
          create: {
            month: new Date().toISOString().slice(0, 7)
          }
        }
      }
    });

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "7d"
      }
    );

    return {
      token,
      user
    };
  }

  async login(email, password) {

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      throw new Error("Invalid email or password");
    }

    const valid = await bcrypt.compare(
      password,
      user.password
    );

    if (!valid) {
      throw new Error("Invalid email or password");
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "7d"
      }
    );

    return {
      token,
      user
    };
  }

  async getProfile(userId) {

    return await prisma.user.findUnique({
      where: {
        id: userId
      },
      include: {
        profile: true,
        subscription: true,
        usage: true
      }
    });

  }

}

module.exports = new AuthService();