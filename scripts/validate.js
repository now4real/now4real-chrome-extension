const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

if (manifest.manifest_version !== 3) {
  throw new Error('manifest_version must be 3');
}

const requiredFiles = [
  manifest.action.default_popup,
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action.default_icon || {}),
  manifest.options_ui.page,
  ...manifest.content_scripts.flatMap((script) => script.js),
  ...manifest.web_accessible_resources.flatMap((resource) => resource.resources)
];

for (const file of requiredFiles) {
  const absolutePath = path.join(root, file);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing referenced file: ${file}`);
  }
}

for (const file of ['src/content.js', 'src/page-bridge.js', 'src/settings.js']) {
  const code = fs.readFileSync(path.join(root, file), 'utf8');
  new vm.Script(code, { filename: file });
}

console.log('Extension files look valid.');
