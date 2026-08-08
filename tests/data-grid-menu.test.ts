// The context menu the grid offers out of the box, and the seam a host overrides
// it through.
//
// Everywhere else this package hands chrome to the host -- the column picker's
// dialog is the host's markup, its buttons, its modal library. The menu is the
// exception, and the reason is worth stating: positioning a list at a pointer,
// dismissing it on the next click and on Escape, and keeping it inside the window
// is the same hundred lines in every host, and none of them are about tables.
//
// So what is tested here is that the default is useful without any host code, and
// that a host can still take the whole thing over -- including refusing it.
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { DataGrid, type GridMenuContext } from '../src/data-grid';
import { GridContextMenu, type GridMenuItem } from '../src/context-menu';
import { FakeElement, asDom, fakeDocument, fireOnDocument, installFakeDocument } from './fake-dom';

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
        defaultSort: null,
        rowKey: r => String(r.id),
        emptyText: 'No rows',
        contextMenu: true,
        ...extra,
    });
    grid.setRows(ROWS);
    return { grid, head, body };
}

/// A right-click on the cell at (row, column), the way a browser reports it.
function rightClick(body: FakeElement, rowIndex: number, colIndex: number) {
    const td = body.children[rowIndex].children[colIndex];
    let prevented = false;
    body.dispatchEvent({
        type: 'contextmenu',
        target: td,
        clientX: 10,
        clientY: 20,
        preventDefault: () => { prevented = true; },
    } as never);
    return prevented;
}

const openMenu = () => fakeDocument.body.children.find(el => el.className.includes('grid-menu'));

// One fake document serves the whole file, so a menu a test leaves open would still
// be there for the next one. A browser has the same rule and its own answer: the
// next click anywhere dismisses it.
beforeEach(() => fireOnDocument({ type: 'mousedown' }));
const labels = (menu: FakeElement) => menu.children.map(el => el.textContent);

describe('DataGrid context menu', () => {
    it('is absent until asked for', () => {
        const { body } = makeGrid({ contextMenu: false });

        rightClick(body, 0, 1);

        assert.equal(openMenu(), undefined);
    });

    it('opens on a cell and offers what applies to it', () => {
        const { body } = makeGrid();

        const prevented = rightClick(body, 0, 1);

        // The browser menu has to be suppressed, or both appear at once.
        assert.equal(prevented, true);
        const menu = openMenu()!;
        assert.match(labels(menu).join('|'), /Sort ascending/);
        assert.match(labels(menu).join('|'), /Group by this column/);
        assert.match(labels(menu).join('|'), /Filter by this value: AAPL/);
        assert.match(labels(menu).join('|'), /Copy row/);
    });

    it('acts on the grid when an item is chosen, and closes first', () => {
        const { grid, body } = makeGrid();

        rightClick(body, 0, 1);
        const item = openMenu()!.children.find(el => el.textContent === 'Group by this column')!;
        item.dispatchEvent({ type: 'click', target: item });

        assert.equal(grid.groupedBy(), 'symbol');
        assert.equal(openMenu(), undefined);
    });

    it('offers ungrouping once grouped, in place of grouping', () => {
        const { grid, body } = makeGrid();
        grid.groupBy('symbol');

        rightClick(body, 1, 1);   // a data row under the group header

        const shown = labels(openMenu()!).join('|');
        assert.match(shown, /Ungroup/);
        assert.doesNotMatch(shown, /Group by this column/);
    });

    it('dims what cannot be done rather than hiding it', () => {
        const { grid, body } = makeGrid();

        rightClick(body, 0, 1);
        const menu = openMenu()!;
        const disabled = menu.children.filter(el => el.className.includes('is-disabled')).map(el => el.textContent);
        // No sort is set and nothing is hidden or filtered yet.
        assert.deepEqual(disabled.sort(), ['Clear filters', 'Clear sort', 'Show all columns']);

        // A dimmed line does nothing when clicked.
        const clear = menu.children.find(el => el.textContent === 'Clear filters')!;
        clear.dispatchEvent({ type: 'click', target: clear });
        assert.equal(openMenu(), menu, 'a disabled item should not even close the menu');

        grid.setFilter('symbol', { text: 'a' });
        fireOnDocument({ type: 'mousedown' });
        rightClick(body, 0, 1);
        const now = openMenu()!.children.filter(el => el.className.includes('is-disabled')).map(el => el.textContent);
        assert.ok(!now.includes('Clear filters'));
    });

    it('will not let the last column be hidden', () => {
        const { grid, body } = makeGrid();
        grid.hideColumn('id');
        grid.hideColumn('qty');

        rightClick(body, 0, 0);

        const hide = openMenu()!.children.find(el => el.textContent === 'Hide column')!;
        assert.ok(hide.className.includes('is-disabled'));
    });

    it('closes on a click elsewhere and on Escape', () => {
        const { body } = makeGrid();

        rightClick(body, 0, 1);
        fireOnDocument({ type: 'mousedown' });
        assert.equal(openMenu(), undefined);

        rightClick(body, 0, 1);
        fireOnDocument({ type: 'keydown', key: 'Escape' } as never);
        assert.equal(openMenu(), undefined);

        // A key that is not Escape leaves it alone.
        rightClick(body, 0, 1);
        fireOnDocument({ type: 'keydown', key: 'a' } as never);
        assert.notEqual(openMenu(), undefined);
        fireOnDocument({ type: 'mousedown' });
    });

    it('lets a host add to the items, keeping the grid own ones', () => {
        const { body } = makeGrid({
            contextMenu: {
                items: (context: GridMenuContext<Row>, defaults: GridMenuItem[]) =>
                    [{ label: `Cancel #${context.row?.id}`, run: () => {} }, {}, ...defaults],
            },
        });

        rightClick(body, 0, 1);

        const shown = labels(openMenu()!);
        assert.equal(shown[0], 'Cancel #1');
        assert.ok(shown.includes('Sort ascending'));
    });

    it('lets a host refuse the menu for a click', () => {
        const { body } = makeGrid({ contextMenu: { items: () => [] } });

        const prevented = rightClick(body, 0, 1);

        assert.equal(openMenu(), undefined);
        // Nothing suppressed, so the browser's own menu appears -- which is the point
        // of returning nothing rather than a menu with no items in it.
        assert.equal(prevented, false);
    });

    it('takes the wording from the host', () => {
        const { body } = makeGrid({ contextMenu: { labels: { sortAsc: 'По возрастанию' } } });

        rightClick(body, 0, 1);

        assert.ok(labels(openMenu()!).includes('По возрастанию'));
    });
});

describe('GridContextMenu', () => {
    it('shows one menu at a time for the page', () => {
        const first = new GridContextMenu();
        const second = new GridContextMenu();

        first.open([{ label: 'a', run: () => {} }], 0, 0);
        second.open([{ label: 'b', run: () => {} }], 0, 0);

        assert.equal(first.isOpen, false);
        assert.equal(second.isOpen, true);
        assert.equal(fakeDocument.body.children.filter(el => el.className.includes('grid-menu')).length, 1);
        second.close();
    });

    it('draws a separator for an item with no label', () => {
        const menu = new GridContextMenu();

        menu.open([{ label: 'a', run: () => {} }, {}, { label: 'b', run: () => {} }], 0, 0);

        const el = openMenu()!;
        assert.equal(el.children[1].className, 'grid-menu-separator');
        menu.close();
    });

    it('opens nothing for an empty list', () => {
        const menu = new GridContextMenu();

        menu.open([], 0, 0);

        assert.equal(menu.isOpen, false);
    });
});
