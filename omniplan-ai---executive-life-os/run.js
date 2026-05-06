#!/usr/bin/env node

/**
 * OmniPlan AI desktop app launcher.
 *
 * Run with: node run.js
 */

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';

const isWindows = process.platform === 'win32';
const npm = isWindows ? 'npm.cmd' : 'npm';
const cwd = path.dirname(fileURLToPath(import.meta.url));

function log(message) {
  console.log(`[OmniPlan] ${message}`);
}

function run(command, args) {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

if (!fs.existsSync(path.join(cwd, 'node_modules'))) {
  log('First run - installing dependencies...');
  run(npm, ['install']);
}

const distIndex = path.join(cwd, 'dist', 'index.html');
if (!fs.existsSync(distIndex)) {
  log('Building app...');
  run(npm, ['run', 'build']);
}

log('Starting OmniPlan AI...');
const electronPath = typeof electron === 'string' ? electron : electron.default;
const child = spawn(electronPath, ['.'], {
  cwd,
  detached: true,
  stdio: process.env.OMNIPLAN_DEBUG ? 'inherit' : 'ignore',
  windowsHide: false,
});

child.on('error', error => {
  console.error('[OmniPlan] Could not start Electron:', error.message);
  process.exit(1);
});

child.unref();
log('Opening planner window...');

setTimeout(() => process.exit(0), 1000);
