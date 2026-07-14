const ExcelJS = require('exceljs');

const MAX_EMPTY_STREAK = 60;   // gap qua 60 dong trong lien tiep (sau khi da co du lieu) thi dung doc
const HARD_ROW_LIMIT = 50000;  // gioi han tuyet doi, phong truong hop du lieu thuc su rat dai

// Kiem tra 1 gia tri co "thuc su" chua noi dung hay khong - bo qua truong hop cong thuc
// co ket qua rong/blank (rat hay gap khi cong thuc duoc keo dai het toan bo sheet).
function hasMeaningfulValue(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.some(r => r.text && String(r.text).trim());
    if (v.result !== undefined) return hasMeaningfulValue(v.result);
    if (v.text !== undefined) return hasMeaningfulValue(v.text);
    if (v instanceof Date) return true;
    return false;
  }
  return String(v).trim() !== '';
}

function rowHasMeaningfulValue(row) {
  let found = false;
  row.eachCell({ includeEmpty: false }, (cell) => {
    if (!found && hasMeaningfulValue(cell.value)) found = true;
  });
  return found;
}

// Doc TOAN BO cac sheet trong file, tra ve danh sach ten sheet (khong giu du lieu, chi de liet ke).
async function listSheetNames(filePath) {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    entries: 'emit', sharedStrings: 'cache', hyperlinks: 'ignore', worksheets: 'emit',
  });
  const names = [];
  for await (const wsReader of reader) {
    names.push(wsReader.name);
    // Doc luot qua nhanh, dung som ngay khi gap nhieu dong trong lien tiep,
    // tranh ton thoi gian/bo nho voi sheet co dinh dang tran lan hang trieu dong.
    let emptyStreak = 0;
    let sawAny = false;
    for await (const row of wsReader) {
      const hasValue = rowHasMeaningfulValue(row);
      if (hasValue) { sawAny = true; emptyStreak = 0; } else { emptyStreak++; }
      if (sawAny && emptyStreak > MAX_EMPTY_STREAK) break;
      if (row.number > HARD_ROW_LIMIT) break;
    }
  }
  return names;
}

// Doc 1 sheet cu the (theo ten), tra ve 1 "shim" co cung API toi thieu voi Worksheet cua exceljs
// (getRow().getCell().value, getRow().eachCell(), rowCount, columnCount) de dung lai duoc
// toan bo logic buildHeaders/cellText/... da viet san, khong can sua gi them o noi khac.
async function readSheetSafely(filePath, sheetName) {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    entries: 'emit', sharedStrings: 'cache', hyperlinks: 'ignore', worksheets: 'emit',
  });

  const rowsData = [];
  let maxCol = 0;
  let lastNonEmptyRow = 0;
  let foundSheet = false;
  let actualName = null;

  for await (const wsReader of reader) {
    const isTarget = sheetName ? wsReader.name === sheetName : !foundSheet;
    if (!isTarget) {
      // Khong phai sheet can doc: luot qua that nhanh, dung som, khong luu gi ca.
      let emptyStreak = 0;
      let sawAny = false;
      for await (const row of wsReader) {
        const hasValue = rowHasMeaningfulValue(row);
        if (hasValue) { sawAny = true; emptyStreak = 0; } else { emptyStreak++; }
        if (sawAny && emptyStreak > MAX_EMPTY_STREAK) break;
        if (row.number > HARD_ROW_LIMIT) break;
      }
      continue;
    }

    foundSheet = true;
    actualName = wsReader.name;
    let emptyStreak = 0;

    for await (const row of wsReader) {
      if (row.number > HARD_ROW_LIMIT) break;
      const rowObj = {};
      let hasValue = false;
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        rowObj[colNumber] = cell.value;
        if (colNumber > maxCol) maxCol = colNumber;
        if (hasMeaningfulValue(cell.value)) hasValue = true;
      });
      if (hasValue) {
        rowsData[row.number] = rowObj;
        lastNonEmptyRow = row.number;
        emptyStreak = 0;
      } else {
        emptyStreak++;
        if (lastNonEmptyRow > 0 && emptyStreak > MAX_EMPTY_STREAK) break;
      }
    }
    break; // da xong sheet muc tieu, khong can doc tiep cac sheet con lai
  }

  if (!foundSheet) return null;

  const shim = {
    name: actualName,
    rowCount: lastNonEmptyRow,
    columnCount: maxCol,
    getRow(r) {
      const data = rowsData[r] || {};
      return {
        getCell(c) { return { value: c in data ? data[c] : null }; },
        eachCell(opts, cb) {
          Object.keys(data).forEach(c => cb({ value: data[c] }, Number(c)));
        },
      };
    },
  };
  return shim;
}

module.exports = { listSheetNames, readSheetSafely };
