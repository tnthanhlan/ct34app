const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const { seedUsers, requireAuth } = require('./src/auth');
const { startCron } = require('./src/cron');

const authRoutes = require('./src/routes/auth');
const engineRoutes = require('./src/routes/engines');
const engineFieldRoutes = require('./src/routes/engineFields');
const maintenanceRoutes = require('./src/routes/maintenance');
const maintenanceCategoryRoutes = require('./src/routes/maintenanceCategories');
const materialRoutes = require('./src/routes/materials');
const materialFieldRoutes = require('./src/routes/materialFields');
const importExportRoutes = require('./src/routes/importExport');

seedUsers();

const app = express();
const PORT = process.env.PORT || 8100;

// Dán vào tên file css/js 1 "build id" đổi mỗi lần server khởi động (= mỗi lần update add-on),
// để bắt trình duyệt (và Cloudflare) tải lại bản mới ngay, không bị dính cache css/js cũ nữa
// (trước đây /js/app.js và /css/style.css không có tham số version nên dễ bị cache, update
// add-on xong vẫn thấy giao diện cũ cho tới khi người dùng tự xóa cache trình duyệt).
const BUILD_ID = String(Date.now());

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
app.use('/api/engine-fields', engineFieldRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/maintenance-categories', maintenanceCategoryRoutes);
app.use('/api/materials', materialRoutes);
app.use('/api/material-fields', materialFieldRoutes);
app.use('/api/data', importExportRoutes);

app.get('/api/session-check', requireAuth, (req, res) => res.json({ ok: true, user: req.session.user }));

// index: false -> không để express.static tự trả index.html (ta tự trả bên dưới để chèn BUILD_ID)
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.get('*', (req, res) => {
  let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  html = html
    .replace('href="/css/style.css"', `href="/css/style.css?v=${BUILD_ID}"`)
    .replace('src="/js/app.js"', `src="/js/app.js?v=${BUILD_ID}"`);
  res.set('Cache-Control', 'no-store'); // HTML luôn lấy bản mới nhất, để query ?v= luôn đúng BUILD_ID hiện tại
  res.type('html').send(html);
});

// Middleware bắt lỗi chung - luôn trả JSON thay vì trang HTML mặc định của Express,
// để giao diện hiển thị được đúng nội dung lỗi thật thay vì "Có lỗi xảy ra".
app.use((err, req, res, next) => {
  console.error('[baotri_ct34] Loi server:', err && err.stack ? err.stack : err);
  res.status(500).json({ error: 'Loi server: ' + (err && err.message ? err.message : String(err)) });
});

app.listen(PORT, () => {
  console.log(`[baotri_ct34] Server dang chay tai port ${PORT}`);
  startCron();
});
