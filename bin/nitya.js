#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const command = process.argv[2];
const args = process.argv.slice(3);

const commands = {
  'deploy': 'perma-deploy.js',
  'init': 'perma-init.cjs', 
  'begin': 'perma-begin.cjs'
};

if (!command || !commands[command]) {
  console.log('Usage: nitya <command>');
  console.log('Commands: deploy, init, begin');
  process.exit(1);
}

const scriptPath = join(__dirname, commands[command]);
spawn('node', [scriptPath, ...args], { stdio: 'inherit' });