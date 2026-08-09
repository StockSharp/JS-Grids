// Single-level grouping: a header row per distinct value, the rows under it, and
// a collapse that survives a reload.
//
// The interactions are where the decisions live, and they are what this file pins:
// groups are ordered by their value while rows inside a group keep the sort the
// user chose, `renderLimit` caps data rows rather than headers, and the export
// stays flat -- a spreadsheet has its own grouping and does not want ours.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DataGrid } from '../src/data-grid';
import { FakeElement, asDom, installFakeDocument } from './fake-dom';

installFakeDocument();

interface Row { id: number; symbol: string; qty: number; }

const ROWS: Row[] = [
    { id: 1, symbol: 'BTC', qty: 10 },
    { id: 2, symbol: 'AAPL', qty: 30 },
    { id: 3, symbol: 'BTC', qty: 20 },
    { id: 4, symbol: 'AAPL', qty: 40 },
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

/// Rows as (kind, label) so a group header and a data row read apart at a glance.
const shape = (body: FakeElement) => body.children.map(tr => {
    const group = tr.getAttribute('data-group');
    return group !== null ? ['group', group] : ['row', tr.getAttribute('data-row-key')];
});

describe('DataGrid grouping', () => {
    it('is off until asked for', () => {
        const { grid, body } = makeGrid();

        assert.equal(grid.groupedBy(), null);
        assert.deepEqual(shape(body), [['row', '1'], ['row', '2'], ['row', '3'], ['row', '4']]);
    });

    it('puts a header before each group, ordered by value', () => {
        const { grid, body } = makeGrid();

        grid.groupBy('symbol');

        assert.deepEqual(shape(body), [
            ['group', 'AAPL'], ['row', '2'], ['row', '4'],
            ['group', 'BTC'], ['row', '1'], ['row', '3'],
        ]);
    });

    it('sorts within a group without reordering the groups', () => {
        const { grid, body } = makeGrid();

        grid.groupBy('symbol');
        grid.sort.set('qty', 'desc');

        assert.deepEqual(shape(body), [
            ['group', 'AAPL'], ['row', '4'], ['row', '2'],
            ['group', 'BTC'], ['row', '3'], ['row', '1'],
        ]);
    });

    it('counts the rows in the header, and spans it across the visible columns', () => {
        const { grid, body } = makeGrid();

        grid.groupBy('symbol');
        grid.hideColumn('qty');

        const header = body.children[0];
        assert.equal(header.children[0].colSpan, 2);
        assert.match(header.children[0].textContent, /AAPL/);
        assert.match(header.children[0].textContent, /2/);
    });

    it('collapses a group and leaves the others alone', () => {
        const { grid, body } = makeGrid();

        grid.groupBy('symbol');
        grid.toggleGroup('AAPL');

        assert.deepEqual(shape(body), [
            ['group', 'AAPL'],
            ['group', 'BTC'], ['row', '1'], ['row', '3'],
        ]);
        assert.deepEqual(grid.collapsedGroups(), ['AAPL']);

        grid.toggleGroup('AAPL');
        assert.deepEqual(grid.collapsedGroups(), []);
    });

    it('collapses by clicking the header', () => {
        const { grid, body } = makeGrid();

        grid.groupBy('symbol');
        body.children[0].dispatchEvent({ type: 'click', target: body.children[0] });

        assert.deepEqual(grid.collapsedGroups(), ['AAPL']);
    });

    it('counts data rows against renderLimit, not group headers', () => {
        const { grid, body } = makeGrid({ renderLimit: 3 });

        grid.groupBy('symbol');

        assert.deepEqual(shape(body), [
            ['group', 'AAPL'], ['row', '2'], ['row', '4'],
            ['group', 'BTC'], ['row', '1'],
        ]);
    });

    it('groups what the filter left', () => {
        const { grid, body } = makeGrid();

        grid.groupBy('symbol');
        grid.setFilter('qty', { min: 25 });

        assert.deepEqual(shape(body), [
            ['group', 'AAPL'], ['row', '2'], ['row', '4'],
        ]);
    });

    it('exports flat, whatever the grouping', () => {
        const { grid } = makeGrid();

        grid.groupBy('symbol');

        assert.deepEqual(grid.exportData().rows.map(r => r[0]), [2, 4, 1, 3]);
    });

    it('refuses to group by a column with nothing to group on', () => {
        const { grid } = makeGrid();

        assert.throws(() => grid.groupBy('nope'), /nope/);
    });

    it('carries the grouping and what is collapsed through the state', () => {
        const { grid } = makeGrid();

        grid.groupBy('symbol');
        grid.toggleGroup('BTC');

        const state = grid.getState();
        assert.equal(state.group, 'symbol');
        assert.deepEqual(state.collapsed, ['BTC']);

        const fresh = makeGrid();
        fresh.grid.setState(state);
        assert.deepEqual(shape(fresh.body), [
            ['group', 'AAPL'], ['row', '2'], ['row', '4'],
            ['group', 'BTC'],
        ]);
    });

    it('drops a stored grouping whose column is gone', () => {
        const { grid, body } = makeGrid();

        grid.setState({ group: 'vanished' });

        assert.equal(grid.groupedBy(), null);
        assert.deepEqual(shape(body), [['row', '1'], ['row', '2'], ['row', '3'], ['row', '4']]);
    });

    it('heads a group by what the value reads as, not by the value', () => {
        const head = new FakeElement('thead');
        const body = new FakeElement('tbody');
        // A side column: held as 0 and 1, read as Buy and Sell.
        const grid = new DataGrid<Row>({
            head: asDom(head),
            body: asDom(body),
            columns: [
                { key: 'id', header: 'ID', exportable: true, value: r => r.id },
                {
                    key: 'side', header: 'Side', exportable: true,
                    value: r => r.qty % 20 === 0 ? 1 : 0,
                    text: r => (r.qty % 20 === 0 ? 'Sell' : 'Buy'),
                },
            ],
            defaultSort: { col: 'id', dir: 'asc' },
            rowKey: r => String(r.id),
            emptyText: 'No rows',
            ...{},
        });
        grid.setRows(ROWS);

        grid.groupBy('side');

        const headers = body.children.filter(tr => tr.className.includes('grid-group'));
        assert.deepEqual(headers.map(tr => tr.textContent), ['▾ Buy (2)', '▾ Sell (2)']);
        // The key stays the raw value, because collapse and the stored view are
        // written against it.
        assert.deepEqual(headers.map(tr => tr.getAttribute('data-group')), ['0', '1']);
    });

    it('collapses by the value, so a relabelled column keeps what was shut', () => {
        const head = new FakeElement('thead');
        const body = new FakeElement('tbody');
        const grid = new DataGrid<Row>({
            head: asDom(head),
            body: asDom(body),
            columns: [
                { key: 'id', header: 'ID', exportable: true, value: r => r.id },
                { key: 'side', header: 'Side', exportable: true, value: r => r.qty % 20 === 0 ? 1 : 0, text: () => 'whatever' },
            ],
            defaultSort: { col: 'id', dir: 'asc' },
            rowKey: r => String(r.id),
            emptyText: 'No rows',
        });
        grid.setRows(ROWS);
        grid.groupBy('side');

        grid.toggleGroup('1');

        assert.deepEqual(grid.getState().collapsed, ['1']);
    });

    it('orders groups the way the column sorts, numbers included', () => {
        const head = new FakeElement('thead');
        const body = new FakeElement('tbody');
        interface Lot { id: number; strike: number; }
        const grid = new DataGrid<Lot>({
            head: asDom(head),
            body: asDom(body),
            columns: [
                { key: 'id', header: 'ID', exportable: true, value: r => r.id },
                { key: 'strike', header: 'Strike', exportable: true, value: r => r.strike },
            ],
            defaultSort: { col: 'id', dir: 'asc' },
            rowKey: r => String(r.id),
            emptyText: 'No rows',
        });
        grid.setRows([{ id: 1, strike: 100 }, { id: 2, strike: 2 }, { id: 3, strike: 10 }]);

        grid.groupBy('strike');

        // Compared as text without numeric collation this reads 10, 100, 2 -- the
        // groups disagreeing with the sort arrow on the same column.
        const labels = body.children.filter(tr => tr.className.includes('grid-group')).map(tr => tr.textContent);
        assert.deepEqual(labels, ['▾ 2 (1)', '▾ 10 (1)', '▾ 100 (1)']);
    });

    it('hands the group header to a host that wants to write it differently', () => {
        const head = new FakeElement('thead');
        const body = new FakeElement('tbody');
        const grid = new DataGrid<Row>({
            head: asDom(head),
            body: asDom(body),
            columns: [
                { key: 'id', header: 'ID', exportable: true, value: r => r.id },
                { key: 'symbol', header: 'Symbol', exportable: true, value: r => r.symbol },
            ],
            defaultSort: { col: 'id', dir: 'asc' },
            rowKey: r => String(r.id),
            emptyText: 'No rows',
            groupHeader: (label: string, count: number, collapsed: boolean) =>
                `${collapsed ? '+' : '-'} ${label}: ${count} 条`,
        });
        grid.setRows(ROWS);

        grid.groupBy('symbol');
        const header = body.children.find(tr => tr.className.includes('grid-group'))!;
        assert.equal(header.textContent, '- AAPL: 2 条');

        grid.toggleGroup('AAPL');
        const collapsed = body.children.find(tr => tr.className.includes('grid-group'))!;
        assert.equal(collapsed.textContent, '+ AAPL: 2 条');
    });
});
