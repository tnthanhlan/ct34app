const ExcelJS = require('exceljs');

// Doc danh sach ten sheet bang streaming, khong load het du lieu vao bo nho
async function listSheetNames(filePath) {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    entries: 'emit', sharedStrings: 'cache', hyperlinks: 'ignore', worksheets: 'emit',
  });
  const names = [];
  for await (const wsReader of reader) {
    names.push(wsReader.name);
    // phai duyet het cac dong cua sheet nay truoc khi sang sheet tiep theo (yeu cau cua exceljs stream)
    for await (const row of wsReader) { /* bo qua, chi lay ten */ }
  }
  return names;
}

// Doc 1 sheet cu the (theo ten, hoac sheet dau tien neu khong truyen ten) bang streaming,
// tra ve mot doi tuong "gia lap" giong API cua worksheet thong thuong (getRow/getCell/rowCount/columnCount),
// de code con lai trong app dung duoc nhu doc file binh thuong ma khong can load het vao bo nho.
// Tu dong dung som neu gap qua nhieu dong trong lien tiep (file bi keo cong thuc/dinh dang xa qua that).
async function readSheetSafely(filePath, sheetName) {
  const MAX_EMPTY_STREAK = 200;
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    entries: 'emit', sharedStrings: 'cache', hyperlinks: 'ignore', worksheets: 'emit',
  });

  for await (const wsReader of reader) {
    const isTarget = sheetName ? wsReader.name === sheetName : true;
    if (!isTarget) {
      for await (const row of wsReader) { /* bo qua sheet khong can */ }
      continue;
    }

    const rowsData = {};
    let maxRow = 0;
    let maxCol = 0;
    let emptyStreak = 0;

    for await (const row of wsReader) {
      const rowNum = row.number;
      let rowHasValue = false;
      const rowVals = {};
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        rowVals[colNumber] = cell.value;
        if (colNumber > maxCol) maxCol = colNumber;
        if (cell.value !== null && cell.value !== undefined && cell.value !== '') rowHasValue = true;
      });
      if (Object.keys(rowVals).length) rowsData[rowNum] = rowVals;
      if (rowNum > maxRow) maxRow = rowNum;

      if (rowHasValue) emptyStreak = 0;
      else emptyStreak++;
      if (emptyStreak > MAX_EMPTY_STREAK) break; // file co qua nhieu dong trong lien tiep, dung som cho an toan
    }

    return {
      name: wsReader.name,
      rowCount: maxRow,
      columnCount: maxCol,
      getRow(r) {
        const data = rowsData[r] || {};
        return {
          getCell(c) { return { value: c in data ? data[c] : null }; },
          eachCell(opts, cb) {
            const includeEmpty = opts && opts.includeEmpty;
            const maxC = includeEmpty ? maxCol : Math.max(0, ...Object.keys(data).map(Number));
            for (let c = 1; c <= maxC; c++) {
              if (c in data) cb({ value: data[c] }, c);
              else if (includeEmpty) cb({ value: null }, c);
            }
          },
        };
      },
    };
  }
  return null;
}

module.exports = { listSheetNames, readSheetSafely };
