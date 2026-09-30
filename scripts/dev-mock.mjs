// Runs the mock backends and the Vite dev server together (no extra dependency).
import { spawn } from 'node:child_process'

const run = (args) => spawn(process.execPath, args, { stdio: 'inherit' })
const kids = [run(['mock/server.mjs']), run(['node_modules/vite/bin/vite.js'])]
const stop = () => kids.forEach((k) => k.kill())
process.on('SIGINT', stop); process.on('SIGTERM', stop)
kids.forEach((k) => k.on('exit', stop))
