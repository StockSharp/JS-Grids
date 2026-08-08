// FILE: column-settings.d.ts
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
export declare class ColumnSettings {
    readonly table: HTMLTableElement;
    /**
     * Discovers the table's columns and immediately applies the stored layout,
     * so a page arrives already showing what the user last chose.
     */
    constructor(options: ColumnSettingsOptions);
    /**
     * The manageable columns in their original (server-rendered) order — the
     * layout "no choice has been made" means.
     */
    defaultKeys(): string[];
    /**
     * Reorder + show/hide. `visibleKeyed` is the manageable keys in the desired
     * display order; manageable keys absent from it are hidden. Fixed columns
     * stay at their original absolute slot.
     */
    apply(visibleKeyed: string[]): void;
    /** True when this layout is the table's own order with nothing hidden. */
    isDefault(visibleKeyed: string[]): boolean;
    /**
     * Show the picker over the layout currently on screen — read back off the
     * live header, so it reflects reality rather than a remembered intent.
     */
    openPicker(): void;
    /** Commit what the user picked, persist it and close. */
    applyPicked(): void;
    /** Drop back to the table's own order with every column shown, and close. */
    resetToDefault(): void;
}

// FILE: context-menu.d.ts
/** One line in the menu. A separator is an item with no label. */
export interface GridMenuItem {
    /** Shown to the user. Omit for a separator. */
    label?: string;
    /** What the line does. A separator and a disabled line have none. */
    run?(): void;
    /** Drawn, but inert and dimmed -- so an action stays where the user expects it. */
    disabled?: boolean;
    /** Marks the line as ticked, for the toggles (a hidden column, a set filter). */
    checked?: boolean;
}
/** Class names for the menu's parts. The grid names elements; a host styles them. */
export interface GridMenuClasses {
    menu?: string;
    item?: string;
    separator?: string;
    disabled?: string;
    checked?: string;
}
/**
 * Shows one menu at a time for the whole page.
 *
 * One instance rather than one per grid: two menus open at once is never what a
 * user asked for, and a second grid opening its own would leave the first hanging
 * with no way back to it.
 */
export declare class GridContextMenu {
    constructor(classes?: GridMenuClasses);
    /** Whether this menu is the one currently on screen. */
    get isOpen(): boolean;
    /**
     * Draw the items at (x, y) in viewport coordinates. Opening a menu closes
     * whichever one was open, including this one -- a right-click inside an open
     * menu means "somewhere else", not "two menus".
     */
    open(items: GridMenuItem[], x: number, y: number): void;
    close(): void;
    /**
     * Nudge the menu back inside the window when it was opened near an edge.
     * Measured after it is in the document, because until then it has no size.
     */
}

// FILE: data-grid.d.ts
import { TableSort, type SortSpec } from './table-sort.js';
import { type GridMenuClasses, type GridMenuItem } from './context-menu.js';
/** Where a pinned row sits relative to the sorted body rows. */
export declare const GridPinnedPlacements: {
    readonly Top: "top";
    readonly Bottom: "bottom";
};
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
/** Where a right-click landed, handed to whoever builds the menu for it. */
export interface GridMenuContext<TRow> {
    /** The column under the pointer, or null when the click missed the cells. */
    column: GridColumn<TRow> | null;
    /** The row under the pointer, or null on a header, a group row or empty space. */
    row: TRow | null;
    /** The value of that row in that column, already rendered as text. */
    text: string;
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
    filterByValue: string;
    clearFilters: string;
    copyCell: string;
    copyRow: string;
    exportXlsx: string;
}
/** How many rows a user may have selected at once. */
export type GridSelectionMode = 'none' | 'single' | 'multi';
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
export declare class DataGrid<TRow> {
    readonly options: GridOptions<TRow>;
    readonly sort: TableSort<TRow>;
    constructor(options: GridOptions<TRow>);
    /** Every declared column in display order, hidden ones included. */
    columnKeys(): string[];
    /** The columns actually rendered, in the order they are rendered. */
    visibleColumns(): GridColumn<TRow>[];
    isColumnHidden(key: string): boolean;
    /**
     * Put the columns in this order. Keys the caller leaves out keep their relative
     * order behind the ones named -- a layout stored before a column existed must
     * not make that column disappear.
     */
    setColumnOrder(keys: string[]): void;
    hideColumn(key: string): void;
    showColumn(key: string): void;
    /** The filters in effect, by column key. Columns with none are absent. */
    filters(): Record<string, GridFilter>;
    /**
     * Filter a column, or pass null to stop filtering it. A filter with nothing set
     * -- a text box the user emptied -- is the same as null, so clearing an input
     * brings the rows back instead of matching nothing.
     */
    setFilter(key: string, filter: GridFilter | null): void;
    clearFilters(): void;
    /** The held rows that pass every filter, in the order they were handed over. */
    filteredRows(): TRow[];
    /**
     * The items the grid offers for a right-click. Public so a host that replaces
     * the menu can still reach for the parts of it that it wants to keep.
     */
    menuItems(context: GridMenuContext<TRow>): GridMenuItem[];
    /** Selected row keys, in the order they appear on screen. */
    selectedKeys(): string[];
    /** The selected rows that are actually on screen. */
    selectedRows(): TRow[];
    setSelection(keys: string[]): void;
    clearSelection(): void;
    /** The column the rows are grouped under, or null. */
    groupedBy(): string | null;
    /** Group by a column, or pass null to go flat. */
    groupBy(key: string | null): void;
    collapsedGroups(): string[];
    toggleGroup(value: string): void;
    /** The arrangement, as a host would store it. */
    getState(): GridState;
    /**
     * Restore an arrangement. Unknown column keys are dropped rather than rejected:
     * a view stored before a deploy has to survive one.
     */
    setState(state: GridState): void;
    /**
     * The rows the grid holds, in the order they were handed over. The grid keeps
     * the caller's array by reference: a caller that merges a live delta into it
     * and calls `render()` repaints from the current contents.
     */
    get rows(): TRow[];
    /**
     * Rows in the order currently in effect (the picked column, else the table
     * default). A sorted copy — the held array is never reordered.
     */
    sortedRows(): TRow[];
    /**
     * Every row that is on screen, in the order it appears there -- filtered, sorted,
     * and gathered into groups when grouping is on. Collapsed groups are included:
     * they are hidden, not excluded, and an export of a collapsed table that silently
     * dropped rows would be worse than one that shows them.
     */
    displayRows(): TRow[];
    setRows(rows: TRow[]): void;
    render(): void;
    /**
     * The rendered row with this key, or null when it is not on screen (filtered
     * out, or past `renderLimit`).
     */
    rowElement(rowKey: string): HTMLTableRowElement | null;
    /**
     * The rendered cell at (row, column) — how a caller patches one cell in place
     * instead of repainting the table, and how it finds the cell to edit.
     */
    cellElement(rowKey: string, columnKey: string): HTMLTableCellElement | null;
    /**
     * Header captions and cell values of the exportable columns, over every held
     * row in the order in effect. Pure — separate from `download` so the sheet
     * content can be asserted without a browser.
     */
    exportData(): GridExportData;
    /** Export to `<baseName>-<timestamp>.xlsx` in the order on screen. */
    download(baseName: string, sheetName: string): void;
    /**
     * The row of filter controls, or null when no visible column declares one.
     *
     * Every visible column gets a cell even when it has no filter, or the row would
     * shear away from the captions above it. The cells carry no `data-sort`, so a
     * click inside one does not reach the sort handler bound on the `<thead>`.
     */
    /**
     * Put the stored filters back into the controls without rebuilding the row.
     * Rebuilding it would take the focus and the caret out of the box the user is
     * still typing in.
     */
    /**
     * Drag a header to move its column in front of the one it is dropped on.
     *
     * The dragged key lives on the instance rather than in dataTransfer: the payload
     * is this grid's, and reading it back out of the event would mean a header
     * dragged from anywhere -- another grid, another window -- could reorder this one.
     */
}

// FILE: index.d.ts
export { DataGrid, GridPinnedPlacements } from './data-grid.js';
export type { GridColumn, GridExportData, GridOptions, GridPinnedCell, GridPinnedPlacement, GridPinnedRow, } from './data-grid.js';
export { SortDirections, TableSort } from './table-sort.js';
export type { SortDir, SortSpec } from './table-sort.js';
export { ColumnSettings } from './column-settings.js';
export type { ColumnLayoutStore, ColumnPickerClasses, ColumnSettingsDialog, ColumnSettingsOptions, } from './column-settings.js';
export { TableExport } from './table-export.js';
export { GridContextMenu, type GridMenuClasses, type GridMenuItem } from './context-menu.js';

// FILE: table-export.d.ts
export declare const TableExport: {
    /**
     * Build the workbook and trigger a browser download as
     * `<baseName>-YYYYMMDD-HHMMSS.xlsx`. Rows are exported exactly as the
     * caller passes them (i.e. in the currently rendered/sorted order).
     */
    download(baseName: string, sheetName: string, headers: string[], rows: unknown[][]): void;
};

// FILE: table-sort.d.ts
/**
 * The two directions a column can be sorted in. Spelled as a const object so the
 * values have names at the call site and the union stays derived from one place.
 */
export declare const SortDirections: {
    readonly Asc: "asc";
    readonly Desc: "desc";
};
export type SortDir = typeof SortDirections[keyof typeof SortDirections];
export interface SortSpec {
    col: string;
    dir: SortDir;
}
export declare class TableSort<TRow = unknown> {
    col: string | null;
    dir: SortDir;
    constructor(headerEl: HTMLElement | null, accessors: Record<string, (row: TRow) => unknown>, onChange: () => void, defaultSort: SortSpec | null);
    /**
     * Sorted copy of rows by the effective sort (explicit column or table default). Rows with no
     * value for the sort column group at the end. Always a copy: a caller told its array is never
     * reordered must be able to rely on that for one row and no sort as much as for a sorted many.
     */
    apply(rows: TRow[]): TRow[];
    /**
     * The column the user picked, or null while the table's own default is in effect.
     *
     * Deliberately not the effective sort: this is what gets stored and handed back
     * to `set`, and storing the default as though it were a choice would pin it --
     * a later change to the table's default would then never reach anyone who had
     * ever looked at the table.
     */
    current(): SortSpec | null;
    /** Pick a column, or pass null to fall back to the table's default. */
    set(col: string | null, dir: SortDir | null): void;
    /**
     * Re-mark the header cells. A grid that rebuilds its `<thead>` -- moving a column,
     * hiding one -- throws away the marks with the old cells, and the rows would then
     * sit sorted under a header that says nothing about why.
     */
    refreshHeader(): void;
}
