const db = require('./db');

function getMaterialFields() {
  return db.prepare('SELECT * FROM material_fields ORDER BY sort_order ASC, id ASC').all();
}

function parseMaterialData(dataJson) {
  try { return JSON.parse(dataJson || '{}'); } catch (e) { return {}; }
}

function materialToObject(row) {
  return {
    id: row.id,
    name: row.name,
    ...parseMaterialData(row.data_json),
    sort_order: row.sort_order,
    created_at: row.created_at,
  };
}

function slugifyFieldKey(label) {
  let s = String(label).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/[đĐ]/g, 'd');
  s = s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!s) s = 'truong';
  return s;
}

module.exports = { getMaterialFields, parseMaterialData, materialToObject, slugifyFieldKey };
