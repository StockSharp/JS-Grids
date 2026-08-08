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
});
