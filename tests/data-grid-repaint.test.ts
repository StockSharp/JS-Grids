// A repaint changes what changed and leaves the rest of the table alone. A live tape repaints on
// every print and a quote board on every tick: at a hundred updates a second, building every row
// anew makes thousands of rows a second and takes the frames with it. A row on screen keeps its
// element across repaints while its key, its cells and its class read the same; a cell whose text
// or class moved is built anew, and so is anything the grid cannot compare.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DataGrid, type GridOptions } from '../src/data-grid';
import { FakeElement, asDom, asFake, installFakeDocument } from './fake-dom';

installFakeDocument();

interface Print {
    id: number;
    price: number;
}

function makeGrid(rows: Print[], extra: Partial<GridOptions<Print>> = {}) {
    const head = new FakeElement('thead');
    const body = new FakeElement('tbody');
    const grid = new DataGrid<Print>({
        head: asDom<HTMLElement>(head),
        body: asDom<HTMLElement>(body),
        columns: [
            { key: 'id', header: 'ID', exportable: true, value: p => p.id },
            { key: 'price', header: 'Price', exportable: true, value: p => p.price, cellClass: p => (p.price > 100 ? 'num high' : 'num') },
        ],
        defaultSort: { col: 'id', dir: 'desc' },
        rowKey: p => String(p.id),
        emptyText: 'No prints',
        ...extra,
    });
    grid.setRows(rows);
    return { grid, head, body };
}

const keys = (body: FakeElement) => body.children.map(tr => tr.dataset.rowKey);
const rowOf = (body: FakeElement, key: string) => {
    const tr = body.children.find(el => el.dataset.rowKey === key);
    if (!tr) throw new Error(`row ${key} is not painted`);
    return tr;
};

describe('DataGrid — a repaint keeps what did not change', () => {
    it('keeps the elements of the rows a newcomer pushed down', () => {
        const rows = [{ id: 2, price: 11 }, { id: 1, price: 10 }];
        const { grid, body } = makeGrid(rows);
        const [two, one] = body.children;

        grid.setRows([{ id: 3, price: 12 }, ...rows]);

        assert.deepEqual(keys(body), ['3', '2', '1']);
        assert.equal(rowOf(body, '2'), two);
        assert.equal(rowOf(body, '1'), one);
    });

    it('takes out the row that left the table, and only that one', () => {
        const rows = [{ id: 3, price: 12 }, { id: 2, price: 11 }, { id: 1, price: 10 }];
        const { grid, body } = makeGrid(rows);
        const [three, two] = body.children;

        grid.setRows(rows.slice(0, 2));

        assert.deepEqual(keys(body), ['3', '2']);
        assert.equal(rowOf(body, '3'), three);
        assert.equal(rowOf(body, '2'), two);
    });

    it('rebuilds the one cell whose value changed in place and leaves its neighbours', () => {
        const rows = [{ id: 2, price: 11 }, { id: 1, price: 10 }];
        const { grid, body } = makeGrid(rows);
        const one = rowOf(body, '1');
        const [idCell, priceCell] = one.children;
        const two = rowOf(body, '2');
        const twoCells = two.children.slice();

        rows[1].price = 15;
        grid.render();

        assert.equal(rowOf(body, '1'), one);
        assert.equal(one.children[0], idCell);
        assert.notEqual(one.children[1], priceCell);
        assert.equal(one.children[1].textContent, '15');
        assert.equal(rowOf(body, '2'), two);
        assert.deepEqual(two.children, twoCells);
    });

    it('rebuilds a cell whose class changed though its text did not', () => {
        const rows = [{ id: 1, price: 100 }];
        const { grid, body } = makeGrid(rows, {
            columns: [
                { key: 'id', header: 'ID', exportable: true, value: p => p.id },
                { key: 'price', header: 'Price', exportable: true, value: p => p.price, render: () => 'n/a', cellClass: p => (p.price > 100 ? 'high' : 'low') },
            ],
        });
        const cell = rowOf(body, '1').children[1];

        rows[0].price = 200;
        grid.render();

        assert.notEqual(rowOf(body, '1').children[1], cell);
        assert.equal(rowOf(body, '1').children[1].className, 'high');
    });

    it('gives a kept row its new class', () => {
        const rows = [{ id: 1, price: 10 }];
        const { grid, body } = makeGrid(rows, { rowClass: p => (p.price > 100 ? 'large' : '') });
        const tr = rowOf(body, '1');

        rows[0].price = 500;
        grid.render();

        assert.equal(rowOf(body, '1'), tr);
        assert.equal(tr.className, 'large');
    });

    it('moves the rows a new sort reorders instead of building them again', () => {
        const rows = [{ id: 1, price: 30 }, { id: 2, price: 10 }, { id: 3, price: 20 }];
        const { head, body } = makeGrid(rows);
        const before = new Map(body.children.map(tr => [tr.dataset.rowKey, tr]));

        const th = head.querySelectorAll('[data-sort]').find(el => el.dataset.sort === 'price')!;
        head.dispatchEvent({ type: 'click', target: th });

        assert.deepEqual(keys(body), ['2', '3', '1']);
        for (const tr of body.children) assert.equal(tr, before.get(tr.dataset.rowKey));
    });

    it('marks a selection on the row that is already there', () => {
        const rows = [{ id: 2, price: 11 }, { id: 1, price: 10 }];
        const { grid, body } = makeGrid(rows, { selection: 'single', selectedClass: 'sel' });
        const tr = rowOf(body, '1');

        grid.setSelection(['1']);

        assert.equal(rowOf(body, '1'), tr);
        assert.equal(tr.className, 'sel');
        assert.equal(rowOf(body, '2').className, '');
    });

    it('builds anew a cell whose renderer hands over an element, which it cannot compare', () => {
        const rows = [{ id: 1, price: 10 }];
        const { grid, body } = makeGrid(rows, {
            columns: [
                { key: 'id', header: 'ID', exportable: true, value: p => p.id },
                { key: 'act', header: 'Act', exportable: false, render: () => document.createElement('button') },
            ],
        });
        const tr = rowOf(body, '1');
        const [idCell, actCell] = tr.children;

        grid.render();

        assert.equal(rowOf(body, '1'), tr);
        assert.equal(tr.children[0], idCell);
        assert.notEqual(tr.children[1], actCell);
    });

    // A host that flashes a cell decorates the one painted; the next paint hands it a fresh cell to decorate again,
    // as it always did, so an animation keyed on the class plays again.
    it('builds anew a cell the host decorated after the paint', () => {
        const rows = [{ id: 1, price: 10 }];
        const { grid } = makeGrid(rows);
        const cell = asFake(grid.cellElement('1', 'price'));
        cell.classList.add('flash-up');

        grid.render();

        assert.notEqual(asFake(grid.cellElement('1', 'price')), cell);
        assert.equal(asFake(grid.cellElement('1', 'price')).className, 'num');
    });

    it('builds anew a row the host decorated after the paint', () => {
        const rows = [{ id: 1, price: 10 }];
        const { grid, body } = makeGrid(rows);
        const tr = rowOf(body, '1');
        tr.classList.add('flash-row');

        grid.render();

        assert.notEqual(rowOf(body, '1'), tr);
        assert.equal(rowOf(body, '1').className, '');
    });

    it('builds the row anew for another object under the same key when the host binds rows', () => {
        const bound: Print[] = [];
        const { grid, body } = makeGrid([{ id: 1, price: 10 }], { bindRow: (_tr, row) => { bound.push(row); } });
        const tr = rowOf(body, '1');

        grid.setRows(grid.rows);
        assert.equal(rowOf(body, '1'), tr, 'the same object keeps its bound row');

        grid.setRows([{ id: 1, price: 10 }]);
        assert.notEqual(rowOf(body, '1'), tr);
        assert.equal(bound.length, 2);
    });

    it('builds the cell anew on every paint when the column binds its cells', () => {
        const rows = [{ id: 1, price: 10 }];
        const { grid } = makeGrid(rows, {
            columns: [
                { key: 'id', header: 'ID', exportable: true, value: p => p.id },
                { key: 'price', header: 'Price', exportable: true, value: p => p.price, bindCell: () => {} },
            ],
        });
        const idCell = asFake(grid.cellElement('1', 'id'));
        const priceCell = asFake(grid.cellElement('1', 'price'));

        grid.render();

        assert.equal(asFake(grid.cellElement('1', 'id')), idCell);
        assert.notEqual(asFake(grid.cellElement('1', 'price')), priceCell);
    });

    it('lays a row out anew when its columns change', () => {
        const rows = [{ id: 1, price: 10 }];
        const { grid, body } = makeGrid(rows);

        grid.hideColumn('price');

        assert.deepEqual(rowOf(body, '1').children.map(td => td.dataset.col), ['id']);

        grid.showColumn('price');
        grid.setColumnOrder(['price', 'id']);

        assert.deepEqual(rowOf(body, '1').children.map(td => td.dataset.col), ['price', 'id']);
    });

    it('paints two rows that share a key as two rows', () => {
        const rows = [{ id: 1, price: 10 }, { id: 1, price: 11 }];
        const { grid, body } = makeGrid(rows);

        grid.render();

        assert.equal(body.children.length, 2);
        assert.notEqual(body.children[0], body.children[1]);
    });

    it('finds a kept row and its cells by key after the repaint', () => {
        const rows = [{ id: 1, price: 10 }];
        const { grid, body } = makeGrid(rows);

        grid.setRows([{ id: 2, price: 20 }, ...rows]);

        assert.equal(asFake(grid.rowElement('1')), rowOf(body, '1'));
        assert.equal(asFake(grid.cellElement('1', 'price')).textContent, '10');
        assert.equal(asFake(grid.cellElement('2', 'price')).textContent, '20');
    });
});
