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
}

export class DataGrid<TRow> {
    readonly options: GridOptions<TRow>;
    readonly sort: TableSort<TRow>;
    private _rows: TRow[];
    private _rowEls: Map<string, HTMLTableRowElement>;
    private _cellEls: Map<string, Map<string, HTMLTableCellElement>>;

    constructor(options: GridOptions<TRow>) {
        for (const col of options.columns) {
            if (col.exportable && !col.value && !col.exportValue)
                throw new Error(`DataGrid: column "${col.key}" is exportable but declares no value to export`);
        }

        this.options = options;
        this._rows = [];
        this._rowEls = new Map();
        this._cellEls = new Map();

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
        return this.sort.apply(this._rows);
    }

    setRows(rows: TRow[]): void {
        this._rows = rows || [];
        this.render();
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
        const columns = this.options.columns.filter(col => col.exportable);
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
        for (const col of this.options.columns) {
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
            tr.appendChild(th);
        }
        this.options.head.replaceChildren(tr);
    }

    private _bodyRow(row: TRow): HTMLTableRowElement {
        const tr = document.createElement('tr') as HTMLTableRowElement;
        const key = this.options.rowKey(row);
        const rowClass = this.options.rowClass ? this.options.rowClass(row) : '';
        if (rowClass) tr.className = rowClass;
        tr.dataset.rowKey = key;

        const cells = new Map<string, HTMLTableCellElement>();
        for (const col of this.options.columns) {
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

        const cells = new Map<string, HTMLTableCellElement>();
        for (let i = 0; i < this.options.columns.length; i++) {
            const col = this.options.columns[i];
            const td = document.createElement('td') as HTMLTableCellElement;
            td.dataset.col = col.key;
            const cell = pinned.cells[i];
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
        td.colSpan = this.options.columns.length;
        td.textContent = this.options.emptyText;
        tr.appendChild(td);
        return tr;
    }

    private static _text(value: unknown): string {
        return value === null || value === undefined ? '' : String(value);
    }
}
