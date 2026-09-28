const express = require('express');
const { findUserByEmail, verifyPassword } = require('../auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = findUserByEmail(email);
  if (!verifyPassword(user, password)) {
    return res.status(401).json({ error: 'Sai email hoặc mật khẩu' });
  }
  req.session.user = { id: user.id, email: user.email, role: user.role };
  res.json({ ok: true, user: req.session.user });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

module.exports = router;
