/**
 * Patches Next.js SWC loader to use WASM fallback on Windows ARM64.
 *
 * Problem: Next.js 14.x ships native SWC binaries that are incompatible with
 * Node.js v24+ on Windows ARM64 ("not a valid Win32 application").
 * The WASM fallback is only auto-enabled for a hardcoded list of "unsupported"
 * platforms, and win32-arm64 is not in that list.
 *
 * Fix: Adds "aarch64-pc-windows-msvc" to knownDefaultWasmFallbackTriples
 * and removes the useWasmBinary gate so the WASM fallback is used automatically.
 *
 * Run via: npm run postinstall (in frontend package)
 * Safe to run on non-ARM64 systems — the patch is harmless if the platform isn't matched.
 */
const fs = require('fs');
const path = require('path');

const swcIndexPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'next',
  'dist',
  'build',
  'swc',
  'index.js'
);

// Also check hoisted location
const hoistedPath = path.join(
  __dirname,
  '..', '..', '..',
  'node_modules',
  'next',
  'dist',
  'build',
  'swc',
  'index.js'
);

const filePath = fs.existsSync(swcIndexPath) ? swcIndexPath : hoistedPath;

if (!fs.existsSync(filePath)) {
  console.log('patch-next-swc: next/dist/build/swc/index.js not found, skipping');
  process.exit(0);
}

let content = fs.readFileSync(filePath, 'utf8');
let patched = false;

// Patch 1: Add aarch64-pc-windows-msvc to WASM fallback triples
if (!content.includes('"aarch64-pc-windows-msvc"')) {
  content = content.replace(
    '"i686-pc-windows-msvc"\n];',
    '"i686-pc-windows-msvc",\n    "aarch64-pc-windows-msvc"\n];'
  );
  patched = true;
}

// Patch 2: Remove useWasmBinary gate so unsupported platforms auto-fallback to WASM
if (content.includes('unsupportedPlatform && useWasmBinary ||')) {
  content = content.replace(
    'unsupportedPlatform && useWasmBinary ||',
    'unsupportedPlatform ||'
  );
  patched = true;
}

if (patched) {
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('patch-next-swc: Patched Next.js SWC loader for Windows ARM64 WASM fallback');
} else {
  console.log('patch-next-swc: Already patched or not needed');
}
