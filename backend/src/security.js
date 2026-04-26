const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const PASSWORD_ROUNDS = 12;

function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

async function hashPassword(password) {
  return bcrypt.hash(String(password || ""), PASSWORD_ROUNDS);
}

async function verifyPassword(password, passwordHash) {
  if (!passwordHash) {
    return false;
  }
  return bcrypt.compare(String(password || ""), passwordHash);
}

module.exports = {
  makeToken,
  hashToken,
  hashPassword,
  verifyPassword,
};
