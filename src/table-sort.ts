// Column-sort controller — the sort state behind DataGrid.
//
// Attach to the table's <thead>: clicking a <th data-sort="key"> cycles
// asc -> desc -> default. There is no "unsorted" state: a table always has a
// deterministic order. Each table declares its default (e.g. orders newest-
// first, trades most-recent-first) so the resting view is meaningful instead of
// exposing the raw cache/insertion order (storage hydration + snapshot + live
// updates land in an order that means nothing to the user). Clicking a header
// overrides the default; cycling past desc returns to it. The owner re-renders
// through onChange and passes its row array through apply(), which returns a
// sorted copy, so live inserts land in the active order on the next render.
//
// DataGrid builds the accessors from its column declarations and owns the
// instance; it is separate from the grid because sort state is a self-contained
// concern with its own semantics worth pinning down on its own.

/**
 * The two directions a column can be sorted in. Spelled as a const object so the
 * values have names at the call site and the union stays derived from one place.
 */
export const SortDirections = {
    Asc: 'asc',
    Desc: 'desc',
} as const;

export type SortDir = typeof SortDirections[keyof typeof SortDirections];

export interface SortSpec { col: string; dir: SortDir; }

// A column with no declared accessor is read off the row by its own key, which
// needs a shape TRow never promised — so the widening happens here, once, instead
// of loosening the row type of the whole controller.
function readByKey(row: unknown, key: string): unknown {
    return row === null || row === undefined ? undefined : (row as Record<string, unknown>)[key];
}

export class TableSort<TRow = unknown> {
    col: string | null;
    dir: SortDir;
    private _headerEl: HTMLElement | null;
    private _accessors: Record<string, (row: TRow) => unknown>;
    private _onChange: () => void;
    private _default: SortSpec | null;

    // `defaultSort` is the order applied when no header is explicitly selected — the table's
    // resting sort. Pass null only for a table that genuinely has no meaningful default (raw row
    // order); every real blotter should name one so its first paint is deterministic.
    constructor(headerEl: HTMLElement | null, accessors: Record<string, (row: TRow) => unknown>, onChange: () => void, defaultSort: SortSpec | null) {
        this.col = null;
        this.dir = SortDirections.Asc;
        this._headerEl = headerEl;
        this._accessors = accessors || {};
        this._onChange = onChange;
        this._default = defaultSort;
        this._updateHeader();

        headerEl?.addEventListener('click', (e) => {
            const tgt = e.target as Element | null;
            const th = tgt?.closest('[data-sort]') as HTMLElement | null;
            if (!th) return;
            const col = th.dataset.sort!;
            if (this.col !== col) { this.col = col; this.dir = SortDirections.Asc; }
            else if (this.dir === SortDirections.Asc) this.dir = SortDirections.Desc;
            else { this.col = null; this.dir = SortDirections.Asc; }   // back to the table default
            this._updateHeader();
            this._onChange();
        });
    }

    // The order actually in effect: the explicitly-picked column, else the table's default.
    private _effective(): SortSpec | null {
        return this.col ? { col: this.col, dir: this.dir } : this._default;
    }

    /**
     * Sorted copy of rows by the effective sort (explicit column or table default). Rows with no
     * value for the sort column group at the end. Always a copy: a caller told its array is never
     * reordered must be able to rely on that for one row and no sort as much as for a sorted many.
     */
    apply(rows: TRow[]): TRow[] {
        if (!Array.isArray(rows)) return rows;
        const eff = this._effective();
        if (!eff || rows.length < 2) return [...rows];
        const col = eff.col;
        const acc = this._accessors[col] || ((r: TRow) => readByKey(r, col));
        const factor = eff.dir === SortDirections.Asc ? 1 : -1;
        return [...rows].sort((a, b) => {
            const av = acc(a);
            const bv = acc(b);
            const aEmpty = av === null || av === undefined || av === '';
            const bEmpty = bv === null || bv === undefined || bv === '';
            if (aEmpty && bEmpty) return 0;
            if (aEmpty) return 1;      // empties sink regardless of direction
            if (bEmpty) return -1;
            return TableSort._compare(av, bv) * factor;
        });
    }

    private static _compare(a: unknown, b: unknown): number {
        const an = typeof a === 'number' ? a : Number(a);
        const bn = typeof b === 'number' ? b : Number(b);
        if (isFinite(an) && isFinite(bn)) return an - bn;
        return String(a).localeCompare(String(b));
    }

    private _updateHeader() {
        if (!this._headerEl) return;
        // Reflect the effective sort — including the table default — so the resting view shows why
        // the rows are ordered the way they are, not a blank header over a sorted table.
        const eff = this._effective();
        this._headerEl.querySelectorAll('[data-sort]').forEach((el: Element) => {
            const th = el as HTMLElement;
            const active = !!eff && eff.col === th.dataset.sort;
            th.classList.toggle('sort-asc', active && eff!.dir === SortDirections.Asc);
            th.classList.toggle('sort-desc', active && eff!.dir === SortDirections.Desc);
        });
    }
}
