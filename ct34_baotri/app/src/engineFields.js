const db = require('./db');

function getEngineFields() {
  return db.prepare('SELECT * FROM engine_fields ORDER BY sort_order ASC, id ASC').all();
}

function parseData(dataJson) {
  try { return JSON.parse(dataJson || '{}'); } catch (e) { return {}; }
}

function engineToObject(row) {
  return {
    id: row.id,
    ma_thiet_bi: row.ma_thiet_bi,
    ...parseData(row.data_json),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Lấy 1 giá trị đại diện (để hiển thị làm "tên gọi") từ dữ liệu động cơ.
// Ưu tiên trường admin đã đánh dấu "dùng làm tên hiển thị"; nếu trường đó rỗng
// hoặc chưa đánh dấu trường nào, dùng giá trị khác rỗng đầu tiên theo thứ tự.
function displayLabel(dataJson) {
  const fields = getEngineFields();
  const data = parseData(dataJson);

  const primary = fields.find(f => f.is_display_name);
  if (primary) {
    const v = data[primary.field_key];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }

  for (const f of fields) {
    const v = data[f.field_key];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function slugifyFieldKey(label) {
  let s = String(label).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/[đĐ]/g, 'd');
  s = s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!s) s = 'truong';
  return s;
}

module.exports = { getEngineFields, parseData, engineToObject, displayLabel, slugifyFieldKey };
