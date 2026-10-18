// Two languages for the demo, so the page shows what a host has to translate and
// what it does not.
//
// The split is the point. `grid` holds the strings the PACKAGE would otherwise say
// in English -- they go straight into the menu and filter-dialog label options.
// `columns`, `values` and `page` are the host's own: a column header, the word a
// cell shows for a code, and the prose around the table. The grid never invents
// any of those, which is why there is no fourth language file inside the package.
//
// What must NOT appear here: a column key, a filter value, a group key, a sort
// direction. Those are identity, not wording -- the saved view is written in them,
// and it has to survive a language switch.

(function (root) {
    'use strict';

    var EN = {
        code: 'en',
        htmlLang: 'en',
        // The button offers the OTHER language, which is the one a reader who cannot
        // read this page is looking for.
        switchTo: '中文',

        grid: {
            menu: {
                sortAsc: 'Sort ascending',
                sortDesc: 'Sort descending',
                sortClear: 'Clear sort',
                hideColumn: 'Hide column',
                showAllColumns: 'Show all columns',
                groupBy: 'Group by this column',
                ungroup: 'Ungroup',
                filterByValue: function (text) { return 'Filter by this value: ' + text; },
                filterRule: 'Filter…',
                showFilters: 'Show filter row',
                hideFilters: 'Hide filter row',
                showHeader: 'Show header row',
                hideHeader: 'Hide header row',
                clearFilters: 'Clear filters',
                copyCell: 'Copy cell',
                copyRow: 'Copy row',
                copyRows: function (count) { return 'Copy selected rows (' + count + ')'; },
                exportXlsx: 'Export to .xlsx'
            },
            filter: {
                title: function (header) { return 'Filter: ' + header; },
                apply: 'Apply',
                clear: 'Clear',
                cancel: 'Cancel',
                value: 'Value',
                and: 'and',
                ops: {
                    contains: 'contains',
                    notContains: 'does not contain',
                    startsWith: 'starts with',
                    endsWith: 'ends with',
                    eq: '=',
                    ne: '≠',
                    gt: '>',
                    ge: '≥',
                    lt: '<',
                    le: '≤',
                    between: 'between',
                    anyOf: 'is any of',
                    noneOf: 'is none of',
                    empty: 'is empty',
                    notEmpty: 'is not empty'
                }
            },
            empty: 'No orders'
        },

        columns: {
            id: 'ID', time: 'Time', symbol: 'Symbol', board: 'Board', side: 'Side',
            type: 'Type', qty: 'Qty', price: 'Price', filled: 'Filled', last: 'Last',
            pnl: 'P&L', state: 'State', actions: 'Actions'
        },

        // The words behind the codes. The grid filters and groups by the code; these
        // are only what it reads as.
        values: {
            side: { 0: 'Buy', 1: 'Sell' },
            type: { Limit: 'Limit', Market: 'Market', Stop: 'Stop' },
            state: { Done: 'Done', Active: 'Active', Partial: 'Partial', Cancelled: 'Cancelled' }
        },

        page: {
            title: 'ssgrid · StockSharp JS Grids',
            headScript: '&lt;script src="../dist/ssgrid.js"&gt; → window.SSGrid',
            lede: '<b>@stocksharp/grids</b> is the browser data grid behind StockSharp\'s web '
                + 'applications — one column declaration drives the header, the body, the sort and the exported '
                + 'sheet. This page runs the published bundle over 25 sample orders: sort by clicking a header, '
                + 'pick and reorder columns, keep pinned summary rows outside the sort, cap what is painted, and '
                + 'download a real <code>.xlsx</code>.',
            themeDark: '☾ Dark',
            themeLight: '☀ Light',
            columns: 'Columns…',
            live: 'Live prices',
            limit: 'renderLimit = ',
            limitOff: 'renderLimit = off',
            manyRows: '+1000 orders',
            clearRows: 'Clear rows',
            restoreRows: 'Restore rows',
            groupOn: 'Group by board',
            groupOff: 'Ungroup',
            filterRow: 'Filter row',
            clearFilters: 'Clear filters',
            restore: 'Restore saved view',
            summary: 'Summary .xlsx',
            download: 'Download .xlsx',
            noneSelected: 'none selected',
            selected: ' selected',
            liveHere: 'What is live here',
            hints: [
                '<b>Click a header</b> — asc → desc → back to the table default (<code>id desc</code>).',
                '<b>Columns…</b> — <code>ColumnSettings</code> over this table: tick to show, arrows to reorder.',
                '<b>WORKING / ALL ORDERS</b> — pinned rows: outside the sort, outside the sheet.',
                '<b>Cancel</b> — a real <code>&lt;button&gt;</code> returned by <code>render()</code>, with its own listener.',
                '<b>Right-click anything</b> — the grid\'s own menu: sort, group, <b>Filter…</b>, copy, export.',
                '<b>Live prices</b> — mutate the held array, <code>render()</code>, flash the changed cell via <code>cellElement()</code>.',
                '<b>中文</b> — every word above is the host\'s; the saved view below does not change with it.'
            ],
            layout: 'layout: ',
            layoutDefault: 'table default',
            stateTitle: 'grid.getState()',
            stateEmpty: 'nothing changed yet',
            exportTitle: 'grid.exportData()',
            exportNote: 'The sheet the <b>Download .xlsx</b> button writes: the exportable columns, '
                + 'every held row, in the order on screen. It follows the declarations, not the screen — '
                + 'hiding a column or capping the paint leaves all 12 exportable columns and all 25 rows in '
                + 'the workbook.',
            modalTitle: 'Columns',
            modalClose: 'Close',
            modalReset: 'Reset to default',
            modalApply: 'Apply',
            moveUp: 'Move up',
            moveDown: 'Move down',
            more: function (n) { return '… ' + n + ' more'; },
            bucket: 'Bucket',
            ordersHeader: 'Orders',
            summarySheet: 'Summary',
            cancelOrder: 'Cancel order #',
            cancelButton: 'Cancel',
            working: 'WORKING',
            allOrders: 'ALL ORDERS',
            orders: ' orders',
            status: function (painted, held, sheetRows, sheetCols, sort) {
                return 'painted ' + painted + ' of ' + held + ' held rows  ·  sheet ' + sheetRows
                    + ' rows × ' + sheetCols + ' columns  ·  sort ' + sort;
            },
            sortDefault: 'default (id desc)',
            sortBy: function (col, dir) { return col + ' ' + dir; },
            loadTest: 'Load test →'
        },

        // The load page (load.html): the same dictionary, so its language button and its
        // column headers work the way the main page's do.
        load: {
            title: 'ssgrid · load test',
            headSub: '· load test',
            back: '← Demo',
            lede: '<b>@stocksharp/grids</b> under the rate a live tape or a quote board brings: tens to hundreds of '
                + 'updates a second, each one handed to the grid the documented way and painted at once. The meters '
                + 'say what that costs — frames, paints, the rows and elements the grid creates, and the share of '
                + 'the main thread the updates take.',
            scenario: 'Scenario',
            tape: 'Tape',
            inplace: 'In place',
            rate: 'Updates / s',
            start: 'Start',
            stop: 'Stop',
            meters: {
                fps: 'Frames / s',
                updates: 'Updates / s',
                renders: 'Renders / s',
                rows: 'Rows built / s',
                elements: 'Elements created / s',
                busy: 'Main thread',
                heap: 'JS heap, MB'
            },
            howTitle: 'What is measured',
            hints: [
                '<b>Tape</b> — a new row arrives on top through <code>setRows()</code>; the table keeps the last 200, '
                    + 'newest first, and <code>flashNewClass</code> marks the arrival.',
                '<b>In place</b> — the grid holds 200 quotes; each update changes one of them and calls '
                    + '<code>render()</code>, the documented live-update path.',
                '<b>One paint per update</b> — the way a host that repaints on every message drives the grid: at '
                    + '500 a second that is 500 paints a second.',
                '<b>Rows built, elements created</b> — what the grid put into the table each second, counted by a '
                    + '<code>MutationObserver</code> on the body.',
                '<b>Main thread</b> — the share of each second spent inside the updates: the change itself and the '
                    + 'grid\'s paint. The browser\'s layout and drawing come on top.',
                '<b>Headless</b> — <code>?scenario=tape&amp;rate=200&amp;auto=1</code> starts a run; '
                    + '<code>window.__loadReport()</code> returns the counters since <code>window.__loadReset()</code>.'
            ],
            columns: {
                id: '#', time: 'Time', symbol: 'Symbol', side: 'Side', price: 'Price', qty: 'Qty',
                bid: 'Bid', ask: 'Ask', last: 'Last', change: 'Change', volume: 'Volume'
            },
            empty: 'No rows',
            status: function (scenario, rows, rate, running) {
                return scenario + '  ·  ' + rows + ' rows  ·  ' + rate + ' updates a second'
                    + (running ? '  ·  running' : '  ·  stopped');
            }
        }
    };

    var ZH = {
        code: 'zh',
        htmlLang: 'zh-CN',
        switchTo: 'English',

        grid: {
            menu: {
                sortAsc: '升序排列',
                sortDesc: '降序排列',
                sortClear: '取消排序',
                hideColumn: '隐藏此列',
                showAllColumns: '显示全部列',
                groupBy: '按此列分组',
                ungroup: '取消分组',
                filterByValue: function (text) { return '按此值筛选：' + text; },
                filterRule: '筛选条件…',
                showFilters: '显示筛选行',
                hideFilters: '隐藏筛选行',
                showHeader: '显示表头',
                hideHeader: '隐藏表头',
                clearFilters: '清除筛选',
                copyCell: '复制单元格',
                copyRow: '复制此行',
                copyRows: function (count) { return '复制选中的 ' + count + ' 行'; },
                exportXlsx: '导出为 .xlsx'
            },
            filter: {
                title: function (header) { return '筛选：' + header; },
                apply: '应用',
                clear: '清除',
                cancel: '取消',
                value: '值',
                and: '至',
                ops: {
                    contains: '包含',
                    notContains: '不包含',
                    startsWith: '开头为',
                    endsWith: '结尾为',
                    eq: '=',
                    ne: '≠',
                    gt: '>',
                    ge: '≥',
                    lt: '<',
                    le: '≤',
                    between: '介于',
                    anyOf: '属于',
                    noneOf: '不属于',
                    empty: '为空',
                    notEmpty: '不为空'
                }
            },
            empty: '暂无委托'
        },

        columns: {
            id: '编号', time: '时间', symbol: '合约', board: '交易所', side: '方向',
            type: '类型', qty: '数量', price: '价格', filled: '成交', last: '最新价',
            pnl: '盈亏', state: '状态', actions: '操作'
        },

        values: {
            side: { 0: '买入', 1: '卖出' },
            type: { Limit: '限价', Market: '市价', Stop: '止损' },
            state: { Done: '已成交', Active: '活动', Partial: '部分成交', Cancelled: '已撤销' }
        },

        page: {
            title: 'ssgrid · StockSharp JS 表格',
            headScript: '&lt;script src="../dist/ssgrid.js"&gt; → window.SSGrid',
            lede: '<b>@stocksharp/grids</b> 是 StockSharp 网页应用背后的浏览器端数据表格 —— '
                + '一份列声明同时驱动表头、表体、排序和导出的工作表。本页用已发布的打包文件展示 25 条示例委托：'
                + '点击表头排序，挑选并拖动列，把汇总行钉在排序之外，限制绘制行数，并下载真正的 <code>.xlsx</code>。',
            themeDark: '☾ 深色',
            themeLight: '☀ 浅色',
            columns: '列…',
            live: '实时价格',
            limit: 'renderLimit = ',
            limitOff: 'renderLimit = 关闭',
            manyRows: '+1000 个订单',
            clearRows: '清空数据',
            restoreRows: '恢复数据',
            groupOn: '按交易所分组',
            groupOff: '取消分组',
            filterRow: '筛选行',
            clearFilters: '清除筛选',
            restore: '恢复已存视图',
            summary: '汇总 .xlsx',
            download: '下载 .xlsx',
            noneSelected: '未选中',
            selected: ' 行已选中',
            liveHere: '本页可以做什么',
            hints: [
                '<b>点击表头</b> —— 升序 → 降序 → 回到表格默认顺序（<code>id desc</code>）。',
                '<b>列…</b> —— 在此表上使用 <code>ColumnSettings</code>：勾选显示，箭头调整顺序。',
                '<b>WORKING / ALL ORDERS</b> —— 钉住的汇总行：不参与排序，也不进入工作表。',
                '<b>撤单</b> —— 由 <code>render()</code> 返回的真实 <code>&lt;button&gt;</code>，自带监听。',
                '<b>右键点击</b> —— 表格自带菜单：排序、分组、<b>筛选条件…</b>、复制、导出。',
                '<b>实时价格</b> —— 修改持有的数组，调用 <code>render()</code>，用 <code>cellElement()</code> 闪烁变动的单元格。',
                '<b>English</b> —— 以上文字都由宿主提供；下方保存的视图不随语言改变。'
            ],
            layout: '布局：',
            layoutDefault: '表格默认',
            stateTitle: 'grid.getState()',
            stateEmpty: '尚无改动',
            exportTitle: 'grid.exportData()',
            exportNote: '<b>下载 .xlsx</b> 按钮写出的工作表：可导出的列、全部持有行，按屏幕上的顺序。'
                + '它遵循的是列声明而不是屏幕 —— 隐藏一列或限制绘制行数，工作簿里仍是 12 个可导出列和 25 行。',
            modalTitle: '列',
            modalClose: '关闭',
            modalReset: '恢复默认',
            modalApply: '应用',
            moveUp: '上移',
            moveDown: '下移',
            more: function (n) { return '… 还有 ' + n + ' 行'; },
            bucket: '分组',
            ordersHeader: '委托数',
            summarySheet: '汇总',
            cancelOrder: '撤销委托 #',
            cancelButton: '撤单',
            working: '活动委托',
            allOrders: '全部委托',
            orders: ' 条委托',
            status: function (painted, held, sheetRows, sheetCols, sort) {
                return '已绘制 ' + painted + ' / ' + held + ' 行  ·  工作表 ' + sheetRows
                    + ' 行 × ' + sheetCols + ' 列  ·  排序 ' + sort;
            },
            sortDefault: '默认（id 降序）',
            sortBy: function (col, dir) { return col + ' ' + (dir === 'asc' ? '升序' : '降序'); },
            loadTest: '压力测试 →'
        },

        load: {
            title: 'ssgrid · 压力测试',
            headSub: '· 压力测试',
            back: '← 演示',
            lede: '<b>@stocksharp/grids</b> 承受实时成交流或报价板的更新频率：每秒数十到数百次更新，'
                + '每次都按文档方式交给表格并立即绘制。仪表显示其代价 —— 帧数、绘制次数、表格创建的行与元素，'
                + '以及更新占用主线程的比例。',
            scenario: '场景',
            tape: '成交流',
            inplace: '原地更新',
            rate: '每秒更新',
            start: '开始',
            stop: '停止',
            meters: {
                fps: '帧 / 秒',
                updates: '更新 / 秒',
                renders: '绘制 / 秒',
                rows: '新建行 / 秒',
                elements: '新建元素 / 秒',
                busy: '主线程',
                heap: 'JS 堆，MB'
            },
            howTitle: '测量内容',
            hints: [
                '<b>成交流</b> —— 新行通过 <code>setRows()</code> 出现在顶部；表格保留最近 200 行，最新在前，'
                    + '<code>flashNewClass</code> 标记新到的行。',
                '<b>原地更新</b> —— 表格持有 200 条报价；每次更新修改其中一条并调用 <code>render()</code>，'
                    + '即文档中的实时更新方式。',
                '<b>每次更新绘制一次</b> —— 与每条消息都重绘的宿主驱动表格的方式相同：每秒 500 次更新即每秒绘制 500 次。',
                '<b>新建行、新建元素</b> —— 表格每秒放入表体的内容，由表体上的 <code>MutationObserver</code> 统计。',
                '<b>主线程</b> —— 每秒中花在更新上的时间比例：数据变更本身与表格的绘制。浏览器的布局与绘图另计。',
                '<b>无界面运行</b> —— <code>?scenario=tape&amp;rate=200&amp;auto=1</code> 开始一次运行；'
                    + '<code>window.__loadReport()</code> 返回自 <code>window.__loadReset()</code> 以来的计数。'
            ],
            columns: {
                id: '#', time: '时间', symbol: '代码', side: '方向', price: '价格', qty: '数量',
                bid: '买价', ask: '卖价', last: '最新', change: '涨跌', volume: '成交量'
            },
            empty: '无数据',
            status: function (scenario, rows, rate, running) {
                return scenario + '  ·  ' + rows + ' 行  ·  每秒 ' + rate + ' 次更新'
                    + (running ? '  ·  运行中' : '  ·  已停止');
            }
        }
    };

    root.SSDemoText = { en: EN, zh: ZH };
})(window);
