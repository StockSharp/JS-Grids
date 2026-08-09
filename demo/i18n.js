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
            sortBy: function (col, dir) { return col + ' ' + dir; }
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
            sortBy: function (col, dir) { return col + ' ' + (dir === 'asc' ? '升序' : '降序'); }
        }
    };

    root.SSDemoText = { en: EN, zh: ZH };
})(window);
