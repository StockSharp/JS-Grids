// Load test for @stocksharp/grids: the table under tens to hundreds of updates a second, fed only through the
// published bundle's documented API, with what the updates cost read off the page itself. A headless run starts it
// from the address (?scenario=tape&rate=200&auto=1) and reads window.__loadReport(); window.__loadReset() starts
// the count over.
(function () {
    'use strict';

    var SS = window.SSGrid;
    var DataGrid = SS.DataGrid;
    var SortDirections = SS.SortDirections;

    var query = new URLSearchParams(location.search);
    var T = SSDemoText[query.get('lang') === 'zh' ? 'zh' : 'en'];

    // [symbol, decimals, price]
    var INSTRUMENTS = [
        ['BTCUSDT', 2, 94180.5], ['ETHUSDT', 2, 3251.75], ['SOLUSDT', 2, 209.55], ['ESZ5', 2, 5846.75],
        ['NQZ5', 2, 20443.25], ['AAPL', 2, 240.11], ['MSFT', 2, 433.05], ['NVDA', 2, 140.28],
        ['EURUSD', 5, 1.08215], ['GBPUSD', 5, 1.26385], ['GCG6', 1, 2641.9], ['SBER', 2, 269.9]
    ];
    var ROWS = 200;                       // the tape keeps the last 200 prints; the board holds 200 quotes

    var scenario = query.get('scenario') === 'inplace' ? 'inplace' : 'tape';
    var rate = Number(query.get('rate')) > 0 ? Number(query.get('rate')) : 50;

    // ------------------------------------------------------------ the data
    // Every string a cell shows is made once, when its value changes: the page measures the grid, and a formatter
    // run on every paint would be measured along with it.
    var formats = {};

    function priceText(price, dec) {
        var format = formats[dec] || (formats[dec] = new Intl.NumberFormat('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }));
        return format.format(price);
    }

    function pad(n, width) {
        return String(n).padStart(width || 2, '0');
    }

    function clock() {
        var d = new Date();
        return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '.' + pad(d.getMilliseconds(), 3);
    }

    function pick(list) {
        return list[Math.floor(Math.random() * list.length)];
    }

    var printSeq = 0;

    function print() {
        var instrument = pick(INSTRUMENTS);
        var price = instrument[2] * (1 + (Math.random() - 0.5) * 0.002);
        var qty = Math.round((0.01 + Math.random() * 5) * 100) / 100;
        return {
            id: ++printSeq, time: clock(), symbol: instrument[0], side: Math.random() < 0.5 ? 0 : 1,
            price: price, priceText: priceText(price, instrument[1]), qty: qty, qtyText: String(qty)
        };
    }

    function quotes() {
        var list = [];
        for (var i = 0; i < ROWS; i++) {
            var instrument = INSTRUMENTS[i % INSTRUMENTS.length];
            var round = Math.floor(i / INSTRUMENTS.length);
            var quote = {
                id: i + 1, symbol: instrument[0] + (round > 0 ? '·' + round : ''), dec: instrument[1],
                open: instrument[2], last: instrument[2], volume: 0, time: clock()
            };
            describe(quote);
            list.push(quote);
        }
        return list;
    }

    function tick(quote) {
        quote.last *= 1 + (Math.random() - 0.5) * 0.002;
        quote.volume += 1 + Math.floor(Math.random() * 10);
        quote.time = clock();
        describe(quote);
    }

    function describe(quote) {
        quote.lastText = priceText(quote.last, quote.dec);
        quote.bidText = priceText(quote.last * 0.9999, quote.dec);
        quote.askText = priceText(quote.last * 1.0001, quote.dec);
        quote.change = (quote.last / quote.open - 1) * 100;
        quote.changeText = (quote.change >= 0 ? '+' : '') + quote.change.toFixed(2) + '%';
        quote.volumeText = String(quote.volume);
    }

    // ----------------------------------------------------------- the columns
    function tapeColumns() {
        var c = T.load.columns;
        return [
            { key: 'id', header: c.id, headerClass: 'num', value: function (p) { return p.id; }, cellClass: function () { return 'num dim'; } },
            { key: 'time', header: c.time, value: function (p) { return p.time; }, cellClass: function () { return 'num dim'; } },
            { key: 'symbol', header: c.symbol, value: function (p) { return p.symbol; }, cellClass: function () { return 'sym'; } },
            { key: 'side', header: c.side, value: function (p) { return p.side; }, render: function (p) { return T.values.side[p.side]; } },
            { key: 'price', header: c.price, headerClass: 'num', value: function (p) { return p.price; }, render: function (p) { return p.priceText; }, cellClass: function () { return 'num'; } },
            { key: 'qty', header: c.qty, headerClass: 'num', value: function (p) { return p.qty; }, render: function (p) { return p.qtyText; }, cellClass: function () { return 'num'; } }
        ];
    }

    function boardColumns() {
        var c = T.load.columns;
        return [
            { key: 'symbol', header: c.symbol, value: function (q) { return q.symbol; }, cellClass: function () { return 'sym'; } },
            { key: 'bid', header: c.bid, headerClass: 'num', value: function (q) { return q.last; }, render: function (q) { return q.bidText; }, cellClass: function () { return 'num'; } },
            { key: 'ask', header: c.ask, headerClass: 'num', value: function (q) { return q.last; }, render: function (q) { return q.askText; }, cellClass: function () { return 'num'; } },
            { key: 'last', header: c.last, headerClass: 'num', value: function (q) { return q.last; }, render: function (q) { return q.lastText; }, cellClass: function () { return 'num'; } },
            { key: 'change', header: c.change, headerClass: 'num', value: function (q) { return q.change; }, render: function (q) { return q.changeText; }, cellClass: function (q) { return q.change >= 0 ? 'num pnl-pos' : 'num pnl-neg'; } },
            { key: 'volume', header: c.volume, headerClass: 'num', value: function (q) { return q.volume; }, render: function (q) { return q.volumeText; }, cellClass: function () { return 'num'; } },
            { key: 'time', header: c.time, value: function (q) { return q.time; }, cellClass: function () { return 'num dim'; } }
        ];
    }

    // -------------------------------------------------------------- the counts
    // `total` runs from the last reset and is what the report reads; `recent` is the last second the meters show.
    function zero() {
        return { since: performance.now(), updates: 0, renders: 0, frames: 0, rows: 0, elements: 0, spentMs: 0 };
    }

    var total = zero();
    var recent = zero();

    function add(field, n) {
        total[field] += n;
        recent[field] += n;
    }

    (function frame() {
        add('frames', 1);
        requestAnimationFrame(frame);
    })();

    // What the grid put into the table: every row and element that entered the body, counted where it landed.
    var body = document.getElementById('gridBody');
    new MutationObserver(function (records) {
        for (var r = 0; r < records.length; r++) {
            var added = records[r].addedNodes;
            for (var i = 0; i < added.length; i++) {
                var node = added[i];
                if (node.nodeType !== 1) continue;
                add('elements', 1 + node.getElementsByTagName('*').length);
                if (node.tagName === 'TR') add('rows', 1);
            }
        }
    }).observe(body, { childList: true, subtree: true });

    function perSecond(counts) {
        var seconds = (performance.now() - counts.since) / 1000;
        var per = function (n) { return seconds > 0 ? Math.round(n / seconds * 10) / 10 : 0; };
        return {
            seconds: Math.round(seconds * 10) / 10,
            updatesPerSecond: per(counts.updates),
            rendersPerSecond: per(counts.renders),
            framesPerSecond: per(counts.frames),
            rowsBuiltPerSecond: per(counts.rows),
            elementsCreatedPerSecond: per(counts.elements),
            mainThreadPercent: seconds > 0 ? Math.round(counts.spentMs / seconds / 10 * 10) / 10 : 0
        };
    }

    function heapMb() {
        return performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576 * 10) / 10 : null;
    }

    window.__loadReport = function () {
        var report = perSecond(total);
        report.scenario = scenario;
        report.rate = rate;
        report.running = pump !== null;
        report.heapMb = heapMb();
        return report;
    };

    window.__loadReset = function () {
        total = zero();
    };

    setInterval(function () {
        var shown = perSecond(recent);
        recent = zero();
        meter('fps', shown.framesPerSecond);
        meter('updates', shown.updatesPerSecond);
        meter('renders', shown.rendersPerSecond);
        meter('rows', shown.rowsBuiltPerSecond);
        meter('elements', shown.elementsCreatedPerSecond);
        meter('busy', shown.mainThreadPercent + '%');
        meter('heap', heapMb() === null ? '–' : heapMb());
    }, 1000);

    function meter(name, value) {
        document.querySelector('[data-meter="' + name + '"]').textContent = String(value);
    }

    // ---------------------------------------------------------------- the grid
    var grid = null;
    var held = [];

    function build() {
        if (grid) grid.destroy();
        var tape = scenario === 'tape';
        held = tape ? [] : quotes();
        grid = new DataGrid({
            head: document.getElementById('gridHead'),
            body: body,
            columns: tape ? tapeColumns() : boardColumns(),
            // Newest print on top for the tape; the board keeps its rows where they are.
            defaultSort: { col: 'id', dir: tape ? SortDirections.Desc : SortDirections.Asc },
            rowKey: function (row) { return String(row.id); },
            rowClass: tape ? function (p) { return p.side === 0 ? 'side-buy' : 'side-sell'; } : undefined,
            emptyText: T.load.empty,
            locale: T.htmlLang,
            selection: 'multi',
            selectedClass: 'sel',
            flashNewClass: tape ? 'flash-new' : undefined,
            afterRender: function () { add('renders', 1); }
        });
        if (tape) {
            for (var i = 0; i < ROWS; i++) held.unshift(print());
        }
        grid.setRows(held);
    }

    // One update, painted at once: the way a host that repaints on every message drives the grid.
    function update() {
        var started = performance.now();
        if (scenario === 'tape') {
            held.unshift(print());
            if (held.length > ROWS) held.length = ROWS;
            grid.setRows(held);
        } else {
            tick(pick(held));
            grid.render();
        }
        add('spentMs', performance.now() - started);
        add('updates', 1);
    }

    // Updates are spread over time by what is owed since the last turn, so a rate above what a timer can tick at
    // still arrives in full -- several updates to a turn. A page that cannot keep up drops what it owes past a
    // second, and the meters show the shortfall.
    var pump = null;
    var owed = 0;
    var last = 0;

    function start() {
        if (pump !== null) return;
        owed = 0;
        last = performance.now();
        pump = setInterval(function () {
            var now = performance.now();
            owed = Math.min(owed + (now - last) * rate / 1000, rate);
            last = now;
            while (owed >= 1) {
                owed -= 1;
                update();
            }
        }, 10);
        paintChrome();
    }

    function stop() {
        if (pump === null) return;
        clearInterval(pump);
        pump = null;
        paintChrome();
    }

    // ---------------------------------------------------------------- the chrome
    function paintChrome() {
        var page = T.load;
        document.documentElement.lang = T.htmlLang;
        document.title = page.title;
        document.getElementById('headSub').textContent = page.headSub;
        document.getElementById('lnkDemo').textContent = page.back;
        document.getElementById('lede').innerHTML = page.lede;
        document.getElementById('btnLang').textContent = T.switchTo;
        document.getElementById('btnTheme').textContent =
            document.documentElement.classList.contains('light') ? T.page.themeDark : T.page.themeLight;
        document.getElementById('scenarioLabel').textContent = page.scenario;
        document.getElementById('rateLabel').textContent = page.rate;
        document.querySelectorAll('[data-scenario]').forEach(function (btn) {
            btn.textContent = page[btn.getAttribute('data-scenario')];
            btn.classList.toggle('on', btn.getAttribute('data-scenario') === scenario);
        });
        document.querySelectorAll('[data-rate]').forEach(function (btn) {
            btn.classList.toggle('on', Number(btn.getAttribute('data-rate')) === rate);
        });
        document.querySelectorAll('[data-meter-label]').forEach(function (label) {
            label.textContent = page.meters[label.getAttribute('data-meter-label')];
        });
        document.getElementById('btnRun').textContent = pump !== null ? page.stop : page.start;
        document.getElementById('howTitle').textContent = page.howTitle;
        document.getElementById('hints').replaceChildren.apply(
            document.getElementById('hints'),
            page.hints.map(function (html) {
                var li = document.createElement('li');
                li.innerHTML = html;
                return li;
            }));
        document.getElementById('status').textContent = page.status(page[scenario], held.length, rate, pump !== null);
    }

    document.querySelectorAll('[data-scenario]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            scenario = btn.getAttribute('data-scenario');
            build();
            window.__loadReset();
            paintChrome();
        });
    });

    document.querySelectorAll('[data-rate]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            rate = Number(btn.getAttribute('data-rate'));
            window.__loadReset();
            paintChrome();
        });
    });

    document.getElementById('btnRun').addEventListener('click', function () {
        if (pump === null) start(); else stop();
    });

    document.getElementById('btnTheme').addEventListener('click', function () {
        document.documentElement.classList.toggle('light');
        paintChrome();
    });

    document.getElementById('btnLang').addEventListener('click', function () {
        T = SSDemoText[T.code === 'en' ? 'zh' : 'en'];
        build();
        paintChrome();
    });

    build();
    paintChrome();
    if (query.get('auto') === '1') start();
})();
