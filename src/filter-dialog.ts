/// The popup a column's filter rule is built in: an operator and its operand.
///
/// The inline filter row stays what it is -- one box per column, a substring or a
/// range, typed without leaving the table. It cannot express "not equal", "starts
/// with" or "is empty" without growing a second control per column, and a header
/// row is the wrong place to grow controls. So the rules live here, one column at
/// a time, opened from the menu or from the funnel in the filter cell.
///
/// Same bargain as the context menu: the package builds the popup because every
/// host would otherwise write the same positioning and dismissal, and the host
/// decides its class names and its wording.

import type { GridFilter, GridFilterKind, GridFilterOp } from './data-grid.js';

/** Class names for the dialog's parts. */
export interface GridFilterDialogClasses {
    dialog?: string;
    title?: string;
    row?: string;
    select?: string;
    input?: string;
    actions?: string;
    apply?: string;
    clear?: string;
    cancel?: string;
}

/** Every phrase the dialog shows. */
export interface GridFilterDialogLabels {
    title: string;
    apply: string;
    clear: string;
    cancel: string;
    value: string;
    and: string;
    ops: Record<GridFilterOp, string>;
}

const DEFAULT_CLASSES: Required<GridFilterDialogClasses> = {
    dialog: 'grid-filter-dialog',
    title: 'grid-filter-dialog-title',
    row: 'grid-filter-dialog-row',
    select: 'grid-filter-dialog-op',
    input: 'grid-filter-dialog-value',
    actions: 'grid-filter-dialog-actions',
    apply: 'grid-filter-dialog-apply',
    clear: 'grid-filter-dialog-clear',
    cancel: 'grid-filter-dialog-cancel',
};

const DEFAULT_LABELS: GridFilterDialogLabels = {
    title: 'Filter',
    apply: 'Apply',
    clear: 'Clear',
    cancel: 'Cancel',
    value: 'Value',
    and: 'and',
    ops: {
        contains: 'contains',
        notContains: 'does not contain',
        startsWith: 'starts with',
        endsWith: 'ends with',
        eq: '=',
        ne: '≠',
        gt: '>',
        ge: '≥',
        lt: '<',
        le: '≤',
        between: 'between',
        empty: 'is empty',
        notEmpty: 'is not empty',
    },
};

/// Which rules make sense for which kind of column. A number column offering
/// "starts with" invites a filter that reads as a mistake; a text column offering
/// only comparisons cannot express the thing text filters are actually for.
const OPS: Record<GridFilterKind, GridFilterOp[]> = {
    text: ['contains', 'notContains', 'startsWith', 'endsWith', 'eq', 'ne', 'empty', 'notEmpty'],
    number: ['eq', 'ne', 'gt', 'ge', 'lt', 'le', 'between', 'empty', 'notEmpty'],
    set: ['eq', 'ne', 'contains', 'empty', 'notEmpty'],
};

const NEEDS_NO_OPERAND = new Set<GridFilterOp>(['empty', 'notEmpty']);

export class GridFilterDialog {
    private static _open: GridFilterDialog | null = null;

    private readonly _classes: Required<GridFilterDialogClasses>;
    private readonly _labels: GridFilterDialogLabels;
    private _el: HTMLElement | null = null;
    private _unbind: (() => void) | null = null;

    constructor(classes?: GridFilterDialogClasses, labels?: Partial<GridFilterDialogLabels>) {
        this._classes = { ...DEFAULT_CLASSES, ...(classes || {}) };
        this._labels = { ...DEFAULT_LABELS, ...(labels || {}), ops: { ...DEFAULT_LABELS.ops, ...(labels?.ops || {}) } };
    }

    get isOpen(): boolean {
        return this._el !== null;
    }

    /**
     * Ask for a filter on one column. `commit` is called with the new filter, or
     * with null when the user clears it; cancelling calls nothing at all, so a
     * dialog dismissed by mistake leaves the table exactly as it was.
     */
    open(
        options: {
            header: string;
            kind: GridFilterKind;
            current: GridFilter | null;
            x: number;
            y: number;
        },
        commit: (filter: GridFilter | null) => void,
    ): void {
        GridFilterDialog._open?.close();

        const ops = OPS[options.kind] || OPS.text;
        const current = options.current || {};
        const startOp: GridFilterOp = current.op
            || (current.min !== undefined || current.max !== undefined ? 'between' : ops[0]);

        const el = document.createElement('div');
        el.className = this._classes.dialog;
        el.setAttribute('role', 'dialog');
        el.style.position = 'fixed';
        el.style.left = `${options.x}px`;
        el.style.top = `${options.y}px`;

        const title = document.createElement('div');
        title.className = this._classes.title;
        title.textContent = `${this._labels.title}: ${options.header}`;
        el.appendChild(title);

        const row = document.createElement('div');
        row.className = this._classes.row;

        const select = document.createElement('select') as HTMLSelectElement;
        select.className = this._classes.select;
        for (const op of ops) {
            const option = document.createElement('option') as HTMLOptionElement;
            option.value = op;
            option.textContent = this._labels.ops[op];
            select.appendChild(option);
        }
        select.value = startOp;

        const value = document.createElement('input') as HTMLInputElement;
        value.className = this._classes.input;
        value.type = options.kind === 'number' ? 'number' : 'text';
        value.placeholder = this._labels.value;
        value.value = current.text !== undefined ? current.text
            : current.min !== undefined ? String(current.min) : '';

        const and = document.createElement('span');
        and.textContent = ` ${this._labels.and} `;

        const upper = document.createElement('input') as HTMLInputElement;
        upper.className = this._classes.input;
        upper.type = 'number';
        upper.value = current.max !== undefined ? String(current.max) : '';

        row.appendChild(select);
        row.appendChild(value);
        row.appendChild(and);
        row.appendChild(upper);
        el.appendChild(row);

        // The operand controls follow the rule: "is empty" takes none, "between"
        // takes two. Showing all three always would ask for values the rule ignores.
        const sync = () => {
            const op = select.value as GridFilterOp;
            const none = NEEDS_NO_OPERAND.has(op);
            value.style.display = none ? 'none' : '';
            and.style.display = op === 'between' ? '' : 'none';
            upper.style.display = op === 'between' ? '' : 'none';
        };
        select.addEventListener('change', sync);
        sync();

        const actions = document.createElement('div');
        actions.className = this._classes.actions;
        actions.appendChild(this._button(this._labels.apply, this._classes.apply, () => {
            const op = select.value as GridFilterOp;
            if (NEEDS_NO_OPERAND.has(op)) return commit({ op });
            if (op === 'between') {
                const min = value.value.trim() === '' ? undefined : Number(value.value);
                const max = upper.value.trim() === '' ? undefined : Number(upper.value);
                return commit(min === undefined && max === undefined ? null : { op, min, max });
            }
            return commit(value.value.trim() === '' ? null : { op, text: value.value });
        }));
        actions.appendChild(this._button(this._labels.clear, this._classes.clear, () => commit(null)));
        actions.appendChild(this._button(this._labels.cancel, this._classes.cancel, () => {}));
        el.appendChild(actions);

        document.body.appendChild(el);
        this._el = el;
        GridFilterDialog._open = this;

        // Same rule as the menu: a press inside is the user working in the dialog,
        // not dismissing it -- and the capture phase means this runs before the
        // control under the pointer ever sees the press.
        const dismiss = (event: Event) => {
            if (event.type === 'keydown') {
                const key = (event as KeyboardEvent).key;
                if (key === 'Enter') { (actions.firstChild as HTMLElement).click(); return; }
                if (key !== 'Escape') return;
            }
            const target = (event as unknown as { target?: Node }).target;
            if (event.type === 'mousedown' && target && el.contains(target)) return;
            this.close();
        };
        document.addEventListener('mousedown', dismiss, true);
        document.addEventListener('keydown', dismiss, true);
        this._unbind = () => {
            document.removeEventListener('mousedown', dismiss, true);
            document.removeEventListener('keydown', dismiss, true);
        };

        if (typeof value.focus === 'function') value.focus();
    }

    close(): void {
        if (!this._el) return;
        this._unbind?.();
        this._unbind = null;
        this._el.parentNode?.removeChild(this._el);
        this._el = null;
        if (GridFilterDialog._open === this) GridFilterDialog._open = null;
    }

    private _button(label: string, className: string, run: () => void): HTMLElement {
        const btn = document.createElement('button') as HTMLButtonElement;
        btn.type = 'button';
        btn.className = className;
        btn.textContent = label;
        btn.addEventListener('click', () => {
            // Closed first, so a commit that repaints does not leave a dialog floating
            // over a table that has moved underneath it.
            this.close();
            run();
        });
        return btn;
    }
}
