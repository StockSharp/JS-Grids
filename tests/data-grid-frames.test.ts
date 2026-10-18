// The grid decides when to paint. Whoever feeds it -- a tape on every print, a board on every tick -- hands
// the rows over and thinks no further: in a browser the grid paints once per frame however many updates the
// frame brought, and a hidden tab, which gets no frames, gets no paints. Reading a row or a cell paints what
// is pending first, so a caller never reads a table older than the rows it handed over.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { DataGrid, type GridOptions } from '../src/data-grid';
import { FakeElement, asDom, frameClock, installFakeDocument } from './fake-dom';

installFakeDocument();

interface Print {
    id: number;
    price: number;
}

function makeGrid(extra: Partial<GridOptions<Print>> = {}) {
    const body = new FakeElement('tbody');
    let paints = 0;
    const grid = new DataGrid<Print>({
        head: asDom<HTMLElement>(new FakeElement('thead')),
        body: asDom<HTMLElement>(body),
        columns: [
            { key: 'id', header: 'ID', exportable: true, value: p => p.id },
            { key: 'price', header: 'Price', exportable: true, value: p => p.price },
        ],
        defaultSort: { col: 'id', dir: 'desc' },
        rowKey: p => String(p.id),
        emptyText: 'No prints',
        afterRender: () => { paints++; },
        ...extra,
    });
    return { grid, body, paints: () => paints };
}

const keys = (body: FakeElement) => body.children.map(tr => tr.dataset.rowKey);

describe('DataGrid — in a browser it paints once a frame', () => {
    beforeEach(() => frameClock.install());
    afterEach(() => frameClock.uninstall());

    it('paints the updates of one frame once, with the latest rows', () => {
        const { grid, body, paints } = makeGrid();

        grid.setRows([{ id: 1, price: 10 }]);
        grid.setRows([{ id: 2, price: 11 }, { id: 1, price: 10 }]);
        grid.setRows([{ id: 3, price: 12 }, { id: 2, price: 11 }, { id: 1, price: 10 }]);

        assert.equal(paints(), 0, 'painted before the frame');

        frameClock.run();

        assert.equal(paints(), 1);
        assert.deepEqual(keys(body), ['3', '2', '1']);
    });

    // A hidden tab gets no frames: the rows keep arriving and nothing is drawn until the tab is shown again.
    it('paints nothing while no frame comes, and the first frame catches up', () => {
        const { grid, body, paints } = makeGrid();

        for (let id = 1; id <= 50; id++)
            grid.setRows([{ id, price: 10 + id }]);

        assert.equal(paints(), 0);
        assert.deepEqual(keys(body), [undefined], 'only the empty row the grid was built with');

        frameClock.run();

        assert.equal(paints(), 1);
        assert.deepEqual(keys(body), ['50']);
    });

    it('paints what is pending at once for a caller that reads a row or a cell', () => {
        const { grid, paints } = makeGrid();

        grid.setRows([{ id: 7, price: 70 }]);

        assert.equal(grid.cellElement('7', 'price')?.textContent, '70');
        assert.notEqual(grid.rowElement('7'), null);
        assert.equal(paints(), 1);

        frameClock.run();

        assert.equal(paints(), 1, 'the frame painted again what the read had painted');
    });

    it('paints nothing at its frame once destroyed', () => {
        const { grid, body, paints } = makeGrid();

        grid.setRows([{ id: 1, price: 10 }]);
        grid.destroy();
        frameClock.run();

        assert.equal(paints(), 0);
        assert.deepEqual(keys(body), [undefined]);
    });
});

describe('DataGrid — with no frame clock it paints at once', () => {
    it('paints on the call, as a page without frames (a test process) needs', () => {
        const { grid, body, paints } = makeGrid();

        grid.setRows([{ id: 1, price: 10 }]);

        assert.equal(paints(), 1);
        assert.deepEqual(keys(body), ['1']);
    });
});
