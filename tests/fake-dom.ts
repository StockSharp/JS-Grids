// The DOM the tests run against.
//
// The package has no DOM library and no browser in its test process, so the
// slice of DOM the grid touches is implemented here. Keeping the fake small is
// deliberate: it is also the statement of how narrow that surface is — create an
// element, set a class, set text, append, replace the children, read a data-*
// key, move a cell, listen for an event.
//
// Two properties of the real DOM are load-bearing and therefore modelled rather
// than approximated:
//
//   * appendChild MOVES a node that already has a parent. That is the whole of
//     how ColumnSettings reorders a row without rebuilding it, so a fake that
//     copied instead would pass a test the browser would fail.
//   * `dataset` and `data-*` attributes are two views of one thing. DataGrid
//     writes through `dataset`, ColumnSettings reads through `getAttribute`, and
//     a fake that kept them apart would let a real mismatch go unnoticed.

export interface FakeEvent {
    type: string;
    target?: FakeElement;
    /// Drag handling calls it to accept a drop; a test that wants to assert the
    /// call passes its own spy, and one that does not can leave it out.
    preventDefault?(): void;
    /// Selection reads these to tell a plain click from an add or a range.
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
}

type FakeListener = (event: FakeEvent) => void;

export class FakeText {
    readonly nodeType = 3;
    data: string;
    parentNode: FakeElement | null = null;

    constructor(text: string) {
        this.data = String(text);
    }

    get textContent(): string { return this.data; }
}

export class FakeFragment {
    readonly nodeType = 11;
    childNodes: FakeNode[] = [];

    appendChild<T extends FakeNode>(node: T): T {
        this.childNodes.push(node);
        return node;
    }
}

export type FakeNode = FakeElement | FakeText;

/// camelCase dataset key -> data-* attribute name (`rowKey` -> `data-row-key`).
function dataAttribute(key: string): string {
    return 'data-' + key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}

/// data-* attribute name -> camelCase dataset key (`data-row-key` -> `rowKey`).
function datasetKey(attribute: string): string {
    return attribute.slice(5).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/// Matches the two selector forms the library uses: an attribute presence test
/// (`[data-sort]`) and a bare tag name. Anything else throws rather than quietly
/// matching nothing.
function matches(el: FakeElement, selector: string): boolean {
    if (selector.startsWith('[') && selector.endsWith(']')) {
        const attr = selector.slice(1, -1);
        if (!attr.startsWith('data-')) throw new Error(`fake DOM: unsupported selector ${selector}`);
        return attr in el.attributes;
    }
    if (/^[a-z]+$/i.test(selector)) return el.tagName === selector.toUpperCase();
    throw new Error(`fake DOM: unsupported selector ${selector}`);
}

function classSet(el: FakeElement): Set<string> {
    return new Set(el.className.split(' ').filter(Boolean));
}

export class FakeElement {
    readonly nodeType = 1;
    readonly tagName: string;
    readonly attributes: Record<string, string> = {};
    readonly style: { display: string } = { display: '' };
    childNodes: FakeNode[] = [];
    parentNode: FakeElement | null = null;
    className = '';
    title = '';
    type = '';
    href = '';
    download = '';
    checked = false;
    /// Inputs and selects the grid renders for its filter row read and write this.
    value = '';
    disabled = false;
    colSpan = 1;
    readonly _listeners = new Map<string, FakeListener[]>();

    constructor(tagName: string) {
        this.tagName = tagName.toUpperCase();
    }

    /// Element children only, the way the real `children` differs from
    /// `childNodes` — the tests index into a cell to reach the control in it.
    get children(): FakeElement[] {
        return this.childNodes.filter((n): n is FakeElement => n.nodeType === 1);
    }

    /// A row's cells and a section's rows are its element children; one class
    /// serves every tag rather than a hierarchy that adds nothing.
    get cells(): FakeElement[] { return this.children; }

    get rows(): FakeElement[] { return this.children; }

    get dataset(): Record<string, string | undefined> {
        const attributes = this.attributes;
        return new Proxy({} as Record<string, string | undefined>, {
            get: (_target, key) => (typeof key === 'string' ? attributes[dataAttribute(key)] : undefined),
            set: (_target, key, value) => {
                if (typeof key === 'string') attributes[dataAttribute(key)] = String(value);
                return true;
            },
            has: (_target, key) => typeof key === 'string' && dataAttribute(key) in attributes,
            deleteProperty: (_target, key) => {
                if (typeof key === 'string') delete attributes[dataAttribute(key)];
                return true;
            },
            ownKeys: () => Object.keys(attributes).filter(a => a.startsWith('data-')).map(datasetKey),
            getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
        });
    }

    get classList() {
        const el = this;
        return {
            add(...names: string[]): void {
                const set = classSet(el);
                for (const name of names) set.add(name);
                el.className = [...set].join(' ');
            },
            remove(...names: string[]): void {
                const set = classSet(el);
                for (const name of names) set.delete(name);
                el.className = [...set].join(' ');
            },
            contains: (name: string): boolean => classSet(el).has(name),
            toggle(name: string, force?: boolean): boolean {
                const set = classSet(el);
                const on = force === undefined ? !set.has(name) : force;
                if (on) set.add(name); else set.delete(name);
                el.className = [...set].join(' ');
                return on;
            },
        };
    }

    get textContent(): string {
        return this.childNodes.map(n => n.textContent).join('');
    }

    set textContent(value: string) {
        this.childNodes = [];
        if (value !== '') this.appendChild(new FakeText(value));
    }

    appendChild<T extends FakeNode | FakeFragment>(node: T): T {
        if (node instanceof FakeFragment) {
            const moved = node.childNodes;
            node.childNodes = [];
            for (const child of moved) this.appendChild(child);
            return node;
        }
        // Detaching first is what makes this a move: re-appending a node the row
        // already holds is how a column changes position.
        node.parentNode?._remove(node);
        node.parentNode = this;
        this.childNodes.push(node);
        return node;
    }

    /// The menu asks whether a press landed inside itself, to tell a choice from a
    /// dismissal.
    contains(node: FakeNode | null): boolean {
        for (let n: FakeNode | null = node; n; n = (n as FakeElement).parentNode) {
            if ((n as unknown) === (this as unknown)) return true;
        }
        return false;
    }

    /// The context menu takes itself back out of the body when it closes.
    removeChild<T extends FakeNode>(node: T): T {
        const at = this.childNodes.indexOf(node);
        if (at >= 0) {
            this.childNodes.splice(at, 1);
            (node as { parentNode: FakeElement | null }).parentNode = null;
        }
        return node;
    }

    replaceChildren(...nodes: FakeNode[]): void {
        this.childNodes = [];
        for (const node of nodes) this.appendChild(node);
    }

    setAttribute(name: string, value: string): void { this.attributes[name] = String(value); }

    getAttribute(name: string): string | null { return this.attributes[name] ?? null; }

    querySelectorAll(selector: string): FakeElement[] {
        const found: FakeElement[] = [];
        const walk = (el: FakeElement): void => {
            for (const child of el.children) {
                if (matches(child, selector)) found.push(child);
                walk(child);
            }
        };
        walk(this);
        return found;
    }

    querySelector(selector: string): FakeElement | null { return this.querySelectorAll(selector)[0] || null; }

    closest(selector: string): FakeElement | null {
        let el: FakeElement | null = this;
        while (el) {
            if (matches(el, selector)) return el;
            el = el.parentNode;
        }
        return null;
    }

    addEventListener(type: string, handler: FakeListener): void {
        const handlers = this._listeners.get(type);
        if (handlers) handlers.push(handler);
        else this._listeners.set(type, [handler]);
    }

    dispatchEvent(event: FakeEvent): void {
        for (const handler of this._listeners.get(event.type) || []) handler(event);
    }

    /// A download is a click on an anchor the user never sees, so the element the
    /// export builds has to be clickable and then removable.
    click(): void { this.dispatchEvent({ type: 'click', target: this }); }

    remove(): void {
        this.parentNode?._remove(this);
        this.parentNode = null;
    }

    _remove(node: FakeNode): void {
        const at = this.childNodes.indexOf(node);
        if (at >= 0) this.childNodes.splice(at, 1);
    }
}

/// The two members ColumnSettings reads off a table. A `<table>` is not an
/// element with children here because the adapter never treats it as one.
/// `tHead` is nullable the way the real one is: a parser inserts a missing
/// `<tbody>` but never a `<thead>`, so a table can genuinely arrive without one.
export class FakeTable {
    readonly tHead: FakeElement | null;
    readonly tBodies: FakeElement[];

    constructor(head: FakeElement | null, bodies: FakeElement[]) {
        this.tHead = head;
        this.tBodies = bodies;
    }
}

/// Listeners the context menu binds on the document and the window to dismiss
/// itself. Kept addressable so a test can fire one instead of waiting for a user.
const documentListeners = new Map<string, FakeListener[]>();
const windowListeners = new Map<string, FakeListener[]>();

function bind(store: Map<string, FakeListener[]>, type: string, handler: FakeListener): void {
    const list = store.get(type);
    if (list) list.push(handler);
    else store.set(type, [handler]);
}

function unbind(store: Map<string, FakeListener[]>, type: string, handler: FakeListener): void {
    const list = store.get(type);
    if (!list) return;
    const at = list.indexOf(handler);
    if (at >= 0) list.splice(at, 1);
}

export const fakeDocument = {
    createElement: (tag: string): FakeElement => new FakeElement(tag),
    createTextNode: (text: string): FakeText => new FakeText(text),
    createDocumentFragment: (): FakeFragment => new FakeFragment(),
    /// The export parks its anchor here for the click, and an open menu lives here.
    body: new FakeElement('body'),
    addEventListener: (type: string, handler: FakeListener): void => bind(documentListeners, type, handler),
    removeEventListener: (type: string, handler: FakeListener): void => unbind(documentListeners, type, handler),
};

export const fakeWindow = {
    innerWidth: 1024,
    innerHeight: 768,
    addEventListener: (type: string, handler: FakeListener): void => bind(windowListeners, type, handler),
    removeEventListener: (type: string, handler: FakeListener): void => unbind(windowListeners, type, handler),
};

/// Fire what the page would fire: a click somewhere else, an Escape, a scroll.
export function fireOnDocument(event: FakeEvent): void {
    for (const handler of [...(documentListeners.get(event.type) || [])]) handler(event);
}

/// Publish the fake as the global `document`. The library reaches for the global
/// exactly as it does in a browser; nothing is injected for the sake of testing.
export function installFakeDocument(): void {
    (globalThis as unknown as { document: unknown }).document = fakeDocument;
    (globalThis as unknown as { window: unknown }).window = fakeWindow;
}

/// The fakes are structural stand-ins carrying the members the library touches,
/// not implementations of the DOM interfaces. The cast into those interfaces
/// lives here once instead of at every construction site.
export function asDom<T>(node: FakeElement | FakeTable): T {
    return node as unknown as T;
}

/// The way back: the library hands back DOM types, and in this process every one
/// of them is a fake. A lookup that found nothing fails here with the reason
/// rather than as a null dereference three assertions later.
export function asFake(node: unknown): FakeElement {
    if (node instanceof FakeElement) return node;
    throw new Error(`fake DOM: expected an element, got ${node === null ? 'null' : typeof node}`);
}
