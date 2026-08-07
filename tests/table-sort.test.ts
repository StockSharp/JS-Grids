// Unit coverage for TableSort — the column-sort controller behind DataGrid.
// Focus: the "default sort" behaviour (a table always has a deterministic
// resting order) plus the explicit-column override and the empties-sink rule.
// Most of it needs no DOM at all; the two cases that are about the header cycle
// drive a fake <thead> the way a browser would.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SortDirections, TableSort, type SortSpec } from '../src/table-sort';
import { FakeElement, asDom } from './fake-dom';

interface Row {
    localId?: number;
    id?: number;
    price?: number;
}

const accessors = {
    id: (o: Row) => o.localId ?? o.id,
    price: (o: Row) => o.price,
};

function make(defaultSort: SortSpec | null): TableSort<Row> {
    return new TableSort<Row>(null, accessors, () => {}, defaultSort);
}

/// A <thead> carrying one sortable header per key, the markup TableSort binds to.
function header(keys: string[]): FakeElement {
    const thead = new FakeElement('thead');
    const tr = new FakeElement('tr');
    for (const key of keys) {
        const th = new FakeElement('th');
        th.dataset.sort = key;
        tr.appendChild(th);
    }
    thead.appendChild(tr);
    return thead;
}

function headerCell(head: FakeElement, key: string): FakeElement {
    const th = head.querySelectorAll('[data-sort]').find(el => el.dataset.sort === key);
    if (!th) throw new Error(`no sortable header for column "${key}"`);
    return th;
}

/// Click a header the way a browser would: the listener sits on <thead> and reads
/// the <th> off the event target.
function clickHeader(head: FakeElement, key: string): void {
    head.dispatchEvent({ type: 'click', target: headerCell(head, key) });
}

function attach(head: FakeElement, defaultSort: SortSpec | null): TableSort<Row> {
    return new TableSort<Row>(asDom<HTMLElement>(head), accessors, () => {}, defaultSort);
}

describe('TableSort — default (resting) order', () => {
    it('applies the table default when no column is explicitly selected', () => {
        const sort = make({ col: 'id', dir: SortDirections.Desc });
        const rows: Row[] = [{ localId: 1 }, { localId: 143 }, { localId: 142 }];
        // Raw insertion order is 1, 143, 142; default is id-descending.
        assert.deepStrictEqual(sort.apply(rows).map(r => r.localId), [143, 142, 1]);
    });

    it('marks the default column on the header before anything is clicked', () => {
        // The resting sort has to be visible on the first paint: a blank header over
        // a sorted table gives the user no reason for the order they are looking at.
        const head = header(['id', 'price']);
        attach(head, { col: 'id', dir: SortDirections.Desc });

        assert.equal(headerCell(head, 'id').className, 'sort-desc');
        assert.equal(headerCell(head, 'price').className, '');
    });

    it('an explicitly-selected column overrides the default', () => {
        const head = header(['id', 'price']);
        const sort = attach(head, { col: 'id', dir: SortDirections.Desc });
        const rows: Row[] = [{ localId: 1, price: 30 }, { localId: 2, price: 10 }, { localId: 3, price: 20 }];

        clickHeader(head, 'price');

        assert.deepStrictEqual(sort.apply(rows).map(r => r.price), [10, 20, 30]);
        assert.equal(headerCell(head, 'price').className, 'sort-asc');
        assert.equal(headerCell(head, 'id').className, '');
    });

    it('cycling a header back past desc returns to the table default', () => {
        const head = header(['id', 'price']);
        const sort = attach(head, { col: 'id', dir: SortDirections.Desc });
        const rows: Row[] = [{ localId: 1, price: 30 }, { localId: 2, price: 10 }, { localId: 3, price: 20 }];

        clickHeader(head, 'price');   // asc
        clickHeader(head, 'price');   // desc
        clickHeader(head, 'price');   // back to the table default

        assert.deepStrictEqual(sort.apply(rows).map(r => r.localId), [3, 2, 1]);
        assert.equal(headerCell(head, 'price').className, '');
        assert.equal(headerCell(head, 'id').className, 'sort-desc');
    });

    it('rows with no value for the sort column sink to the end regardless of direction', () => {
        const sort = make({ col: 'price', dir: SortDirections.Desc });
        const rows: Row[] = [{ price: 10 }, { price: undefined }, { price: 20 }];
        const out = sort.apply(rows).map(r => r.price);
        assert.deepStrictEqual(out, [20, 10, undefined]);
    });

    it('a null default leaves the rows in their natural order', () => {
        const sort = make(null);
        const rows: Row[] = [{ localId: 3 }, { localId: 1 }, { localId: 2 }];
        assert.deepStrictEqual(sort.apply(rows).map(r => r.localId), [3, 1, 2]);
    });

    it('hands back a copy even when there is nothing to reorder', () => {
        // The single row and the no-sort cases have no work to do, but the caller was
        // promised a copy — handing its own array back lets a caller that sorts or
        // splices the result silently reorder the grid's held rows.
        const one: Row[] = [{ localId: 1 }];
        assert.notStrictEqual(make({ col: 'id', dir: SortDirections.Desc }).apply(one), one);

        const three: Row[] = [{ localId: 3 }, { localId: 1 }, { localId: 2 }];
        assert.notStrictEqual(make(null).apply(three), three);
    });

    it('falls back to reading the row by the column key when no accessor is declared', () => {
        // DataGrid declares an accessor per column, but TableSort is usable on its own
        // over a plain <th data-sort="price"> whose rows are plain objects.
        const sort = new TableSort<Row>(null, {}, () => {}, { col: 'price', dir: SortDirections.Asc });
        const rows: Row[] = [{ price: 30 }, { price: 10 }, { price: 20 }];
        assert.deepStrictEqual(sort.apply(rows).map(r => r.price), [10, 20, 30]);
    });
});
