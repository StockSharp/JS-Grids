// A live tape prepends prints, and the host wants the newcomer to flash
// without hand-patching cells after every render. `flashNewClass` is the
// grid's native answer: a row whose key was not on screen the render before
// carries the class for one repaint. The class name is the caller's — the
// package still names nothing (see AGENTS.md, "The library owns no chrome").
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DataGrid } from '../src/data-grid';
import { FakeElement, asDom, installFakeDocument } from './fake-dom';

installFakeDocument();

interface Print { id: number; price: number; }

function makeGrid(extra: Record<string, unknown> = {}) {
    const head = new FakeElement('thead');
    const body = new FakeElement('tbody');
    const grid = new DataGrid<Print>({
        head: asDom(head),
        body: asDom(body),
        columns: [
            { key: 'id', header: 'ID', exportable: true, value: r => r.id },
            { key: 'price', header: 'Price', exportable: true, value: r => r.price },
        ],
        defaultSort: { col: 'id', dir: 'desc' },
        rowKey: r => String(r.id),
        emptyText: 'No prints',
        flashNewClass: 'flash-new',
        ...extra,
    });
    return { grid, body };
}

const flashed = (body: FakeElement) =>
    body.children.filter(tr => tr.className.includes('flash-new')).map(tr => tr.getAttribute('data-row-key'));

describe('DataGrid flashNewClass', () => {
    it('never flashes the first paint — a seeded table is history, not news', () => {
        const { grid, body } = makeGrid();

        grid.setRows([{ id: 1, price: 10 }, { id: 2, price: 11 }]);

        assert.deepEqual(flashed(body), []);
    });

    it('flashes exactly the rows that were not on screen the render before', () => {
        const { grid, body } = makeGrid();
        grid.setRows([{ id: 1, price: 10 }, { id: 2, price: 11 }]);

        grid.setRows([{ id: 1, price: 10 }, { id: 2, price: 11 }, { id: 3, price: 12 }]);

        assert.deepEqual(flashed(body), ['3']);
        // The rows that were already there keep their calm.
        assert.equal(body.children.length, 3);
    });

    it('does not re-flash on a repaint that brought nothing new', () => {
        const { grid, body } = makeGrid();
        grid.setRows([{ id: 1, price: 10 }]);
        grid.setRows([{ id: 1, price: 10 }, { id: 2, price: 11 }]);

        // A sort click, a selection change — any repaint over the same keys.
        grid.render();

        assert.deepEqual(flashed(body), []);
    });

    it('stays entirely out of the way without the option', () => {
        const { grid, body } = makeGrid({ flashNewClass: undefined });
        grid.setRows([{ id: 1, price: 10 }]);

        grid.setRows([{ id: 1, price: 10 }, { id: 2, price: 11 }]);

        assert.deepEqual(flashed(body), []);
    });

    it('reads the paint after flashReset as a fresh seed, then arms again', () => {
        const { grid, body } = makeGrid();
        grid.setRows([{ id: 1, price: 10 }]);

        // The host replaced the tape wholesale — a new instrument's history,
        // not fifty arrivals at once.
        grid.flashReset();
        grid.setRows([{ id: 2, price: 11 }, { id: 3, price: 12 }]);
        assert.deepEqual(flashed(body), []);

        grid.setRows([{ id: 2, price: 11 }, { id: 3, price: 12 }, { id: 4, price: 13 }]);
        assert.deepEqual(flashed(body), ['4']);
    });
});
