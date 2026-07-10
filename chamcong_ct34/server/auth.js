const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('Thiếu biến môi trường JWT_SECRET. Đặt 1 chuỗi bí mật dài, ngẫu nhiên trước khi chạy server.');
}
const COOKIE_NAME = 'cc_session';
const TOKEN_TTL = '30d';

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}
function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}
function issueToken(user) {
  return jwt.sign({ email: user.email, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}
function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,      // yeu cau HTTPS - dung qua Cloudflare Tunnel la co san HTTPS
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
}
function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME);
}
function readSession(req) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

function requireAuth(req, res, next) {
  const session = readSession(req);
  if (!session) return res.status(401).json({ error: 'Chưa đăng nhập.' });
  req.user = session;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Chỉ Admin mới được thực hiện thao tác này.' });
  }
  next();
}

module.exports = {
  hashPassword, verifyPassword, issueToken,
  setSessionCookie, clearSessionCookie, readSession,
  requireAuth, requireAdmin, COOKIE_NAME
};
