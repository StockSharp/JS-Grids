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
import { GridContextMenu, type GridMenuClasses, type GridMenuItem } from './context-menu.js';
import { GridFilterDialog, type GridFilterDialogClasses, type GridFilterDialogLabels } from './filter-dialog.js';
import { TableExport } from './table-export.js';

/// A row separator for the clipboard. Named because a bare escape inside a string
/// is easy to mangle when this file is edited by a tool rather than by hand.
const NEWLINE = String.fromCharCode(10);
const TAB = String.fromCharCode(9);

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
     * The value as a person reads it, when that is not the value itself: `Buy` for
     * the 0 an order's side is held as, a status name for its code.
     *
     * The grid shows this wherever it has to name a value outside a cell -- a group
     * header, the list a set filter is picked from, the menu line that filters by
     * the value under the pointer -- while `value` goes on being what it sorts,
     * groups and compares by. Without it those places read `0 (14)`, and a filter
     * picked from them would be comparing a label against a number.
     *
     * Unlike `render`, this returns text and nothing but text, so the grid can put
     * it in places that hold no markup.
     */
    text?(row: TRow): string;

    /**
     * Draw a filter for this column, of this kind. Omit it and the column is not
     * filterable -- a filter row appears only once some column asks for one.
     */
    filter?: GridFilterKind;

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

/**
 * Which control the grid draws for a column, and therefore how its filter reads:
 * a substring box, a min/max pair, or a list of the values present.
 */
export type GridFilterKind = 'text' | 'number' | 'set';

/** Where a right-click landed, handed to whoever builds the menu for it. */
export interface GridMenuContext<TRow> {
    /** The column under the pointer, or null when the click missed the cells. */
    column: GridColumn<TRow> | null;
    /** The row under the pointer, or null on a header, a group row or empty space. */
    row: TRow | null;
    /** The value of that row in that column, already rendered as text. */
    text: string;
    /** Where the click landed, so anything the menu opens can appear there. */
    x: number;
    y: number;
}

/** How the grid's own menu is set up, and how a host takes it over. */
export interface GridMenuOptions<TRow> {
    classes?: GridMenuClasses;
    /**
     * The final say on what the menu contains. Gets the grid's own items and may
     * return them, add to them, or ignore them entirely; returning an empty array
     * suppresses the menu for that click.
     */
    items?(context: GridMenuContext<TRow>, defaults: GridMenuItem[]): GridMenuItem[];
    /** Wording, for a host that is not in English. */
    labels?: Partial<GridMenuLabels>;
    /** Class names and wording for the filter rule dialog the menu opens. */
    filterDialog?: { classes?: GridFilterDialogClasses; labels?: Partial<GridFilterDialogLabels> };
}

/** Every phrase the built-in menu can show. */
export interface GridMenuLabels {
    sortAsc: string;
    sortDesc: string;
    sortClear: string;
    hideColumn: string;
    showAllColumns: string;
    groupBy: string;
    ungroup: string;
    /**
     * Names the value under the pointer. A function rather than a string because the
     * line is two pieces joined, and what joins them is a language's business: a
     * Chinese UI wants a full-width colon, and some languages want the value first.
     */
    filterByValue(text: string): string;
    filterRule: string;
    showFilters: string;
    hideFilters: string;
    clearFilters: string;
    copyCell: string;
    copyRow: string;
    /** Names how many rows go. A function for the same reason as `filterByValue`. */
    copyRows(count: number): string;
    exportXlsx: string;
}

const MENU_LABELS: GridMenuLabels = {
    sortAsc: 'Sort ascending',
    sortDesc: 'Sort descending',
    sortClear: 'Clear sort',
    hideColumn: 'Hide column',
    showAllColumns: 'Show all columns',
    groupBy: 'Group by this column',
    ungroup: 'Ungroup',
    filterByValue: text => `Filter by this value: ${text}`,
    filterRule: 'Filter…',
    showFilters: 'Show filter row',
    hideFilters: 'Hide filter row',
    clearFilters: 'Clear filters',
    copyCell: 'Copy cell',
    copyRow: 'Copy row',
    copyRows: count => `Copy selected rows (${count})`,
    exportXlsx: 'Export to .xlsx',
};

/** How many rows a user may have selected at once. */
export type GridSelectionMode = 'none' | 'single' | 'multi';

/** One value a set filter can be picked by: what it compares, and what it reads as. */
export interface GridValueOption {
    value: string;
    label: string;
}

/// Rows sharing a value, under the label that value reads as.
interface GridGroup<TRow> {
    label: string;
    rows: TRow[];
}

/**
 * One column's filter. Plain data rather than a predicate, and deliberately so:
 * a closure cannot be written to a store, so a grid filtered by one could never
 * come back filtered the same way. Every field is optional; an object with none
 * of them set means no filter at all.
 */
export interface GridFilter {
    /**
     * The rule. Absent means the shape decides: `text` reads as "contains", a
     * min/max pair as "between" -- which is what the inline row writes, and what a
     * filter stored before operators existed still means.
     */
    op?: GridFilterOp;
    /** The value the rule compares against, for every op but `empty` / `notEmpty`. */
    text?: string;
    /** Inclusive bounds for `between`; `min` alone also carries the operand of ge/gt/eq/ne on numbers. */
    min?: number;
    max?: number;
    /**
     * The values the rule picks from, as the column's `value` produces them -- the
     * raw side, not the "Buy" a person picked. `anyOf` keeps them, `noneOf` drops
     * them; with no op at all the list reads as `anyOf`, which is what the single
     * select in the filter row writes.
     */
    values?: string[];
}

/**
 * What a filter asks of a value. Text and numbers share the comparison ops -- a
 * user filtering an id column expects `>` to mean what it says, and a symbol
 * column compares as text.
 */
export type GridFilterOp =
    'contains' | 'notContains' | 'startsWith' | 'endsWith'
    | 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le' | 'between'
    | 'anyOf' | 'noneOf'
    | 'empty' | 'notEmpty';

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
    /** Whether the filter row is on screen. Absent means the table's own default. */
    filtersVisible?: boolean;
    sort?: SortSpec | null;
    /** By column key. Columns that are not filtered are absent rather than empty. */
    filters?: Record<string, GridFilter>;
    /** Column key the rows are grouped under, or null for a flat table. */
    group?: string | null;
    /** Group values the user collapsed. */
    collapsed?: string[];
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
     * The language the table is written in, as a BCP 47 tag. It decides the order of
     * everything compared as text -- the sort, the groups, a set filter's option list
     * -- so a page rendered in German orders the same way for every visitor instead of
     * following whatever locale their browser happens to be set to.
     *
     * Left out, the collator takes the document's own language.
     */
    locale?: string;

    /** A collator of your own, when the default (numeric, case-folding) is not it. */
    collator?: Intl.Collator;

    /**
     * The line a group header shows. The default reads `▾ Buy (14)`; override it for a
     * language that writes counts differently, or return a Node to put a real chevron
     * element in place of the triangle.
     */
    groupHeader?(label: string, count: number, collapsed: boolean): string | Node;

    /**
     * Show the row of filter boxes under the header. Off by default: the rule dialog
     * says everything the row can and more -- an operator, not just a substring -- and
     * a row of boxes costs a line of vertical space on every table that has one. Turn
     * it on for a table where filtering is the main activity.
     */
    filtersVisible?: boolean;
    /**
     * Whether clicking a row selects it, and whether more than one can be selected.
     * Defaults to 'none': a table that is read, not acted on, should not respond to
     * a click with a highlight nobody asked for.
     */
    selection?: GridSelectionMode;
    /**
     * Class put on a selected row. The grid names elements but decides nothing about
     * how they look, so the host supplies the name its stylesheet defines.
     */
    selectedClass?: string;
    onSelectionChange?(keys: string[]): void;
    /**
     * Offer a context menu on right-click. `true` takes the grid's own; an object
     * keeps it and lets the host restyle, reword or rewrite the items.
     */
    contextMenu?: boolean | GridMenuOptions<TRow>;
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
    private _group: string | null;
    private _filtersVisible: boolean;
    /// By row key, never by index or element: a repaint rebuilds every `<tr>`, and a
    /// filter takes rows off screen and brings them back.
    private _selected: Set<string>;
    /// Where a shift-click measures its range from.
    private _anchorKey: string | null;
    private _menu: GridContextMenu | null;
    private _dragging: boolean;
    /// One collator for the whole grid: the sort, the group order, the option list a
    /// set filter offers, and the ordering filter rules. They compare the same strings
    /// and had better agree about what comes first.
    private readonly _collator: Intl.Collator;
    /// What to undo when the grid is destroyed: the listeners it put on the document.
    private readonly _release: (() => void)[] = [];
    /// The grid a keyboard shortcut belongs to: the last one the pointer touched.
    /// Two grids on a page both holding a selection would otherwise both answer Ctrl+C.
    private static _active: DataGrid<unknown> | null = null;
    private _filterDialog: GridFilterDialog | null;
    private _collapsed: Set<string>;
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
        this._filtersVisible = options.filtersVisible === true;
        this._group = null;
        this._collapsed = new Set();
        this._selected = new Set();
        this._anchorKey = null;
        this._menu = null;
        this._filterDialog = null;
        this._dragging = false;
        this._collator = options.collator
            || new Intl.Collator(
                options.locale || (typeof document !== 'undefined' ? document.documentElement?.lang : '') || undefined,
                // numeric so a text column of ids reads 1, 2, 10 rather than 1, 10, 2,
                // and accent-sensitive so it folds case the way the text filters do.
                { numeric: true, sensitivity: 'accent' });
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
        this.sort = new TableSort<TRow>(options.head, accessors, () => this.render(), options.defaultSort, this._collator);
        this._paint();
        if (options.contextMenu) this._bindContextMenu();
        if ((options.selection || 'none') !== 'none') this._bindCopyShortcut();
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

    filtersVisible(): boolean {
        return this._filtersVisible;
    }

    /** Show or hide the filter row. The filters themselves are kept either way. */
    showFilters(visible: boolean): void {
        if (this._filtersVisible === visible) return;
        this._filtersVisible = visible;
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
            return this._passes(col.value(row), filter);
        }));
    }

    private _afterFilterChange(): void {
        this.render();
        this._refreshFilterRow();
        if (!this._restoring && this.options.onStateChange) this.options.onStateChange(this.getState());
    }

    private static _normalizeFilter(filter: GridFilter): GridFilter | null {
        const out: GridFilter = {};
        // `empty` and `notEmpty` ask about the value itself, so they are a filter even
        // with nothing typed in -- every other op needs an operand to mean anything.
        if (filter.op === 'empty' || filter.op === 'notEmpty') return { op: filter.op };
        if (filter.op) out.op = filter.op;
        const text = typeof filter.text === 'string' ? filter.text.trim() : '';
        if (text) out.text = text;
        if (typeof filter.min === 'number' && Number.isFinite(filter.min)) out.min = filter.min;
        if (typeof filter.max === 'number' && Number.isFinite(filter.max)) out.max = filter.max;
        if (filter.values && filter.values.length) out.values = [...filter.values];
        // An op on its own filters nothing; it needs something to compare against.
        if (out.op && out.text === undefined && out.min === undefined && out.max === undefined && !out.values) return null;
        return Object.keys(out).length ? out : null;
    }

    private _passes(value: unknown, filter: GridFilter): boolean {
        const op = DataGrid._effectiveOp(filter);
        if (!op) return true;

        const text = DataGrid._text(value);
        // A set filter is picked from the values present rather than compared against
        // an operand, so it answers on its own terms.
        if (op === 'anyOf' || op === 'noneOf') {
            const listed = (filter.values || []).includes(text);
            return op === 'anyOf' ? listed : !listed;
        }

        if (op === 'empty') return text === '';
        if (op === 'notEmpty') return text !== '';

        if (op === 'between') {
            const n = Number(text);
            if (!Number.isFinite(n)) return false;
            if (filter.min !== undefined && n < filter.min) return false;
            if (filter.max !== undefined && n > filter.max) return false;
            return true;
        }

        // Compared as numbers when both sides are numbers, as text otherwise: `>` on a
        // symbol column has to mean something, and on a quantity it has to mean the
        // arithmetic thing rather than '9' > '10'.
        const operandText = filter.text !== undefined ? filter.text : (filter.min !== undefined ? String(filter.min) : '');
        const left = Number(text);
        const right = Number(operandText);
        const numeric = text !== '' && operandText !== '' && Number.isFinite(left) && Number.isFinite(right);

        // Ordering compares through the collator, not with `>` on strings: raw
        // comparison is UTF-16 code-unit order, which puts every accented letter after
        // z and every Cyrillic capital before every small letter -- so a column shown
        // in one order would filter in another.
        const order = numeric ? Math.sign(left - right) : this._collator.compare(text, operandText);

        switch (op) {
            case 'contains': return text.toLowerCase().includes(operandText.toLowerCase());
            case 'notContains': return !text.toLowerCase().includes(operandText.toLowerCase());
            case 'startsWith': return text.toLowerCase().startsWith(operandText.toLowerCase());
            case 'endsWith': return text.toLowerCase().endsWith(operandText.toLowerCase());
            case 'eq': return numeric ? left === right : text.toLowerCase() === operandText.toLowerCase();
            case 'ne': return numeric ? left !== right : text.toLowerCase() !== operandText.toLowerCase();
            case 'gt': return order > 0;
            case 'ge': return order >= 0;
            case 'lt': return order < 0;
            case 'le': return order <= 0;
            default: return true;
        }
    }

    /// The rule actually in force. Absent `op` keeps the old meaning of the shape, so
    /// a filter written by the inline row -- or stored before operators existed --
    /// goes on meaning what it meant.
    private static _effectiveOp(filter: GridFilter): GridFilterOp | null {
        if (filter.op) return filter.op;
        // No op means the shape decides, which is what the controls in the filter row
        // write: a box of text reads as "contains", a pair of numbers as "between",
        // and a picked value as "any of".
        if (filter.values !== undefined) return 'anyOf';
        if (filter.min !== undefined || filter.max !== undefined) return 'between';
        if (filter.text !== undefined) return 'contains';
        return null;
    }

    /**
     * The items the grid offers for a right-click. Public so a host that replaces
     * the menu can still reach for the parts of it that it wants to keep.
     */
    menuItems(context: GridMenuContext<TRow>): GridMenuItem[] {
        const labels = { ...MENU_LABELS, ...(this._menuOptions().labels || {}) };
        const items: GridMenuItem[] = [];
        const col = context.column;

        if (col && col.value) {
            const sort = this.sort.current();
            items.push(
                { label: labels.sortAsc, checked: sort?.col === col.key && sort.dir === 'asc', run: () => this.sort.set(col.key, 'asc') },
                { label: labels.sortDesc, checked: sort?.col === col.key && sort.dir === 'desc', run: () => this.sort.set(col.key, 'desc') },
                { label: labels.sortClear, disabled: !sort, run: () => this.sort.set(null, null) },
                {},
                this._group === col.key
                    ? { label: labels.ungroup, run: () => this.groupBy(null) }
                    : { label: labels.groupBy, run: () => this.groupBy(col.key) },
            );

            if (col.filter) {
                items.push({
                    label: labels.filterRule,
                    checked: this._filters[col.key] !== undefined,
                    run: () => this.openFilterDialog(col.key, context.x, context.y),
                });
            }

            if (context.row !== null) {
                // Named by what the cell reads as, filtering by what the column holds.
                // Taking the cell's text for both matched a label against a raw value,
                // so on a column showing "Buy" for 0 this line filtered everything out.
                const value = DataGrid._text(col.value ? col.value(context.row) : null);
                items.push({
                    label: labels.filterByValue(this._displayText(col, context.row)),
                    run: () => this.setFilter(col.key, { op: 'anyOf', values: [value] }),
                });
            }
        }

        if (this.options.columns.some(c => c.filter)) {
            items.push(
                {
                    label: this._filtersVisible ? labels.hideFilters : labels.showFilters,
                    checked: this._filtersVisible,
                    run: () => this.showFilters(!this._filtersVisible),
                },
                { label: labels.clearFilters, disabled: Object.keys(this._filters).length === 0, run: () => this.clearFilters() },
                {},
            );
        }

        if (col) {
            items.push({
                label: labels.hideColumn,
                // The last visible column cannot go: a table with no columns is a
                // blank rectangle with no way back to itself.
                disabled: this.visibleColumns().length <= 1,
                run: () => this.hideColumn(col.key),
            });
        }
        items.push({
            label: labels.showAllColumns,
            disabled: this._hidden.size === 0,
            run: () => { for (const key of [...this._hidden]) this.showColumn(key); },
        });

        if (context.row !== null) {
            items.push(
                {},
                { label: labels.copyCell, run: () => DataGrid._copy(context.text) },
                {
                    // Names how many rows go, because "Copy row" over a selection of
                    // twelve would be a lie about what the click is about to do.
                    label: this._selected.size > 1 ? labels.copyRows(this._selected.size) : labels.copyRow,
                    run: () => this.copyRows(context.row),
                },
            );
        }

        items.push({}, { label: labels.exportXlsx, run: () => this.download('export', 'Export') });
        return items;
    }

    private _menuOptions(): GridMenuOptions<TRow> {
        const option = this.options.contextMenu;
        return typeof option === 'object' && option !== null ? option : {};
    }

    private _bindContextMenu(): void {
        this._menu = new GridContextMenu(this._menuOptions().classes);

        const onContext = (event: Event) => {
            DataGrid._active = this as unknown as DataGrid<unknown>;
            const target = (event as unknown as { target?: Element }).target;
            const cell = target && typeof target.closest === 'function'
                ? target.closest('[data-col]') as HTMLElement | null
                : null;
            const rowEl = target && typeof target.closest === 'function'
                ? target.closest('[data-row-key]') as HTMLElement | null
                : null;

            const column = cell ? this.options.columns.find(c => c.key === cell.dataset.col) || null : null;
            const rowKey = rowEl?.dataset.rowKey;
            const row = rowKey === undefined ? null
                : this.displayRows().find(r => this.options.rowKey(r) === rowKey) || null;
            const text = column && row && column.value ? DataGrid._text(column.value(row)) : '';

            const at = event as unknown as { clientX?: number; clientY?: number };
            const context: GridMenuContext<TRow> = { column, row, text, x: at.clientX || 0, y: at.clientY || 0 };
            const build = this._menuOptions().items;
            const items = build ? build(context, this.menuItems(context)) : this.menuItems(context);
            if (items.length === 0) return;

            event.preventDefault();
            this._menu!.open(items, context.x, context.y);
        };

        this.options.head.addEventListener('contextmenu', onContext);
        this.options.body.addEventListener('contextmenu', onContext);
    }

    /// The same columns and the same accessors the sheet uses. A row on the clipboard
    /// and a row in the .xlsx are the same data going to the same place, so a column
    /// that renders a button has nothing to contribute to either, and one that exports
    /// "Buy" must not copy the 0 behind it.
    private _rowText(row: TRow): string {
        return this.visibleColumns()
            .filter(col => col.exportable)
            .map(col => DataGrid._text((col.exportValue || col.value)!(row)))
            .join(TAB);
    }

    /// Put text on the clipboard, returning whether anything was written.
    /// navigator.clipboard exists only in a secure context, so on a page served over
    /// plain http to anything but localhost it is simply undefined -- which is how
    /// Copy row came to do nothing at all on a LAN address while working locally. The
    /// older execCommand path still works there, so it is the fallback rather than a
    /// silent no-op.
    private static _copy(text: string): boolean {
        const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
        if (clipboard && clipboard.writeText) {
            clipboard.writeText(text).catch(() => DataGrid._copyFallback(text));
            return true;
        }
        return DataGrid._copyFallback(text);
    }

    private static _copyFallback(text: string): boolean {
        if (typeof document === 'undefined' || !document.body) return false;

        const area = document.createElement('textarea') as HTMLTextAreaElement;
        area.value = text;
        // Off-screen rather than hidden: execCommand copies from a field that is in
        // the layout, and display:none takes it out of the layout.
        area.style.position = 'fixed';
        area.style.left = '-9999px';
        document.body.appendChild(area);
        try {
            area.select();
            return typeof document.execCommand === 'function' && document.execCommand('copy');
        } catch {
            return false;
        } finally {
            area.parentNode?.removeChild(area);
        }
    }

    /**
     * What Copy row and Ctrl+C put on the clipboard: the selected rows when there is
     * a selection, otherwise the one row asked for. Tab-separated, one row per line,
     * which is what a spreadsheet reads back as cells.
     */
    copyText(row: TRow | null): string {
        const selected = this.selectedRows();
        const rows = selected.length > 0 ? selected : (row === null ? [] : [row]);
        return rows.map(r => this._rowText(r)).join(NEWLINE);
    }

    /** Copy the current selection, or the row given. True when anything was written. */
    copyRows(row: TRow | null): boolean {
        const text = this.copyText(row);
        return text === '' ? false : DataGrid._copy(text);
    }

    /** Selected row keys, in the order they appear on screen. */
    selectedKeys(): string[] {
        const onScreen = this.displayRows().map(row => this.options.rowKey(row));
        const known = new Set(onScreen);
        // Keys of rows a filter is currently hiding keep their selection but have no
        // place in the on-screen order, so they follow at the end rather than vanish.
        return [...onScreen.filter(key => this._selected.has(key)),
            ...[...this._selected].filter(key => !known.has(key))];
    }

    /** The selected rows that are actually on screen. */
    selectedRows(): TRow[] {
        return this.displayRows().filter(row => this._selected.has(this.options.rowKey(row)));
    }

    setSelection(keys: string[]): void {
        this._replaceSelection(new Set(keys));
    }

    clearSelection(): void {
        this._replaceSelection(new Set());
    }

    private _replaceSelection(next: Set<string>): void {
        const before = this.selectedKeys();
        this._selected = next;
        const after = this.selectedKeys();
        if (before.length === after.length && before.every((key, i) => key === after[i])) return;
        this.render();
        if (this.options.onSelectionChange) this.options.onSelectionChange(after);
    }

    private _beginDragSelect(): void {
        this._dragging = true;
        const end = () => {
            this._dragging = false;
            document.removeEventListener('mouseup', end, true);
        };
        document.addEventListener('mouseup', end, true);
    }

    private _extendTo(key: string): void {
        if (this._anchorKey === null) return;
        const order = this.displayRows().map(row => this.options.rowKey(row));
        const from = order.indexOf(this._anchorKey);
        const to = order.indexOf(key);
        if (from === -1 || to === -1) return;
        this._replaceSelection(new Set(order.slice(Math.min(from, to), Math.max(from, to) + 1)));
    }

    /// Ctrl+C over the table copies the selected rows. Bound on the document because
    /// a table has no focus of its own, and answered only by the grid the pointer last
    /// touched -- otherwise every grid on the page would copy at once.
    private _bindCopyShortcut(): void {
        const onKeyDown = (event: Event) => {
            const e = event as unknown as { key?: string; code?: string; ctrlKey?: boolean; metaKey?: boolean; target?: { tagName?: string } };
            if (!(e.ctrlKey || e.metaKey)) return;
            // `code` is the physical key, so this holds on a layout where that key
            // types something other than "c" -- on a Russian one it reports "с".
            const isC = e.code ? e.code === 'KeyC' : (e.key || '').toLowerCase() === 'c';
            if (!isC) return;
            if (DataGrid._active !== (this as unknown as DataGrid<unknown>)) return;
            if (this._selected.size === 0) return;

            // Never steal a copy from a field the user is typing in.
            const tag = e.target && e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

            if (this.copyRows(null)) event.preventDefault();
        };
        document.addEventListener('keydown', onKeyDown);
        this._release.push(() => document.removeEventListener('keydown', onKeyDown));
    }

    /**
     * Let the grid go. Everything it put outside its own two elements comes off: the
     * Ctrl+C binding on the document, and any menu or filter popup still open.
     *
     * A host needs this whenever it replaces a grid rather than updating one -- the
     * columns are declared once, so re-declaring them (translated headers, a different
     * set of columns) means a new grid over the same table, and the old one would go
     * on answering Ctrl+C from beyond the grave.
     */
    destroy(): void {
        for (const release of this._release.splice(0)) release();
        this._menu?.close();
        this._filterDialog?.close();
        if (DataGrid._active === (this as unknown as DataGrid<unknown>)) DataGrid._active = null;
    }

    private _clickRow(key: string, event: Event): void {
        const mode = this.options.selection || 'none';
        if (mode === 'none') return;

        const modifiers = event as unknown as { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean };
        const next = new Set<string>();

        if (mode === 'single' || (!modifiers.ctrlKey && !modifiers.metaKey && !modifiers.shiftKey)) {
            next.add(key);
            this._anchorKey = key;
        } else if (modifiers.shiftKey && this._anchorKey !== null) {
            // The range is what the user sees between the two rows, so it is measured
            // against the order on screen -- sorted, filtered, grouped -- not the order
            // the rows were handed over in.
            const order = this.displayRows().map(row => this.options.rowKey(row));
            const from = order.indexOf(this._anchorKey);
            const to = order.indexOf(key);
            if (from === -1 || to === -1) next.add(key);
            else for (const k of order.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(k);
        } else {
            for (const k of this._selected) next.add(k);
            if (!next.delete(key)) next.add(key);
            this._anchorKey = key;
        }

        this._replaceSelection(next);
    }

    /**
     * Open the rule dialog for a column -- an operator and its operand, which is what
     * the inline row cannot express without growing a second control per column.
     */
    openFilterDialog(key: string, x: number, y: number): void {
        const col = this.options.columns.find(c => c.key === key);
        if (!col || !col.filter) return;

        const options = this._menuOptions().filterDialog || {};
        if (!this._filterDialog) this._filterDialog = new GridFilterDialog(options.classes, options.labels);

        this._filterDialog.open(
            {
                header: col.header,
                kind: col.filter,
                current: this._filters[key] || null,
                // A set column is picked from, not typed into: the dialog needs the
                // values the rows actually hold, each under the label it reads as.
                values: col.filter === 'set' ? this._distinctValues(col) : [],
                x,
                y,
            },
            filter => this.setFilter(key, filter),
        );
    }

    /** The column the rows are grouped under, or null. */
    groupedBy(): string | null {
        return this._group;
    }

    /** Group by a column, or pass null to go flat. */
    groupBy(key: string | null): void {
        if (key !== null) {
            const col = this.options.columns.find(c => c.key === key);
            if (!col || !col.value) throw new Error(`DataGrid: no column "${key}" with a value to group by`);
        }
        this._group = key;
        // Collapse is remembered per group value, and the values belong to the column
        // that produced them -- keeping them across a regroup would collapse whatever
        // happened to share a name.
        this._collapsed.clear();
        this._afterViewChange();
    }

    collapsedGroups(): string[] {
        return [...this._collapsed];
    }

    toggleGroup(value: string): void {
        if (!this._collapsed.delete(value)) this._collapsed.add(value);
        this._afterViewChange();
    }

    private _afterViewChange(): void {
        this.render();
        if (!this._restoring && this.options.onStateChange) this.options.onStateChange(this.getState());
    }

    /** The arrangement, as a host would store it. */
    getState(): GridState {
        return {
            order: [...this._order],
            hidden: this._order.filter(key => this._hidden.has(key)),
            sort: this.sort.current(),
            filters: this.filters(),
            filtersVisible: this._filtersVisible,
            group: this._group,
            collapsed: this.collapsedGroups(),
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
            if (state.filtersVisible !== undefined) this._filtersVisible = state.filtersVisible;
            if (state.group !== undefined) {
                const col = state.group && this.options.columns.find(c => c.key === state.group);
                this._group = col && col.value ? state.group! : null;
                this._collapsed.clear();
            }
            if (state.collapsed) this._collapsed = new Set(state.collapsed);
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

    /**
     * Every row that is on screen, in the order it appears there -- filtered, sorted,
     * and gathered into groups when grouping is on. Collapsed groups are included:
     * they are hidden, not excluded, and an export of a collapsed table that silently
     * dropped rows would be worse than one that shows them.
     */
    displayRows(): TRow[] {
        const sorted = this.sortedRows();
        if (this._group === null) return sorted;
        return [...this._groups(sorted).values()].flatMap(group => group.rows);
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
        const limit = this.options.renderLimit != null ? this.options.renderLimit : Infinity;

        const children: Node[] = [];
        for (const row of pinned) {
            if (row.place === GridPinnedPlacements.Top) children.push(this._pinnedRow(row));
        }

        let painted = 0;
        if (this._group === null) {
            for (const row of sorted) {
                if (painted >= limit) break;
                children.push(this._bodyRow(row));
                painted++;
            }
        } else {
            // Groups run in value order while the rows inside each keep the sort the
            // user picked -- sorting by quantity inside "AAPL" should not shuffle
            // "AAPL" itself against "BTC".
            for (const [key, group] of this._groups(sorted)) {
                if (painted >= limit) break;
                children.push(this._groupRow(key, group.label, group.rows.length));
                if (this._collapsed.has(key)) continue;
                for (const row of group.rows) {
                    // The limit counts rows of data: a group header is a label for the
                    // rows under it, and capping on it would cut a group off at its own title.
                    if (painted >= limit) break;
                    children.push(this._bodyRow(row));
                    painted++;
                }
            }
        }

        // A pinned row is content, so a table showing only a balance summary is not
        // empty — the "nothing here" row would read as a contradiction next to it.
        if (painted === 0 && pinned.length === 0 && this._collapsed.size === 0) children.push(this._emptyRow());

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
            // Grouped, the sheet follows the order on screen but without the header
            // rows: a spreadsheet has its own grouping, and a label row in the middle
            // of the data would break every formula pointed at the range.
            rows: this.displayRows().map(row => columns.map(col => {
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
            // The same key the body cells carry. Without it a right-click on the header
            // resolves no column, so the menu loses everything about it -- and any host
            // stamping the keys itself loses them on the next repaint.
            th.dataset.col = col.key;
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
        if (!this._filtersVisible || !columns.some(col => col.filter)) return null;

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
        for (const { value, label } of this._distinctValues(col)) {
            const option = document.createElement('option') as HTMLOptionElement;
            option.value = value;
            option.textContent = label;
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
    private _syncOptions(select: HTMLSelectElement, values: GridValueOption[]): void {
        const current = Array.from(select.children).slice(1).map(el => (el as HTMLOptionElement).value);
        if (current.length === values.length && current.every((v, i) => v === values[i].value)) return;

        const blank = document.createElement('option') as HTMLOptionElement;
        blank.value = '';
        blank.textContent = '';
        const options: HTMLElement[] = [blank];
        for (const { value, label } of values) {
            const option = document.createElement('option') as HTMLOptionElement;
            option.value = value;
            option.textContent = label;
            options.push(option);
        }
        select.replaceChildren(...options);
    }

    /// The value as a person reads it. One place, because a group header, a filter's
    /// option list and the menu line that filters by a value all have to agree -- and
    /// all of them have to disagree with `value`, which stays what the grid compares.
    private _displayText(col: GridColumn<TRow>, row: TRow): string {
        if (col.text) return col.text(row);
        return DataGrid._text(col.value ? col.value(row) : null);
    }

    /// Every value the column holds, paired with the label it is picked by. Keyed by
    /// the raw value: two rows reading "Buy" are one option, and the option carries
    /// the 0 the filter will actually compare against.
    private _distinctValues(col: GridColumn<TRow>): GridValueOption[] {
        const seen = new Map<string, string>();
        for (const row of this._rows) {
            if (!col.value) continue;
            const value = DataGrid._text(col.value(row));
            if (!seen.has(value)) seen.set(value, this._displayText(col, row));
        }
        return [...seen.entries()]
            .map(([value, label]) => ({ value, label }))
            .sort((a, b) => this._collator.compare(a.label, b.label));
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

        if (this._selected.has(key)) {
            const selectedClass = this.options.selectedClass || 'is-selected';
            tr.className = tr.className ? `${tr.className} ${selectedClass}` : selectedClass;
        }
        const mode = this.options.selection || 'none';
        if (mode !== 'none') {
            // Selection happens on mousedown, not on click, for two reasons that are
            // the same reason: that is when a real table responds, and that is when the
            // browser would otherwise start dragging a text selection across the rows.
            // preventDefault claims the gesture for the table.
            tr.addEventListener('mousedown', (event: Event) => {
                const button = (event as unknown as { button?: number }).button;
                if (button !== undefined && button !== 0) return;   // right-click belongs to the menu
                event.preventDefault();
                DataGrid._active = this as DataGrid<unknown>;
                this._clickRow(key, event);

                const m = event as unknown as { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean };
                if (mode === 'multi' && !m.shiftKey && !m.ctrlKey && !m.metaKey) this._beginDragSelect();
            });

            // Dragging across rows extends the selection, which is what the pointer
            // was doing anyway -- it just used to paint text instead of rows.
            tr.addEventListener('mouseenter', (event: Event) => {
                if (!this._dragging) return;
                // A mouseup released outside the window never reaches us, and a grid
                // stuck in drag mode selects whatever the pointer wanders over next.
                // The event carries which buttons are actually down; trust that.
                const buttons = (event as unknown as { buttons?: number }).buttons;
                if (buttons !== undefined && (buttons & 1) === 0) { this._dragging = false; return; }
                this._extendTo(key);
            });
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

    /// Rows by their group value, in value order, each group keeping the row order
    /// it was handed.
    private _groups(rows: TRow[]): Map<string, GridGroup<TRow>> {
        const col = this.options.columns.find(c => c.key === this._group);
        const groups = new Map<string, GridGroup<TRow>>();
        for (const row of rows) {
            // Keyed by the raw value and labelled by the readable one: collapse state
            // and the stored view are written against the key, so a column that starts
            // spelling its values differently must not lose which groups were shut.
            const key = DataGrid._text(col && col.value ? col.value(row) : null);
            const group = groups.get(key);
            if (group) group.rows.push(row);
            else groups.set(key, { label: col ? this._displayText(col, row) : key, rows: [row] });
        }
        // Ordered by the label, so the groups read alphabetically in the language on
        // screen -- which does mean two languages show the same table in a different
        // group order, while the keys underneath, and any saved view, stay put.
        return new Map([...groups.entries()].sort((a, b) => this._collator.compare(a[1].label, b[1].label)));
    }

    private _groupRow(key: string, label: string, count: number): HTMLTableRowElement {
        const tr = document.createElement('tr') as HTMLTableRowElement;
        tr.className = this._collapsed.has(key) ? 'grid-group is-collapsed' : 'grid-group';
        tr.dataset.group = key;

        const collapsed = this._collapsed.has(key);
        const td = document.createElement('td') as HTMLTableCellElement;
        td.colSpan = this.visibleColumns().length;
        const content = this.options.groupHeader
            ? this.options.groupHeader(label, count, collapsed)
            : `${collapsed ? '▸' : '▾'} ${label} (${count})`;
        if (typeof content === 'string') td.textContent = content;
        else td.appendChild(content);
        tr.appendChild(td);

        tr.addEventListener('click', () => this.toggleGroup(key));
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
