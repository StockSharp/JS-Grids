import { execFile } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');

// The target is a fixed child of this repository, never a caller-provided path.
await rm(dist, { recursive: true, force: true });

await execFileAsync(
    process.execPath,
    [join(here, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join(here, 'tsconfig.build.json')],
    { cwd: here },
);

await build({
    // Complete public stack: DataGrid + TableSort/ColumnSettings/TableExport.
    entryPoints: [join(here, 'src', 'index.ts')],
    outfile: join(dist, 'ssgrid.js'),
    globalName: 'SSGrid',
    bundle: true,
    format: 'iife',
    sourcemap: true,
    target: 'es2020',
    logLevel: 'info',
});
