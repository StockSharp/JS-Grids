// DataGrid — a column-driven table.
//
// A blotter used to declare its columns three times: the <thead> cells in the
// server-rendered markup, the sort accessors in the widget constructor, and the
// export header/row arrays in its export routine. Nothing kept the three in
// step, and the body was built by concatenating innerHTML, which forces every
// interactive cell into an inline `onclick="someGlobal.doThing(id)"` attribute
// because a string cannot carry a listener.
//
// Here a column is declared once — key, header, how to read the value, how to
// render it, how to class it, whether it exports — and the grid owns the header,
// the body, the sort state and the sheet. Two things a naive column pipeline
// cannot express are first-class:
//
//   * `render()` may return a Node. That is how a cell holds a real control with
//     its own addEventListener instead of an inline handler reaching a global.
//   * Pinned rows sit outside the sort and outside the export — a positions
//     balance summary stays on top no matter which column the user sorts by.
//
// The grid renders elements, never HTML strings, so nothing here can be an
// injection site. Colour stays where it was: the caller returns class names
// (`cellClass` / `rowClass`) and the host stylesheet decides what they look
// like.
//
// Three class names come out of the package itself, and an adopting site has to
// style them: `grid-empty` on the cell that spans the table when there is
// nothing to show, `visually-hidden` on a header whose caption is for screen
// readers only, and `sort-asc` / `sort-desc` on the sorted header (emitted by
// TableSort). The first is ours; the other two are spelled the way Bootstrap
// spells them, which is a coupling worth knowing about before adopting.
import { TableSort, type SortSpec } from './table-sort.js';
import { TableExport } from './table-export.js';

/** Where a pinned row sits relative to the sorted body rows. */
export const GridPinnedPlacements = {
    Top: 'top',
    Bottom: 'bottom',
} as const;

export type GridPinnedPlacement = typeof GridPinnedPlacements[keyof typeof GridPinnedPlacements];

export interface GridColumn<TRow> {
    /**
     * Stable identity of the column: stamped as `data-sort` on the header cell
     * (which is what TableSort keys off) and as `data-col` on every body cell,
     * and the key `cellElement()` takes.
     */
    key: string;

    /**
     * Caption, already localized. The grid does no translation — a host with a
     * translator resolves the string before declaring the column.
     */
    header: string;

    /** Class list for the header cell (alignment, width hints). */
    headerClass?: string;

    /**
     * Render the caption into a `.visually-hidden` span instead of visible text:
     * the column is announced to a screen reader but shows no header, which is
     * what an actions column wants.
     */
    headerHidden?: boolean;

    /**
     * This row's value for the column. Drives the sort, and is both the default
     * cell content and the default exported value. A column that declares no
     * value has nothing to sort by, so its header is not clickable.
     */
    value?(row: TRow): unknown;

    /**
     * Display content. A string becomes the cell's text; a Node is appended as
     * it is, so the cell can hold a button, an icon or any element carrying its
     * own listeners.
     */
    render?(row: TRow): string | Node;

    /**
     * Class list for this row's cell — the colouring third (`side-buy`,
     * `pnl-negative`, `cell-editable`, …). The host stylesheet owns the looks.
     */
    cellClass?(row: TRow): string;

    /**
     * Wire behaviour onto the whole cell once its content is in place. For an
     * interaction that belongs to the cell rather than to a control inside it —
     * double-clicking a price cell to edit it. A control gets its own listener
     * in `render()` instead.
     */
    bindCell?(td: HTMLTableCellElement, row: TRow): void;

    /**
     * Whether the column appears in the exported sheet. An exportable column
     * must be able to produce a value (`value` or `exportValue`).
     */
    /**
     * Draw a filter for this column, of this kind. Omit it and the column is not
     * filterable -- a filter row appears only once some column asks for one.
     */
    filter?: GridFilterKind;
    exportable: boolean;

    /**
     * Exported value, when it differs from `value`: the localized text the user
     * reads rather than the raw enum behind it, or the raw number rather than
     * the formatted string on screen.
     */
    exportValue?(row: TRow): unknown;
}

export interface GridPinnedCell {
    content: string | Node;
    className: string;
}

/**
 * A row the grid renders but does not own the data of: it is not sorted, not
 * exported, and its cells are supplied ready-made because it does not share the
 * shape the columns read (a balance summary under position columns).
 */
export interface GridPinnedRow {
    key: string;
    className: string;
    place: GridPinnedPlacement;
    /**
     * One cell per column, in column order. A shorter list leaves the remaining
     * columns empty; a longer one is a declaration mistake and throws.
     */
    cells: GridPinnedCell[];
}

export interface GridExportData {
    headers: string[];
    rows: unknown[][];
}

/**
 * Which control the grid draws for a column, and therefore how its filter reads:
 * a substring box, a min/max pair, or a list of the values present.
 */
export type GridFilterKind = 'text' | 'number' | 'set';

/**
 * One column's filter. Plain data rather than a predicate, and deliberately so:
 * a closure cannot be written to a store, so a grid filtered by one could never
 * come back filtered the same way. Every field is optional; an object with none
 * of them set means no filter at all.
 */
export interface GridFilter {
    /** Matches anywhere in the value, case-insensitively. */
    text?: string;
    /** Inclusive bounds, each optional on its own. */
    min?: number;
    max?: number;
    /** Exact matches against the value's text. */
    values?: string[];
}

/**
 * What the user arranged, and nothing the data decided. This is the whole of what
 * a host has to store to bring a table back the way somebody left it: which
 * columns, in what order, sorted by what.
 *
 * Every field is optional and every unknown column key is ignored on the way in,
 * because a stored layout outlives the table it was stored from -- a column gets
 * removed in a deploy and the saved view must still restore the rest rather than
 * fault.
 */
export interface GridState {
    /** Column keys in display order. Keys the caller leaves out keep their relative order, after these. */
    order?: string[];
    /** Column keys the user hid. They keep their place in `order` so unhiding restores the slot. */
    hidden?: string[];
    sort?: SortSpec | null;
    /** By column key. Columns that are not filtered are absent rather than empty. */
    filters?: Record<string, GridFilter>;
}

export interface GridOptions<TRow> {
    /** The `<thead>` the grid renders the header row into. Emptied on construction. */
    head: HTMLElement;
    /** The `<tbody>` the grid renders rows into. Emptied on every render. */
    body: HTMLElement;
    columns: GridColumn<TRow>[];
    /**
     * The order in effect while no header is selected. Null only for a table with
     * genuinely no meaningful resting order — see TableSort.
     */
    defaultSort: SortSpec | null;
    /**
     * Stable identity of a row, used to find its element again after a render
     * (patch a single cell, start an inline edit). Must be unique per row; when
     * two rows share a key the later one wins the lookup.
     */
    rowKey(row: TRow): string;
    /** Localized text for the row shown when there is nothing to display. */
    emptyText: string;
    rowClass?(row: TRow): string;
    /** Wire behaviour onto the whole row (selecting an instrument by clicking it). */
    bindRow?(tr: HTMLTableRowElement, row: TRow): void;
    /** Rows outside the sort, re-read on every render so they can track live data. */
    pinnedRows?(): GridPinnedRow[];
    /**
     * Cap on how many sorted rows are painted. Only rendering is capped — the
     * export still covers every row the grid holds, which is what a watchlist
     * wants: a screen-sized table over a full sheet.
     */
    renderLimit?: number;
    /**
     * Called once the body has been repainted. The grid owns the header
     * listener, so a sort click re-renders without the caller being involved —
     * this is the only hook a caller has for work that depends on *which rows
     * are now on screen* (a watchlist re-subscribing to the visible symbols).
     *
     * Not called for the paint the constructor does: the grid holds no rows
     * yet, so there is nothing on screen to react to, and the caller does not
     * hold its own reference to the grid until the constructor returns.
     */
    afterRender?(): void;
    /**
     * Let the user drag a header to move its column. Off by default: a grid inside
     * a form or a report has nothing to gain from it, and a draggable header is a
     * mouse target that behaves differently from every other one on the page.
     */
    reorderable?: boolean;
    /**
     * Called whenever the user changes the arrangement -- moved a column, hid one,
     * sorted. This is where a host persists it; `setState` deliberately does not
     * fire it, or restoring a layout would write it straight back on every load.
     */
    onStateChange?(state: GridState): void;
}

export class DataGrid<TRow> {
    readonly options: GridOptions<TRow>;
    readonly sort: TableSort<TRow>;
    private _rows: TRow[];
    private _rowEls: Map<string, HTMLTableRowElement>;
    private _cellEls: Map<string, Map<string, HTMLTableCellElement>>;
    /// Display order of every declared column, hidden ones included -- hiding must
    /// not lose the slot a column goes back to.
    private _order: string[];
    private _hidden: Set<string>;
    /// The column a drag started on. Held here rather than in dataTransfer because
    /// the payload is ours, not the page's: dropping a header onto another window
    /// should do nothing, and reading it back out of the event would invite it.
    private _dragKey: string | null;
    private _filters: Record<string, GridFilter>;
    /// The rendered filter controls, by column key, so a stored filter can be put
    /// back into them without rebuilding the row under the user's cursor.
    private _filterEls: Map<string, HTMLElement[]>;
    /// Suppresses onStateChange while setState applies a stored arrangement.
    private _restoring: boolean;

    constructor(options: GridOptions<TRow>) {
        for (const col of options.columns) {
            if (col.exportable && !col.value && !col.exportValue)
                throw new Error(`DataGrid: column "${col.key}" is exportable but declares no value to export`);
        }

        this.options = options;
        this._rows = [];
        this._rowEls = new Map();
        this._cellEls = new Map();
        this._order = options.columns.map(col => col.key);
        this._hidden = new Set();
        this._dragKey = null;
        this._filters = {};
        this._filterEls = new Map();
        this._restoring = false;

        const accessors: Record<string, (row: TRow) => unknown> = {};
        for (const col of options.columns) {
            if (col.value) accessors[col.key] = col.value;
        }

        // The header has to exist before TableSort is constructed: it marks the
        // active column on the cells it finds under `head` right away, so that the
        // resting sort is visible on first paint and not only after a click.
        this._renderHead();
        this.sort = new TableSort<TRow>(options.head, accessors, () => this.render(), options.defaultSort);
        this._paint();
    }

    /** Every declared column in display order, hidden ones included. */
    columnKeys(): string[] {
        return [...this._order];
    }

    /** The columns actually rendered, in the order they are rendered. */
    visibleColumns(): GridColumn<TRow>[] {
        const byKey = new Map(this.options.columns.map(col => [col.key, col]));
        return this._order.filter(key => !this._hidden.has(key)).map(key => byKey.get(key)!);
    }

    isColumnHidden(key: string): boolean {
        return this._hidden.has(key);
    }

    /**
     * Put the columns in this order. Keys the caller leaves out keep their relative
     * order behind the ones named -- a layout stored before a column existed must
     * not make that column disappear.
     */
    setColumnOrder(keys: string[]): void {
        const known = new Set(this.options.columns.map(col => col.key));
        for (const key of keys) {
            if (!known.has(key)) throw new Error(`DataGrid: no column "${key}" to order`);
        }
        this._applyOrder(keys);
        this._rerender();
    }

    hideColumn(key: string): void {
        if (this._hidden.has(key)) return;
        this._hidden.add(key);
        this._rerender();
    }

    showColumn(key: string): void {
        if (!this._hidden.delete(key)) return;
        this._rerender();
    }

    /** The filters in effect, by column key. Columns with none are absent. */
    filters(): Record<string, GridFilter> {
        return { ...this._filters };
    }

    /**
     * Filter a column, or pass null to stop filtering it. A filter with nothing set
     * -- a text box the user emptied -- is the same as null, so clearing an input
     * brings the rows back instead of matching nothing.
     */
    setFilter(key: string, filter: GridFilter | null): void {
        const normalized = filter && DataGrid._normalizeFilter(filter);
        if (normalized) this._filters[key] = normalized;
        else delete this._filters[key];
        this._afterFilterChange();
    }

    clearFilters(): void {
        if (Object.keys(this._filters).length === 0) return;
        this._filters = {};
        this._afterFilterChange();
    }

    /** The held rows that pass every filter, in the order they were handed over. */
    filteredRows(): TRow[] {
        const entries = Object.entries(this._filters);
        if (entries.length === 0) return this._rows;

        const byKey = new Map(this.options.columns.map(col => [col.key, col]));
        return this._rows.filter(row => entries.every(([key, filter]) => {
            const col = byKey.get(key);
            // A filter naming a column that is gone matches everything rather than
            // nothing: a stale stored filter must not empty the table.
            if (!col || !col.value) return true;
            return DataGrid._passes(col.value(row), filter);
        }));
    }

    private _afterFilterChange(): void {
        this.render();
        this._refreshFilterRow();
        if (!this._restoring && this.options.onStateChange) this.options.onStateChange(this.getState());
    }

    private static _normalizeFilter(filter: GridFilter): GridFilter | null {
        const out: GridFilter = {};
        const text = typeof filter.text === 'string' ? filter.text.trim() : '';
        if (text) out.text = text;
        if (typeof filter.min === 'number' && Number.isFinite(filter.min)) out.min = filter.min;
        if (typeof filter.max === 'number' && Number.isFinite(filter.max)) out.max = filter.max;
        if (filter.values && filter.values.length) out.values = [...filter.values];
        return Object.keys(out).length ? out : null;
    }

    private static _passes(value: unknown, filter: GridFilter): boolean {
        if (filter.text !== undefined) {
            if (!DataGrid._text(value).toLowerCase().includes(filter.text.toLowerCase())) return false;
        }
        if (filter.min !== undefined || filter.max !== undefined) {
            const n = typeof value === 'number' ? value : Number(value);
            if (!Number.isFinite(n)) return false;
            if (filter.min !== undefined && n < filter.min) return false;
            if (filter.max !== undefined && n > filter.max) return false;
        }
        if (filter.values !== undefined) {
            if (!filter.values.includes(DataGrid._text(value))) return false;
        }
        return true;
    }

    /** The arrangement, as a host would store it. */
    getState(): GridState {
        return {
            order: [...this._order],
            hidden: this._order.filter(key => this._hidden.has(key)),
            sort: this.sort.current(),
            filters: this.filters(),
        };
    }

    /**
     * Restore an arrangement. Unknown column keys are dropped rather than rejected:
     * a view stored before a deploy has to survive one.
     */
    setState(state: GridState): void {
        const known = new Set(this.options.columns.map(col => col.key));
        this._restoring = true;
        try {
            if (state.order) this._applyOrder(state.order.filter(key => known.has(key)));
            if (state.hidden) this._hidden = new Set(state.hidden.filter(key => known.has(key)));
            if (state.sort !== undefined) {
                if (state.sort) this.sort.set(state.sort.col, state.sort.dir);
                else this.sort.set(null, null);
            }
            if (state.filters) {
                this._filters = {};
                for (const [key, filter] of Object.entries(state.filters)) {
                    if (!known.has(key)) continue;
                    const normalized = DataGrid._normalizeFilter(filter);
                    if (normalized) this._filters[key] = normalized;
                }
            }
            this._rerender();
        } finally {
            this._restoring = false;
        }
    }

    private _applyOrder(keys: string[]): void {
        const named = keys.filter((key, i) => keys.indexOf(key) === i);
        this._order = [...named, ...this._order.filter(key => !named.includes(key))];
    }

    /// One place that repaints and tells the host, so no caller can do one without
    /// the other.
    private _rerender(): void {
        this._renderHead();
        this.sort.refreshHeader();
        this.render();
        if (!this._restoring && this.options.onStateChange) this.options.onStateChange(this.getState());
    }

    /**
     * The rows the grid holds, in the order they were handed over. The grid keeps
     * the caller's array by reference: a caller that merges a live delta into it
     * and calls `render()` repaints from the current contents.
     */
    get rows(): TRow[] {
        return this._rows;
    }

    /**
     * Rows in the order currently in effect (the picked column, else the table
     * default). A sorted copy — the held array is never reordered.
     */
    sortedRows(): TRow[] {
        return this.sort.apply(this.filteredRows());
    }

    setRows(rows: TRow[]): void {
        this._rows = rows || [];
        this.render();
        // A set filter offers the values the rows actually hold, so new rows can bring
        // new options. The header is not rebuilt for it -- that would take the caret
        // out of a filter box mid-typing -- only the option list, and only if it moved.
        this._refreshFilterRow();
    }

    render(): void {
        this._paint();
        if (this.options.afterRender) this.options.afterRender();
    }

    private _paint(): void {
        this._rowEls.clear();
        this._cellEls.clear();

        const pinned = this.options.pinnedRows ? this.options.pinnedRows() : [];
        const sorted = this.sortedRows();
        const painted = this.options.renderLimit != null ? sorted.slice(0, this.options.renderLimit) : sorted;

        const children: Node[] = [];
        for (const row of pinned) {
            if (row.place === GridPinnedPlacements.Top) children.push(this._pinnedRow(row));
        }
        // A pinned row is content, so a table showing only a balance summary is not
        // empty — the "nothing here" row would read as a contradiction next to it.
        if (painted.length === 0 && pinned.length === 0) children.push(this._emptyRow());
        for (const row of painted) children.push(this._bodyRow(row));
        for (const row of pinned) {
            if (row.place === GridPinnedPlacements.Bottom) children.push(this._pinnedRow(row));
        }

        this.options.body.replaceChildren(...children);
    }

    /**
     * The rendered row with this key, or null when it is not on screen (filtered
     * out, or past `renderLimit`).
     */
    rowElement(rowKey: string): HTMLTableRowElement | null {
        return this._rowEls.get(rowKey) || null;
    }

    /**
     * The rendered cell at (row, column) — how a caller patches one cell in place
     * instead of repainting the table, and how it finds the cell to edit.
     */
    cellElement(rowKey: string, columnKey: string): HTMLTableCellElement | null {
        return this._cellEls.get(rowKey)?.get(columnKey) || null;
    }

    /**
     * Header captions and cell values of the exportable columns, over every held
     * row in the order in effect. Pure — separate from `download` so the sheet
     * content can be asserted without a browser.
     */
    exportData(): GridExportData {
        const columns = this.visibleColumns().filter(col => col.exportable);
        return {
            headers: columns.map(col => col.header),
            rows: this.sortedRows().map(row => columns.map(col => {
                const accessor = col.exportValue || col.value;
                return accessor ? accessor(row) : null;
            })),
        };
    }

    /** Export to `<baseName>-<timestamp>.xlsx` in the order on screen. */
    download(baseName: string, sheetName: string): void {
        const data = this.exportData();
        TableExport.download(baseName, sheetName, data.headers, data.rows);
    }

    private _renderHead(): void {
        const tr = document.createElement('tr');
        for (const col of this.visibleColumns()) {
            const th = document.createElement('th');
            th.setAttribute('scope', 'col');
            if (col.headerClass) th.className = col.headerClass;
            // Sortable exactly when there is a value to sort by. TableSort binds to
            // the cells carrying `data-sort`, so a column without one is inert.
            if (col.value) th.dataset.sort = col.key;
            if (col.headerHidden) {
                const label = document.createElement('span');
                label.className = 'visually-hidden';
                label.textContent = col.header;
                th.appendChild(label);
            } else {
                th.textContent = col.header;
            }
            if (this.options.reorderable) this._bindHeaderDrag(th, col.key);
            tr.appendChild(th);
        }

        const filters = this._filterRow();
        if (filters) this.options.head.replaceChildren(tr, filters);
        else this.options.head.replaceChildren(tr);
    }

    /**
     * The row of filter controls, or null when no visible column declares one.
     *
     * Every visible column gets a cell even when it has no filter, or the row would
     * shear away from the captions above it. The cells carry no `data-sort`, so a
     * click inside one does not reach the sort handler bound on the `<thead>`.
     */
    private _filterRow(): HTMLTableRowElement | null {
        const columns = this.visibleColumns();
        if (!columns.some(col => col.filter)) return null;

        const tr = document.createElement('tr') as HTMLTableRowElement;
        tr.className = 'grid-filters';
        this._filterEls = new Map();

        for (const col of columns) {
            const cell = document.createElement('th') as HTMLTableCellElement;
            cell.dataset.filter = col.key;
            if (col.filter) {
                for (const el of this._filterControls(col)) cell.appendChild(el);
            }
            tr.appendChild(cell);
        }
        return tr;
    }

    private _filterControls(col: GridColumn<TRow>): HTMLElement[] {
        const current = this._filters[col.key] || {};

        if (col.filter === 'text') {
            const input = document.createElement('input') as HTMLInputElement;
            input.type = 'text';
            input.className = 'grid-filter grid-filter-text';
            input.value = current.text || '';
            input.addEventListener('input', () => this.setFilter(col.key, { text: input.value }));
            this._filterEls.set(col.key, [input]);
            return [input];
        }

        if (col.filter === 'number') {
            const read = (el: HTMLInputElement) => {
                const n = Number(el.value);
                return el.value.trim() === '' || !Number.isFinite(n) ? undefined : n;
            };
            const make = (className: string, value: number | undefined) => {
                const input = document.createElement('input') as HTMLInputElement;
                input.type = 'number';
                input.className = `grid-filter ${className}`;
                input.value = value === undefined ? '' : String(value);
                return input;
            };
            const min = make('grid-filter-min', current.min);
            const max = make('grid-filter-max', current.max);
            const push = () => this.setFilter(col.key, { min: read(min), max: read(max) });
            min.addEventListener('input', push);
            max.addEventListener('input', push);
            this._filterEls.set(col.key, [min, max]);
            return [min, max];
        }

        // A set filter offers the values actually in the held rows -- all of them,
        // not the ones surviving the current filters, or picking one would empty the
        // list it was picked from.
        const select = document.createElement('select') as HTMLSelectElement;
        select.className = 'grid-filter grid-filter-set';
        const blank = document.createElement('option') as HTMLOptionElement;
        blank.value = '';
        blank.textContent = '';
        select.appendChild(blank);
        for (const value of this._distinctValues(col)) {
            const option = document.createElement('option') as HTMLOptionElement;
            option.value = value;
            option.textContent = value;
            select.appendChild(option);
        }
        select.value = current.values && current.values.length ? current.values[0] : '';
        select.addEventListener('change', () =>
            this.setFilter(col.key, select.value ? { values: [select.value] } : null));
        this._filterEls.set(col.key, [select]);
        return [select];
    }

    /// Replaces the option list only when the values behind it changed, so a live
    /// table that repaints on every tick does not rebuild a select the user is using.
    private _syncOptions(select: HTMLSelectElement, values: string[]): void {
        const current = Array.from(select.children).slice(1).map(el => (el as HTMLOptionElement).value);
        if (current.length === values.length && current.every((v, i) => v === values[i])) return;

        const blank = document.createElement('option') as HTMLOptionElement;
        blank.value = '';
        blank.textContent = '';
        const options: HTMLElement[] = [blank];
        for (const value of values) {
            const option = document.createElement('option') as HTMLOptionElement;
            option.value = value;
            option.textContent = value;
            options.push(option);
        }
        select.replaceChildren(...options);
    }

    private _distinctValues(col: GridColumn<TRow>): string[] {
        const seen = new Set<string>();
        for (const row of this._rows) {
            if (col.value) seen.add(DataGrid._text(col.value(row)));
        }
        return [...seen].sort();
    }

    /**
     * Put the stored filters back into the controls without rebuilding the row.
     * Rebuilding it would take the focus and the caret out of the box the user is
     * still typing in.
     */
    private _refreshFilterRow(): void {
        for (const [key, els] of this._filterEls) {
            const filter = this._filters[key] || {};
            if (els.length === 2) {
                (els[0] as HTMLInputElement).value = filter.min === undefined ? '' : String(filter.min);
                (els[1] as HTMLInputElement).value = filter.max === undefined ? '' : String(filter.max);
            } else if (els[0].tagName === 'SELECT') {
                const select = els[0] as HTMLSelectElement;
                const col = this.options.columns.find(c => c.key === key);
                if (col) this._syncOptions(select, this._distinctValues(col));
                select.value = filter.values && filter.values.length ? filter.values[0] : '';
            } else {
                const input = els[0] as HTMLInputElement;
                const want = filter.text || '';
                if (input.value !== want) input.value = want;
            }
        }
    }

    private _bodyRow(row: TRow): HTMLTableRowElement {
        const tr = document.createElement('tr') as HTMLTableRowElement;
        const key = this.options.rowKey(row);
        const rowClass = this.options.rowClass ? this.options.rowClass(row) : '';
        if (rowClass) tr.className = rowClass;
        tr.dataset.rowKey = key;

        const cells = new Map<string, HTMLTableCellElement>();
        for (const col of this.visibleColumns()) {
            const td = document.createElement('td') as HTMLTableCellElement;
            td.dataset.col = col.key;
            const cellClass = col.cellClass ? col.cellClass(row) : '';
            if (cellClass) td.className = cellClass;
            const content = col.render ? col.render(row) : DataGrid._text(col.value ? col.value(row) : null);
            // A renderer is declared to return a string or a Node, but a value that
            // fell through a formatter's branches arrives as whatever it was - a raw
            // status number, say. Passing that to appendChild throws and takes the
            // whole table down over one unexpected row, so anything that is not a Node
            // is rendered as text. nodeType rather than instanceof Node: the tests run
            // against a fake DOM with no Node constructor in scope.
            if (content !== null && typeof content === 'object' && 'nodeType' in content) td.appendChild(content);
            else td.textContent = DataGrid._text(content);
            if (col.bindCell) col.bindCell(td, row);
            tr.appendChild(td);
            cells.set(col.key, td);
        }

        if (this.options.bindRow) this.options.bindRow(tr, row);
        this._rowEls.set(key, tr);
        this._cellEls.set(key, cells);
        return tr;
    }

    private _pinnedRow(pinned: GridPinnedRow): HTMLTableRowElement {
        if (pinned.cells.length > this.options.columns.length) {
            throw new Error(`DataGrid: pinned row "${pinned.key}" declares ${pinned.cells.length} cells `
                + `for ${this.options.columns.length} columns`);
        }

        const tr = document.createElement('tr') as HTMLTableRowElement;
        if (pinned.className) tr.className = pinned.className;
        tr.dataset.rowKey = pinned.key;

        // The cells are authored positionally against the DECLARED columns, so they
        // are keyed by that before rendering: a summary cell belongs to its column,
        // and has to travel when the user moves it rather than stay in slot 0.
        const byColumn = new Map<string, GridPinnedCell>();
        this.options.columns.forEach((col, i) => {
            const cell = pinned.cells[i];
            if (cell) byColumn.set(col.key, cell);
        });

        const cells = new Map<string, HTMLTableCellElement>();
        for (const col of this.visibleColumns()) {
            const td = document.createElement('td') as HTMLTableCellElement;
            td.dataset.col = col.key;
            const cell = byColumn.get(col.key);
            if (cell) {
                if (cell.className) td.className = cell.className;
                if (typeof cell.content === 'string') td.textContent = cell.content;
                else td.appendChild(cell.content);
            }
            tr.appendChild(td);
            cells.set(col.key, td);
        }

        this._rowEls.set(pinned.key, tr);
        this._cellEls.set(pinned.key, cells);
        return tr;
    }

    private _emptyRow(): HTMLTableRowElement {
        const tr = document.createElement('tr') as HTMLTableRowElement;
        const td = document.createElement('td') as HTMLTableCellElement;
        td.className = 'grid-empty';
        td.colSpan = this.visibleColumns().length;
        td.textContent = this.options.emptyText;
        tr.appendChild(td);
        return tr;
    }

    /**
     * Drag a header to move its column in front of the one it is dropped on.
     *
     * The dragged key lives on the instance rather than in dataTransfer: the payload
     * is this grid's, and reading it back out of the event would mean a header
     * dragged from anywhere -- another grid, another window -- could reorder this one.
     */
    private _bindHeaderDrag(th: HTMLElement, key: string): void {
        th.setAttribute('draggable', 'true');

        th.addEventListener('dragstart', () => { this._dragKey = key; });
        th.addEventListener('dragend', () => { this._dragKey = null; });

        // Without preventDefault the browser refuses the drop, and the header just
        // springs back with nothing to show for the gesture.
        th.addEventListener('dragover', (event: Event) => {
            if (this._dragKey !== null && this._dragKey !== key) event.preventDefault();
        });

        th.addEventListener('drop', (event: Event) => {
            event.preventDefault();
            const moved = this._dragKey;
            this._dragKey = null;
            if (moved === null || moved === key) return;

            const order = this._order.filter(k => k !== moved);
            order.splice(order.indexOf(key), 0, moved);
            this._applyOrder(order);
            this._rerender();
        });
    }

    private static _text(value: unknown): string {
        return value === null || value === undefined ? '' : String(value);
    }
}
