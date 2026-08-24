const fs = require('fs');
const path = require('path');

const distDirectory = path.resolve(__dirname, '..', 'dist');
if (!fs.existsSync(distDirectory)) {
  process.stdout.write('dist directory does not exist; nothing to clean.\n');
  process.exit(0);
}

const removableDirectories = fs.readdirSync(distDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /-unpacked$/i.test(entry.name))
  .map((entry) => path.join(distDirectory, entry.name));

for (const directory of removableDirectories) {
  fs.rmSync(directory, { recursive: true, force: true });
  process.stdout.write(`Removed temporary package directory: ${path.basename(directory)}\n`);
}

if (!removableDirectories.length) process.stdout.write('No temporary package directories found.\n');
