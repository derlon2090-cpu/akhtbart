import { readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const javascriptFiles = ['app.js'];
for (const directory of ['api', 'lib']) {
  const visit = path => {
    for (const entry of readdirSync(path)) {
      const file = join(path, entry);
      if (statSync(file).isDirectory()) visit(file);
      else if (file.endsWith('.js')) javascriptFiles.push(file);
    }
  };
  visit(directory);
}

for (const file of javascriptFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
}

const questionImages = readdirSync('images/questions').filter(file => file.endsWith('.svg'));
if (questionImages.length < 10) throw new Error('Expected at least 10 chemistry question illustrations.');
console.log(`Build checks passed: ${javascriptFiles.length} JavaScript files and ${questionImages.length} question illustrations.`);
