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

// FILE: data-grid.d.ts
import { TableSort, type SortSpec } from './table-sort.js';
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
export declare class DataGrid<TRow> {
    readonly options: GridOptions<TRow>;
    readonly sort: TableSort<TRow>;
    constructor(options: GridOptions<TRow>);
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
}

// FILE: index.d.ts
export { DataGrid, GridPinnedPlacements } from './data-grid.js';
export type { GridColumn, GridExportData, GridOptions, GridPinnedCell, GridPinnedPlacement, GridPinnedRow, } from './data-grid.js';
export { SortDirections, TableSort } from './table-sort.js';
export type { SortDir, SortSpec } from './table-sort.js';
export { ColumnSettings } from './column-settings.js';
export type { ColumnLayoutStore, ColumnPickerClasses, ColumnSettingsDialog, ColumnSettingsOptions, } from './column-settings.js';
export { TableExport } from './table-export.js';

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
}
