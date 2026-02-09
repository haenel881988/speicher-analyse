const { spawn } = require('child_process');
const electronPath = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ['.'], {
    cwd: __dirname,
    env,
    stdio: 'inherit',
});

child.on('close', (code) => process.exit(code));
