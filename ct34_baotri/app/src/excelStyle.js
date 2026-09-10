// Chuẩn định dạng chung cho MỌI file Excel xuất ra từ app CT34: viền đầy đủ toàn bộ ô,
// font Times New Roman cỡ 12, căn giữa nội dung. Áp dụng sau khi đã đổ hết dữ liệu vào sheet.
function applyStandardStyle(ws) {
  const colCount = ws.columns ? ws.columns.length : ws.columnCount;
  const rowCount = ws.rowCount;
  const thinBorder = { style: 'thin' };
  for (let r = 1; r <= rowCount; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Times New Roman', size: 12, bold: r === 1 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
    }
  }
}

module.exports = { applyStandardStyle };
