// Per-column filters, rendered by the grid.
//
// The alternative was a single predicate supplied by the host, which is less code
// here and more code in every page that wants a filter row. The grid draws the
// inputs because it is the only thing that knows which columns exist, what they
// are called and what a cell in them holds -- and because a filter that is not
// part of the grid cannot be part of its saved state.
//
// The filter shape is one serialisable object per column rather than a closure,
// for the same reason: a function cannot be written to a store and read back.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DataGrid } from '../src/data-grid';
import { FakeElement, asDom, installFakeDocument } from './fake-dom';

installFakeDocument();

interface Row { id: number; symbol: string; qty: number; side: string; }

const ROWS: Row[] = [
    { id: 1, symbol: 'AAPL', qty: 10, side: 'Buy' },
    { id: 2, symbol: 'BTCUSDT', qty: -5, side: 'Sell' },
    { id: 3, symbol: 'AAPL', qty: 250, side: 'Sell' },
    { id: 4, symbol: 'ESZ5', qty: 0, side: 'Buy' },
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
            { key: 'qty', header: 'Qty', exportable: true, value: r => r.qty, filter: 'number' },
            { key: 'side', header: 'Side', exportable: true, value: r => r.side, filter: 'set' },
        ],
        defaultSort: { col: 'id', dir: 'asc' },
        rowKey: r => String(r.id),
        emptyText: 'No rows',
        // The row is opt-in now; the rule dialog is the default way to filter.
        filtersVisible: true,
        ...extra,
    });
    grid.setRows(ROWS);
    return { grid, head, body };
}

const shownIds = (body: FakeElement) =>
    body.children
        .filter(tr => tr.getAttribute('data-row-key'))
        .map(tr => tr.getAttribute('data-row-key'));

describe('DataGrid filters', () => {
    it('draws a filter row only for the columns that asked for one', () => {
        const { head } = makeGrid();

        // Two rows in the header: the captions, then the filters.
        assert.equal(head.children.length, 2);
        const cells = head.children[1].children;
        assert.equal(cells.length, 4);
        // A column with no filter still gets its cell, or the row would shear.
        assert.equal(cells[0].children.length, 0);
        assert.equal(cells[1].children.length, 1);
    });

    it('has no filter row at all when no column asked', () => {
        const head = new FakeElement('thead');
        const body = new FakeElement('tbody');
        new DataGrid<Row>({
            head: asDom(head),
            body: asDom(body),
            columns: [{ key: 'id', header: 'ID', exportable: true, value: r => r.id }],
            filtersVisible: true,
            defaultSort: null,
            rowKey: r => String(r.id),
            emptyText: 'No rows',
        });

        assert.equal(head.children.length, 1);
    });

    it('matches text anywhere in the value, ignoring case', () => {
        const { grid, body } = makeGrid();

        grid.setFilter('symbol', { text: 'aap' });

        assert.deepEqual(shownIds(body), ['1', '3']);
    });

    it('reads a number range as inclusive, and each end as optional', () => {
        const { grid, body } = makeGrid();

        grid.setFilter('qty', { min: 0 });
        assert.deepEqual(shownIds(body), ['1', '3', '4']);

        grid.setFilter('qty', { min: 0, max: 10 });
        assert.deepEqual(shownIds(body), ['1', '4']);

        grid.setFilter('qty', { max: -1 });
        assert.deepEqual(shownIds(body), ['2']);
    });

    it('matches a set filter on the exact value', () => {
        const { grid, body } = makeGrid();

        grid.setFilter('side', { values: ['Sell'] });

        assert.deepEqual(shownIds(body), ['2', '3']);
    });

    it('combines filters across columns with and', () => {
        const { grid, body } = makeGrid();

        grid.setFilter('symbol', { text: 'aapl' });
        grid.setFilter('side', { values: ['Sell'] });

        assert.deepEqual(shownIds(body), ['3']);
    });

    it('clears one filter and all of them', () => {
        const { grid, body } = makeGrid();

        grid.setFilter('symbol', { text: 'aapl' });
        grid.setFilter('qty', { min: 100 });
        assert.deepEqual(shownIds(body), ['3']);

        grid.setFilter('qty', null);
        assert.deepEqual(shownIds(body), ['1', '3']);

        grid.clearFilters();
        assert.deepEqual(shownIds(body), ['1', '2', '3', '4']);
        assert.deepEqual(grid.filters(), {});
    });

    it('treats an empty filter as no filter, so a cleared input does not hide everything', () => {
        const { grid, body } = makeGrid();

        grid.setFilter('symbol', { text: '   ' });

        assert.deepEqual(shownIds(body), ['1', '2', '3', '4']);
        assert.deepEqual(grid.filters(), {});
    });

    it('shows the empty text when a filter leaves nothing', () => {
        const { grid, body } = makeGrid();

        grid.setFilter('symbol', { text: 'nothing matches this' });

        assert.equal(shownIds(body).length, 0);
        assert.equal(body.children[0].children[0].textContent, 'No rows');
    });

    it('exports what the filter left, not everything held', () => {
        const { grid } = makeGrid();

        grid.setFilter('side', { values: ['Buy'] });

        assert.deepEqual(grid.exportData().rows.map(r => r[0]), [1, 4]);
    });

    it('carries filters in the state, and restores them', () => {
        const { grid, body } = makeGrid();

        grid.setFilter('symbol', { text: 'aapl' });
        const state = grid.getState();
        assert.deepEqual(state.filters, { symbol: { text: 'aapl' } });

        const fresh = makeGrid();
        fresh.grid.setState(state);
        assert.deepEqual(shownIds(fresh.body), ['1', '3']);

        // And a filter on a column that no longer exists is dropped, not thrown at.
        grid.setState({ filters: { gone: { text: 'x' } } });
        assert.deepEqual(shownIds(body), ['1', '2', '3', '4']);
    });

    it('filters as the user types into the rendered input', () => {
        const { grid, body, head } = makeGrid();

        const input = head.children[1].children[1].children[0];
        input.value = 'esz';
        input.dispatchEvent({ type: 'input', target: input });

        assert.deepEqual(shownIds(body), ['4']);
        assert.deepEqual(grid.filters(), { symbol: { text: 'esz' } });
    });

    it('offers the set filter the values actually present, once each', () => {
        const { head } = makeGrid();

        const select = head.children[1].children[3].children[0];
        // A blank first option is "no filter"; the rest are the distinct values.
        // Read through `value` rather than the attribute: that is what the select
        // reads back, and the fake DOM does not reflect one into the other.
        assert.deepEqual(select.children.map(o => o.value), ['', 'Buy', 'Sell']);
        assert.deepEqual(select.children.map(o => o.textContent), ['', 'Buy', 'Sell']);
    });

    it('hides the filter row without forgetting the filters', () => {
        const { grid, head, body } = makeGrid();

        grid.setFilter('symbol', { text: 'aapl' });
        grid.showFilters(false);

        // The row is gone but the rows stay filtered: hiding the controls is about
        // screen space, not about undoing what the user asked for.
        assert.equal(head.children.length, 1);
        assert.deepEqual(shownIds(body), ['1', '3']);
        assert.equal(grid.filtersVisible(), false);
        assert.equal(grid.getState().filtersVisible, false);

        grid.showFilters(true);
        assert.equal(head.children.length, 2);
        assert.equal(head.children[1].children[1].children[0].value, 'aapl');
    });

    it('reads an operator when one is given', () => {
        const { grid, body } = makeGrid();

        grid.setFilter('qty', { op: 'gt', text: '10' });
        assert.deepEqual(shownIds(body), ['3']);

        grid.setFilter('qty', { op: 'le', text: '0' });
        assert.deepEqual(shownIds(body), ['2', '4']);

        grid.setFilter('qty', { op: 'ne', text: '10' });
        assert.deepEqual(shownIds(body), ['2', '3', '4']);
    });

    it('compares text as text and numbers as numbers', () => {
        const { grid, body } = makeGrid();

        // '9' > '10' as strings, 9 < 10 as numbers -- a quantity column has to mean
        // the second, and a symbol column can only mean the first.
        grid.setFilter('symbol', { op: 'gt', text: 'B' });
        assert.deepEqual(shownIds(body), ['2', '4']);

        grid.setFilter('symbol', null);
        grid.setFilter('qty', { op: 'gt', text: '9' });
        assert.deepEqual(shownIds(body), ['1', '3']);
    });

    it('asks about the value itself for empty and notEmpty', () => {
        const { grid, body } = makeGrid();

        // These two are a filter with nothing typed in, which every other op is not.
        grid.setFilter('symbol', { op: 'notEmpty' });
        assert.deepEqual(shownIds(body), ['1', '2', '3', '4']);
        assert.deepEqual(grid.filters(), { symbol: { op: 'notEmpty' } });

        grid.setFilter('symbol', { op: 'empty' });
        assert.deepEqual(shownIds(body), []);
    });

    it('ignores an operator with nothing to compare against', () => {
        const { grid } = makeGrid();

        grid.setFilter('qty', { op: 'gt' });

        assert.deepEqual(grid.filters(), {});
    });

    it('keeps meaning what it meant when no operator is given', () => {
        const { grid, body } = makeGrid();

        // What the inline row writes, and what a filter stored before operators
        // existed looks like.
        grid.setFilter('symbol', { text: 'aap' });
        assert.deepEqual(shownIds(body), ['1', '3']);

        grid.setFilter('symbol', null);
        grid.setFilter('qty', { min: 0, max: 10 });
        assert.deepEqual(shownIds(body), ['1', '4']);
    });

    it('orders text by collation, the way the column is sorted', () => {
        const head = new FakeElement('thead');
        const body = new FakeElement('tbody');
        interface Word { id: number; word: string; }
        const grid = new DataGrid<Word>({
            head: asDom(head),
            body: asDom(body),
            columns: [{ key: 'word', header: 'Word', exportable: true, filter: 'text', value: r => r.word }],
            defaultSort: { col: 'word', dir: 'asc' },
            rowKey: r => String(r.id),
            emptyText: 'none',
            locale: 'de',
        });
        grid.setRows([{ id: 1, word: 'apfel' }, { id: 2, word: 'Äpfel' }, { id: 3, word: 'zebra' }]);

        // 'ä' is U+00E4, so a raw `>` puts it after 'z' and this filter would answer
        // with the accented rows -- the opposite of where the column shows them.
        grid.setFilter('word', { op: 'gt', text: 'zebra' });
        assert.deepEqual(grid.displayRows().map(r => r.id), []);

        grid.setFilter('word', { op: 'lt', text: 'zebra' });
        assert.deepEqual(grid.displayRows().map(r => r.id).sort(), [1, 2]);
    });

    it('folds case in the ordering rules, as it already did in the others', () => {
        const { grid } = makeGrid();

        // `eq` has always ignored case; `>=` comparing raw code units did not, so the
        // same column answered two different questions depending on the rule picked.
        grid.setFilter('symbol', { op: 'ge', text: 'aapl' });
        const shown = grid.displayRows().map(r => r.symbol);

        assert.ok(shown.includes('AAPL'), 'AAPL is not below aapl');
    });
});
