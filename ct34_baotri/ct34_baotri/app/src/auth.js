const bcrypt = require('bcryptjs');
const db = require('./db');

function seedUsers() {
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'changeme';
  const userEmail = (process.env.USER_EMAIL || '').trim().toLowerCase();
  const userPassword = process.env.USER_PASSWORD || 'changeme';

  const upsert = db.prepare(`
    INSERT INTO users (email, password_hash, role)
    VALUES (?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, role = excluded.role
  `);

  if (adminEmail) {
    upsert.run(adminEmail, bcrypt.hashSync(adminPassword, 10), 'admin');
  }
  if (userEmail) {
    upsert.run(userEmail, bcrypt.hashSync(userPassword, 10), 'user');
  }
}

function findUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').trim().toLowerCase());
}

function verifyPassword(user, password) {
  if (!user) return false;
  return bcrypt.compareSync(password, user.password_hash);
}

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'Chưa đăng nhập' });
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  return res.status(403).json({ error: 'Chỉ admin mới thực hiện được thao tác này' });
}

module.exports = { seedUsers, findUserByEmail, verifyPassword, requireAuth, requireAdmin };
