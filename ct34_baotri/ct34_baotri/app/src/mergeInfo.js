const JSZip = require('jszip');
const fs = require('fs');

function colLetterToNum(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function decodeXmlEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

// Lấy danh sách vùng ô gộp (merge) thật của 1 sheet, đọc trực tiếp từ XML bên trong file .xlsx.
// Trả về mảng {r1,c1,r2,c2} (r1<=r2, c1<=c2, đánh số từ 1).
async function getMergedRanges(filePath, sheetName) {
  try {
    const buf = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(buf);

    const workbookXml = await zip.file('xl/workbook.xml').async('string');
    const sheetTagRegex = /<sheet\b[^>]*\/>/g;
    let sheetTagMatch;
    let rid = null;
    while ((sheetTagMatch = sheetTagRegex.exec(workbookXml))) {
      const tag = sheetTagMatch[0];
      const nameMatch = /name="([^"]*)"/.exec(tag);
      const ridMatch = /r:id="([^"]*)"/.exec(tag);
      if (!nameMatch || !ridMatch) continue;
      const name = decodeXmlEntities(nameMatch[1]);
      if (name === sheetName) { rid = ridMatch[1]; break; }
    }
    if (!rid) return [];

    const relsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    const relTagRegex = /<Relationship\b[^>]*\/>/g;
    let relTagMatch;
    let target = null;
    while ((relTagMatch = relTagRegex.exec(relsXml))) {
      const tag = relTagMatch[0];
      const idMatch = /Id="([^"]*)"/.exec(tag);
      const targetMatch = /Target="([^"]*)"/.exec(tag);
      if (idMatch && idMatch[1] === rid && targetMatch) { target = targetMatch[1]; break; }
    }
    if (!target) return [];

    const sheetPath = 'xl/' + target.replace(/^\/?xl\//, '').replace(/^\.?\//, '');
    const sheetFile = zip.file(sheetPath) || zip.file(target);
    if (!sheetFile) return [];
    const sheetXml = await sheetFile.async('string');

    const ranges = [];
    const mergeRegex = /<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\s*\/>/g;
    let mm;
    while ((mm = mergeRegex.exec(sheetXml))) {
      const c1 = colLetterToNum(mm[1]), r1 = parseInt(mm[2], 10);
      const c2 = colLetterToNum(mm[3]), r2 = parseInt(mm[4], 10);
      ranges.push({ r1: Math.min(r1, r2), c1: Math.min(c1, c2), r2: Math.max(r1, r2), c2: Math.max(c1, c2) });
    }
    return ranges;
  } catch (e) {
    return [];
  }
}

module.exports = { getMergedRanges };
