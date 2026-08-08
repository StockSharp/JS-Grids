// Demo host for @stocksharp/grids. Every feature on the page is driven through the
// published bundle (window.SSGrid); nothing here re-implements a grid behaviour.
(function () {
    'use strict';

    var SS = window.SSGrid;
    var DataGrid = SS.DataGrid;
    var ColumnSettings = SS.ColumnSettings;
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

    // ------------------------------------------------------------------- columns
    // Declared once: the header cell, the body cell, the sort accessor and the
    // exported column all come from these objects.
    var COLUMNS = [
        { key: 'id', header: 'ID', headerClass: 'num', exportable: true, value: function (o) { return o.id; }, cellClass: function () { return 'num dim'; } },
        { key: 'time', header: 'Time', exportable: true, value: function (o) { return o.time; }, cellClass: function () { return 'num dim'; } },
        { key: 'symbol', header: 'Symbol', exportable: true, filter: 'text', value: function (o) { return o.symbol; }, cellClass: function () { return 'sym'; } },
        { key: 'board', header: 'Board', exportable: true, filter: 'set', value: function (o) { return o.board; }, cellClass: function () { return 'dim'; } },
        {
            key: 'side', header: 'Side', exportable: true, filter: 'set',
            value: function (o) { return o.side; },
            render: function (o) { return o.side === 0 ? 'Buy' : 'Sell'; },
            cellClass: function (o) { return o.side === 0 ? 'side-buy' : 'side-sell'; },
            exportValue: function (o) { return o.side === 0 ? 'Buy' : 'Sell'; }
        },
        { key: 'type', header: 'Type', exportable: true, value: function (o) { return o.type; }, cellClass: function () { return 'dim'; } },
        {
            key: 'qty', header: 'Qty', headerClass: 'num', exportable: true,
            value: function (o) { return o.qty; },
            render: function (o) { return qtyText(o.qty); },
            cellClass: function () { return 'num'; }
        },
        {
            key: 'price', header: 'Price', headerClass: 'num', exportable: true,
            value: function (o) { return o.price; },
            render: function (o) { return fixed(o.price, o.dec); },
            cellClass: function () { return 'num'; }
        },
        {
            key: 'filled', header: 'Filled', headerClass: 'num', exportable: true,
            value: function (o) { return o.filled; },
            render: function (o) { return qtyText(o.filled) + ' / ' + qtyText(o.qty); },
            cellClass: function (o) { return o.filled === 0 ? 'num dim' : o.filled < o.qty ? 'num part' : 'num'; }
        },
        {
            key: 'last', header: 'Last', headerClass: 'num', exportable: true,
            value: function (o) { return o.last; },
            render: function (o) { return fixed(o.last, o.dec); },
            cellClass: function () { return 'num'; }
        },
        {
            key: 'pnl', header: 'P&L', headerClass: 'num', exportable: true, filter: 'number',
            value: function (o) { return o.pnl; },
            render: function (o) { return signed(o.pnl); },
            cellClass: function (o) { return 'num ' + pnlClass(o.pnl); }
        },
        {
            key: 'state', header: 'State', exportable: true,
            value: function (o) { return o.state; },
            // A Node, not a string: the cell holds a real element the host styles.
            render: function (o) {
                var badge = document.createElement('span');
                badge.className = 'badge badge-' + o.state.toLowerCase();
                badge.textContent = o.state;
                return badge;
            }
        },
        {
            // No value(): nothing to sort by, so the grid leaves this header inert.
            key: 'actions', header: 'Actions', headerHidden: true, headerClass: 'act', exportable: false,
            cellClass: function () { return 'act'; },
            render: function (o) {
                if (!isWorking(o)) return '';
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'rowbtn';
                btn.textContent = 'Cancel';
                btn.addEventListener('click', function (e) {
                    e.stopPropagation();          // the row below has its own click
                    cancel(o.id);
                });
                return btn;
            }
        }
    ];

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
                board: { content: rows.length + ' orders', className: 'dim' },
                qty: { content: qtyText(round(sum(rows, 'qty'), 4)), className: 'num' },
                filled: { content: qtyText(round(sum(rows, 'filled'), 4)), className: 'num' },
                pnl: { content: signed(pnl), className: 'num ' + pnlClass(pnl) }
            })
        };
    }

    function pinnedRows() {
        if (!held.length) return [];      // let the grid show its emptyText instead
        return [
            totalsRow('pinned-working', 'WORKING', held.filter(isWorking), GridPinnedPlacements.Top),
            totalsRow('pinned-all', 'ALL ORDERS', held, GridPinnedPlacements.Bottom)
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
        emptyText: 'No orders',
        // Drag a header to move its column.
        reorderable: true,
        // Ctrl adds, shift takes a range -- measured against the order on screen.
        selection: 'multi',
        selectedClass: 'sel',
        onSelectionChange: function (keys) {
            document.getElementById('selCount').textContent = keys.length ? keys.length + ' selected' : 'none selected';
        },
        // The grid's own menu, with one host line added in front of it.
        contextMenu: {
            items: function (context, defaults) {
                if (!context.row) return defaults;
                return [{ label: 'Cancel order #' + context.row.id, run: function () { cancel(context.row.id); } }, {}]
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
        this.textContent = on ? 'Group by board' : 'Ungroup';
    });

    document.getElementById('btnFilters').addEventListener('click', function () {
        grid.clearFilters();
    });

    // Restoring is the host handing an arrangement back, which is why the grid does
    // not echo it to onStateChange -- otherwise this button would rewrite the store
    // it just read from.
    document.getElementById('btnRestore').addEventListener('click', function () {
        if (saved) grid.setState(saved);
    });

    // --------------------------------------------------------- the column picker
    // ColumnSettings attaches to a rendered table and reads its columns off the
    // data-col keys in the header, so the host stamps them on the header the grid
    // just built. The keys are the column keys, which is what the grid already
    // writes on every body cell.
    var headCells = options.head.querySelectorAll('th');
    COLUMNS.forEach(function (col, i) { headCells[i].setAttribute('data-col', col.key); });

    var modal = document.getElementById('colModal');
    var layoutNote = document.getElementById('layout');
    var storedLayout = null;              // this demo's store lives in memory

    var settings = new ColumnSettings({
        table: document.getElementById('blotter'),
        dialog: {
            list: document.getElementById('columnList'),
            moveUpTitle: 'Move up',
            moveDownTitle: 'Move down',
            classes: {
                item: 'col-item',
                toggle: 'col-toggle',
                label: 'col-label',
                move: 'col-move',
                moveUpIcon: 'ico ico-up',
                moveDownIcon: 'ico ico-down'
            },
            open: function () { modal.classList.add('show'); },
            close: function () { modal.classList.remove('show'); }
        },
        store: {
            read: function () { return storedLayout; },
            write: function (visible) {
                // null means "this IS the table default" — the store keeps nothing.
                storedLayout = visible;
                layoutNote.textContent = 'layout: ';
                var b = document.createElement('b');
                b.textContent = visible ? visible.join(', ') : 'table default';
                layoutNote.appendChild(b);
            }
        }
    });

    document.getElementById('btnColumns').addEventListener('click', function () { settings.openPicker(); });
    document.getElementById('colApply').addEventListener('click', function () { settings.applyPicked(); });
    document.getElementById('colReset').addEventListener('click', function () { settings.resetToDefault(); });
    document.getElementById('colClose').addEventListener('click', function () { modal.classList.remove('show'); });
    modal.addEventListener('click', function (e) {
        if (e.target === modal) modal.classList.remove('show');   // discard, nothing committed
    });

    // ------------------------------------------------------------- after a paint
    var status = document.getElementById('status');
    var preview = document.getElementById('preview');
    var sheetRows = document.getElementById('sheetRows');

    function afterRender() {
        // A repaint builds fresh cells in declaration order, so the picked layout is
        // re-applied over them — this is what afterRender() exists for.
        if (settings) settings.apply(storedLayout || settings.defaultKeys());

        flashes.forEach(function (dir, key) {
            var td = grid.cellElement(key, 'last');
            if (td) td.classList.add(dir > 0 ? 'flash-up' : 'flash-down');
        });
        flashes.clear();

        var data = grid.exportData();
        var painted = options.body.querySelectorAll('tr[data-row-key]:not(.pinned)').length;
        status.textContent = 'painted ' + painted + ' of ' + grid.rows.length + ' held rows'
            + '  ·  sheet ' + data.rows.length + ' rows × ' + data.headers.length + ' columns'
            + '  ·  sort ' + (grid.sort.col ? grid.sort.col + ' ' + grid.sort.dir : 'default (id desc)');

        sheetRows.textContent = data.rows.length;
        preview.textContent = [data.headers.join(' | ')]
            .concat(data.rows.slice(0, 8).map(function (row) { return row.join(' | '); }))
            .concat(data.rows.length > 8 ? ['… ' + (data.rows.length - 8) + ' more'] : [])
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
        btnClear.textContent = empty ? 'Restore rows' : 'Clear rows';
        toggle(btnClear, empty);
        grid.setRows(held);
    });

    document.getElementById('btnExport').addEventListener('click', function () {
        grid.download('orders', 'Orders');
    });

    // The workbook writer on its own: a sheet with no grid behind it.
    document.getElementById('btnSummary').addEventListener('click', function () {
        var buckets = [
            ['Working', held.filter(isWorking)],
            ['All orders', held]
        ];
        TableExport.download('orders-summary', 'Summary',
            ['Bucket', 'Orders', 'Qty', 'Filled', 'P&L'],
            buckets.map(function (b) {
                return [b[0], b[1].length, round(sum(b[1], 'qty'), 4), round(sum(b[1], 'filled'), 4), round(sum(b[1], 'pnl'), 2)];
            }));
    });

    // ----------------------------------------------------------------- first paint
    held = orders;
    grid.setRows(held);
})();
