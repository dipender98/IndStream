#!/usr/bin/env node

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const ENTRY_DIR = path.join(ROOT, 'src', 'indstream');
const ENTRIES_DIR = path.join(ENTRY_DIR, 'entries');
const OUT_DIR = path.join(ROOT, 'providers');
const EXTERNAL_MODULES = ['cheerio-without-node-native', 'react-native-cheerio', 'cheerio', 'crypto-js', 'axios'];

function entryList() {
  const list = [{ entry: path.join(ENTRY_DIR, 'index.js'), out: path.join(OUT_DIR, 'indstream.js') }];
  if (fs.existsSync(ENTRIES_DIR)) {
    fs.readdirSync(ENTRIES_DIR).forEach(function (file) {
      if (file.endsWith('.js')) {
        const id = file.replace(/\.js$/, '');
        list.push({ entry: path.join(ENTRIES_DIR, file), out: path.join(OUT_DIR, id + '.js') });
      }
    });
  }
  return list;
}

async function main() {
  const args = process.argv.slice(2);
  const jobs = entryList();

  if (args.includes('--watch')) {
    // Watch the combined entry only; full rebuild via npm run build.
    const context = await esbuild.context({
      entryPoints: [jobs[0].entry],
      bundle: true,
      outfile: jobs[0].out,
      format: 'cjs',
      platform: 'neutral',
      target: 'es2016',
      minify: args.includes('--minify'),
      sourcemap: false,
      external: EXTERNAL_MODULES,
      logLevel: 'warning',
    });
    await context.watch();
    console.log('Watching src/indstream/index.js -> providers/indstream.js');
    return;
  }

  for (const job of jobs) {
    await esbuild.build({
      entryPoints: [job.entry],
      bundle: true,
      outfile: job.out,
      format: 'cjs',
      platform: 'neutral',
      target: 'es2016',
      minify: args.includes('--minify'),
      sourcemap: false,
      external: EXTERNAL_MODULES,
      logLevel: 'warning',
    });
    const stats = fs.statSync(job.out);
    console.log('Built ' + path.relative(ROOT, job.out) + ' (' + (stats.size / 1024).toFixed(1) + ' KB)');
  }
}

main().catch(function (err) {
  console.error('Build failed:', err);
  process.exit(1);
});
