import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = join(root, 'tests', 'api', 'public-api.d.ts');
const tscPath = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const update = process.argv.includes('--update');
const temp = await mkdtemp(join(tmpdir(), 'ssgrid-api-'));

try {
    const result = spawnSync(
        process.execPath,
        [tscPath, '-p', join(root, 'tsconfig.api.json'), '--outDir', temp],
        { cwd: root, encoding: 'utf8' },
    );
    if (result.status !== 0) {
        process.stderr.write(result.stdout || '');
        process.stderr.write(result.stderr || '');
        throw new Error(`Declaration build failed with exit code ${result.status ?? 1}.`);
    }

    const files = await declarationFiles(temp);
    const generated = (await Promise.all(files.map(async (path) => {
        const name = relative(temp, path).split(sep).join('/');
        const contents = publicDeclarations(await readFile(path, 'utf8')).trimEnd();
        return `// FILE: ${name}\n${contents}\n`;
    }))).join('\n');

    if (update) {
        await mkdir(dirname(snapshotPath), { recursive: true });
        await writeFile(snapshotPath, generated, 'utf8');
        console.log(`updated ${snapshotPath}`);
    } else {
        let expected;
        try {
            expected = normalize(await readFile(snapshotPath, 'utf8'));
        } catch {
            throw new Error('Public API snapshot is missing. Run npm run api:update.');
        }
        if (expected !== generated) {
            throw new Error(
                'Public API changed. Review declarations, then run npm run api:update if the change is intentional.',
            );
        }
        console.log(`public API snapshot matches (${files.length} declaration files)`);
    }
} finally {
    await rm(temp, { recursive: true, force: true });
}

async function declarationFiles(directory) {
    const result = [];
    for (const entry of (await readdir(directory, { withFileTypes: true }))
        .sort((left, right) => left.name.localeCompare(right.name))) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) result.push(...await declarationFiles(path));
        else if (entry.name.endsWith('.d.ts')) result.push(path);
    }
    return result;
}

function normalize(value) {
    return value.replaceAll('\r\n', '\n');
}

/// Drops private members, and the doc comment that came with them: tsc emits the
/// comment above a declaration it is about to strip, which left the snapshot
/// documenting methods nobody outside the class can call.
function publicDeclarations(value) {
    const kept = [];
    let comment = [];

    for (const line of normalize(value).split('\n')) {
        if (comment.length === 0 && /^\s*\/\*\*/.test(line) && !/\*\//.test(line)) {
            comment.push(line);
            continue;
        }
        if (comment.length > 0) {
            comment.push(line);
            if (!/\*\//.test(line)) continue;
            // The block is closed; whether it survives depends on what follows it.
            const block = comment;
            comment = [];
            kept.push({ pending: block });
            continue;
        }

        const isPrivate = /^\s+private(?:\s|$)/.test(line);
        const pending = kept.length > 0 && kept[kept.length - 1].pending;
        if (pending) kept.pop();
        if (isPrivate) continue;
        if (pending) kept.push(...pending.map(text => ({ text })));
        kept.push({ text: line });
    }

    return [...kept.filter(entry => entry.text !== undefined).map(entry => entry.text), ...comment].join('\n');
}
