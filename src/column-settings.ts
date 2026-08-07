// ColumnSettings — the grid's "attach to a table someone else rendered" adapter.
//
// DataGrid owns a table it builds from column declarations. This is the other
// half: a table the server already rendered, where the columns exist as markup
// and the only thing missing is the user's say over which ones are shown and in
// what order. It discovers the columns from the `data-col` keys the header
// already carries, moves and hides cells in place, and renders the picker list.
//
// It knows nothing about the page it is on. The three things that would
// otherwise tie it to one host application are arguments:
//
//   * the dialog — the element the picker list goes into, its two reorder
//     tooltips, and how to open and close it. Chrome, localization and the
//     modal library are the host's;
//   * the store — where a picked layout survives a navigation. A host may keep
//     it in the query string, in local storage or on the server; nothing here
//     knows which;
//   * how the picker is reached — the host binds whatever affordance it wants
//     (a right-click on the header, a toolbar button) and calls openPicker().
//
// Columns without a `data-col` key (an Actions column) are fixed anchors: they
// keep their slot and are never hidden. Rows whose cell count does not match the
// header (a colspan "no data" row) are skipped.
const FIX = '__fix';

// One column of the attached table, as discovered from its header cell.
interface ColEntry { key: string; keyed: boolean; label: string; }

// The attached table's column layout, computed once and cached on the element:
// every later reorder/hide is key-based off this, so repeated applies are
// idempotent whatever order the cells are currently in.
interface ColMeta { order: ColEntry[]; keyed: Record<string, boolean>; n: number; }

// A row of the picker: a manageable column and whether the user wants it shown.
interface ColRow { key: string; label: string; visible: boolean; }

/**
 * Where a picked layout survives a navigation. Keys are lowercase column keys
 * in display order; the ones missing from the list are hidden.
 */
export interface ColumnLayoutStore {
    /** The stored layout, or null when there is none and the table default applies. */
    read(): string[] | null;
    /**
     * Persist a layout. `null` means "this IS the table default" — a store that
     * puts the layout in a URL drops its parameter rather than spelling out the
     * default, so a link only ever carries a deviation from it.
     */
    write(visibleKeyed: string[] | null): void;
}

/**
 * Class names for the picker row and the three controls on it. Like DataGrid,
 * this adapter builds elements and names them but decides nothing about how
 * they look — a host on Bootstrap hands over its list-group / form-check
 * classes, a host on a different stylesheet hands over its own.
 */
export interface ColumnPickerClasses {
    item: string;
    toggle: string;
    label: string;
    move: string;
    /**
     * Icon classes for the two reorder buttons. Named here rather than built from a
     * prefix so a host whose icon font is not Bootstrap Icons can spell them its own way.
     */
    moveUpIcon: string;
    moveDownIcon: string;
}

/**
 * The dialog the user picks columns in. The adapter fills `list` and opens and
 * closes it; everything else about it — chrome, labels, animation, which modal
 * library — belongs to the host.
 */
export interface ColumnSettingsDialog {
    /** Element the picker rows are rendered into. Emptied on every render. */
    list: HTMLElement;
    /** Localized tooltips for the two reorder buttons. */
    moveUpTitle: string;
    moveDownTitle: string;
    classes: ColumnPickerClasses;
    open(): void;
    close(): void;
}

export interface ColumnSettingsOptions {
    /** A table the server rendered, whose header carries `data-col` keys. */
    table: HTMLTableElement;
    dialog: ColumnSettingsDialog;
    store: ColumnLayoutStore;
}

export class ColumnSettings {
    readonly table: HTMLTableElement;
    private readonly _dialog: ColumnSettingsDialog;
    private readonly _store: ColumnLayoutStore;
    private readonly _meta: ColMeta;
    // The picker's in-progress rows while the dialog is open — candidate order
    // and candidate visibility, neither applied to the table until the user says so.
    private _picked: ColRow[];

    /**
     * Discovers the table's columns and immediately applies the stored layout,
     * so a page arrives already showing what the user last chose.
     */
    constructor(options: ColumnSettingsOptions) {
        // A parser inserts a missing <tbody> but never a <thead>, so a table written
        // without one arrives here with tHead null and every column lookup below —
        // discovery, apply, the picker — would fault on it far from the cause.
        if (!options.table.tHead)
            throw new Error('ColumnSettings: the table needs a <thead> whose header cells carry the data-col keys');

        this.table = options.table;
        this._dialog = options.dialog;
        this._store = options.store;
        this._picked = [];
        this._meta = ColumnSettings._discover(options.table);

        this.apply(this._store.read() || this.defaultKeys());
    }

    /**
     * The manageable columns in their original (server-rendered) order — the
     * layout "no choice has been made" means.
     */
    defaultKeys(): string[] {
        return this._meta.order.filter(c => c.keyed).map(c => c.key.toLowerCase());
    }

    /**
     * Reorder + show/hide. `visibleKeyed` is the manageable keys in the desired
     * display order; manageable keys absent from it are hidden. Fixed columns
     * stay at their original absolute slot.
     */
    apply(visibleKeyed: string[]): void {
        const meta = this._meta;
        const keyedKeys = this.defaultKeys();
        let visible = visibleKeyed.filter(k => meta.keyed[k]);
        const seen: Record<string, boolean> = {};
        visible = visible.filter(k => (seen[k] ? false : (seen[k] = true)));
        const visSet: Record<string, boolean> = {};
        visible.forEach(k => { visSet[k] = true; });
        const hidden = keyedKeys.filter(k => !visSet[k]);
        const keyedSeq = visible.concat(hidden);   // fills keyed slots; first visible.length shown

        // Final key order across all slots: fixed keys keep their slot, keyed slots
        // take keyedSeq in order.
        const finalKeys: string[] = [];
        let p = 0;
        meta.order.forEach(c => {
            finalKeys.push(c.keyed ? keyedSeq[p++] : c.key.toLowerCase());
        });

        const reorder = (rowEl: HTMLTableRowElement): void => {
            const cells = Array.prototype.slice.call(rowEl.cells) as HTMLTableCellElement[];
            if (cells.length !== meta.n) return;    // colspan / empty row
            const byKey: Record<string, HTMLTableCellElement> = {};
            cells.forEach(cell => { byKey[(cell.getAttribute('data-col') || '').toLowerCase()] = cell; });
            finalKeys.forEach(k => {
                const cell = byKey[k];
                if (!cell) return;
                if (meta.keyed[k]) cell.style.display = visSet[k] ? '' : 'none';
                rowEl.appendChild(cell);            // appendChild moves the existing node into final order
            });
        };

        // Non-null throughout: the constructor rejects a table with no <thead>.
        reorder(this.table.tHead!.rows[0]);
        this._eachBodyRow(reorder);
    }

    /** True when this layout is the table's own order with nothing hidden. */
    isDefault(visibleKeyed: string[]): boolean {
        const def = this.defaultKeys();
        if (visibleKeyed.length !== def.length) return false;
        for (let i = 0; i < def.length; i++) if (visibleKeyed[i] !== def[i]) return false;
        return true;
    }

    /**
     * Show the picker over the layout currently on screen — read back off the
     * live header, so it reflects reality rather than a remembered intent.
     */
    openPicker(): void {
        this._picked = this._currentLayout();
        this._renderPicker();
        this._dialog.open();
    }

    /** Commit what the user picked, persist it and close. */
    applyPicked(): void {
        const visible = this._picked.filter(r => r.visible).map(r => r.key);
        this._commit(visible);
    }

    /** Drop back to the table's own order with every column shown, and close. */
    resetToDefault(): void {
        this._commit(this.defaultKeys());
    }

    private _commit(visibleKeyed: string[]): void {
        this.apply(visibleKeyed);
        this._store.write(this.isDefault(visibleKeyed) ? null : visibleKeyed);
        this._dialog.close();
    }

    // The manageable columns in their present DOM order, each with whether it is
    // currently shown.
    private _currentLayout(): ColRow[] {
        const out: ColRow[] = [];
        Array.prototype.forEach.call(this.table.tHead!.rows[0].cells, (th: HTMLTableCellElement) => {
            const key = (th.getAttribute('data-col') || '').toLowerCase();
            if (!this._meta.keyed[key]) return;
            const entry = this._meta.order.filter(c => c.key.toLowerCase() === key)[0];
            out.push({ key, label: entry ? entry.label : key, visible: th.style.display !== 'none' });
        });
        return out;
    }

    // Render the in-progress rows into the dialog's list. Elements, never HTML
    // strings — a column label is server-rendered text of unknown provenance.
    private _renderPicker(): void {
        const list = this._dialog.list;
        list.textContent = '';

        const classes = this._dialog.classes;
        this._picked.forEach((row, idx) => {
            const li = document.createElement('li');
            li.className = classes.item;

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = classes.toggle;
            cb.checked = row.visible;
            cb.addEventListener('change', () => { row.visible = cb.checked; });

            const label = document.createElement('span');
            label.className = classes.label;
            label.textContent = row.label;

            const swap = (a: number, b: number): void => {
                const rows = this._picked;
                const t = rows[a]; rows[a] = rows[b]; rows[b] = t;
                this._renderPicker();
            };

            li.appendChild(cb);
            li.appendChild(label);
            li.appendChild(ColumnSettings._arrowButton(classes.move, classes.moveUpIcon, this._dialog.moveUpTitle, idx === 0, () => swap(idx, idx - 1)));
            li.appendChild(ColumnSettings._arrowButton(classes.move, classes.moveDownIcon, this._dialog.moveDownTitle, idx === this._picked.length - 1, () => swap(idx, idx + 1)));
            list.appendChild(li);
        });
    }

    private _eachBodyRow(fn: (row: HTMLTableRowElement) => void): void {
        Array.prototype.forEach.call(this.table.tBodies, (tb: HTMLTableSectionElement) => {
            Array.prototype.forEach.call(tb.rows, (row: HTMLTableRowElement) => fn(row));
        });
    }

    // Record the original column order, assign synthetic keys to the unkeyed
    // (fixed) columns, and tag every body cell with its column key so all later
    // reorder/hide operations are key-based and idempotent. Cached on the element
    // so a second adapter over the same table sees the original order, not
    // whatever the first one left on screen.
    private static _discover(table: HTMLTableElement): ColMeta {
        const carrier = table as unknown as { __cols?: ColMeta };
        const cached = carrier.__cols;
        if (cached) return cached;

        const headCells = Array.prototype.slice.call(table.tHead!.rows[0].cells) as HTMLTableCellElement[];
        const n = headCells.length;
        const order: ColEntry[] = [];                 // in original order
        const keyed: Record<string, boolean> = {};    // key -> true for real (manageable) columns

        headCells.forEach((th, i) => {
            const real = th.getAttribute('data-col');
            const key = real || (FIX + i);
            if (!real) th.setAttribute('data-col', key);
            if (real) keyed[key.toLowerCase()] = true;
            order.push({ key, keyed: !!real, label: (th.textContent || '').trim() || key });
        });

        // Tag body cells by column key (only well-formed rows).
        Array.prototype.forEach.call(table.tBodies, (tb: HTMLTableSectionElement) => {
            Array.prototype.forEach.call(tb.rows, (row: HTMLTableRowElement) => {
                if (row.cells.length !== n) return;
                for (let i = 0; i < n; i++) row.cells[i].setAttribute('data-col', order[i].key);
            });
        });

        const meta: ColMeta = { order, keyed, n };
        carrier.__cols = meta;
        return meta;
    }

    private static _arrowButton(buttonClass: string, iconClass: string, title: string, disabled: boolean, onClick: () => void): HTMLButtonElement {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = buttonClass;
        b.title = title;
        b.disabled = disabled;
        const i = document.createElement('i');
        i.className = iconClass;
        b.appendChild(i);
        b.addEventListener('click', onClick);
        return b;
    }
}
