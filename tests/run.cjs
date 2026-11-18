// Usage: node run.cjs <plugin main.js>
// Loads the plugin with a stub 'obsidian' module and runs the conversion over test lines.
const Module = require('module');
const path = require('path');
const origLoad = Module._load;
class Stub { constructor() {} }
Module._load = function (req, ...rest) {
  if (req === 'obsidian') return { Plugin: Stub, PluginSettingTab: Stub, Setting: Stub, Notice: Stub, MarkdownView: Stub };
  return origLoad.call(this, req, ...rest);
};
const file = path.resolve(process.argv[2]);
const Plugin = require(file);
const convert = Plugin.__test && Plugin.__test.convertLine;
if (!convert) { console.error('plugin does not expose __test.convertLine'); process.exit(2); }

const S = { autoConvert: true, convertChemistry: true, convertEnglishLogicWords: false };
const should = [
  'H2O', 'CO2', 'Ca(OH)2', 'SO4^2-', 'SO42-', 'NO3-', 'Cu2+', 'CuSO4*5H2O', 'H2O(l)', 'H2 + O2 --> H2O',
  '1/2', 'x^2', 'x_i', 'sqrt(x)', 'root(3, x)', 'dy/dx', 'dT/dt', '!=', '<=', '>=', '~~', '+-', 'pi', 'theta', 'inf',
  'log(x)', 'sin(x)', 'therefore', 'subset', '->', '-->', '<-', '=>', '<=>', 'Fe3+', 'Fe^3+', 'e-', '[Cu(NH3)4]2+',
];
const shouldNot = [
  'He', 'As', 'US', 'CO', 'Fe', 'because I said so', 'Meeting on 12/03/2026', 'Due 1/1/2025', 'See 2026/09/18',
  'The word log in a sentence', 'union workers', 'intersect the road', '`H2O` stays code', '`1/2` stays code',
  'Visit https://github.com/katananananna/obsidian-mathify-notes for docs', 'Already $x^2$ done', 'ISO 9001 and IME',
  'I am OK', 'A cup of tea', 'He is a member', 'Version 2.0/3.1', 'Go to <!-- H2O --> here', 'See [[H2O notes]]',
];
let fail = 0;
for (const t of should) {
  const r = convert(t, S);
  const ok = r.changed && r.text.includes('$');
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} convert   ${JSON.stringify(t)} -> ${JSON.stringify(r.text)}`);
}
for (const t of shouldNot) {
  const r = convert(t, S);
  const ok = !r.changed;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} keep      ${JSON.stringify(t)} -> ${JSON.stringify(r.text)}`);
}
// Idempotence: converting already-converted text must not change it again.
for (const t of should) {
  const once = convert(t, S).text;
  const twice = convert(once, S);
  if (twice.changed) { fail++; console.log(`FAIL idempotent ${JSON.stringify(once)} -> ${JSON.stringify(twice.text)}`); }
}
const off = convert('H2O', { ...S, convertChemistry: false });
if (off.changed) { fail++; console.log('FAIL chemistry toggle off still converts H2O'); }
const on = convert('because', { ...S, convertEnglishLogicWords: true });
if (!on.changed) { fail++; console.log('FAIL logic words on does not convert because'); }
console.log(`\n${fail} failure(s)`);
process.exit(fail ? 1 : 0);
