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

const children = apps.map((app) =>
    spawn(process.execPath, [npm, 'run', 'dev', ...app.args], {
        cwd: path.join(root, app.dir),
        stdio: 'inherit',
    })
);

// Ctrl+C reaches both on its own. If one stops by itself, stop the other too,
// so that the error stays on screen instead of half a storefront running on.
let stopping = false;
for (const child of children) {
    child.on('exit', (code) => {
        if (stopping) return;
        stopping = true;
        for (const other of children) {
            if (other !== child && other.exitCode === null) stop(other);
        }
        process.exitCode = code === null ? 1 : code;
    });
}

function stop(child) {
    if (process.platform === 'win32') {
        // child.kill() would end npm and leave its node process holding the port.
        try { execSync(`taskkill /T /F /PID ${child.pid}`, { stdio: 'ignore' }); } catch { }
    } else {
        child.kill('SIGTERM');
    }
}
