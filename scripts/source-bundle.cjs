const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const paths = execFileSync('git', ['ls-files','-z'], {encoding:'utf8'}).split('\0').filter(Boolean);
if (paths.some(path => path.startsWith('.env') && path !== '.env.example' || path.startsWith('.git/'))) throw new Error('Secret-bearing path rejected');
process.stdout.write(JSON.stringify(paths.map(file => ({file,encoding:'utf-8',data:fs.readFileSync(file,'utf8')}))));
