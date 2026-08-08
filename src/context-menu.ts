/// A context menu the grid can offer out of the box, and a host can take over.
///
/// The package draws no chrome anywhere else -- ColumnSettings hands the picker's
/// markup to the host precisely so a page can use its own modal. A menu is the one
/// place where that rule costs more than it buys: every host would write the same
/// hundred lines to position a list at a pointer, close it on the next click and
/// on Escape, and keep it inside the window. So the menu is built here, and the
/// host decides its contents and its class names instead of its existence.

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

const DEFAULTS: Required<GridMenuClasses> = {
    menu: 'grid-menu',
    item: 'grid-menu-item',
    separator: 'grid-menu-separator',
    disabled: 'is-disabled',
    checked: 'is-checked',
};

/**
 * Shows one menu at a time for the whole page.
 *
 * One instance rather than one per grid: two menus open at once is never what a
 * user asked for, and a second grid opening its own would leave the first hanging
 * with no way back to it.
 */
export class GridContextMenu {
    private static _open: GridContextMenu | null = null;

    private readonly _classes: Required<GridMenuClasses>;
    private _el: HTMLElement | null = null;
    private _dismiss: (() => void) | null = null;

    constructor(classes?: GridMenuClasses) {
        this._classes = { ...DEFAULTS, ...(classes || {}) };
    }

    /** Whether this menu is the one currently on screen. */
    get isOpen(): boolean {
        return this._el !== null;
    }

    /**
     * Draw the items at (x, y) in viewport coordinates. Opening a menu closes
     * whichever one was open, including this one -- a right-click inside an open
     * menu means "somewhere else", not "two menus".
     */
    open(items: GridMenuItem[], x: number, y: number): void {
        GridContextMenu._open?.close();
        if (items.length === 0) return;

        const el = document.createElement('div');
        el.className = this._classes.menu;
        el.setAttribute('role', 'menu');
        el.style.position = 'fixed';
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;

        for (const item of items) el.appendChild(this._itemEl(item));

        document.body.appendChild(el);
        this._el = el;
        GridContextMenu._open = this;

        // Bound now rather than on a timer. The gesture that opens a menu is over by
        // this point -- a right-click fires mousedown before contextmenu, and a menu
        // opened from a button is opened on the click that ends one -- so there is no
        // opening event left to dismiss it, and a timer would only make when it starts
        // listening depend on the event loop.
        const dismiss = (event: Event) => {
            if (event.type === 'keydown' && (event as KeyboardEvent).key !== 'Escape') return;
            // A press INSIDE the menu is the user choosing something. This listener runs
            // in the capture phase, before the click reaches the item, so closing here
            // would tear the item out from under the gesture and the menu would look
            // dead: it vanishes and nothing happens.
            const target = (event as unknown as { target?: Node }).target;
            if (event.type === 'mousedown' && target && el.contains(target)) return;
            this.close();
        };
        document.addEventListener('mousedown', dismiss, true);
        document.addEventListener('keydown', dismiss, true);
        window.addEventListener('resize', dismiss);
        window.addEventListener('scroll', dismiss, true);
        this._dismiss = () => {
            document.removeEventListener('mousedown', dismiss, true);
            document.removeEventListener('keydown', dismiss, true);
            window.removeEventListener('resize', dismiss);
            window.removeEventListener('scroll', dismiss, true);
        };

        this._keepInside(el, x, y);
    }

    close(): void {
        if (!this._el) return;
        this._dismiss?.();
        this._dismiss = null;
        this._el.parentNode?.removeChild(this._el);
        this._el = null;
        if (GridContextMenu._open === this) GridContextMenu._open = null;
    }

    private _itemEl(item: GridMenuItem): HTMLElement {
        if (!item.label) {
            const sep = document.createElement('div');
            sep.className = this._classes.separator;
            sep.setAttribute('role', 'separator');
            return sep;
        }

        const el = document.createElement('div');
        el.className = this._classes.item;
        if (item.disabled) el.className += ` ${this._classes.disabled}`;
        if (item.checked) el.className += ` ${this._classes.checked}`;
        el.setAttribute('role', 'menuitem');
        el.textContent = item.label;

        if (!item.disabled && item.run) {
            el.addEventListener('click', () => {
                // Close first: an action that repaints the grid would otherwise run
                // with a menu still floating over rows that no longer exist.
                this.close();
                item.run!();
            });
        }
        return el;
    }

    /**
     * Nudge the menu back inside the window when it was opened near an edge.
     * Measured after it is in the document, because until then it has no size.
     */
    private _keepInside(el: HTMLElement, x: number, y: number): void {
        const rect = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null;
        if (!rect) return;

        const width = typeof window !== 'undefined' ? window.innerWidth : 0;
        const height = typeof window !== 'undefined' ? window.innerHeight : 0;
        if (width && x + rect.width > width) el.style.left = `${Math.max(0, width - rect.width)}px`;
        if (height && y + rect.height > height) el.style.top = `${Math.max(0, height - rect.height)}px`;
    }
}
