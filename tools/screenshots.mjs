// Re-takes the README screenshots from the demo, so a picture cannot drift away
// from what the package does.
//
// Nothing is installed for this: it serves the repo with the demo server that is
// already here and drives the Chrome that is already on the machine over its own
// debugging protocol. Node has had a WebSocket client built in since 22, so there
// is no dependency to add and nothing lands outside this repository.
//
// Dry run by default -- it prints the shots it would take and the files it would
// write, and touches nothing. Pass --apply to actually write them.
//
//   node tools/screenshots.mjs                 # say what would happen
//   node tools/screenshots.mjs --apply         # write screenshots/*.jpg
//   node tools/screenshots.mjs --apply --only context-menu

import { spawn } from 'node:child_process';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'screenshots');
// Chrome insists on a profile directory. It goes inside the repo, next to the
// other build leavings, rather than into the machine's home.
const profileDir = join(root, '.tmp-chrome');

const apply = process.argv.includes('--apply');
const only = argValue('--only');
const port = Number(argValue('--port') || 8799);
const WIDTH = 1440;
const HEIGHT = 820;

/// Each shot: what to set up on the page, and what to call the file. The setup runs
/// in the page, so it drives the built bundle the same way a user would.
const SHOTS = [
    {
        name: 'blotter',
        title: 'the table itself, with the filter row showing',
        setup: `
            document.getElementById('btnFilterRow').click();
            const tr = [...document.querySelectorAll('#gridBody tr[data-row-key]')]
                .filter(r => !r.className.includes('pinned'));
            tr[1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
            tr[2].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, buttons: 1 }));
            document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        `,
    },
    {
        name: 'context-menu',
        title: 'the context menu over a cell, with a host item on top',
        setup: `
            const tr = [...document.querySelectorAll('#gridBody tr[data-row-key]')]
                .filter(r => !r.className.includes('pinned'));
            const td = tr[1].querySelector('td[data-col="symbol"]');
            const box = td.getBoundingClientRect();
            td.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: box.left + 30, clientY: box.top + 12 }));
        `,
    },
    {
        name: 'filter-dialog',
        title: 'the filter rule popup on a column of values',
        setup: `
            const tr = [...document.querySelectorAll('#gridBody tr[data-row-key]')]
                .filter(r => !r.className.includes('pinned'));
            const td = tr[1].querySelector('td[data-col="side"]');
            const box = td.getBoundingClientRect();
            td.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: box.left + 20, clientY: box.top + 12 }));
            [...document.querySelector('.grid-menu').children]
                .find(el => el.textContent === 'Filter\\u2026').click();
        `,
    },
    {
        name: 'chinese',
        title: 'the same table in Chinese, arrangement carried across',
        setup: `
            const tr = [...document.querySelectorAll('#gridBody tr[data-row-key]')]
                .filter(r => !r.className.includes('pinned'));
            const td = tr[1].querySelector('td[data-col="side"]');
            const box = td.getBoundingClientRect();
            td.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: box.left + 20, clientY: box.top + 12 }));
            [...document.querySelector('.grid-menu').children]
                .find(el => el.textContent === 'Group by this column').click();
            document.getElementById('btnLang').click();
        `,
    },
];

const shots = only ? SHOTS.filter(shot => shot.name === only) : SHOTS;
if (shots.length === 0) fail(`No shot named "${only}". Known: ${SHOTS.map(s => s.name).join(', ')}.`);

if (!apply) {
    console.log('DRY RUN -- nothing is written. Pass --apply to take the screenshots.\n');
    console.log(`chrome        ${await chromePath()}`);
    console.log(`demo server   node serve.mjs on port ${port}`);
    console.log(`viewport      ${WIDTH}x${HEIGHT}`);
    console.log(`profile dir   ${relative(root, profileDir)}  (created, then removed)`);
    console.log('\nwould write:');
    for (const shot of shots) console.log(`  ${relative(root, join(outDir, `${shot.name}.jpg`))}  -- ${shot.title}`);
    process.exit(0);
}

const chrome = await chromePath();
await rm(profileDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const server = spawn(process.execPath, [join(root, 'serve.mjs')], {
    cwd: root,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
    stdio: 'ignore',
});

const browser = spawn(chrome, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    // Nothing here needs a GPU, and asking for one in a headless run on a server
    // is how this hangs instead of failing.
    '--disable-gpu',
    'about:blank',
], { stdio: 'ignore' });

let failure = null;
try {
    const endpoint = await devToolsEndpoint();
    for (const shot of shots) {
        const bytes = await capture(endpoint, shot);
        const file = join(outDir, `${shot.name}.jpg`);
        await writeFile(file, bytes);
        console.log(`${relative(root, file)}  ${(bytes.length / 1024).toFixed(0)} kB  -- ${shot.title}`);
    }
} catch (error) {
    failure = error;
} finally {
    browser.kill();
    server.kill();
    // Chrome holds a lock on its profile until it has actually gone, and killing it
    // only asks. Removing the directory a moment later fails with EBUSY.
    await exited(browser);
    await removeProfile();
}

if (failure) fail(failure.message);

function exited(child) {
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
    return new Promise(done => {
        child.once('exit', done);
        setTimeout(done, 5_000);
    });
}

/// The lock can outlive the process by a beat on Windows, so give it a few tries
/// before deciding the leftover directory is worth reporting.
async function removeProfile() {
    for (let attempt = 0; attempt < 20; attempt++) {
        try {
            await rm(profileDir, { recursive: true, force: true });
            return;
        } catch {
            await new Promise(done => setTimeout(done, 250));
        }
    }
    console.warn(`could not remove ${relative(root, profileDir)}; it is ignored by git and safe to delete`);
}

async function capture(endpoint, shot) {
    const target = await post(endpoint, '/json/new?about:blank');
    const socket = await open(target.webSocketDebuggerUrl);
    try {
        await socket.send('Page.enable', {});
        await socket.send('Page.navigate', { url: `http://127.0.0.1:${port}/demo/index.html` });
        await socket.until('Page.loadEventFired');
        // The demo fills the table on a timer of its own; wait for rows rather than
        // guessing at a delay.
        await evaluate(socket, `new Promise(done => {
            const ready = () => document.querySelectorAll('#gridBody tr[data-row-key]').length > 3;
            if (ready()) return done(true);
            const timer = setInterval(() => { if (ready()) { clearInterval(timer); done(true); } }, 50);
        })`, true);
        await evaluate(socket, `(() => { ${shot.setup} })()`, false);
        // One frame for the setup to land.
        await evaluate(socket, 'new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))', true);

        const result = await socket.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
        return Buffer.from(result.data, 'base64');
    } finally {
        socket.close();
        await post(endpoint, `/json/close/${target.id}`);
    }
}

async function evaluate(socket, expression, awaitPromise) {
    const result = await socket.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (result.exceptionDetails) {
        const text = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
        throw new Error(`page script failed: ${text}`);
    }
    return result.result?.value;
}

/// Chrome writes the port it actually took into the profile directory once it is
/// listening, which is the only reliable way to learn it when asking for port 0.
async function devToolsEndpoint() {
    const portFile = join(profileDir, 'DevToolsActivePort');
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        try {
            await access(portFile);
            const [line] = (await readFile(portFile, 'utf8')).split('\n');
            if (line) return `http://127.0.0.1:${line.trim()}`;
        } catch {
            // not up yet
        }
        await new Promise(done => setTimeout(done, 100));
    }
    throw new Error('Chrome did not report a debugging port within 30s.');
}

async function post(endpoint, path) {
    const response = await fetch(`${endpoint}${path}`, { method: 'PUT' });
    if (!response.ok) throw new Error(`${path} answered ${response.status}`);
    const text = await response.text();
    return text.startsWith('{') ? JSON.parse(text) : {};
}

/// A CDP connection: send returns the reply to its own message, until waits for an
/// event. Node's built-in WebSocket, so there is nothing to install.
function open(url) {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(url);
        const pending = new Map();
        const waiting = new Map();
        let id = 0;

        socket.addEventListener('message', event => {
            const message = JSON.parse(event.data);
            if (message.id !== undefined) {
                const entry = pending.get(message.id);
                if (!entry) return;
                pending.delete(message.id);
                if (message.error) entry.reject(new Error(message.error.message));
                else entry.resolve(message.result);
                return;
            }
            const resolveEvent = waiting.get(message.method);
            if (resolveEvent) {
                waiting.delete(message.method);
                resolveEvent(message.params);
            }
        });
        socket.addEventListener('error', () => reject(new Error(`cannot reach ${url}`)));
        socket.addEventListener('open', () => resolve({
            send: (method, params) => new Promise((ok, no) => {
                const messageId = ++id;
                pending.set(messageId, { resolve: ok, reject: no });
                socket.send(JSON.stringify({ id: messageId, method, params }));
            }),
            until: method => new Promise(ok => waiting.set(method, ok)),
            close: () => socket.close(),
        }));
    });
}

async function chromePath() {
    const fromEnv = process.env.CHROME_PATH;
    const candidates = [
        fromEnv,
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        '/usr/bin/google-chrome',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ].filter(Boolean);

    for (const candidate of candidates) {
        try {
            await access(candidate);
            return candidate;
        } catch {
            // try the next one
        }
    }
    fail('No Chrome found. Set CHROME_PATH to its executable.');
}

function argValue(flag) {
    const at = process.argv.indexOf(flag);
    return at === -1 ? undefined : process.argv[at + 1];
}

function fail(message) {
    console.error(message);
    process.exit(1);
}
