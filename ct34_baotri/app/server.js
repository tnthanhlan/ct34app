const express = require('express');
const session = require('express-session');
const path = require('path');

const { seedUsers, requireAuth } = require('./src/auth');
const { startCron } = require('./src/cron');

const authRoutes = require('./src/routes/auth');
const engineRoutes = require('./src/routes/engines');
const maintenanceRoutes = require('./src/routes/maintenance');
const importExportRoutes = require('./src/routes/importExport');

seedUsers();

const app = express();
const PORT = process.env.PORT || 8100;

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'changeme-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 30 } // 30 ngày
}));

app.use('/api/auth', authRoutes);
app.use('/api/engines', engineRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/data', importExportRoutes);

app.get('/api/session-check', requireAuth, (req, res) => res.json({ ok: true, user: req.session.user }));

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Middleware bắt lỗi chung - luôn trả JSON thay vì trang HTML mặc định của Express,
// để giao diện hiển thị được đúng nội dung lỗi thật thay vì "Có lỗi xảy ra".
app.use((err, req, res, next) => {
  console.error('[baotri_ct34] Loi server:', err && err.stack ? err.stack : err);
  res.status(500).json({ error: 'Loi server: ' + (err && err.message ? err.message : String(err)) });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[baotri_ct34] Server dang chay tai port ${PORT}`);
  startCron();
});
