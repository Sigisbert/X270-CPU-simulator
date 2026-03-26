import fs from 'fs';
import https from 'https';
import path from 'path';

const files = [
  { url: 'https://raw.githubusercontent.com/Sigisbert/X270-CPU-simulator/main/src/App.tsx', dest: 'src/App.tsx' },
  { url: 'https://raw.githubusercontent.com/Sigisbert/X270-CPU-simulator/main/src/data/cpus.ts', dest: 'src/data/cpus.ts' },
  { url: 'https://raw.githubusercontent.com/Sigisbert/X270-CPU-simulator/main/src/index.css', dest: 'src/index.css' }
];

files.forEach(({url, dest}) => {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      fs.writeFileSync(dest, data);
      console.log(`Downloaded ${dest}`);
    });
  });
});
