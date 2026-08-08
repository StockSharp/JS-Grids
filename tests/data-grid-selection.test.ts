// Row selection: off, one row, or many, and the modifiers that go with many.
//
// Selection is held by row key rather than by position or by element, which is
// what makes it survive the two things that happen to a live blotter: a repaint
// that rebuilds every `<tr>`, and a filter that takes a selected row off screen
// and later brings it back.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DataGrid } from '../src/data-grid';
import { FakeElement, asDom, fakeDocument, fireOnDocument, installFakeDocument } from './fake-dom';

installFakeDocument();

interface Row { id: number; symbol: string; }

const ROWS: Row[] = [
    { id: 1, symbol: 'AAPL' },
    { id: 2, symbol: 'BTC' },
    { id: 3, symbol: 'ESZ5' },
    { id: 4, symbol: 'NVDA' },
];

function makeGrid(extra: Record<string, unknown> = {}) {
    const head = new FakeElement('thead');
    const body = new FakeElement('tbody');
    const grid = new DataGrid<Row>({
        head: asDom(head),
        body: asDom(body),
        columns: [
            { key: 'id', header: 'ID', exportable: true, value: r => r.id },
            { key: 'symbol', header: 'Symbol', exportable: true, value: r => r.symbol, filter: 'text' },
        ],
        defaultSort: { col: 'id', dir: 'asc' },
        rowKey: r => String(r.id),
        emptyText: 'No rows',
        ...extra,
    });
    grid.setRows(ROWS);
    return { grid, head, body };
}

// A pointer presses before it clicks, and selection answers the press -- which is
// both what a real table does and what stops the browser dragging a text selection
// across the rows. A helper that sent only `click` was testing something no mouse does.
const click = (body: FakeElement, index: number, modifiers: Record<string, boolean> = {}) => {
    const tr = body.children[index];
    tr.dispatchEvent({ type: 'mousedown', target: tr, button: 0, preventDefault: () => {}, ...modifiers });
};

const selectedClasses = (body: FakeElement) =>
    body.children.filter(tr => tr.className.includes('is-selected')).map(tr => tr.getAttribute('data-row-key'));

describe('DataGrid selection', () => {
    it('does nothing when selection is off', () => {
        const { grid, body } = makeGrid();

        click(body, 0);

        assert.deepEqual(grid.selectedKeys(), []);
        assert.deepEqual(selectedClasses(body), []);
    });

    it('keeps one row at a time in single mode', () => {
        const { grid, body } = makeGrid({ selection: 'single' });

        click(body, 0);
        assert.deepEqual(grid.selectedKeys(), ['1']);

        click(body, 2);
        assert.deepEqual(grid.selectedKeys(), ['3']);
        assert.deepEqual(selectedClasses(body), ['3']);
    });

    it('ignores the modifiers in single mode', () => {
        const { grid, body } = makeGrid({ selection: 'single' });

        click(body, 0);
        click(body, 2, { ctrlKey: true });

        assert.deepEqual(grid.selectedKeys(), ['3']);
    });

    it('adds and removes with ctrl in multi mode', () => {
        const { grid, body } = makeGrid({ selection: 'multi' });

        click(body, 0);
        click(body, 2, { ctrlKey: true });
        assert.deepEqual(grid.selectedKeys(), ['1', '3']);

        click(body, 0, { ctrlKey: true });
        assert.deepEqual(grid.selectedKeys(), ['3']);
    });

    it('takes a range with shift, in the order on screen', () => {
        const { grid, body } = makeGrid({ selection: 'multi' });

        click(body, 1);
        click(body, 3, { shiftKey: true });

        assert.deepEqual(grid.selectedKeys(), ['2', '3', '4']);
    });

    it('measures the range against the order on screen, not the held order', () => {
        const { grid, body } = makeGrid({ selection: 'multi' });

        grid.sort.set('id', 'desc');   // 4, 3, 2, 1
        click(body, 0);                 // id 4
        click(body, 2, { shiftKey: true });   // id 2

        assert.deepEqual(grid.selectedKeys().sort(), ['2', '3', '4']);
    });

    it('replaces the selection on a plain click', () => {
        const { grid, body } = makeGrid({ selection: 'multi' });

        click(body, 0);
        click(body, 1, { ctrlKey: true });
        click(body, 3);

        assert.deepEqual(grid.selectedKeys(), ['4']);
    });

    it('survives a repaint', () => {
        const { grid, body } = makeGrid({ selection: 'multi' });

        click(body, 0);
        grid.render();

        assert.deepEqual(selectedClasses(body), ['1']);
    });

    it('keeps a selected row selected while a filter hides it', () => {
        const { grid, body } = makeGrid({ selection: 'multi' });

        click(body, 0);   // AAPL
        grid.setFilter('symbol', { text: 'btc' });

        // Still selected, just not on screen -- so it comes back selected.
        assert.deepEqual(grid.selectedKeys(), ['1']);
        assert.deepEqual(selectedClasses(body), []);
        assert.deepEqual(grid.selectedRows().map(r => r.id), []);

        grid.clearFilters();
        assert.deepEqual(selectedClasses(body), ['1']);
        assert.deepEqual(grid.selectedRows().map(r => r.id), [1]);
    });

    it('is settable and clearable from code, and reports each change once', () => {
        const seen: string[][] = [];
        const { grid } = makeGrid({ selection: 'multi', onSelectionChange: (keys: string[]) => seen.push(keys) });

        grid.setSelection(['2', '4']);
        assert.deepEqual(grid.selectedKeys(), ['2', '4']);

        grid.clearSelection();
        assert.deepEqual(grid.selectedKeys(), []);

        assert.deepEqual(seen, [['2', '4'], []]);
    });

    it('does not fire when the selection did not actually change', () => {
        const seen: string[][] = [];
        const { body } = makeGrid({ selection: 'single', onSelectionChange: (keys: string[]) => seen.push(keys) });

        click(body, 0);
        click(body, 0);

        assert.equal(seen.length, 1);
    });

    it('leaves a pinned row out of it', () => {
        const { grid, body } = makeGrid({
            selection: 'multi',
            pinnedRows: () => [{ key: 'total', className: '', place: 'top', cells: [] }],
        });

        click(body, 0);   // the pinned row

        assert.deepEqual(grid.selectedKeys(), []);
    });

    it('extends the selection by dragging across rows', () => {
        const { grid, body } = makeGrid({ selection: 'multi' });
        const row = (i: number) => body.children[i];

        row(0).dispatchEvent({ type: 'mousedown', target: row(0), button: 0, preventDefault: () => {} });
        row(1).dispatchEvent({ type: 'mouseenter', target: row(1) });
        row(3).dispatchEvent({ type: 'mouseenter', target: row(3) });

        assert.deepEqual(grid.selectedKeys(), ['1', '2', '3', '4']);

        // Once the button is up, moving over rows stops changing anything.
        fireOnDocument({ type: 'mouseup' });
        row(0).dispatchEvent({ type: 'mouseenter', target: row(0) });
        assert.deepEqual(grid.selectedKeys(), ['1', '2', '3', '4']);
    });

    it('claims the press so the browser does not select text instead', () => {
        const { body } = makeGrid({ selection: 'multi' });
        let prevented = false;
        const tr = body.children[0];

        tr.dispatchEvent({ type: 'mousedown', target: tr, button: 0, preventDefault: () => { prevented = true; } });

        assert.equal(prevented, true);
    });

    it('leaves the right button to the menu', () => {
        const { grid, body } = makeGrid({ selection: 'multi' });
        const tr = body.children[0];

        tr.dispatchEvent({ type: 'mousedown', target: tr, button: 2, preventDefault: () => {} });

        assert.deepEqual(grid.selectedKeys(), []);
    });

    it('copies the selection, tab between cells and newline between rows', () => {
        const { grid, body } = makeGrid({ selection: 'multi' });

        assert.equal(grid.copyText(null), '');

        click(body, 0);
        click(body, 2, { ctrlKey: true });
        const text = grid.copyText(null);

        assert.equal(text.split(String.fromCharCode(10)).length, 2);
        assert.ok(text.includes('AAPL'));
        assert.ok(text.includes('ESZ5'));
    });

    it('stops dragging when the button turns out to be up', () => {
        const { grid, body } = makeGrid({ selection: 'multi' });
        const row = (i: number) => body.children[i];

        row(0).dispatchEvent({ type: 'mousedown', target: row(0), button: 0, preventDefault: () => {} });
        // The release happened outside the window, so no mouseup ever arrived here.
        row(2).dispatchEvent({ type: 'mouseenter', target: row(2), buttons: 0 });

        assert.deepEqual(grid.selectedKeys(), ['1']);
    });

    it('copies what the sheet would hold, not what the row renders', () => {
        const head = new FakeElement('thead');
        const body = new FakeElement('tbody');
        const grid = new DataGrid<Row>({
            head: asDom(head),
            body: asDom(body),
            columns: [
                { key: 'id', header: 'ID', exportable: true, value: r => r.id },
                // Displayed as a word, held as a number -- the clipboard takes the word.
                { key: 'side', header: 'Side', exportable: true, value: r => r.id % 2, exportValue: r => (r.id % 2 ? 'Sell' : 'Buy') },
                // A button column: nothing to export, so nothing to copy either.
                { key: 'act', header: '', exportable: false, render: () => 'Cancel' },
            ],
            defaultSort: { col: 'id', dir: 'asc' },
            rowKey: r => String(r.id),
            emptyText: 'No rows',
            selection: 'multi',
        });
        grid.setRows(ROWS);

        grid.setSelection(['1']);
        const TAB = String.fromCharCode(9);

        assert.equal(grid.copyText(null), ['1', 'Sell'].join(TAB));
    });

    it('answers Ctrl+C on the physical key, whatever the layout types', () => {
        const { body } = makeGrid({ selection: 'multi' });
        click(body, 0);

        // A Russian layout reports key "с" for the same key a US one calls "c",
        // so a shortcut matched on the letter simply stops working there.
        fakeDocument.clipboard = '';
        fireOnDocument({ type: 'keydown', key: 'с', code: 'KeyC', ctrlKey: true, preventDefault: () => {} } as never);

        assert.ok(fakeDocument.clipboard.includes('AAPL'), 'the shortcut has to reach the clipboard');
    });
});
