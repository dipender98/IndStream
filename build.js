#!/usr/bin/env node

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const ENTRY = path.join(__dirname, 'src', 'indstream', 'index.js');
const OUT = path.join(__dirname, 'providers', 'indstream.js');
const EXTERNAL_MODULES = ['cheerio-without-node-native', 'react-native-cheerio', 'cheerio', 'crypto-js', 'axios'];

function logSize() {
  const stats = fs.statSync(OUT);
  console.log('Built providers/indstream.js (' + (stats.size / 1024).toFixed(1) + ' KB)');
}

async function main() {
  const args = process.argv.slice(2);
  const options = {
    entryPoints: [ENTRY],
    bundle: true,
    outfile: OUT,
    format: 'cjs',
    platform: 'neutral',
    target: 'es2016',
    minify: args.includes('--minify'),
    sourcemap: false,
    external: EXTERNAL_MODULES,
    logLevel: 'warning',
    plugins: [
      {
        name: 'size-log',
        setup: function (build) {
          build.onEnd(function (result) {
            if (!result.errors.length) logSize();
          });
        },
      },
    ],
  };

  if (args.includes('--watch')) {
    const context = await esbuild.context(options);
    await context.watch();
    console.log('Watching src/indstream for changes...');
    return;
  }

  await esbuild.build(options);
}

main().catch(function (err) {
  console.error('Build failed:', err);
  process.exit(1);
});
