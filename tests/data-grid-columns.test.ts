// The grid owns its column view: which columns are shown, in what order, and how
// that arrangement survives a reload.
//
// This used to live outside the grid. ColumnSettings reordered the cells of an
// already-rendered table by their `data-col` attribute, while DataGrid rebuilt
// those same cells from its own declaration order on every repaint -- so the two
// disagreed the moment anything repainted, and the arrangement quietly reverted.
// One owner removes that class of bug rather than papering over it: the grid
// renders from the view, and everything else asks the grid.
//
// What is pinned here is the algebra a user would notice: a moved column takes
// its cells with it, a hidden column takes its slot back, a pinned summary row
// keeps its cells against the right columns, and the export follows the screen.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DataGrid } from '../src/data-grid';
import { FakeElement, asDom, installFakeDocument } from './fake-dom';

installFakeDocument();

interface Row { id: number; symbol: string; qty: number; }

const ROWS: Row[] = [
    { id: 1, symbol: 'AAPL', qty: 10 },
    { id: 2, symbol: 'BTC', qty: -5 },
];

function makeGrid(extra: Record<string, unknown> = {}) {
    const head = new FakeElement('thead');
    const body = new FakeElement('tbody');
    const grid = new DataGrid<Row>({
        head: asDom(head),
        body: asDom(body),
        columns: [
            { key: 'id', header: 'ID', exportable: true, value: r => r.id },
            { key: 'symbol', header: 'Symbol', exportable: true, value: r => r.symbol },
            { key: 'qty', header: 'Qty', exportable: true, value: r => r.qty },
        ],
        defaultSort: { col: 'id', dir: 'asc' },
        rowKey: r => String(r.id),
        emptyText: 'No rows',
        ...extra,
    });
    grid.setRows(ROWS);
    return { grid, head, body };
}

const headerKeys = (head: FakeElement) =>
    head.children[0].children.map(th => th.getAttribute('data-sort'));

const cellKeys = (body: FakeElement, rowIndex: number) =>
    body.children[rowIndex].children.map(td => td.getAttribute('data-col'));

describe('DataGrid column view', () => {
    it('renders in the declared order until something changes it', () => {
        const { grid, head, body } = makeGrid();

        assert.deepEqual(grid.columnKeys(), ['id', 'symbol', 'qty']);
        assert.deepEqual(headerKeys(head), ['id', 'symbol', 'qty']);
        assert.deepEqual(cellKeys(body, 0), ['id', 'symbol', 'qty']);
    });

    it('moves a column and its cells together', () => {
        const { grid, head, body } = makeGrid();

        grid.setColumnOrder(['qty', 'id', 'symbol']);

        assert.deepEqual(headerKeys(head), ['qty', 'id', 'symbol']);
        assert.deepEqual(cellKeys(body, 0), ['qty', 'id', 'symbol']);
        // The cell under a moved header still belongs to that header.
        assert.equal(body.children[0].children[0].textContent, '10');
    });

    it('keeps a partial order stable and appends what the caller left out', () => {
        const { grid } = makeGrid();

        // A stored layout from before a column existed must not drop the new one.
        grid.setColumnOrder(['symbol']);

        assert.deepEqual(grid.columnKeys(), ['symbol', 'id', 'qty']);
    });

    it('refuses an order naming a column that does not exist', () => {
        const { grid } = makeGrid();

        assert.throws(() => grid.setColumnOrder(['id', 'nope']), /nope/);
    });

    it('hides a column without forgetting where it belongs', () => {
        const { grid, head, body } = makeGrid();

        grid.hideColumn('symbol');
        assert.deepEqual(headerKeys(head), ['id', 'qty']);
        assert.deepEqual(cellKeys(body, 0), ['id', 'qty']);
        assert.equal(grid.isColumnHidden('symbol'), true);
        // Order is remembered, not rewritten, so unhiding restores the slot.
        assert.deepEqual(grid.columnKeys(), ['id', 'symbol', 'qty']);

        grid.showColumn('symbol');
        assert.deepEqual(headerKeys(head), ['id', 'symbol', 'qty']);
    });

    it('spans the empty row across the visible columns only', () => {
        const { grid, body } = makeGrid();
        grid.hideColumn('qty');
        grid.setRows([]);

        assert.equal(body.children[0].children[0].colSpan, 2);
    });

    it('keeps a pinned row aligned to its columns when they move', () => {
        const { grid, body } = makeGrid({
            pinnedRows: () => [{
                key: 'total',
                className: '总',
                place: 'bottom',
                cells: [
                    { content: 'Σ', className: '' },
                    { content: 'ALL', className: '' },
                    { content: '5', className: '' },
                ],
            }],
        });

        grid.setColumnOrder(['qty', 'id', 'symbol']);

        const pinned = body.children[body.children.length - 1];
        assert.deepEqual(pinned.children.map(td => td.getAttribute('data-col')), ['qty', 'id', 'symbol']);
        // The cell authored for `qty` travelled with it rather than staying in slot 0.
        assert.deepEqual(pinned.children.map(td => td.textContent), ['5', 'Σ', 'ALL']);
    });

    it('exports what is on screen, in the order on screen', () => {
        const { grid } = makeGrid();

        grid.setColumnOrder(['symbol', 'id', 'qty']);
        grid.hideColumn('qty');

        const data = grid.exportData();
        assert.deepEqual(data.headers, ['Symbol', 'ID']);
        assert.deepEqual(data.rows[0], ['AAPL', 1]);
    });
});

describe('DataGrid state', () => {
    it('hands back what the user arranged, and takes it back', () => {
        const { grid } = makeGrid();

        grid.setColumnOrder(['qty', 'symbol', 'id']);
        grid.hideColumn('symbol');
        grid.sort.set('qty', 'desc');

        const state = grid.getState();
        assert.deepEqual(state.order, ['qty', 'symbol', 'id']);
        assert.deepEqual(state.hidden, ['symbol']);
        assert.deepEqual(state.sort, { col: 'qty', dir: 'desc' });

        // A second grid, same declaration, restored from that state alone.
        const fresh = makeGrid().grid;
        fresh.setState(state);

        assert.deepEqual(fresh.columnKeys(), ['qty', 'symbol', 'id']);
        assert.equal(fresh.isColumnHidden('symbol'), true);
        assert.deepEqual(fresh.getState().sort, { col: 'qty', dir: 'desc' });
    });

    it('ignores a stored column that no longer exists instead of throwing', () => {
        const { grid } = makeGrid();

        // A layout saved before a column was removed must still restore the rest:
        // the alternative is a user whose saved view bricks the page after a deploy.
        grid.setState({ order: ['qty', 'gone', 'id'], hidden: ['gone', 'symbol'] });

        assert.deepEqual(grid.columnKeys(), ['qty', 'id', 'symbol']);
        assert.equal(grid.isColumnHidden('symbol'), true);
    });

    it('reports a change once per arrangement, so a host can persist it', () => {
        const seen: unknown[] = [];
        const { grid } = makeGrid({ onStateChange: (s: unknown) => seen.push(s) });

        grid.setColumnOrder(['qty', 'id', 'symbol']);
        grid.hideColumn('id');

        assert.equal(seen.length, 2);
        assert.deepEqual((seen[1] as { hidden: string[] }).hidden, ['id']);
    });

    it('does not report a change while restoring one', () => {
        const seen: unknown[] = [];
        const { grid } = makeGrid({ onStateChange: (s: unknown) => seen.push(s) });

        // Restoring is the host telling the grid, not the grid telling the host --
        // echoing it back is how a store ends up writing on every page load.
        grid.setState({ order: ['qty', 'id', 'symbol'], hidden: ['id'] });

        assert.equal(seen.length, 0);
    });
});

describe('DataGrid header reordering', () => {
    it('is off unless asked for', () => {
        const { head } = makeGrid();
        assert.equal(head.children[0].children[0].getAttribute('draggable'), null);
    });

    it('moves the dragged column in front of the one it is dropped on', () => {
        const { grid, head } = makeGrid({ reorderable: true });
        const [id, , qty] = head.children[0].children;

        assert.equal(id.getAttribute('draggable'), 'true');

        qty.dispatchEvent({ type: 'dragstart', target: qty });
        id.dispatchEvent({ type: 'dragover', target: id, preventDefault: () => {} });
        id.dispatchEvent({ type: 'drop', target: id, preventDefault: () => {} });

        assert.deepEqual(grid.columnKeys(), ['qty', 'id', 'symbol']);
    });

    it('dropping a column on itself changes nothing and reports nothing', () => {
        const seen: unknown[] = [];
        const { grid, head } = makeGrid({ reorderable: true, onStateChange: (s: unknown) => seen.push(s) });
        const id = head.children[0].children[0];

        id.dispatchEvent({ type: 'dragstart', target: id });
        id.dispatchEvent({ type: 'drop', target: id, preventDefault: () => {} });

        assert.deepEqual(grid.columnKeys(), ['id', 'symbol', 'qty']);
        assert.equal(seen.length, 0);
    });
});
