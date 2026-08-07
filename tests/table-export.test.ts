// Unit coverage for TableExport — the dependency-free .xlsx writer.
//
// This is the package's most unforgiving code: a hand-rolled CRC32, a store-only
// ZIP laid out by byte offset, and SpreadsheetML built by string concatenation.
// Every one of those fails the same way — a file that downloads happily and then
// will not open — so the assertions here are about the bytes, not about whether
// the call returned.
//
// The archive is read back the way an unzipper reads one: end-of-central-
// directory, then the directory, then the local header each entry points at. That
// is deliberately the opposite direction from the way the writer lays it out, so
// an offset the writer computes wrongly cannot also be read back wrongly.
//
// The CRCs are checked against node's zlib, an implementation this package shares
// nothing with, and that reference is itself pinned to the standard vector below.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { crc32 } from 'node:zlib';

import { TableExport } from '../src/table-export';
import { FakeElement, fakeDocument, installFakeDocument } from './fake-dom';

installFakeDocument();

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;

/// The parts a workbook is made of, in the order the writer emits them.
const PART_NAMES = [
    '[Content_Types].xml',
    '_rels/.rels',
    'xl/workbook.xml',
    'xl/_rels/workbook.xml.rels',
    'xl/worksheets/sheet1.xml',
];

// --- running the export ----------------------------------------------------

interface Download {
    bytes: Uint8Array;
    anchor: FakeElement;
}

/// Runs a download and hands back the workbook it would have handed the browser.
/// `URL.createObjectURL` is where the blob leaves the library, so that is where
/// the test picks it up.
async function download(sheetName: string, headers: string[], rows: unknown[][]): Promise<Download> {
    const blobs: Blob[] = [];
    const anchors: FakeElement[] = [];

    const realCreateObjectURL = URL.createObjectURL;
    const realRevokeObjectURL = URL.revokeObjectURL;
    const realCreateElement = fakeDocument.createElement;
    const realSetTimeout = globalThis.setTimeout;

    URL.createObjectURL = (blob: Blob | MediaSource): string => { blobs.push(blob as Blob); return 'blob:workbook'; };
    URL.revokeObjectURL = (): void => {};
    fakeDocument.createElement = (tag: string): FakeElement => {
        const el = realCreateElement(tag);
        if (tag === 'a') anchors.push(el);
        return el;
    };
    // The library schedules the revoke five seconds out. There is no object URL to
    // revoke in this process, and a live timer would hold the test runner open for
    // those five seconds, so the schedule is swallowed for the duration of the call.
    globalThis.setTimeout = ((): number => 0) as unknown as typeof globalThis.setTimeout;

    try {
        TableExport.download('orders', sheetName, headers, rows);
    } finally {
        URL.createObjectURL = realCreateObjectURL;
        URL.revokeObjectURL = realRevokeObjectURL;
        fakeDocument.createElement = realCreateElement;
        globalThis.setTimeout = realSetTimeout;
    }

    assert.equal(blobs.length, 1, 'the export produced exactly one workbook');
    assert.equal(anchors.length, 1, 'the export built exactly one anchor');
    return { bytes: new Uint8Array(await blobs[0].arrayBuffer()), anchor: anchors[0] };
}

/// A one-row sheet, which is all most of these assertions need.
function sheetOf(bytes: Uint8Array): string {
    return partText(bytes, 'xl/worksheets/sheet1.xml');
}

// --- reading the archive back ----------------------------------------------

interface ZipRecord {
    name: string;
    crc: number;
    compressedSize: number;
    size: number;
}

interface ZipEntry {
    name: string;
    local: ZipRecord;
    central: ZipRecord;
    localOffset: number;
    data: Uint8Array;
}

function readZip(bytes: Uint8Array): ZipEntry[] {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const decoder = new TextDecoder();

    // The writer emits no archive comment, so the record sits at a fixed distance
    // from the end and needs no backwards scan.
    const eocdAt = bytes.length - 22;
    assert.equal(view.getUint32(eocdAt, true), EOCD_SIGNATURE, 'end of central directory signature');
    const count = view.getUint16(eocdAt + 10, true);
    const directorySize = view.getUint32(eocdAt + 12, true);
    const directoryOffset = view.getUint32(eocdAt + 16, true);
    assert.equal(directoryOffset + directorySize, eocdAt, 'the directory ends where the EOCD begins');

    const entries: ZipEntry[] = [];
    let at = directoryOffset;
    for (let i = 0; i < count; i++) {
        assert.equal(view.getUint32(at, true), CENTRAL_SIGNATURE, `central directory signature of entry ${i}`);
        const nameLength = view.getUint16(at + 28, true);
        const extraLength = view.getUint16(at + 30, true);
        const commentLength = view.getUint16(at + 32, true);
        const central: ZipRecord = {
            name: decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength)),
            crc: view.getUint32(at + 16, true),
            compressedSize: view.getUint32(at + 20, true),
            size: view.getUint32(at + 24, true),
        };
        const localOffset = view.getUint32(at + 42, true);

        assert.equal(view.getUint32(localOffset, true), LOCAL_SIGNATURE, `local header signature of ${central.name}`);
        const localNameLength = view.getUint16(localOffset + 26, true);
        const localExtraLength = view.getUint16(localOffset + 28, true);
        const local: ZipRecord = {
            name: decoder.decode(bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength)),
            crc: view.getUint32(localOffset + 14, true),
            compressedSize: view.getUint32(localOffset + 18, true),
            size: view.getUint32(localOffset + 22, true),
        };
        const dataAt = localOffset + 30 + localNameLength + localExtraLength;

        entries.push({
            name: central.name,
            local,
            central,
            localOffset,
            data: bytes.subarray(dataAt, dataAt + local.compressedSize),
        });
        at += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
}

function partText(bytes: Uint8Array, name: string): string {
    const entry = readZip(bytes).find(e => e.name === name);
    if (!entry) throw new Error(`the workbook carries no part named "${name}"`);
    return new TextDecoder().decode(entry.data);
}

// --- the archive -----------------------------------------------------------

describe('TableExport — the archive', () => {
    it('is a zip carrying the minimal OOXML part set', async () => {
        const { bytes } = await download('Orders', ['ID'], [[1]]);

        assert.equal(new DataView(bytes.buffer).getUint32(0, true), LOCAL_SIGNATURE, 'the file opens with a local header');
        assert.deepStrictEqual(readZip(bytes).map(e => e.name), PART_NAMES);
    });

    it('points every central directory record at its own local header', async () => {
        const { bytes } = await download('Orders', ['ID', 'Symbol'], [[1, 'BTC'], [2, 'ETH']]);

        for (const entry of readZip(bytes)) {
            // readZip already asserted the signature at the offset; what matters here is
            // that it is the *right* local header — an off-by-one part offset lands on a
            // valid header belonging to a different entry.
            assert.equal(entry.local.name, entry.central.name, `entry ${entry.name} names the same part in both records`);
        }
    });

    it('records the same crc and sizes in both records, stored uncompressed', async () => {
        const { bytes } = await download('Orders', ['ID'], [[1]]);

        for (const entry of readZip(bytes)) {
            assert.equal(entry.local.crc, entry.central.crc, `${entry.name}: crc`);
            assert.equal(entry.local.size, entry.central.size, `${entry.name}: uncompressed size`);
            assert.equal(entry.local.compressedSize, entry.central.compressedSize, `${entry.name}: stored size`);
            // Store-only: the entry is its own payload, so the two sizes and the bytes
            // actually written all have to be the same number.
            assert.equal(entry.local.compressedSize, entry.local.size, `${entry.name}: stored size equals uncompressed size`);
            assert.equal(entry.data.length, entry.local.size, `${entry.name}: payload length`);
        }
    });
});

describe('TableExport — crc32', () => {
    it('agrees with the standard vector, through the reference this suite checks against', () => {
        // Pins the reference: node's zlib.crc32 is the IEEE 802.3 CRC the ZIP format
        // specifies, so the per-part comparison below is a real check and not a
        // comparison of two copies of the same mistake.
        assert.equal(crc32(Buffer.from('123456789')), 0xCBF43926);
    });

    it('checksums every part the way an unzipper will', async () => {
        const { bytes } = await download('Orders', ['ID', 'Symbol'], [[1, 'BTC'], [2, 'ETH']]);

        for (const entry of readZip(bytes))
            assert.equal(entry.local.crc, crc32(Buffer.from(entry.data)), `${entry.name}: crc over its own bytes`);
    });

    it('checksums a part whose bytes leave the ascii range', async () => {
        // The CRC covers UTF-8 bytes, not characters: a caption outside ascii is one
        // cell but several bytes, and the length written into the header has to match.
        const { bytes } = await download('Заявки', ['Символ'], [['Ц£€']]);
        const sheet = readZip(bytes).find(e => e.name === 'xl/worksheets/sheet1.xml')!;

        assert.equal(sheet.local.crc, crc32(Buffer.from(sheet.data)));
        assert.ok(sheet.data.length > new TextDecoder().decode(sheet.data).length, 'the payload is measured in bytes');
    });
});

// --- the sheet -------------------------------------------------------------

describe('TableExport — column references', () => {
    it('crosses the single- to multi-letter boundary the way a spreadsheet does', async () => {
        const headers = Array.from({ length: 703 }, (_, i) => `c${i}`);
        const { bytes } = await download('Wide', headers, []);

        const headerRow = /<row r="1">([\s\S]*?)<\/row>/.exec(sheetOf(bytes));
        if (!headerRow) throw new Error('the sheet carries no header row');
        const refs = [...headerRow[1].matchAll(/<c r="([A-Z]+)1"/g)].map(m => m[1]);

        assert.equal(refs.length, headers.length);
        assert.equal(refs[0], 'A');
        assert.equal(refs[25], 'Z');
        assert.equal(refs[26], 'AA');
        assert.equal(refs[701], 'ZZ');
        assert.equal(refs[702], 'AAA');
    });

    it('numbers rows from the header down', async () => {
        const { bytes } = await download('Orders', ['ID'], [[1], [2]]);
        const sheet = sheetOf(bytes);

        assert.ok(sheet.includes('<row r="1"><c r="A1" t="inlineStr"><is><t xml:space="preserve">ID</t></is></c></row>'));
        assert.ok(sheet.includes('<row r="2"><c r="A2"><v>1</v></c></row>'));
        assert.ok(sheet.includes('<row r="3"><c r="A3"><v>2</v></c></row>'));
    });
});

describe('TableExport — cell values', () => {
    it('writes a finite number as a native numeric cell', async () => {
        const { bytes } = await download('Orders', ['Price'], [[10], [-1.5], [0]]);
        const sheet = sheetOf(bytes);

        assert.ok(sheet.includes('<c r="A2"><v>10</v></c>'));
        assert.ok(sheet.includes('<c r="A3"><v>-1.5</v></c>'));
        // Zero is a value, not an absence — the empty-cell branch must not swallow it.
        assert.ok(sheet.includes('<c r="A4"><v>0</v></c>'));
    });

    it('writes everything else as an inline string', async () => {
        // A numeric-looking string stays a string (an instrument code with leading
        // zeroes must not become a number), and a non-finite number has no numeric
        // representation a spreadsheet would accept.
        const { bytes } = await download('Orders', ['V'], [['007'], [Number.NaN], [Number.POSITIVE_INFINITY], [true]]);
        const sheet = sheetOf(bytes);

        assert.ok(sheet.includes('<c r="A2" t="inlineStr"><is><t xml:space="preserve">007</t></is></c>'));
        assert.ok(sheet.includes('<c r="A3" t="inlineStr"><is><t xml:space="preserve">NaN</t></is></c>'));
        assert.ok(sheet.includes('<c r="A4" t="inlineStr"><is><t xml:space="preserve">Infinity</t></is></c>'));
        assert.ok(sheet.includes('<c r="A5" t="inlineStr"><is><t xml:space="preserve">true</t></is></c>'));
    });

    it('escapes the markup characters a cell value can carry', async () => {
        const { bytes } = await download('Orders', ['V'], [['a & b < c > d "q"']]);

        assert.ok(sheetOf(bytes).includes(
            '<c r="A2" t="inlineStr"><is><t xml:space="preserve">a &amp; b &lt; c &gt; d &quot;q&quot;</t></is></c>'));
    });

    it('keeps the whitespace a value was handed over with', async () => {
        // Without xml:space="preserve" a reader is free to strip this, and an aligned
        // column of quantities loses its alignment.
        const { bytes } = await download('Orders', ['V'], [['  120  ']]);

        assert.ok(sheetOf(bytes).includes('<t xml:space="preserve">  120  </t>'));
    });

    it('omits the cell entirely for an empty value, leaving the reference free', async () => {
        // A missing cell is how a sheet spells "blank"; writing an empty inline string
        // instead gives a cell that is not empty to a formula or a filter.
        const { bytes } = await download('Orders', ['A', 'B', 'C', 'D'], [[null, undefined, '', 'here']]);
        const row = /<row r="2">([\s\S]*?)<\/row>/.exec(sheetOf(bytes));

        if (!row) throw new Error('the sheet carries no data row');
        assert.equal(row[1], '<c r="D2" t="inlineStr"><is><t xml:space="preserve">here</t></is></c>');
    });
});

// --- the workbook and the download itself ----------------------------------

describe('TableExport — the workbook', () => {
    it('names the sheet what the caller asked for, escaped', async () => {
        const { bytes } = await download('P&L', ['ID'], [[1]]);

        assert.ok(partText(bytes, 'xl/workbook.xml').includes('<sheet name="P&amp;L" sheetId="1" r:id="rId1"/>'));
    });

    it('sanitizes a sheet name Excel would reject', async () => {
        // Excel refuses []:*?/\ in a sheet name and caps it at 31 characters, and the
        // caption arrives already localized — i.e. from outside this package.
        const { bytes } = await download('Orders [2026]: buy/sell*?', ['ID'], [[1]]);

        assert.ok(partText(bytes, 'xl/workbook.xml').includes('<sheet name="Orders  2026   buy sell" sheetId="1" r:id="rId1"/>'));
    });

    it('falls back to a usable name when sanitizing leaves nothing', async () => {
        const { bytes } = await download('///', ['ID'], [[1]]);

        assert.ok(partText(bytes, 'xl/workbook.xml').includes('<sheet name="Sheet1" sheetId="1" r:id="rId1"/>'));
    });

    it('caps a long sheet name at the 31 characters Excel allows', async () => {
        const { bytes } = await download('x'.repeat(40), ['ID'], [[1]]);

        assert.ok(partText(bytes, 'xl/workbook.xml').includes(`<sheet name="${'x'.repeat(31)}" sheetId="1" r:id="rId1"/>`));
    });
});

describe('TableExport — the download', () => {
    it('names the file after the caller and the moment, and cleans up after itself', async () => {
        const { anchor } = await download('Orders', ['ID'], [[1]]);

        assert.match(anchor.download, /^orders-\d{8}-\d{6}\.xlsx$/);
        assert.equal(anchor.href, 'blob:workbook');
        // The anchor exists only to be clicked: leaving it behind would accumulate one
        // stray element per export in the host page.
        assert.equal(fakeDocument.body.children.length, 0);
    });
});
