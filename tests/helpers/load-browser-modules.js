const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBrowserModules(...files) {
  const context = { console, crypto };
  context.window = context;
  vm.createContext(context);
  files.forEach((file) => vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8'),
    context,
    { filename: file }
  ));
  return context;
}

module.exports = { loadBrowserModules };
