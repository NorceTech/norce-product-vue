// `npm run dev` in the repository root: starts the BFF (port 3000) and the
// frontend (port 5173) in one terminal. It is the same as `npm run dev` in bff/
// and in productpage-vue/ in two terminals, with one addition: with no bff/.env
// yet, it sets MOCK_DATA=true for this run and says so, as run.ps1 does. That
// keeps a fresh clone working without a copy step, while the BFF itself still
// never falls back to the fixtures on its own.
require('./check-node');

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

// npm_execpath is npm's own entry script, set because this runs under `npm run`.
// Running it with this Node avoids starting npm through a shell, which on
// Windows would mean npm.cmd.
const npm = process.env.npm_execpath;
if (!npm) {
    console.error('Start this with `npm run dev` in the repository root.');
    process.exit(1);
}

for (const dir of ['bff', 'productpage-vue']) {
    if (!fs.existsSync(path.join(root, dir, 'node_modules'))) {
        console.error(`${dir}/node_modules is missing. Run \`npm install\` in the repository root first.`);
        process.exit(1);
    }
}

// A MOCK_DATA already in the environment wins, as it does over bff/.env.
if (!fs.existsSync(path.join(root, 'bff', '.env')) && process.env.MOCK_DATA === undefined) {
    process.env.MOCK_DATA = 'true';
    console.log('');
    console.log('No bff/.env yet, so MOCK_DATA=true for this run: the BFF serves the saved');
    console.log('Norce Open Demo responses in mockdata/ and needs no credentials.');
    console.log('For your own Norce data, copy bff/.env.example to bff/.env and fill it in.');
    console.log('');
}

const apps = [
    { dir: 'bff', args: [] },
    // Vite clears the terminal when it starts, which would wipe the BFF's
    // startup lines and the note above.
    { dir: 'productpage-vue', args: ['--', '--clearScreen', 'false'] },
];

// On Unix each server gets a process group of its own, so that stopping it
// reaches everything npm started under it - the shell, and Vite or the
// node --watch parent and its child - not only npm. Windows has no process
// groups to signal; taskkill /T does the same there.
const unix = process.platform !== 'win32';

const children = apps.map((app) =>
    spawn(process.execPath, [npm, 'run', 'dev', ...app.args], {
        cwd: path.join(root, app.dir),
        detached: unix,
        // Outside the terminal's foreground group a server must not read from
        // the terminal, so on Unix it gets a pipe instead. The pipe closes if
        // this launcher dies, and Vite shuts down when its stdin ends.
        stdio: unix ? ['pipe', 'inherit', 'inherit'] : 'inherit',
    })
);

// Stop both, once, on whichever comes first: one server stopping by itself,
// so that its error stays on screen instead of half a storefront running on;
// or Ctrl+C, or a signal sent to this launcher alone. In process groups of
// their own the servers no longer get the terminal's Ctrl+C, so it is passed
// on from here.
let stopping = false;
function stopAll(exitCode) {
    if (stopping) return;
    stopping = true;
    process.exitCode = exitCode;
    for (const child of children) stop(child);
}

for (const child of children) {
    child.on('exit', (code) => stopAll(code === null ? 1 : code));
}
// Stopping on request is not a failure.
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

function stop(child) {
    if (unix) {
        // A negative pid signals the whole group. It throws if the group is
        // already gone.
        try { process.kill(-child.pid, 'SIGTERM'); } catch { }
    } else if (child.exitCode === null) {
        // child.kill() would end npm and leave its node process holding the port.
        try { execSync(`taskkill /T /F /PID ${child.pid}`, { stdio: 'ignore' }); } catch { }
    }
}
