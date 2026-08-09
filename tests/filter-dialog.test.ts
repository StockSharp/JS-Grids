// The popup a filter rule is built in.
//
// The inline filter row can express "contains this" and "between these"; it cannot
// express "is not", "starts with" or "is empty" without growing a second control in
// every header cell. So the rules live in a popup, and what has to hold is that the
// popup offers rules that make sense for the column, asks only for the operands the
// chosen rule uses, and commits exactly once -- Cancel leaving the table untouched.
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import type { GridFilter } from '../src/data-grid';
import { GridFilterDialog } from '../src/filter-dialog';
import { FakeElement, fakeDocument, fireOnDocument, installFakeDocument } from './fake-dom';

installFakeDocument();

const openDialog = () => fakeDocument.body.children.find(el => el.className.includes('grid-filter-dialog'));

interface Parts {
    dialog: FakeElement;
    select: FakeElement;
    value: FakeElement;
    upper: FakeElement;
    apply: FakeElement;
    clear: FakeElement;
    cancel: FakeElement;
}

function parts(): Parts {
    const dialog = openDialog()!;
    // Found by class, not by index: a set column grows a value list between the row
    // and the buttons, and a helper counting children would then click the list.
    const row = dialog.children.find(el => el.className === 'grid-filter-dialog-row')!;
    const actions = dialog.children.find(el => el.className === 'grid-filter-dialog-actions')!;
    return {
        dialog,
        select: row.children[0],
        value: row.children[1],
        upper: row.children[3],
        apply: actions.children[0],
        clear: actions.children[1],
        cancel: actions.children[2],
    };
}

/// What the caller gets back: the filter, null for a clear, or nothing at all.
function show(options: Partial<Parameters<GridFilterDialog['open']>[0]> = {}) {
    const committed: (GridFilter | null)[] = [];
    const dialog = new GridFilterDialog();
    dialog.open(
        { header: 'Qty', kind: 'number', current: null, values: [], x: 10, y: 20, ...options } as Parameters<GridFilterDialog['open']>[0],
        filter => committed.push(filter),
    );
    return { dialog, committed };
}

// One fake document for the file, so a dialog left open would greet the next test.
beforeEach(() => fireOnDocument({ type: 'mousedown' }));

describe('GridFilterDialog', () => {
    it('offers the rules that suit the column, and no others', () => {
        show({ kind: 'number' });
        const ops = () => parts().select.children.map(el => el.value);

        // A number column asking "starts with" invites a filter that reads as a mistake.
        assert.deepEqual(ops(), ['eq', 'ne', 'gt', 'ge', 'lt', 'le', 'between', 'empty', 'notEmpty']);

        fireOnDocument({ type: 'mousedown' });
        show({ kind: 'text' });
        assert.deepEqual(ops(), ['contains', 'notContains', 'startsWith', 'endsWith', 'eq', 'ne', 'empty', 'notEmpty']);
    });

    it('names the column it is filtering', () => {
        show({ header: 'Symbol' });

        assert.equal(parts().dialog.children[0].textContent, 'Filter: Symbol');
    });

    it('asks only for the operands the rule uses', () => {
        show({ kind: 'number' });
        const { select, value, upper } = parts();

        assert.equal(value.style.display, '');
        assert.equal(upper.style.display, 'none');

        select.value = 'between';
        select.dispatchEvent({ type: 'change', target: select });
        assert.equal(value.style.display, '');
        assert.equal(upper.style.display, '');

        select.value = 'empty';
        select.dispatchEvent({ type: 'change', target: select });
        assert.equal(value.style.display, 'none', 'is empty takes no operand');
        assert.equal(upper.style.display, 'none');
    });

    it('commits the rule and closes', () => {
        const { committed } = show({ kind: 'number' });
        const { select, value, apply } = parts();

        select.value = 'gt';
        value.value = '100';
        apply.click();

        assert.deepEqual(committed, [{ op: 'gt', text: '100' }]);
        assert.equal(openDialog(), undefined);
    });

    it('commits a range as its two ends', () => {
        const { committed } = show({ kind: 'number' });
        const { select, value, upper, apply } = parts();

        select.value = 'between';
        select.dispatchEvent({ type: 'change', target: select });
        value.value = '5';
        upper.value = '50';
        apply.click();

        assert.deepEqual(committed, [{ op: 'between', min: 5, max: 50 }]);
    });

    it('takes a rule with no operand at its word', () => {
        const { committed } = show({ kind: 'text' });
        const { select, apply } = parts();

        select.value = 'notEmpty';
        apply.click();

        // No text, and that is the whole rule -- not an empty box meaning "no filter".
        assert.deepEqual(committed, [{ op: 'notEmpty' }]);
    });

    it('reads an applied rule back into the controls', () => {
        show({ kind: 'number', current: { op: 'le', text: '7' } });

        assert.equal(parts().select.value, 'le');
        assert.equal(parts().value.value, '7');
    });

    it('clears through Clear, and through Apply with nothing typed', () => {
        const first = show({ kind: 'number' });
        parts().clear.click();
        assert.deepEqual(first.committed, [null]);

        const second = show({ kind: 'number' });
        parts().apply.click();
        assert.deepEqual(second.committed, [null], 'an empty operand means no filter, not a filter on ""');
    });

    it('leaves the table alone when cancelled or dismissed', () => {
        const cancelled = show();
        parts().cancel.click();
        assert.deepEqual(cancelled.committed, []);
        assert.equal(openDialog(), undefined);

        const escaped = show();
        fireOnDocument({ type: 'keydown', key: 'Escape' } as never);
        assert.deepEqual(escaped.committed, []);
        assert.equal(openDialog(), undefined);

        const clickedAway = show();
        fireOnDocument({ type: 'mousedown' });
        assert.deepEqual(clickedAway.committed, []);
        assert.equal(openDialog(), undefined);
    });

    it('stays open while the user works inside it', () => {
        show();
        const { value } = parts();

        fireOnDocument({ type: 'mousedown', target: value });

        assert.notEqual(openDialog(), undefined);
    });

    it('applies on Enter in the operand, but not on the Enter that picks an operator', () => {
        const typed = show({ kind: 'number' });
        parts().value.value = '3';
        fireOnDocument({ type: 'keydown', key: 'Enter', target: parts().value } as never);
        assert.deepEqual(typed.committed, [{ op: 'eq', text: '3' }]);

        // A native select commits its highlighted option with Enter, and that keydown
        // reaches the document too -- so treating it as Apply submitted the rule at the
        // moment the user chose what the rule should be, operand still empty.
        const picking = show({ kind: 'number' });
        const { select } = parts();
        select.value = 'gt';
        fireOnDocument({ type: 'keydown', key: 'Enter', target: select } as never);

        assert.deepEqual(picking.committed, []);
        assert.notEqual(openDialog(), undefined, 'the dialog must still be there to type the value into');
    });

    it('shows one dialog at a time', () => {
        show();
        show();

        assert.equal(fakeDocument.body.children.filter(el => el.className.includes('grid-filter-dialog')).length, 1);
    });

    it('offers a set column its values to tick, not a box to type in', () => {
        const { committed } = show({
            kind: 'set',
            // The raw value is what the column holds; the label is what the cell shows.
            values: [{ value: '0', label: 'Buy' }, { value: '1', label: 'Sell' }],
        });
        const { dialog, select, value } = parts();

        // Typing at a set column is how a filter ends up comparing "Buy" against 0.
        assert.deepEqual(select.children.map(el => el.value), ['anyOf', 'noneOf', 'empty', 'notEmpty']);
        assert.equal(value.style.display, 'none');

        const list = dialog.children.find(el => el.className === 'grid-filter-dialog-values')!;
        assert.deepEqual(list.children.map(el => el.textContent), ['Buy', 'Sell']);

        const boxes = list.children.map(el => el.children[0]);
        boxes[1].checked = true;
        parts().apply.click();

        // What goes to the grid is the value, never the label.
        assert.deepEqual(committed, [{ op: 'anyOf', values: ['1'] }]);
    });

    it('ticks back what the applied filter holds', () => {
        show({
            kind: 'set',
            current: { op: 'noneOf', values: ['1'] },
            values: [{ value: '0', label: 'Buy' }, { value: '1', label: 'Sell' }],
        });
        const { dialog, select } = parts();

        assert.equal(select.value, 'noneOf');
        const list = dialog.children.find(el => el.className === 'grid-filter-dialog-values')!;
        assert.deepEqual(list.children.map(el => el.children[0].checked), [false, true]);
    });

    it('reads nothing ticked as no filter rather than as a filter on nothing', () => {
        const { committed } = show({
            kind: 'set',
            values: [{ value: '0', label: 'Buy' }],
        });

        parts().apply.click();

        assert.deepEqual(committed, [null]);
    });

    it('hides the value list for a rule that does not pick values', () => {
        show({ kind: 'set', values: [{ value: '0', label: 'Buy' }] });
        const { dialog, select } = parts();
        const list = dialog.children.find(el => el.className === 'grid-filter-dialog-values')!;

        assert.equal(list.style.display, '');

        select.value = 'notEmpty';
        select.dispatchEvent({ type: 'change', target: select });
        assert.equal(list.style.display, 'none');
    });
});
