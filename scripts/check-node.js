// Stops with a plain message when Node.js is too old for this repository,
// instead of letting it fail later inside a dependency. Run by `npm install`
// and `npm run dev` in the repository root, and by run.ps1.
//
// Written without modern syntax, so that it runs on the old versions it is
// meant to catch. The minimum comes from the dependencies: vue-i18n 11 needs
// Node 22 or later. Keep it in step with `engines` in the root package.json.
var required = 22;
var major = parseInt(process.versions.node.split('.')[0], 10);

if (major < required) {
    console.error('');
    console.error('This repository needs Node.js ' + required + ' or later, and this is ' + process.version + '.');
    console.error('Install the LTS version from https://nodejs.org, open a new terminal and');
    console.error('check with `node --version` before running npm install again.');
    console.error('');
    process.exit(1);
}
