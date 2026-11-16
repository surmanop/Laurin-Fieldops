// Export a report as an Excel workbook (.xlsx) or a printable page (Print / Save as PDF), so it can be emailed.
// report = { title, subtitle, file, sheets: [{ name, rows: [[cell, ...], ...], widths?: [chars, ...], heads?: [rowIndex, ...] }] }
// Row 0 of each sheet is its header. Rows listed in `heads` are group headings. Cells are text or numbers; '\n' breaks a line.

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---- .xlsx (a zip of XML files, stored without compression) ----
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files) {
  const enc = new TextEncoder(); const parts = []; const dir = []; let off = 0;
  const u16 = (v) => [v & 0xff, (v >>> 8) & 0xff]; const u32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  files.forEach(([name, text]) => {
    const nb = enc.encode(name), data = enc.encode(text), crc = crc32(data);
    const head = [...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nb.length), ...u16(0)];
    parts.push(new Uint8Array(head), nb, data);
    dir.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nb.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), nb);
    off += head.length + nb.length + data.length;
  });
  const size = dir.reduce((s, p) => s + p.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(size), ...u32(off), ...u16(0)]);
  return new Blob([...parts, ...dir, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
const colName = (i) => { let s = ''; i += 1; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const sheetName = (s, used) => { let n = String(s).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet'; let k = 2; while (used.has(n)) n = n.slice(0, 28) + ' ' + k++; used.add(n); return n; };

function sheetXml(sh, title, subtitle) {
  // Title and subtitle on top, then the table. Styles: 1 = bold title, 2 = bold header, 3 = wrapped text, 4 = bold group row.
  const rows = [[title], [subtitle], [], ...sh.rows];
  const top = 3; const heads = new Set((sh.heads || []).map((h) => h + top));
  const cols = Math.max(1, ...sh.rows.map((r) => r.length));
  const widths = Array.from({ length: cols }, (_, i) => sh.widths?.[i] || Math.min(60, Math.max(10, ...sh.rows.map((r) => Math.max(...String(r[i] ?? '').split('\n').map((l) => l.length))))));
  const xml = rows.map((r, ri) => {
    const st = ri === 0 ? 1 : ri === top ? 2 : heads.has(ri) ? 4 : ri > top ? 3 : 0;
    const cells = r.map((v, ci) => {
      if (v === '' || v == null) return st ? `<c r="${colName(ci)}${ri + 1}" s="${st}"/>` : '';
      const ref = `${colName(ci)}${ri + 1}"${st ? ` s="${st}"` : ''}`;
      return typeof v === 'number' && Number.isFinite(v) ? `<c r="${ref}><v>${v}</v></c>` : `<c r="${ref} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    }).join('');
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="${top + 1}" topLeftCell="A${top + 2}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w + 2}" customWidth="1"/>`).join('')}</cols><sheetData>${xml}</sheetData><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

export function downloadXlsx(report) {
  const used = new Set(); const names = report.sheets.map((s) => sheetName(s.name, used));
  const files = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE2EFE0"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD6DAD0"/></left><right style="thin"><color rgb="FFD6DAD0"/></right><top style="thin"><color rgb="FFD6DAD0"/></top><bottom style="thin"><color rgb="FFD6DAD0"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
    ...report.sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s, report.title, report.subtitle)]),
  ];
  const url = URL.createObjectURL(zip(files));
  const a = document.createElement('a'); a.href = url; a.download = report.file + '.xlsx';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ---- printable page: opens a clean copy and the print dialog; choose "Save as PDF" to get a file to email ----
export function printReport(report) {
  const w = window.open('', '_blank');
  if (!w) { alert('Allow pop-ups for this site to print or save as PDF.'); return; }
  const cell = (v) => esc(v).replace(/\n/g, '<br>');
  const body = report.sheets.map((s) => {
    const heads = new Set(s.heads || []); const [h, ...rest] = s.rows; const n = h.length;
    return `<h2>${esc(s.name)}</h2>${s.note ? `<p class="note">${esc(s.note)}</p>` : ''}<table><thead><tr>${h.map((x) => `<th>${cell(x)}</th>`).join('')}</tr></thead><tbody>${rest.map((r, i) => heads.has(i + 1) ? `<tr class="g"><td colspan="${n}">${cell(r[0])}</td></tr>` : `<tr>${Array.from({ length: n }, (_, k) => `<td>${cell(r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }).join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(report.file)}</title><style>
@page { size: landscape; margin: 12mm; }
body { font: 10pt/1.35 Arial, Helvetica, sans-serif; color: #161a15; margin: 0; }
header { border-bottom: 3px solid #38893a; padding-bottom: 6px; margin-bottom: 10px; }
h1 { font-size: 16pt; margin: 0; } .sub { color: #5d665a; margin: 2px 0 0; }
h2 { font-size: 12pt; margin: 16px 0 6px; break-after: avoid; } .note { color: #5d665a; margin: 0 0 6px; }
table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #c9cec4; padding: 4px 6px; vertical-align: top; text-align: left; }
th { background: #e2efe0; } thead { display: table-header-group; } tr { break-inside: avoid; } tr.g td { background: #f1f4ee; font-weight: bold; }
</style></head><body><header><h1>${esc(report.title)}</h1><p class="sub">${esc(report.subtitle)}</p></header>${body}</body></html>`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
}

// A Matrix screen (rows of groups x columns) as plain rows: first column is the row label, then one cell per column.
export function matrixRows(groups, cols, cellText) {
  const rows = [['Zone / Area / group', ...cols.map((c) => c.label)]]; const heads = [];
  groups.forEach((g) => {
    heads.push(rows.length); rows.push([g.title]);
    g.rows.forEach((r) => rows.push([r.t + (r.sub ? '\n' + r.sub : ''), ...cols.map((c) => (c.off ? 'Non-working' : cellText(r, c)))]));
  });
  return { rows, heads, widths: [28, ...cols.map(() => 34)] };
}
