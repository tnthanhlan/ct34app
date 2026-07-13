// Chay 1 lan duy nhat truoc khi khoi dong server (hoac bat cu luc nao can them/reset tai khoan):
//   node seed.js
// Script se hoi ban nhap mat khau that cho 2 tai khoan Admin va User, luu dang hash (bcrypt),
// khong bao gio luu mat khau dang chu thuong.
const readline = require('readline');
const { getDb, persist } = require('./db');
const { hashPassword } = require('./auth');

const ADMIN_EMAIL = 'tnthanhlan@gmail.com';
const USER_EMAIL = 'doisuachuact34@gmail.com';

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, answer => resolve(answer)));
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('=== Tạo / cập nhật tài khoản đăng nhập ===');
  console.log('Mật khẩu sẽ không hiển thị lại, chỉ lưu dạng mã hoá (bcrypt).\n');

  const adminPass = await ask(rl, `Mật khẩu cho Admin (${ADMIN_EMAIL}): `);
  const userPass = await ask(rl, `Mật khẩu cho User (${USER_EMAIL}): `);
  rl.close();

  if (!adminPass || adminPass.length < 6 || !userPass || userPass.length < 6) {
    console.error('\nMật khẩu cần tối thiểu 6 ký tự. Chạy lại "node seed.js" để nhập lại.');
    process.exit(1);
  }

  const db = getDb();
  db.users = db.users.filter(u => u.email !== ADMIN_EMAIL && u.email !== USER_EMAIL);
  db.users.push({ email: ADMIN_EMAIL, passwordHash: hashPassword(adminPass), role: 'admin' });
  db.users.push({ email: USER_EMAIL, passwordHash: hashPassword(userPass), role: 'user' });
  persist();

  console.log('\n✓ Đã tạo/cập nhật xong 2 tài khoản. Giờ chạy "npm start" để khởi động server.');
}

main();
