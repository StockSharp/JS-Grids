// Unit coverage for ColumnSettings — the grid's adapter over a table the server
// already rendered.
//
// What is worth pinning down is exactly what a host page would otherwise tangle
// itself with: that the layout algebra is right (a hidden column keeps its slot
// free for the visible ones, a column with no key never moves), that the picker
// shows what is on screen rather than a remembered intent, and that the only
// channel to the outside world is the store the caller passed in.
//
// That last point is also what this file being runnable proves: there is no
// `window`, no modal library and no `location` in a node test process, so an
// adapter that still reached for any of them would throw here.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ColumnSettings, type ColumnLayoutStore, type ColumnSettingsDialog } from '../src/column-settings';
import { FakeElement, FakeTable, asDom, installFakeDocument } from './fake-dom';

installFakeDocument();

// --- fixtures --------------------------------------------------------------

interface DialogSpy extends ColumnSettingsDialog {
    /// The same element as `list`, kept in its own type so the assertions can read
    /// the rendered rows back without casting at every use.
    listEl: FakeElement;
    opened: number;
    closed: number;
}

interface StoreSpy extends ColumnLayoutStore {
    stored: string[] | null;
    writes: (string[] | null)[];
}

function cell(text: string, colKey?: string): FakeElement {
    const td = new FakeElement('td');
    td.textContent = text;
    if (colKey) td.setAttribute('data-col', colKey);
    return td;
}

function row(cells: FakeElement[]): FakeElement {
    const tr = new FakeElement('tr');
    for (const c of cells) tr.appendChild(c);
    return tr;
}

/// A list grid the way a server renders one: three manageable columns and a
/// trailing Actions column that carries no key, so it is a fixed anchor.
function grid(): FakeTable {
    const head = new FakeElement('thead');
    head.appendChild(row([cell('ID', 'id'), cell('Name', 'name'), cell('Status', 'status'), cell('')]));

    const body = new FakeElement('tbody');
    body.appendChild(row([cell('1'), cell('Alice'), cell('Active'), cell('edit')]));
    body.appendChild(row([cell('2'), cell('Bob'), cell('Locked'), cell('edit')]));

    return new FakeTable(head, [body]);
}

function dialogSpy(): DialogSpy {
    const listEl = new FakeElement('ul');
    const spy: DialogSpy = {
        listEl,
        list: asDom<HTMLElement>(listEl),
        moveUpTitle: 'Move up',
        moveDownTitle: 'Move down',
        classes: {
            item: 'item',
            toggle: 'toggle',
            label: 'label',
            move: 'move',
            moveUpIcon: 'icon-up',
            moveDownIcon: 'icon-down',
        },
        opened: 0,
        closed: 0,
        open: () => { spy.opened++; },
        close: () => { spy.closed++; },
    };
    return spy;
}

function storeSpy(initial: string[] | null): StoreSpy {
    const spy: StoreSpy = {
        stored: initial,
        writes: [],
        read: () => spy.stored,
        write: (visibleKeyed) => { spy.stored = visibleKeyed; spy.writes.push(visibleKeyed); },
    };
    return spy;
}

function attach(storedLayout: string[] | null) {
    const table = grid();
    const dialog = dialogSpy();
    const store = storeSpy(storedLayout);
    const settings = new ColumnSettings({ table: asDom<HTMLTableElement>(table), dialog, store });
    return { settings, table, dialog, store };
}

/// The header row of a fixture. `tHead` is nullable on a real table, and the one
/// fixture without a header is the subject of its own test rather than of these.
function headRow(table: FakeTable): FakeElement {
    if (!table.tHead) throw new Error('fixture has no <thead>');
    return table.tHead.rows[0];
}

/// The column key of every header cell, in the order they are on screen.
function headerKeys(table: FakeTable): (string | null)[] {
    return headRow(table).cells.map(c => c.getAttribute('data-col'));
}

/// The keys of the header cells that are actually shown.
function visibleKeys(table: FakeTable): (string | null)[] {
    return headRow(table).cells
        .filter(c => c.style.display !== 'none')
        .map(c => c.getAttribute('data-col'));
}

function bodyText(table: FakeTable, rowIndex: number): string[] {
    return table.tBodies[0].rows[rowIndex].cells.map(c => c.textContent);
}

/// The picker's rows: [label, checked].
function pickerRows(dialog: DialogSpy): [string, boolean][] {
    return dialog.listEl.children.map(li => [li.children[1].textContent, li.children[0].checked]);
}

function clickMove(dialog: DialogSpy, rowIndex: number, direction: 'up' | 'down'): void {
    const button = dialog.listEl.children[rowIndex].children[direction === 'up' ? 2 : 3];
    button.dispatchEvent({ type: 'click' });
}

function toggle(dialog: DialogSpy, rowIndex: number, checked: boolean): void {
    const cb = dialog.listEl.children[rowIndex].children[0];
    cb.checked = checked;
    cb.dispatchEvent({ type: 'change' });
}

// --- discovery and apply ---------------------------------------------------

describe('ColumnSettings — applying a layout', () => {
    it('leaves the table alone when nothing is stored', () => {
        const { table } = attach(null);
        assert.deepStrictEqual(visibleKeys(table), ['id', 'name', 'status', '__fix3']);
        assert.deepStrictEqual(bodyText(table, 0), ['1', 'Alice', 'Active', 'edit']);
    });

    it('reorders header and body together from the stored layout', () => {
        const { table } = attach(['status', 'id', 'name']);
        assert.deepStrictEqual(headerKeys(table), ['status', 'id', 'name', '__fix3']);
        assert.deepStrictEqual(bodyText(table, 0), ['Active', '1', 'Alice', 'edit']);
        assert.deepStrictEqual(bodyText(table, 1), ['Locked', '2', 'Bob', 'edit']);
    });

    it('hides a column left out of the layout, and parks it after the visible ones', () => {
        const { table } = attach(['status', 'id']);
        assert.deepStrictEqual(visibleKeys(table), ['status', 'id', '__fix3']);
        // Still in the DOM, just not shown — so re-enabling it needs no reload.
        assert.deepStrictEqual(headerKeys(table), ['status', 'id', 'name', '__fix3']);
        assert.equal(table.tBodies[0].rows[0].cells[2].style.display, 'none');
    });

    it('keeps a column with no key at its own slot, whatever the layout says', () => {
        // The Actions column is an anchor: it is never named in a layout and never
        // moves out of the slot the page put it in.
        const { table } = attach(['status', 'name', 'id', '__fix3']);
        assert.deepStrictEqual(headerKeys(table), ['status', 'name', 'id', '__fix3']);
        assert.notEqual(headRow(table).cells[3].style.display, 'none');
    });

    it('ignores unknown and duplicate keys in a stored layout', () => {
        // The layout comes off a URL anyone can edit.
        const { table } = attach(['status', 'status', 'nonsense', 'id']);
        assert.deepStrictEqual(visibleKeys(table), ['status', 'id', '__fix3']);
    });

    it('skips a row whose cell count does not match the header', () => {
        const table = grid();
        const empty = row([cell('Nothing to show')]);
        table.tBodies[0].appendChild(empty);

        new ColumnSettings({
            table: asDom<HTMLTableElement>(table),
            dialog: dialogSpy(),
            store: storeSpy(['status', 'id', 'name']),
        });

        assert.equal(empty.cells.length, 1);
        assert.equal(empty.cells[0].textContent, 'Nothing to show');
    });

    it('says so when the table has no header to read the columns from', () => {
        // A parser inserts a missing <tbody> but never a <thead>, so this is a table
        // an adopter can really hand over — and the columns are only knowable from
        // the header cells, which is what the message has to say.
        const body = new FakeElement('tbody');
        body.appendChild(row([cell('1'), cell('Alice')]));

        assert.throws(() => new ColumnSettings({
            table: asDom<HTMLTableElement>(new FakeTable(null, [body])),
            dialog: dialogSpy(),
            store: storeSpy(null),
        }), /ColumnSettings: the table needs a <thead>/);
    });

    it('reports the table\'s own order as the default', () => {
        const { settings } = attach(['status', 'id', 'name']);
        assert.deepStrictEqual(settings.defaultKeys(), ['id', 'name', 'status']);
        assert.equal(settings.isDefault(['id', 'name', 'status']), true);
        assert.equal(settings.isDefault(['id', 'status', 'name']), false);
        assert.equal(settings.isDefault(['id', 'name']), false);
    });
});

// --- the picker ------------------------------------------------------------

describe('ColumnSettings — the picker', () => {
    it('lists the columns as they are on screen, not as they were declared', () => {
        const { settings, dialog } = attach(['status', 'id']);
        settings.openPicker();

        assert.deepStrictEqual(pickerRows(dialog), [['Status', true], ['ID', true], ['Name', false]]);
        assert.equal(dialog.opened, 1);
    });

    it('does not touch the table until the user applies', () => {
        const { settings, table, dialog, store } = attach(null);
        settings.openPicker();
        clickMove(dialog, 1, 'up');
        toggle(dialog, 2, false);

        assert.deepStrictEqual(headerKeys(table), ['id', 'name', 'status', '__fix3']);
        assert.deepStrictEqual(store.writes, []);
    });

    it('applies the picked order and visibility, persists it and closes', () => {
        const { settings, table, dialog, store } = attach(null);
        settings.openPicker();
        clickMove(dialog, 2, 'up');      // status above name
        toggle(dialog, 0, false);        // hide id (still row 0 — the swap was below it)
        settings.applyPicked();

        assert.deepStrictEqual(visibleKeys(table), ['status', 'name', '__fix3']);
        assert.deepStrictEqual(bodyText(table, 0), ['Active', 'Alice', '1', 'edit']);
        assert.deepStrictEqual(store.writes, [['status', 'name']]);
        assert.equal(dialog.closed, 1);
    });

    it('stores nothing at all when the picked layout IS the default', () => {
        // The store is told `null`, not the default spelled out: a URL then carries
        // the columns param only while it means something.
        const { settings, store } = attach(['status', 'id']);
        settings.openPicker();
        settings.resetToDefault();

        assert.deepStrictEqual(store.writes, [null]);
    });

    it('reset puts every column back in the table\'s own order', () => {
        const { settings, table } = attach(['status', 'id']);
        settings.resetToDefault();

        assert.deepStrictEqual(visibleKeys(table), ['id', 'name', 'status', '__fix3']);
        assert.deepStrictEqual(bodyText(table, 0), ['1', 'Alice', 'Active', 'edit']);
    });

    it('disables the move that would run off the end of the list', () => {
        const { settings, dialog } = attach(null);
        settings.openPicker();
        const up = dialog.listEl.children.map(li => li.children[2].disabled);
        const down = dialog.listEl.children.map(li => li.children[3].disabled);

        assert.deepStrictEqual(up, [true, false, false]);
        assert.deepStrictEqual(down, [false, false, true]);
    });

    it('names the picker rows with the classes the caller handed over', () => {
        // The adapter builds the elements; how they look stays with the host, the
        // same split DataGrid makes for cell colour.
        const { settings, dialog } = attach(null);
        settings.openPicker();
        const li = dialog.listEl.children[0];

        assert.equal(li.className, 'item');
        assert.equal(li.children[0].className, 'toggle');
        assert.equal(li.children[1].className, 'label');
        assert.equal(li.children[2].className, 'move');
        assert.equal(li.children[2].title, 'Move up');
        assert.equal(li.children[3].title, 'Move down');
        // The icon classes are the host's too, down to which font they name.
        assert.equal(li.children[2].children[0].className, 'icon-up');
        assert.equal(li.children[3].children[0].className, 'icon-down');
    });

    it('re-reads the live layout every time it opens', () => {
        const { settings, dialog } = attach(null);
        settings.openPicker();
        clickMove(dialog, 2, 'up');
        settings.applyPicked();

        settings.openPicker();
        assert.deepStrictEqual(pickerRows(dialog).map(r => r[0]), ['ID', 'Status', 'Name']);
    });
});
