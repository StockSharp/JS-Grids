// Demo host for @stocksharp/grids. Every feature on the page is driven through the
// published bundle (window.SSGrid); nothing here re-implements a grid behaviour.
(function () {
    'use strict';

    var SS = window.SSGrid;
    var DataGrid = SS.DataGrid;
    var TableExport = SS.TableExport;
    var SortDirections = SS.SortDirections;
    var GridPinnedPlacements = SS.GridPinnedPlacements;

    // ---------------------------------------------------------------- sample data
    // [id, time, symbol, board, side (0 = buy), type, qty, price, filled, last, state, decimals, multiplier]
    var RAW = [
        [3187, '09:31:04', 'ESZ5', 'CME', 0, 'Limit', 12, 5842.25, 12, 5846.75, 'Done', 2, 50],
        [3186, '09:30:58', 'NQZ5', 'CME', 1, 'Limit', 5, 20418.50, 5, 20443.25, 'Done', 2, 20],
        [3185, '09:30:41', 'AAPL', 'NASDAQ', 0, 'Market', 400, 241.83, 400, 240.11, 'Done', 2, 1],
        [3184, '09:29:52', 'BTCUSDT', 'BINANCE', 0, 'Limit', 0.75, 93250, 0.75, 94180.50, 'Done', 2, 1],
        [3183, '09:28:37', 'EURUSD', 'FX', 1, 'Limit', 2, 1.08432, 2, 1.08215, 'Done', 5, 100000],
        [3182, '09:27:15', 'GCG6', 'COMEX', 0, 'Stop', 3, 2648.4, 3, 2641.9, 'Done', 1, 100],
        [3181, '09:26:44', 'MSFT', 'NASDAQ', 1, 'Limit', 250, 436.20, 250, 433.05, 'Done', 2, 1],
        [3180, '09:25:03', 'CLF6', 'NYMEX', 0, 'Limit', 4, 78.42, 2, 79.06, 'Partial', 2, 1000],
        [3179, '09:24:37', 'NVDA', 'NASDAQ', 0, 'Limit', 600, 141.55, 0, 140.28, 'Active', 2, 1],
        [3178, '09:23:58', 'ETHUSDT', 'BINANCE', 1, 'Limit', 12, 3284.50, 12, 3251.75, 'Done', 2, 1],
        [3177, '09:22:41', 'ZBH6', 'CBOT', 0, 'Limit', 8, 117.44, 8, 116.97, 'Done', 2, 1000],
        [3176, '09:21:19', 'TSLA', 'NASDAQ', 1, 'Market', 150, 352.90, 150, 357.40, 'Done', 2, 1],
        [3175, '09:20:52', 'GBPUSD', 'FX', 0, 'Limit', 1, 1.26140, 1, 1.26385, 'Done', 5, 100000],
        [3174, '09:19:33', 'SOLUSDT', 'BINANCE', 0, 'Limit', 80, 214.30, 80, 209.55, 'Done', 2, 1],
        [3173, '09:18:47', 'ESZ5', 'CME', 1, 'Limit', 6, 5851, 0, 5846.75, 'Cancelled', 2, 50],
        [3172, '09:17:26', 'JPM', 'NYSE', 0, 'Limit', 300, 242.55, 300, 244.18, 'Done', 2, 1],
        [3171, '09:16:08', 'USDJPY', 'FX', 1, 'Limit', 1, 157.220, 1, 156.845, 'Done', 3, 1000],
        [3170, '09:15:44', 'NQZ5', 'CME', 0, 'Stop', 3, 20470, 3, 20443.25, 'Done', 2, 20],
        [3169, '09:14:12', 'AAPL', 'NASDAQ', 1, 'Limit', 200, 243.10, 200, 240.11, 'Done', 2, 1],
        [3168, '09:13:37', '6BZ5', 'CME', 0, 'Limit', 2, 1.26050, 2, 1.26385, 'Done', 5, 62500],
        [3167, '09:12:50', 'BTCUSDT', 'BINANCE', 1, 'Limit', 0.4, 94600, 0.4, 94180.50, 'Done', 2, 1],
        [3166, '09:11:29', 'MSFT', 'NASDAQ', 0, 'Limit', 180, 438.75, 0, 433.05, 'Active', 2, 1],
        [3165, '09:10:16', 'CLF6', 'NYMEX', 1, 'Limit', 5, 78.90, 5, 79.06, 'Done', 2, 1000],
        [3164, '09:09:03', 'GCG6', 'COMEX', 1, 'Limit', 2, 2645, 2, 2641.9, 'Done', 1, 100],
        [3163, '09:07:41', 'SBER', 'MOEX', 0, 'Limit', 5000, 271.44, 5000, 269.90, 'Done', 2, 1]
    ];

    var orders = RAW.map(function (r) {
        return {
            id: r[0], time: r[1], symbol: r[2], board: r[3], side: r[4], type: r[5],
            qty: r[6], price: r[7], filled: r[8], last: r[9], state: r[10], dec: r[11], mult: r[12]
        };
    });
    orders.forEach(reprice);

    function reprice(o) {
        var dir = o.side === 0 ? 1 : -1;
        o.pnl = round(dir * (o.last - o.price) * o.filled * o.mult, 2);
    }

    function round(v, dec) {
        var f = Math.pow(10, dec);
        return Math.round(v * f) / f;
    }

    function fixed(v, dec) {
        return Number(v).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    }

    function qtyText(v) {
        return Number(v).toLocaleString('en-US', { maximumFractionDigits: 4 });
    }

    function signed(v) {
        return (v > 0 ? '+' : v < 0 ? '−' : '') + fixed(Math.abs(v), 2);
    }

    function pnlClass(v) {
        return v > 0 ? 'pnl-pos' : v < 0 ? 'pnl-neg' : 'dim';
    }

    function isWorking(o) {
        return o.state === 'Active' || o.state === 'Partial';
    }

    // ---------------------------------------------------------------- language
    // One dictionary at a time. Everything the page says -- and everything the grid
    // would otherwise say in English -- is read from it.
    var T = SSDemoText.en;

    // ------------------------------------------------------------------- columns
    // Built from the dictionary rather than declared once, because a header is text
    // and text has a language. The keys never move: the saved view is written in
    // them, so it survives a switch.
    function buildColumns() { return [
        { key: 'id', header: T.columns.id, headerClass: 'num', exportable: true, filter: 'number', value: function (o) { return o.id; }, cellClass: function () { return 'num dim'; } },
        { key: 'time', header: T.columns.time, exportable: true, filter: 'text', value: function (o) { return o.time; }, cellClass: function () { return 'num dim'; } },
        { key: 'symbol', header: T.columns.symbol, exportable: true, filter: 'text', value: function (o) { return o.symbol; }, cellClass: function () { return 'sym'; } },
        { key: 'board', header: T.columns.board, exportable: true, filter: 'set', value: function (o) { return o.board; }, cellClass: function () { return 'dim'; } },
        {
            key: 'side', header: T.columns.side, exportable: true, filter: 'set',
            // Held as 0/1 and read as Buy/Sell: `value` sorts and filters, `text` is
            // what a group header and the filter's value list say.
            value: function (o) { return o.side; },
            text: function (o) { return T.values.side[o.side]; },
            render: function (o) { return T.values.side[o.side]; },
            cellClass: function (o) { return o.side === 0 ? 'side-buy' : 'side-sell'; },
            exportValue: function (o) { return T.values.side[o.side]; }
        },
        {
            key: 'type', header: T.columns.type, exportable: true, filter: 'set',
            value: function (o) { return o.type; },
            text: function (o) { return T.values.type[o.type]; },
            render: function (o) { return T.values.type[o.type]; },
            exportValue: function (o) { return T.values.type[o.type]; },
            cellClass: function () { return 'dim'; }
        },
        {
            key: 'qty', header: T.columns.qty, headerClass: 'num', exportable: true, filter: 'number',
            value: function (o) { return o.qty; },
            render: function (o) { return qtyText(o.qty); },
            cellClass: function () { return 'num'; }
        },
        {
            key: 'price', header: T.columns.price, headerClass: 'num', exportable: true, filter: 'number',
            value: function (o) { return o.price; },
            render: function (o) { return fixed(o.price, o.dec); },
            cellClass: function () { return 'num'; }
        },
        {
            key: 'filled', header: T.columns.filled, headerClass: 'num', exportable: true,
            value: function (o) { return o.filled; },
            render: function (o) { return qtyText(o.filled) + ' / ' + qtyText(o.qty); },
            cellClass: function (o) { return o.filled === 0 ? 'num dim' : o.filled < o.qty ? 'num part' : 'num'; }
        },
        {
            key: 'last', header: T.columns.last, headerClass: 'num', exportable: true,
            value: function (o) { return o.last; },
            render: function (o) { return fixed(o.last, o.dec); },
            cellClass: function () { return 'num'; }
        },
        {
            key: 'pnl', header: T.columns.pnl, headerClass: 'num', exportable: true, filter: 'number',
            value: function (o) { return o.pnl; },
            render: function (o) { return signed(o.pnl); },
            cellClass: function (o) { return 'num ' + pnlClass(o.pnl); }
        },
        {
            key: 'state', header: T.columns.state, exportable: true, filter: 'set',
            value: function (o) { return o.state; },
            text: function (o) { return T.values.state[o.state]; },
            // A Node, not a string: the cell holds a real element the host styles.
            render: function (o) {
                var badge = document.createElement('span');
                badge.className = 'badge badge-' + o.state.toLowerCase();
                badge.textContent = T.values.state[o.state];
                return badge;
            },
            exportValue: function (o) { return T.values.state[o.state]; }
        },
        {
            // No value(): nothing to sort by, so the grid leaves this header inert.
            key: 'actions', header: T.columns.actions, headerHidden: true, headerClass: 'act', exportable: false,
            cellClass: function () { return 'act'; },
            render: function (o) {
                if (!isWorking(o)) return '';
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'rowbtn';
                btn.textContent = T.page.cancelButton;
                btn.addEventListener('click', function (e) {
                    e.stopPropagation();          // the row below has its own click
                    cancel(o.id);
                });
                return btn;
            }
        }
    ]; }

    var COLUMNS = buildColumns();

    function cancel(id) {
        var order = held.find(function (o) { return o.id === id; });
        if (!order) return;
        order.state = 'Cancelled';
        reprice(order);
        grid.render();
    }

    // --------------------------------------------------------------- pinned rows
    // Re-read on every render, so the totals track the rows currently held.
    function pinnedCells(byKey) {
        return COLUMNS.map(function (col) {
            return byKey[col.key] || { content: '', className: '' };
        });
    }

    function sum(rows, field) {
        return rows.reduce(function (acc, o) { return acc + o[field]; }, 0);
    }

    function totalsRow(key, label, rows, place) {
        var pnl = round(sum(rows, 'pnl'), 2);
        return {
            key: key,
            className: 'pinned ' + key,
            place: place,
            cells: pinnedCells({
                id: { content: 'Σ', className: 'num dim' },
                symbol: { content: label, className: 'pin-label' },
                board: { content: rows.length + T.page.orders, className: 'dim' },
                qty: { content: qtyText(round(sum(rows, 'qty'), 4)), className: 'num' },
                filled: { content: qtyText(round(sum(rows, 'filled'), 4)), className: 'num' },
                pnl: { content: signed(pnl), className: 'num ' + pnlClass(pnl) }
            })
        };
    }

    function pinnedRows() {
        if (!held.length) return [];      // let the grid show its emptyText instead
        return [
            totalsRow('pinned-working', T.page.working, held.filter(isWorking), GridPinnedPlacements.Top),
            totalsRow('pinned-all', T.page.allOrders, held, GridPinnedPlacements.Bottom)
        ];
    }

    // ---------------------------------------------------------------------- grid
    var held = [];                        // the array handed to the grid
    var saved = null;                     // the last state the grid reported
    var flashes = new Map();              // rowKey -> +1 / -1, consumed by afterRender

    // Kept as our own reference so renderLimit can be switched at runtime: the grid
    // reads options.renderLimit on every paint.
    var options = {
        head: document.getElementById('gridHead'),
        body: document.getElementById('gridBody'),
        columns: COLUMNS,
        defaultSort: { col: 'id', dir: SortDirections.Desc },
        rowKey: function (o) { return String(o.id); },
        emptyText: T.grid.empty,
        // Text order is a language's business: without this the table would sort by
        // whatever locale the visitor's browser happens to be set to.
        locale: T.htmlLang,
        // Drag a header to move its column.
        reorderable: true,
        // The row of boxes stays available from the menu, but the rule dialog is the
        // way in: it can say '> 1000' and 'is empty', which a box cannot.
        filtersVisible: false,
        // Ctrl adds, shift takes a range -- measured against the order on screen.
        selection: 'multi',
        selectedClass: 'sel',
        onSelectionChange: function (keys) {
            document.getElementById('selCount').textContent = keys.length ? keys.length + T.page.selected : T.page.noneSelected;
        },
        // The grid's own menu, with one host line added in front of it.
        contextMenu: {
            // The package draws the menu and the filter popup, and takes every word in
            // them from here -- which is the whole of what a host has to translate to
            // run the grid in another language.
            labels: T.grid.menu,
            filterDialog: { labels: T.grid.filter },
            items: function (context, defaults) {
                if (!context.row) return defaults;
                return [{ label: T.page.cancelOrder + context.row.id, run: function () { cancel(context.row.id); } }, {}]
                    .concat(defaults);
            }
        },
        // Where a host would persist the arrangement. This one keeps it in memory and
        // prints it, so the panel shows exactly what would have been stored.
        onStateChange: function (state) {
            saved = state;
            showState(state);
        },
        pinnedRows: pinnedRows,
        afterRender: afterRender
    };

    var grid = new DataGrid(options);

    // ------------------------------------------------------- the new grid powers
    function showState(state) {
        document.getElementById('stateOut').textContent = JSON.stringify(state, null, 1);
    }

    document.getElementById('btnGroup').addEventListener('click', function () {
        var on = grid.groupedBy() !== null;
        grid.groupBy(on ? null : 'board');
        this.textContent = on ? T.page.groupOn : T.page.groupOff;
    });

    document.getElementById('btnFilters').addEventListener('click', function () {
        grid.clearFilters();
    });

    document.getElementById('btnFilterRow').addEventListener('click', function () {
        grid.showFilters(!grid.filtersVisible());
    });

    // Restoring is the host handing an arrangement back, which is why the grid does
    // not echo it to onStateChange -- otherwise this button would rewrite the store
    // it just read from.
    document.getElementById('btnRestore').addEventListener('click', function () {
        if (saved) grid.setState(saved);
    });

    // ----------------------------------------------------------------- the theme
    // The grid contributes no colour of its own -- everything on screen is this
    // page's stylesheet -- so switching themes is a matter of swapping the tokens
    // the page defines, and the grid never learns it happened.
    document.getElementById('btnTheme').addEventListener('click', function () {
        var light = document.documentElement.classList.toggle('light');
        this.textContent = light ? T.page.themeDark : T.page.themeLight;
    });

    // --------------------------------------------------------- the column picker
    // Driven straight off the grid. ColumnSettings is for a table the SERVER rendered:
    // it rearranges cells that already exist. Putting it over a DataGrid gives the
    // column view two owners, and they disagree on the first repaint -- which is
    // exactly what happened here, with a dragged column moving in the header while
    // the body sprang back.
    var modal = document.getElementById('colModal');
    var layoutNote = document.getElementById('layout');
    var listEl = document.getElementById('columnList');
    var picked = [];                      // candidate order, uncommitted until Apply

    function fillPicker() {
        picked = grid.columnKeys().map(function (key) {
            var col = COLUMNS.find(function (c) { return c.key === key; });
            return { key: key, label: col.header || key, visible: !grid.isColumnHidden(key) };
        });
        drawPicker();
    }

    function drawPicker() {
        listEl.replaceChildren.apply(listEl, picked.map(function (row, i) {
            var li = document.createElement('li');
            li.className = 'col-item';

            var toggle = document.createElement('input');
            toggle.type = 'checkbox';
            toggle.className = 'col-toggle';
            toggle.checked = row.visible;
            toggle.addEventListener('change', function () { row.visible = toggle.checked; });

            var label = document.createElement('span');
            label.className = 'col-label';
            label.textContent = row.label;

            li.appendChild(toggle);
            li.appendChild(label);
            li.appendChild(moveButton(i, -1, T.page.moveUp, 'ico ico-up'));
            li.appendChild(moveButton(i, 1, T.page.moveDown, 'ico ico-down'));
            return li;
        }));
    }

    function moveButton(index, delta, title, iconClass) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'col-move';
        btn.title = title;
        btn.disabled = index + delta < 0 || index + delta >= picked.length;
        btn.appendChild(Object.assign(document.createElement('span'), { className: iconClass }));
        btn.addEventListener('click', function () {
            var row = picked.splice(index, 1)[0];
            picked.splice(index + delta, 0, row);
            drawPicker();
        });
        return btn;
    }

    function showLayout() {
        var shown = grid.columnKeys().filter(function (k) { return !grid.isColumnHidden(k); });
        var isDefault = shown.length === COLUMNS.length
            && shown.every(function (k, i) { return k === COLUMNS[i].key; });
        layoutNote.textContent = T.page.layout;
        var b = document.createElement('b');
        b.textContent = isDefault ? T.page.layoutDefault : shown.join(', ');
        layoutNote.appendChild(b);
    }

    document.getElementById('btnColumns').addEventListener('click', function () {
        fillPicker();
        modal.classList.add('show');
    });

    document.getElementById('colApply').addEventListener('click', function () {
        grid.setColumnOrder(picked.map(function (r) { return r.key; }));
        picked.forEach(function (r) { r.visible ? grid.showColumn(r.key) : grid.hideColumn(r.key); });
        modal.classList.remove('show');
        showLayout();
    });

    document.getElementById('colReset').addEventListener('click', function () {
        grid.setColumnOrder(COLUMNS.map(function (c) { return c.key; }));
        COLUMNS.forEach(function (c) { grid.showColumn(c.key); });
        modal.classList.remove('show');
        showLayout();
    });

    document.getElementById('colClose').addEventListener('click', function () { modal.classList.remove('show'); });
    modal.addEventListener('click', function (e) {
        if (e.target === modal) modal.classList.remove('show');   // discard, nothing committed
    });

    // ------------------------------------------------------------- after a paint
    var status = document.getElementById('status');
    var preview = document.getElementById('preview');
    var sheetRows = document.getElementById('sheetRows');

    function afterRender() {
        flashes.forEach(function (dir, key) {
            var td = grid.cellElement(key, 'last');
            if (td) td.classList.add(dir > 0 ? 'flash-up' : 'flash-down');
        });
        flashes.clear();

        var data = grid.exportData();
        var painted = options.body.querySelectorAll('tr[data-row-key]:not(.pinned)').length;
        status.textContent = T.page.status(painted, grid.rows.length, data.rows.length, data.headers.length,
            grid.sort.col ? T.page.sortBy(grid.sort.col, grid.sort.dir) : T.page.sortDefault);

        sheetRows.textContent = data.rows.length;
        preview.textContent = [data.headers.join(' | ')]
            .concat(data.rows.slice(0, 8).map(function (row) { return row.join(' | '); }))
            .concat(data.rows.length > 8 ? [T.page.more(data.rows.length - 8)] : [])
            .join('\n');
    }

    // ------------------------------------------------------------------ toolbar
    function toggle(btn, on) { btn.classList.toggle('on', on); }

    var btnLive = document.getElementById('btnLive');
    var timer = null;

    btnLive.addEventListener('click', function () {
        if (timer) { clearInterval(timer); timer = null; }
        else timer = setInterval(tick, 900);
        toggle(btnLive, !!timer);
    });

    // Mutate the array the grid holds and repaint — the documented live-update path.
    function tick() {
        for (var i = 0; i < 6; i++) {
            var o = held[Math.floor(Math.random() * held.length)];
            if (!o || o.state === 'Cancelled') continue;
            var next = round(o.last * (1 + (Math.random() - 0.5) * 0.0012), o.dec);
            if (next <= 0 || next === o.last) continue;
            flashes.set(String(o.id), next > o.last ? 1 : -1);
            o.last = next;
            reprice(o);
        }
        grid.render();
    }

    var btnLimit = document.getElementById('btnLimit');
    btnLimit.addEventListener('click', function () {
        options.renderLimit = options.renderLimit ? undefined : 10;
        toggle(btnLimit, !!options.renderLimit);
        grid.render();
    });

    var btnClear = document.getElementById('btnClear');
    btnClear.addEventListener('click', function () {
        var empty = grid.rows.length > 0;
        held = empty ? [] : orders;
        btnClear.textContent = empty ? T.page.restoreRows : T.page.clearRows;
        toggle(btnClear, empty);
        grid.setRows(held);
    });

    document.getElementById('btnExport').addEventListener('click', function () {
        grid.download('orders', 'Orders');
    });

    // The workbook writer on its own: a sheet with no grid behind it.
    document.getElementById('btnSummary').addEventListener('click', function () {
        var buckets = [
            [T.page.working, held.filter(isWorking)],
            [T.page.allOrders, held]
        ];
        TableExport.download('orders-summary', T.page.summarySheet,
            [T.page.bucket, T.page.ordersHeader, T.columns.qty, T.columns.filled, T.columns.pnl],
            buckets.map(function (b) {
                return [b[0], b[1].length, round(sum(b[1], 'qty'), 4), round(sum(b[1], 'filled'), 4), round(sum(b[1], 'pnl'), 2)];
            }));
    });

    // -------------------------------------------------------------- the language
    // What a switch has to do, and what it must not touch.
    //
    // The grid takes its columns once, so translated headers mean a NEW grid over the
    // same table -- which is why DataGrid has destroy(): the old one would go on
    // answering Ctrl+C otherwise. Everything the user arranged rides across in
    // getState(), and it works precisely because that state is written in column keys
    // and raw values rather than in anything on screen: a table grouped by side and
    // filtered to Sell comes back grouped and filtered, now reading 卖出.
    function paintChrome() {
        var page = T.page;
        document.documentElement.lang = T.htmlLang;
        document.title = page.title;
        document.getElementById('headScript').innerHTML = page.headScript;
        document.getElementById('lede').innerHTML = page.lede;
        document.getElementById('btnLang').textContent = T.switchTo;
        document.getElementById('btnTheme').textContent =
            document.documentElement.classList.contains('light') ? page.themeDark : page.themeLight;
        document.getElementById('btnColumns').textContent = page.columns;
        document.getElementById('btnLimit').textContent = options.renderLimit ? page.limit + options.renderLimit : page.limitOff;
        document.getElementById('btnClear').textContent = grid.rows.length ? page.clearRows : page.restoreRows;
        document.getElementById('btnGroup').textContent = grid.groupedBy() ? page.groupOff : page.groupOn;
        document.getElementById('btnFilterRow').textContent = page.filterRow;
        document.getElementById('btnFilters').textContent = page.clearFilters;
        document.getElementById('btnRestore').textContent = page.restore;
        document.getElementById('btnSummary').textContent = page.summary;
        document.getElementById('btnExport').textContent = page.download;
        document.getElementById('selCount').textContent = grid.selectedKeys().length
            ? grid.selectedKeys().length + page.selected : page.noneSelected;
        document.getElementById('liveHere').textContent = page.liveHere;
        document.getElementById('hints').replaceChildren.apply(
            document.getElementById('hints'),
            page.hints.map(function (html) {
                var li = document.createElement('li');
                li.innerHTML = html;
                return li;
            }));
        document.getElementById('stateTitle').textContent = page.stateTitle;
        document.getElementById('exportTitle').textContent = page.exportTitle;
        document.getElementById('exportNote').innerHTML = page.exportNote;
        document.getElementById('modalTitle').textContent = page.modalTitle;
        document.getElementById('colClose').setAttribute('aria-label', page.modalClose);
        document.getElementById('colReset').textContent = page.modalReset;
        document.getElementById('colApply').textContent = page.modalApply;

        var live = document.getElementById('btnLive');
        live.replaceChildren(Object.assign(document.createElement('span'), { className: 'dot' }),
            document.createTextNode(page.live));
        showLayout();
    }

    function setLanguage(code) {
        var state = grid.getState();
        var selected = grid.selectedKeys();

        T = SSDemoText[code];
        COLUMNS = buildColumns();
        options.columns = COLUMNS;
        options.emptyText = T.grid.empty;
        options.locale = T.htmlLang;
        options.contextMenu.labels = T.grid.menu;
        options.contextMenu.filterDialog = { labels: T.grid.filter };

        grid.destroy();
        grid = new DataGrid(options);
        grid.setRows(held);
        grid.setState(state);
        grid.setSelection(selected);
        paintChrome();
    }

    document.getElementById('btnLang').addEventListener('click', function () {
        setLanguage(T.code === 'en' ? 'zh' : 'en');
    });

    // ----------------------------------------------------------------- first paint
    held = orders;
    grid.setRows(held);
    paintChrome();
})();
