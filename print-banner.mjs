#!/usr/bin/env node
/**
 * SDLC Platform - Enterprise terminal banner
 *
 * Usage:  node print-banner.mjs <module> [port] [env]
 *   module - module name shown in the status panel (default: sdlc-platform)
 *   port   - listening port (default: ---)
 *   env    - NODE_ENV-style value (default: Development)
 *
 * Renders an enterprise-grade ASCII banner in the same style as
 * Docker / Kubernetes / NestJS CLI startup screens. The large ASCII
 * logo is loaded from ./ascii-logo.txt (next to this file) so it can
 * be tweaked without touching code. No Unicode, no external
 * dependencies, works on any modern terminal.
 *
 * Written as ESM so it works in both CommonJS and `"type": "module"`
 * projects without any warning.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const ESC = '\x1b[';
const RESET   = `${ESC}0m`;
const BOLD    = `${ESC}1m`;
const DIM     = `${ESC}2m`;
const CYAN    = `${ESC}96m`;
const GREEN   = `${ESC}92m`;
const YELLOW  = `${ESC}93m`;
const MAGENTA = `${ESC}95m`;
const WHITE   = `${ESC}97m`;
const GRAY    = `${ESC}90m`;
const BG_DARK = `${ESC}48;5;235m`;

// ---------- Config (CLI args + real version from package.json) ----------
const MODULE = (process.argv[2] || 'sdlc-platform').toUpperCase();
const PORT   = (process.argv[3] || '---').toString();
const ENV    = (process.argv[4] || 'Development').toUpperCase();

function readVersion() {
  try {
    const pkgPath = join(__dirname, 'package.json');
    const raw = readFileSync(pkgPath, 'utf8');
    const m = raw.match(/"version"\s*:\s*"([^"]+)"/);
    return m ? m[1] : '0.0.0';
  } catch {
    return '0.0.0';
  }
}
const VERSION = readVersion();

// ---------- Load ASCII logo from ascii-logo.txt ----------
// Expected file shape (between the two `====` borders):
//   1) "AL"   block letters
//   2) "SDLC" block letters
// We pull only those two art blocks and ignore the static
// Version/Env/Port lines at the bottom, since those are rendered
// dynamically from CLI args below.

function loadLogo() {
  const logoPath = join(__dirname, 'ascii-logo.txt');
  if (!existsSync(logoPath)) return null;

  const raw = readFileSync(logoPath, 'utf8');
  const blocks = raw.split(/^=+\s*$/m).map(b => b.trim()).filter(Boolean);
  // blocks[0] = AL art, blocks[1] = SDLC art
  if (blocks.length < 2) return null;

  const splitLines = (block) =>
    block.split(/\r?\n/).map(l => l.replace(/\s+$/, ''));

  return {
    top:    splitLines(blocks[0]),
    bottom: splitLines(blocks[1]),
  };
}

const logo = loadLogo();

// Fallback in case ascii-logo.txt is missing or malformed.
const LOGO_TOP_FALLBACK = [
  '  _____ _____  _      _____ ',
  ' / ____|  __ \\| |    / ____|',
  '| (___ | |  | | |   | |     ',
  ' \\___ \\| |  | | |   | |     ',
  ' ____) | |__| | |___| |____ ',
  '|_____/|_____/|______\\_____|',
];
const LOGO_BOTTOM_FALLBACK = [
  ' ____  _        _  _____ _____ ___  ____  __  __',
  '|  _ \\| |      / \\|_   _|  ___/ _ \\|  _ \\|  \\/  |',
  '| |_) | |     / _ \\ | | | |_ | | | | |_) | |\\/| |',
  '|  __/| |___ / ___ \\| | |  _|| |_| |  _ <| |  | |',
  '|_|   |_____/_/   \\_\\_| |_|   \\___/|_| \\_\\_|  |_|',
];

const TOP = (logo && logo.top.length    ? logo.top    : LOGO_TOP_FALLBACK);
const BOT = (logo && logo.bottom.length ? logo.bottom : LOGO_BOTTOM_FALLBACK);

// ---------- Layout helpers ----------
const W = 68; // inner width between the two vertical bars

function lpad(line, width = W) {
  const totalPad = Math.max(0, width - line.length);
  const left = Math.floor(totalPad / 2);
  return ' '.repeat(left) + line + ' '.repeat(width - left - line.length);
}

function row(content) {
  return '| ' + content.padEnd(W, ' ') + ' |';
}

function empty() {
  return row('');
}

function borderHeavy() {
  return '+=' + '='.repeat(W) + '=+';
}
function borderLight() {
  return '+-' + '-'.repeat(W) + '-+';
}

// ---------- Compose the banner ----------
const lines = [];

lines.push(borderHeavy());
lines.push(empty());

for (const l of TOP) lines.push(row(lpad(l)));

lines.push(empty());

for (const l of BOT) lines.push(row(lpad(l)));

lines.push(empty());

lines.push(borderLight());

function statusLine(label, value) {
  const left  = '  [' + label + ']';
  const right = ' ' + value;
  return row(left + right);
}

lines.push(statusLine('Version', VERSION));
lines.push(statusLine('Env',     ENV));
lines.push(statusLine('Port',    PORT));
lines.push(statusLine('Module',  MODULE));
lines.push(statusLine('Time',    new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC'));

lines.push(borderLight());

const READY = 'PLATFORM INITIALIZED';
const readyPad = Math.floor((W - READY.length) / 2);
const readyLine =
  ' '.repeat(readyPad) + READY + ' '.repeat(W - readyPad - READY.length);
lines.push(row(readyLine));

lines.push(borderHeavy());

// ---------- Output with ANSI styling ----------
process.stdout.write(BG_DARK);

// Layout-dependent indices (see `lines` above):
//   0                       -> top heavy border
//   1                       -> empty row
//   2 .. 2+TOP.length-1     -> TOP art     (cyan, bold)
//   2+TOP.length            -> empty row
//   3+TOP.length .. +BOT    -> BOT art     (white)
//   ...status panel...
//   last                    -> bottom heavy border
const topEnd   = 1 + TOP.length;       // exclusive
const botStart = topEnd + 1;            // skip empty row
const botEnd   = botStart + BOT.length; // exclusive

for (let i = 0; i < lines.length; i++) {
  const ln = lines[i];
  if (i === 0 || i === lines.length - 1) {
    process.stdout.write(`${BOLD}${MAGENTA}${ln}${RESET}\n`);
  } else if (ln.startsWith('+--')) {
    process.stdout.write(`${DIM}${GRAY}${ln}${RESET}\n`);
  } else if (ln.startsWith('+==') || ln.startsWith('+=-')) {
    process.stdout.write(`${BOLD}${MAGENTA}${ln}${RESET}\n`);
  } else if (/^\| \[/.test(ln)) {
    const m = ln.match(/^(\|  \[)([A-Za-z]+)(\]  )(.*?)( *\|)$/);
    if (m) {
      const [, open, label, mid, value, close] = m;
      process.stdout.write(
        `${BOLD}${YELLOW}${open}${label}${mid}${RESET}` +
        `${WHITE}${value}${RESET}` +
        `${WHITE}${close}${RESET}\n`,
      );
    } else {
      process.stdout.write(`${WHITE}${ln}${RESET}\n`);
    }
  } else if (ln.includes(READY)) {
    process.stdout.write(`${BOLD}${GREEN}${ln}${RESET}\n`);
  } else if (i >= 2 && i < topEnd) {
    process.stdout.write(`${BOLD}${CYAN}${ln}${RESET}\n`);
  } else if (i >= botStart && i < botEnd) {
    process.stdout.write(`${WHITE}${ln}${RESET}\n`);
  } else {
    process.stdout.write(`${WHITE}${ln}${RESET}\n`);
  }
}

process.stdout.write(RESET);
