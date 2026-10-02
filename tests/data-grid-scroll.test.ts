// A long table painted a page at a time. `renderLimit` alone caps what is painted, which leaves
// every row past the cap out of reach; given the element the table scrolls in, the grid paints the
// next `renderLimit` rows each time that element is brought near its end, so every row can be reached
// and thousands are never painted up front.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DataGrid, type GridOptions } from '../src/data-grid';
import { FakeElement, asDom, installFakeDocument } from './fake-dom';

installFakeDocument();

interface Item {
    id: number;
}

const ITEMS: Item[] = Array.from({ length: 20 }, (_, i) => ({ id: i + 1 }));

// The scroller is 100px tall and every row 40px, so a screen holds two and a half rows. Its
// content grows with the rows painted into it, as a browser lays it out.
const VIEW_HEIGHT = 100;
const ROW_HEIGHT = 40;

type Scrollers = 'laid-out' | 'hidden' | 'none';

function makeGrid(scrollerKind: Scrollers, renderLimit: number | undefined) {
    const head = new FakeElement('thead');
    const body = new FakeElement('tbody');
    const view = new FakeElement('div');
    if (scrollerKind === 'laid-out') {
        view.clientHeight = VIEW_HEIGHT;
        Object.defineProperty(view, 'scrollHeight', { get: () => body.children.length * ROW_HEIGHT });
    }

    let rendered = 0;
    const options: GridOptions<Item> = {
        head: asDom<HTMLElement>(head),
        body: asDom<HTMLElement>(body),
        columns: [{ key: 'id', header: 'ID', exportable: true, value: (i) => i.id }],
        defaultSort: { col: 'id', dir: 'asc' },
        rowKey: (i) => String(i.id),
        emptyText: 'Nothing',
        renderLimit,
        scroller: scrollerKind === 'none' ? undefined : asDom<HTMLElement>(view),
        afterRender: () => { rendered++; },
    };
    const grid = new DataGrid<Item>(options);
    grid.setRows(ITEMS);
    return { grid, options, body, view, renderedCount: () => rendered };
}

const painted = (body: FakeElement) => body.children.length;
const dataRows = (body: FakeElement) => body.children.filter(tr => tr.getAttribute('data-row-key') !== null).length;

function scrollToEnd(view: FakeElement): void {
    view.scrollTop = view.scrollHeight - view.clientHeight;
    view.dispatchEvent({ type: 'scroll', target: view });
}

describe('DataGrid — painting a long table as it is scrolled', () => {
    it('paints on until the first pages leave something to scroll: a screen past the one in view', () => {
        // Three rows fill 120px of a 100px scroller; six fill 240px, a screen beyond the first.
        const { body } = makeGrid('laid-out', 3);

        assert.equal(painted(body), 6);
    });

    it('paints the next page each time the scroller nears its end, and stops at the last row', () => {
        const { body, view } = makeGrid('laid-out', 3);

        scrollToEnd(view);
        assert.equal(painted(body), 9);

        for (let i = 0; i < 10; i++) scrollToEnd(view);
        assert.equal(painted(body), ITEMS.length);
    });

    it('paints nothing more while the scroller is far from its end', () => {
        const { body, view } = makeGrid('laid-out', 3);

        view.scrollTop = 0;
        view.dispatchEvent({ type: 'scroll', target: view });

        assert.equal(painted(body), 6);
    });

    it('tells the host once about each repaint, however many pages it took', () => {
        // A watchlist re-subscribes from what is on screen after every paint.
        const { view, renderedCount } = makeGrid('laid-out', 3);
        const before = renderedCount();

        scrollToEnd(view);

        assert.equal(renderedCount(), before + 1);
    });

    it('keeps the pages it painted when the rows are replaced', () => {
        // A live list repaints on every quote; a reader halfway down must not be thrown back to the top.
        const { grid, body, view } = makeGrid('laid-out', 3);
        scrollToEnd(view);
        view.scrollTop = 0;

        grid.setRows([...ITEMS]);

        assert.equal(painted(body), 9);
    });

    it('leaves a scroller that is not laid out at its first page', () => {
        // A panel in a hidden tab has no height: filling it would paint the whole table.
        const { body } = makeGrid('hidden', 3);

        assert.equal(painted(body), 3);
    });

    it('reads renderLimit on every paint: a limit set on a live grid applies at the next render', () => {
        const { grid, options, body } = makeGrid('none', 3);
        assert.equal(painted(body), 3);

        options.renderLimit = undefined;
        grid.render();
        assert.equal(painted(body), ITEMS.length);

        options.renderLimit = 5;
        grid.render();
        assert.equal(painted(body), 5);
    });

    it('pages nothing while renderLimit is off, and pages once a limit is set', () => {
        const { grid, options, body } = makeGrid('laid-out', undefined);
        assert.equal(painted(body), ITEMS.length);

        options.renderLimit = 3;
        grid.render();

        assert.equal(painted(body), 6);
    });

    it('does not spin on a renderLimit of nothing', () => {
        const { body } = makeGrid('laid-out', 0);

        assert.equal(dataRows(body), 0);
    });
});
