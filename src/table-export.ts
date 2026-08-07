// Client-side .xlsx export — the sheet DataGrid hands its rows to, and usable on
// its own by any web bundle. No dependency on a host app: the caller passes
// generic (baseName, sheetName, headers, rows) and gets a real workbook.
//
// Builds a real OOXML workbook (not CSV renamed): a store-only ZIP with the
// minimal SpreadsheetML part set. Strings are written as inline strings,
// finite numbers as native numeric cells, so Excel / LibreOffice / Numbers
// open the file without conversion warnings. No third-party libraries.

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';

const CONTENT_TYPES = XML_DECL
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    + '</Types>';

const ROOT_RELS = XML_DECL
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + '</Relationships>';

const WORKBOOK_RELS = XML_DECL
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
    + '</Relationships>';

function workbookXml(sheetName: string): string {
    return XML_DECL
        + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + `<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>`
        + '</workbook>';
}

function escapeXml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 0 -> "A", 25 -> "Z", 26 -> "AA", ...
function colRef(i: number): string {
    let ref = '';
    for (let n = i; n >= 0; n = Math.floor(n / 26) - 1)
        ref = String.fromCharCode(65 + (n % 26)) + ref;
    return ref;
}

function cellXml(ref: string, value: unknown): string {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'number' && isFinite(value))
        return `<c r="${ref}"><v>${value}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
}

function sheetXml(headers: string[], rows: unknown[][]): string {
    let xml = XML_DECL
        + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
    const all: unknown[][] = [headers, ...rows];
    for (let r = 0; r < all.length; r++) {
        xml += `<row r="${r + 1}">`;
        for (let c = 0; c < all[r].length; c++)
            xml += cellXml(colRef(c) + (r + 1), all[r][c]);
        xml += '</row>';
    }
    return xml + '</sheetData></worksheet>';
}

// --- store-only ZIP writer -------------------------------------------------

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++)
            c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(data: Uint8Array): number {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++)
        crc = CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function zip(entries: { name: string; text: string }[]): Blob {
    const encoder = new TextEncoder();
    const parts: Uint8Array[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;

    for (const entry of entries) {
        const name = encoder.encode(entry.name);
        const data = encoder.encode(entry.text);
        const crc = crc32(data);

        const local = new Uint8Array(30 + name.length);
        const lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true);   // local file header signature
        lv.setUint16(4, 20, true);           // version needed
        lv.setUint32(14, crc, true);
        lv.setUint32(18, data.length, true); // compressed (stored) size
        lv.setUint32(22, data.length, true); // uncompressed size
        lv.setUint16(26, name.length, true);
        local.set(name, 30);
        parts.push(local, data);

        const dir = new Uint8Array(46 + name.length);
        const dv = new DataView(dir.buffer);
        dv.setUint32(0, 0x02014b50, true);   // central directory signature
        dv.setUint16(4, 20, true);           // version made by
        dv.setUint16(6, 20, true);           // version needed
        dv.setUint32(16, crc, true);
        dv.setUint32(20, data.length, true);
        dv.setUint32(24, data.length, true);
        dv.setUint16(28, name.length, true);
        dv.setUint32(42, offset, true);      // local header offset
        dir.set(name, 46);
        central.push(dir);

        offset += local.length + data.length;
    }

    const dirSize = central.reduce((sum, d) => sum + d.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);       // end of central directory
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, dirSize, true);
    ev.setUint32(16, offset, true);

    return new Blob([...parts, ...central, eocd] as BlobPart[], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
}

// --- public API ------------------------------------------------------------

export const TableExport = {
    /**
     * Build the workbook and trigger a browser download as
     * `<baseName>-YYYYMMDD-HHMMSS.xlsx`. Rows are exported exactly as the
     * caller passes them (i.e. in the currently rendered/sorted order).
     */
    download(baseName: string, sheetName: string, headers: string[], rows: unknown[][]): void {
        // Sheet names are capped at 31 chars and reject []:*?/\ — sanitize
        // localized captions so a long/exotic translation can't corrupt the file.
        const safeSheet = (sheetName || '').replace(/[\[\]:*?/\\]/g, ' ').slice(0, 31).trim() || 'Sheet1';
        const blob = zip([
            { name: '[Content_Types].xml', text: CONTENT_TYPES },
            { name: '_rels/.rels', text: ROOT_RELS },
            { name: 'xl/workbook.xml', text: workbookXml(safeSheet) },
            { name: 'xl/_rels/workbook.xml.rels', text: WORKBOOK_RELS },
            { name: 'xl/worksheets/sheet1.xml', text: sheetXml(headers, rows) },
        ]);
        const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${baseName}-${stamp}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    },
};
