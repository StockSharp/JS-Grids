// The whole caption row can go: a tape reads as a pure stream without one,
// and the same menu that hides it brings it back — the body still offers a
// right-click when no header is left to offer one.
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { DataGrid } from '../src/data-grid';
import { FakeElement, asDom, fakeDocument, fireOnDocument, installFakeDocument } from './fake-dom';

installFakeDocument();

interface Row { id: number; symbol: string; }

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
        contextMenu: true,
        ...extra,
    });
    grid.setRows([{ id: 1, symbol: 'AAPL' }, { id: 2, symbol: 'BTC' }]);
    return { grid, head, body };
}

/// Caption cells carry `data-col`; the filter row's cells carry `data-filter`.
const captions = (head: FakeElement) =>
    head.querySelectorAll('th').filter(th => th.getAttribute('data-col') !== null);

const filterCells = (head: FakeElement) =>
    head.querySelectorAll('th').filter(th => th.getAttribute('data-filter') !== null);

const openMenu = () => fakeDocument.body.children.find(el => el.className.includes('grid-menu'));

beforeEach(() => fireOnDocument({ type: 'mousedown' }));

describe('DataGrid header visibility', () => {
    it('shows the caption row unless told otherwise', () => {
        const { grid, head } = makeGrid();
        assert.equal(grid.headerVisible(), true);
        assert.equal(captions(head).length, 2);
    });

    it('renders no caption row when constructed without one', () => {
        const { grid, head } = makeGrid({ headerVisible: false });
        assert.equal(grid.headerVisible(), false);
        assert.equal(captions(head).length, 0);
    });

    it('keeps the filter row its own decision — hiding one leaves the other', () => {
        const { head } = makeGrid({ headerVisible: false, filtersVisible: true });
        assert.equal(captions(head).length, 0);
        assert.equal(filterCells(head).length, 2);
    });

    it('toggles at runtime and round-trips through the saved state', () => {
        const { grid, head } = makeGrid();

        grid.showHeader(false);
        assert.equal(captions(head).length, 0);
        assert.equal(grid.getState().headerVisible, false);

        const { grid: restored, head: restoredHead } = makeGrid();
        restored.setState(grid.getState());
        assert.equal(restored.headerVisible(), false);
        assert.equal(captions(restoredHead).length, 0);

        restored.showHeader(true);
        assert.equal(captions(restoredHead).length, 2);
    });

    it('offers the toggle in the menu, from the body — where the header cannot be clicked away', () => {
        const { head, body } = makeGrid();
        const td = body.children[0].children[0];
        body.dispatchEvent({ type: 'contextmenu', target: td, clientX: 5, clientY: 5, preventDefault: () => { } } as never);

        const item = openMenu()!.children.find(el => el.textContent === 'Hide header row')!;
        assert.notEqual(item, undefined);
        item.dispatchEvent({ type: 'click', target: item });
        assert.equal(captions(head).length, 0);

        // And back: the menu still opens on the body, and now offers the show.
        body.dispatchEvent({ type: 'contextmenu', target: td, clientX: 5, clientY: 5, preventDefault: () => { } } as never);
        const showItem = openMenu()!.children.find(el => el.textContent === 'Show header row')!;
        showItem.dispatchEvent({ type: 'click', target: showItem });
        assert.equal(captions(head).length, 2);
    });
});
