// Unit coverage for DataGrid — the column-driven table. The four things worth
// pinning down are the ones a blotter would silently get wrong: the order rows
// come out in (including the empties rule), which columns reach the exported
// sheet and with which value, a cell whose content is a real Node carrying its
// own listener, and rows that sit outside the sort.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DataGrid, GridPinnedPlacements, type GridOptions } from '../src/data-grid';
import { FakeElement, asDom, asFake, installFakeDocument } from './fake-dom';

installFakeDocument();

interface Order {
    id: number;
    symbol: string;
    side: number;
    price?: number;
}

const ORDERS: Order[] = [
    { id: 1, symbol: 'BTC', side: 0, price: 30 },
    { id: 2, symbol: 'ETH', side: 1, price: 10 },
    { id: 3, symbol: 'SOL', side: 0, price: 20 },
];

/// A grid over ORDERS-shaped rows. `extra` merges into the options so a test can
/// state only the part it is about.
function makeGrid(rows: Order[], extra: Partial<GridOptions<Order>> = {}) {
    const head = new FakeElement('thead');
    const body = new FakeElement('tbody');
    const grid = new DataGrid<Order>({
        head: asDom<HTMLElement>(head),
        body: asDom<HTMLElement>(body),
        columns: [
            { key: 'id', header: 'ID', exportable: true, value: (o) => o.id },
            { key: 'symbol', header: 'Sym', exportable: true, value: (o) => o.symbol },
            {
                key: 'side',
                header: 'Side',
                exportable: true,
                value: (o) => o.side,
                render: (o) => (o.side === 0 ? 'Buy' : 'Sell'),
                cellClass: (o) => (o.side === 0 ? 'side-buy' : 'side-sell'),
                exportValue: (o) => (o.side === 0 ? 'Buy' : 'Sell'),
            },
            { key: 'price', header: 'Price', exportable: true, value: (o) => o.price },
            { key: 'actions', header: 'Actions', headerHidden: true, exportable: false, render: () => document.createElement('button') },
        ],
        defaultSort: { col: 'id', dir: 'desc' },
        rowKey: (o) => String(o.id),
        emptyText: 'No orders',
        ...extra,
    });
    grid.setRows(rows);
    return { grid, head, body };
}

/// Row keys in painted order — pinned rows included, which is the point of most
/// of these assertions.
function paintedKeys(body: FakeElement): (string | undefined)[] {
    return body.children.map(tr => tr.dataset.rowKey);
}

function headerCell(head: FakeElement, key: string): FakeElement {
    const th = head.querySelectorAll('[data-sort]').find(el => el.dataset.sort === key);
    if (!th) throw new Error(`no sortable header for column "${key}"`);
    return th;
}

/// Click a header the way a browser would: the listener sits on <thead> and
/// reads the <th> off the event target.
function clickHeader(head: FakeElement, th: FakeElement): void {
    head.dispatchEvent({ type: 'click', target: th });
}

const rowOf = (grid: DataGrid<Order>, rowKey: string): FakeElement => asFake(grid.rowElement(rowKey));
const cellOf = (grid: DataGrid<Order>, rowKey: string, columnKey: string): FakeElement => asFake(grid.cellElement(rowKey, columnKey));

// --- sorting ---------------------------------------------------------------

describe('DataGrid — sorting', () => {
    it('paints the table default when no header is selected', () => {
        const { body } = makeGrid(ORDERS);
        assert.deepStrictEqual(paintedKeys(body), ['3', '2', '1']);
    });

    it('clicking a header sorts ascending, clicking again descending', () => {
        const { head, body } = makeGrid(ORDERS);
        const price = headerCell(head, 'price');

        clickHeader(head, price);
        assert.deepStrictEqual(paintedKeys(body), ['2', '3', '1']);
        assert.equal(price.className, 'sort-asc');

        clickHeader(head, price);
        assert.deepStrictEqual(paintedKeys(body), ['1', '3', '2']);
        assert.equal(price.className, 'sort-desc');
    });

    it('a third click returns to the table default', () => {
        const { head, body } = makeGrid(ORDERS);
        const price = headerCell(head, 'price');

        clickHeader(head, price);
        clickHeader(head, price);
        clickHeader(head, price);

        assert.deepStrictEqual(paintedKeys(body), ['3', '2', '1']);
        assert.equal(price.className, '');
        assert.equal(headerCell(head, 'id').className, 'sort-desc');
    });

    it('rows with no value for the sort column sink to the bottom in both directions', () => {
        const rows: Order[] = [
            { id: 1, symbol: 'BTC', side: 0, price: 30 },
            { id: 2, symbol: 'ETH', side: 1 },
            { id: 3, symbol: 'SOL', side: 0, price: 20 },
        ];
        const { head, body } = makeGrid(rows);
        const price = headerCell(head, 'price');

        clickHeader(head, price);
        assert.deepStrictEqual(paintedKeys(body), ['3', '1', '2']);

        clickHeader(head, price);
        assert.deepStrictEqual(paintedKeys(body), ['1', '3', '2']);
    });

    it('only a column with a value is sortable — the actions header carries no data-sort', () => {
        const { head } = makeGrid(ORDERS);
        assert.deepStrictEqual(
            head.querySelectorAll('[data-sort]').map(th => th.dataset.sort),
            ['id', 'symbol', 'side', 'price']);
    });

    it('a hidden header still names the column for a screen reader', () => {
        const { head } = makeGrid(ORDERS);
        const actions = head.children[0].children[4];
        assert.equal(actions.textContent, 'Actions');
        assert.equal(actions.children[0].className, 'visually-hidden');
    });

    it('the sorted view is a copy — the held array keeps the caller\'s order', () => {
        const rows = [...ORDERS];
        const { grid } = makeGrid(rows);
        grid.sortedRows();
        assert.deepStrictEqual(rows.map(o => o.id), [1, 2, 3]);
        assert.strictEqual(grid.rows, rows);
    });
});

describe('DataGrid — afterRender', () => {
    it('fires for a sort the caller never asked for', () => {
        // The grid owns the header listener, so a header click repaints without the
        // caller hearing about it. A watchlist re-subscribes to the symbols now on
        // screen, and the top of the list changes with the sort — this is its hook.
        const painted: number[][] = [];
        const head = new FakeElement('thead');
        const body = new FakeElement('tbody');
        const grid = new DataGrid<Order>({
            head: asDom<HTMLElement>(head),
            body: asDom<HTMLElement>(body),
            columns: [
                { key: 'id', header: 'ID', exportable: true, value: (o) => o.id },
                { key: 'price', header: 'Price', exportable: true, value: (o) => o.price },
            ],
            defaultSort: { col: 'id', dir: 'desc' },
            rowKey: (o) => String(o.id),
            emptyText: 'No orders',
            renderLimit: 2,
            afterRender: () => painted.push(grid.sortedRows().slice(0, 2).map(o => o.id)),
        });
        // Nothing yet: the constructor paints an empty table, and `grid` is not even
        // assigned while it runs.
        assert.deepStrictEqual(painted, []);

        grid.setRows(ORDERS);
        assert.deepStrictEqual(painted.at(-1), [3, 2]);

        clickHeader(head, headerCell(head, 'price'));
        assert.deepStrictEqual(painted.at(-1), [2, 3]);
    });
});

// --- export ----------------------------------------------------------------

describe('DataGrid — export', () => {
    it('exports only the columns that declare themselves exportable', () => {
        const { grid } = makeGrid(ORDERS);
        assert.deepStrictEqual(grid.exportData().headers, ['ID', 'Sym', 'Side', 'Price']);
    });

    it('exports exportValue where the column declares one, value elsewhere', () => {
        const { grid } = makeGrid(ORDERS);
        // Side reads 0/1 on the wire and "Buy"/"Sell" on screen: the sheet gets the
        // text the user saw, not the enum behind it.
        assert.deepStrictEqual(grid.exportData().rows, [
            [3, 'SOL', 'Buy', 20],
            [2, 'ETH', 'Sell', 10],
            [1, 'BTC', 'Buy', 30],
        ]);
    });

    it('exports in the order on screen', () => {
        const { grid, head } = makeGrid(ORDERS);
        clickHeader(head, headerCell(head, 'price'));
        assert.deepStrictEqual(grid.exportData().rows.map(r => r[0]), [2, 3, 1]);
    });

    it('renderLimit caps what is painted, not what is exported', () => {
        const { grid, body } = makeGrid(ORDERS, { renderLimit: 2 });
        assert.deepStrictEqual(paintedKeys(body), ['3', '2']);
        assert.equal(grid.exportData().rows.length, 3);
    });

    it('a column that exports but has nothing to export from is rejected at wire-up', () => {
        const head = new FakeElement('thead');
        const body = new FakeElement('tbody');
        assert.throws(() => new DataGrid<Order>({
            head: asDom<HTMLElement>(head),
            body: asDom<HTMLElement>(body),
            columns: [{ key: 'actions', header: 'Actions', exportable: true, render: () => 'x' }],
            defaultSort: null,
            rowKey: () => 'k',
            emptyText: 'empty',
        }), /column "actions" is exportable but declares no value/);
    });
});

// --- cells that are real nodes ---------------------------------------------

describe('DataGrid — a cell that is a Node', () => {
    it('puts the returned element in the cell and lets its own listener fire', () => {
        const cancelled: number[] = [];
        const { grid } = makeGrid(ORDERS, {
            columns: [
                { key: 'id', header: 'ID', exportable: true, value: (o) => o.id },
                {
                    key: 'actions',
                    header: 'Actions',
                    headerHidden: true,
                    exportable: false,
                    render: (o) => {
                        const button = document.createElement('button');
                        button.title = 'Cancel order';
                        button.addEventListener('click', () => cancelled.push(o.id));
                        return button;
                    },
                },
            ],
        });

        const cell = cellOf(grid, '2', 'actions');
        const button = cell.children[0];
        assert.equal(button.tagName, 'BUTTON');
        // The handler is on the element, not an onclick attribute reaching a global.
        assert.equal(cell.getAttribute('onclick'), null);
        assert.equal(button.getAttribute('onclick'), null);

        button.dispatchEvent({ type: 'click', target: button });
        assert.deepStrictEqual(cancelled, [2]);
    });

    it('appends a fragment\'s children so a cell can mix text and an element', () => {
        const { grid } = makeGrid(ORDERS, {
            columns: [
                { key: 'id', header: 'ID', exportable: true, value: (o) => o.id },
                {
                    key: 'status',
                    header: 'Status',
                    exportable: false,
                    render: () => {
                        const fragment = document.createDocumentFragment();
                        fragment.appendChild(document.createTextNode('Rejected '));
                        const icon = document.createElement('i');
                        icon.title = 'insufficient balance';
                        fragment.appendChild(icon);
                        return fragment;
                    },
                },
            ],
        });

        const cell = cellOf(grid, '1', 'status');
        assert.equal(cell.childNodes.length, 2);
        assert.equal(cell.textContent, 'Rejected ');
        assert.equal(cell.children[0].title, 'insufficient balance');
    });

    it('bindCell wires an interaction that belongs to the whole cell', () => {
        const edited: number[] = [];
        const { grid } = makeGrid(ORDERS, {
            columns: [
                {
                    key: 'price',
                    header: 'Price',
                    exportable: true,
                    value: (o) => o.price,
                    bindCell: (td, o) => td.addEventListener('dblclick', () => edited.push(o.id)),
                },
            ],
        });

        const cell = cellOf(grid, '3', 'price');
        cell.dispatchEvent({ type: 'dblclick', target: cell });
        assert.deepStrictEqual(edited, [3]);
    });

    it('colours the cell from the class the column returns', () => {
        const { grid } = makeGrid(ORDERS);
        assert.equal(cellOf(grid, '1', 'side').className, 'side-buy');
        assert.equal(cellOf(grid, '2', 'side').className, 'side-sell');
    });
});

// --- pinned rows -----------------------------------------------------------

describe('DataGrid — pinned rows', () => {
    const balance = () => [{
        key: 'balance',
        className: 'balance-row',
        place: GridPinnedPlacements.Top,
        cells: [
            { content: 'USD', className: 'ccy' },
            { content: '$1,000.00', className: '' },
        ],
    }];

    it('stays on top whichever column the user sorts by', () => {
        const { head, body } = makeGrid(ORDERS, { pinnedRows: balance });
        assert.deepStrictEqual(paintedKeys(body), ['balance', '3', '2', '1']);

        clickHeader(head, headerCell(head, 'price'));
        assert.deepStrictEqual(paintedKeys(body), ['balance', '2', '3', '1']);

        clickHeader(head, headerCell(head, 'price'));
        assert.deepStrictEqual(paintedKeys(body), ['balance', '1', '3', '2']);
    });

    it('sits at the bottom when it declares so', () => {
        const { body } = makeGrid(ORDERS, {
            pinnedRows: () => [{ key: 'total', className: 'total-row', place: GridPinnedPlacements.Bottom, cells: [] }],
        });
        assert.deepStrictEqual(paintedKeys(body), ['3', '2', '1', 'total']);
    });

    it('is not a row of data — it stays out of the sheet', () => {
        const { grid } = makeGrid(ORDERS, { pinnedRows: balance });
        assert.equal(grid.exportData().rows.length, 3);
        assert.deepStrictEqual(grid.exportData().rows.map(r => r[0]), [3, 2, 1]);
    });

    it('is content, so it suppresses the "nothing to show" row', () => {
        const { body } = makeGrid([], { pinnedRows: balance });
        assert.deepStrictEqual(paintedKeys(body), ['balance']);
    });

    it('supplies its own cells and is padded out to the column count', () => {
        const { grid } = makeGrid(ORDERS, { pinnedRows: balance });
        assert.equal(rowOf(grid, 'balance').className, 'balance-row');
        assert.equal(rowOf(grid, 'balance').childNodes.length, 5);
        assert.equal(cellOf(grid, 'balance', 'id').textContent, 'USD');
        assert.equal(cellOf(grid, 'balance', 'id').className, 'ccy');
        assert.equal(cellOf(grid, 'balance', 'price').textContent, '');
    });

    it('rejects more cells than there are columns', () => {
        assert.throws(() => makeGrid(ORDERS, {
            pinnedRows: () => [{
                key: 'balance',
                className: '',
                place: GridPinnedPlacements.Top,
                cells: new Array(6).fill({ content: '', className: '' }),
            }],
        }), /pinned row "balance" declares 6 cells for 5 columns/);
    });

    it('re-reads the pinned rows on every render, so live figures update', () => {
        let available = 1000;
        const { grid, body } = makeGrid(ORDERS, {
            pinnedRows: () => [{
                key: 'balance',
                className: '',
                place: GridPinnedPlacements.Top,
                cells: [{ content: `$${available}`, className: '' }],
            }],
        });
        assert.equal(body.children[0].textContent, '$1000');

        available = 1250;
        grid.render();
        assert.equal(body.children[0].textContent, '$1250');
    });
});

// --- empty state and lookups -----------------------------------------------

describe('DataGrid — empty state and element lookup', () => {
    it('spans the whole table with the caller\'s text when there is nothing to show', () => {
        const { body } = makeGrid([]);
        assert.equal(body.children.length, 1);
        const cell = body.children[0].children[0];
        assert.equal(cell.textContent, 'No orders');
        assert.equal(cell.className, 'grid-empty');
        assert.equal(cell.colSpan, 5);
    });

    it('finds a row and a cell by key so a caller can patch one in place', () => {
        const { grid } = makeGrid(ORDERS);
        assert.equal(rowOf(grid, '2').dataset.rowKey, '2');
        assert.equal(cellOf(grid, '2', 'symbol').textContent, 'ETH');
        assert.equal(cellOf(grid, '2', 'symbol').dataset.col, 'symbol');
    });

    it('reports a row that is not painted as absent rather than stale', () => {
        const { grid } = makeGrid(ORDERS, { renderLimit: 1 });
        assert.equal(rowOf(grid, '3').dataset.rowKey, '3');
        assert.equal(grid.rowElement('1'), null);
        assert.equal(grid.cellElement('1', 'symbol'), null);
    });
});
