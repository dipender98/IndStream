#!/usr/bin/env node

const esbuild = require('esbuild');
const path = require('path');

const ENTRY = path.join(__dirname, 'src', 'indstream', 'index.js');
const OUT = path.join(__dirname, 'providers', 'indstream.js');
const EXTERNAL_MODULES = ['cheerio-without-node-native', 'react-native-cheerio', 'cheerio', 'crypto-js', 'axios'];

async function main() {
  const args = process.argv.slice(2);
  const minify = args.includes('--minify');
  await esbuild.build({
    entryPoints: [ENTRY],
    bundle: true,
    outfile: OUT,
    format: 'cjs',
    platform: 'neutral',
    target: 'es2016',
    minify: minify,
    sourcemap: false,
    external: EXTERNAL_MODULES,
    logLevel: 'warning',
  });
  const fs = require('fs');
  const stats = fs.statSync(OUT);
  console.log('Built providers/indstream.js (' + (stats.size / 1024).toFixed(1) + ' KB)');
}

main().catch(function (err) {
  console.error('Build failed:', err);
  process.exit(1);
});
