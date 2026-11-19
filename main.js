const { Plugin, PluginSettingTab, Setting, Notice } = require('obsidian');

const DEFAULT_SETTINGS = { autoConvert: true, convertChemistry: true, convertEnglishLogicWords: false };

const ELEMENTS = new Set('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'.split(' '));

// Text that must never be touched: math, inline code, URLs, wiki links, LaTeX delimiters, HTML comments, calendar dates.
const PROTECTED = /(\$\$[\s\S]*?\$\$|\$[^$]*\$|`[^`]*`|https?:\/\/[^\s)]+|\[\[[^\]]*\]\]|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|<!--[\s\S]*?(?:-->|$)|\b\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}\b|\b\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}\b)/g;

function mapUnprotected(text, fn) {
	const parts = text.split(PROTECTED);
	let changed = false;
	const out = parts.map((part, i) => {
		if (i % 2 === 1 || !part) return part;
		const next = fn(part);
		if (next !== part) changed = true;
		return next;
	});
	return { text: out.join(''), changed };
}

/* ---------- Chemistry ---------- */

function parseCharge(word) {
	let m = word.match(/\^(\d{0,2}[+-])$/);
	if (m) return { core: word.slice(0, -m[0].length), charge: m[1] };
	// After a closing bracket, digits + sign are always the charge: [Cu(NH3)4]2+, (NaCl)2+
	m = word.match(/[)\]](\d{0,2}[+-])$/);
	if (m) return { core: word.slice(0, -m[1].length), charge: m[1] };
	m = word.match(/([A-Za-z])(\d{1,2})([+-])$/);
	if (m) {
		const els = word.match(/[A-Z][a-z]?/g) || [];
		if (els.length === 1) return { core: word.slice(0, -(m[2].length + m[3].length)), charge: m[2] + m[3] };
		const two = word.match(/([A-Za-z])(\d)(\d)([+-])$/);
		if (two) {
			const coreCandidate = word.slice(0, -2);
			if (isChemCore(coreCandidate)) return { core: coreCandidate, charge: two[3] + two[4] };
		}
		return { core: word.slice(0, -1), charge: m[3] };
	}
	m = word.match(/([+-])$/);
	if (m) return { core: word.slice(0, -1), charge: m[1] };
	return { core: word, charge: null };
}

function stripState(word) {
	const m = word.match(/\((aq|s|l|g)\)$/i);
	if (!m) return { core: word, state: null };
	return { core: word.slice(0, -m[0].length), state: m[1].toLowerCase() };
}

function scanChem(core) {
	let hasElement = false, elementCount = 0, hasNumber = false, hasGroup = false, valid = true, depth = 0;
	for (const token of core.split(/([A-Z][a-z]?|\d+|[()\[\]*·•.])/)) {
		if (!token) continue;
		if (/^[A-Z][a-z]?$/.test(token)) {
			if (!ELEMENTS.has(token)) { valid = false; break; }
			hasElement = true; elementCount++;
		} else if (/^\d+$/.test(token)) hasNumber = true;
		else if (token === '(' || token === '[') { depth++; hasGroup = true; }
		else if (token === ')' || token === ']') { depth--; if (depth < 0) { valid = false; break; } }
		else if (!/^[*·•.]$/.test(token)) { valid = false; break; }
	}
	if (depth !== 0) valid = false;
	return { hasElement, elementCount, hasNumber, hasGroup, valid };
}

function isChemCore(raw) {
	let core = raw;
	if (!core || /^\d+$/.test(core)) return false;
	const coeff = core.match(/^(\d+)(.*)$/);
	if (coeff) { if (!coeff[2]) return false; core = coeff[2]; }
	const s = scanChem(core);
	return s.valid && s.hasElement && (s.hasNumber || s.hasGroup);
}

function isChemFormula(word) {
	if (!word || word.length < 2) return false;
	const stripped = stripState(word);
	const parsed = parseCharge(stripped.core);
	let body = parsed.core;
	if (!body || /^\d+$/.test(body)) return false;
	const coeff = body.match(/^(\d+)(.*)$/);
	if (coeff) { if (!coeff[2]) return false; body = coeff[2]; }
	const s = scanChem(body);
	if (!s.valid || !s.hasElement) return false;
	// A digit, charge, state or bracket is required: CO, ISO, OK, He, NaCl stay plain words.
	return s.hasNumber || s.hasGroup || !!parsed.charge || !!stripped.state;
}

function formatCoreChem(core) {
	let out = '';
	const coeff = core.match(/^(\d+)(.*)$/);
	if (coeff && coeff[2]) { out = coeff[1]; core = coeff[2]; }
	let text = '';
	const flush = () => { if (text) { out += `\\text{${text}}`; text = ''; } };
	for (const tok of core.split(/(\d+|[()\[\]])/)) {
		if (!tok) continue;
		if (/^\d+$/.test(tok)) { flush(); out += `_{${tok}}`; }
		else if (/^[()\[\]]$/.test(tok)) { flush(); out += tok; }
		else text += tok;
	}
	flush();
	return out;
}

function formatChemFormula(word) {
	const stripped = stripState(word);
	const state = stripped.state ? `\\text{(${stripped.state})}` : '';
	const parsed = parseCharge(stripped.core);
	const charge = parsed.charge ? `^{${parsed.charge}}` : '';
	const parts = parsed.core.split(/[*·•]/);
	const body = parts.map((part, i) => {
		if (i === 0) return formatCoreChem(part);
		const cm = part.match(/^(\d+)(.*)$/);
		return cm ? `${cm[1]}${formatCoreChem(cm[2])}` : formatCoreChem(part);
	}).join(' \\cdot ');
	return `$${body}${charge}${state}$`;
}

/* ---------- Rules ---------- */

function buildRules(settings) {
	const rules = [
		// Fractions: digits not glued to a decimal point or another slash (2.0/3.1 and 1/2/2025 stay put).
		{ regex: /(?<![\d.\/])(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})(?![\d.\/])/g, replacer: (m, a, b, c) => `$\\frac{\\frac{${a}}{${b}}}{${c}}$` },
		{ regex: /(?<![\d.\/])(\d{1,3})\s*\/\s*(\d{1,3})(?![\d.\/])/g, replacer: (m, a, b) => `$\\frac{${a}}{${b}}$` },
		{ regex: /\bd([A-Za-z])\s*\/\s*d([A-Za-z])\b/g, replacer: (m, a, b) => `$\\frac{d${a}}{d${b}}$` },
		{ regex: /(?<![\w\/])([a-zA-Z])\s*\/\s*([a-zA-Z])(?![\w\/])/g, replacer: (m, a, b) => (m.toLowerCase() === 'e/o' ? m : `$\\frac{${a}}{${b}}$`) },
		{ regex: /\broot\(([^,()]+)\s*,\s*([^()]+)\)/g, replacer: (m, i, r) => `$\\sqrt[${i.trim()}]{${r.trim()}}$` },
		{ regex: /\bsqrt\(([^()]+)\)/g, replacer: (m, c) => `$\\sqrt{${c}}$` },
		{ regex: /<=>/g, replacer: '$\\rightleftharpoons$' },
		{ regex: /<->/g, replacer: '$\\leftrightarrow$' },
		{ regex: /-->/g, replacer: '$\\longrightarrow$' },
		{ regex: /(?<![\-\w])-?->/g, replacer: '$\\rightarrow$' },
		{ regex: /<--/g, replacer: '$\\longleftarrow$' },
		{ regex: /(?<![<\w])<-(?!-)/g, replacer: '$\\leftarrow$' },
		{ regex: /==>/g, replacer: '$\\Longrightarrow$' },
		{ regex: /(?<!=)=>/g, replacer: '$\\Rightarrow$' },
		{ regex: /\bpropto\b/g, replacer: '$\\propto$' },
		{ regex: /(\b\d+)\s+[xX]\s+(\d+\b)/g, replacer: (m, a, b) => `${a} $\\times$ ${b}` },
		{ regex: /(?<=\d)\s+\*\s+(?=\d)/g, replacer: ' $\\times$ ' },
		{ regex: /(?<=\d)\s+div\s+(?=\d)/g, replacer: ' $\\div$ ' },
		{ regex: /~~|\bapprox\b/g, replacer: '$\\approx$' },
		{ regex: /!=/g, replacer: '$\\neq$' },
		{ regex: /<=|=</g, replacer: '$\\leq$' },
		{ regex: />=/g, replacer: '$\\geq$' },
		{ regex: /\+-/g, replacer: '$\\pm$' },
		{ regex: /-\+/g, replacer: '$\\mp$' },
	];
	if (settings.convertChemistry) {
		rules.push(
			{ regex: /(?<![\w\-])e-(?![\w\-])/g, replacer: '$e^{-}$' },
			{ regex: /(?<![A-Za-z0-9])([A-Z0-9(\[][A-Za-z0-9()\[\]*·•^+-]*)(?![A-Za-z0-9])/g, replacer: (m) => (isChemFormula(m) ? formatChemFormula(m) : m) },
		);
	}
	rules.push(
		{ regex: /(?<![\p{L}\p{N}])([a-zA-Z0-9]+)\^([a-zA-Z0-9-]+)(?![\p{L}\p{N}])/gu, replacer: (m, b, e) => `$${b}^{${e}}$` },
		{ regex: /(?<![\p{L}\p{N}])([a-zA-Z])_([a-zA-Z0-9]+)(?![\p{L}\p{N}])/gu, replacer: (m, b, s) => `$${b}_{${s}}$` },
		{ regex: /\b(sin|cos|tan|log|ln|lim)\(([^()]*)\)/g, replacer: (m, f, a) => `$\\${f}(${a})$` },
		{ regex: /(?<![\p{L}\p{N}])(sin|cos|tan|log|ln|lim)(?=\(|_|\^)/gu, replacer: (m, f) => `$\\${f}$` },
		{ regex: /(?<![\p{L}\p{N}])(pi|theta|lambda|alpha|beta|gamma|sigma|Sigma|phi|omega|delta|Delta)(?![\p{L}\p{N}])/gu, replacer: (m, l) => `$\\${l}$` },
		{ regex: /\b[oO]hm\b/g, replacer: '$\\Omega$' },
		{ regex: /\bmicro\b/g, replacer: '$\\mu$' },
		{ regex: /\bdeg\b/g, replacer: '$^\\circ$' },
		{ regex: /\binfinity\b|\binf\b/g, replacer: '$\\infty$' },
		{ regex: /\btherefore\b/g, replacer: '$\\therefore$' },
		{ regex: /\bnotin\b/g, replacer: '$\\notin$' },
	);
	if (settings.convertEnglishLogicWords) {
		// Ordinary English words: only when the user opts in.
		rules.push(
			{ regex: /\bbecause\b/g, replacer: '$\\because$' },
			{ regex: /\bunion\b|\bcup\b/g, replacer: '$\\cup$' },
			{ regex: /\bintersect\b|\bcap\b/g, replacer: '$\\cap$' },
			{ regex: /\bsubset\b/g, replacer: '$\\subset$' },
			{ regex: /\bmember\b/g, replacer: '$\\in$' },
		);
	} else {
		// "subset" is rarely ordinary English, keep it on by default as documented.
		rules.push({ regex: /\bsubset\b/g, replacer: '$\\subset$' });
	}
	return rules;
}

function convertLine(lineText, settings) {
	const rules = buildRules(Object.assign({}, DEFAULT_SETTINGS, settings));
	let text = lineText, changed = false;
	for (const rule of rules) {
		const result = mapUnprotected(text, (plain) => plain.replace(rule.regex, rule.replacer));
		if (result.changed) { text = result.text; changed = true; }
	}
	return { text, changed };
}

/* ---------- Editor helpers ---------- */

function blockContext(editor, lineNo) {
	let fence = null;
	const first = editor.getLine(0);
	let inFrontmatter = first !== undefined && first.trim() === '---' && lineNo > 0;
	if (lineNo === 0 && first !== undefined && first.trim() === '---') return 'frontmatter';
	for (let i = inFrontmatter ? 1 : 0; i <= lineNo; i++) {
		const line = editor.getLine(i);
		if (inFrontmatter) {
			if (i === lineNo) return 'frontmatter';
			if (/^(---|\.\.\.)\s*$/.test(line)) inFrontmatter = false;
			continue;
		}
		const m = line.match(/^\s*(?:>\s*)*(`{3,}|~{3,})/);
		if (fence) {
			if (i === lineNo) return 'code';
			if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
			continue;
		}
		if (m) { if (i === lineNo) return 'code'; fence = m[1]; }
	}
	return 'none';
}

class MathifySettingTab extends PluginSettingTab {
	constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
	display() {
		const { containerEl } = this;
		containerEl.empty();
		const s = this.plugin.settings;
		new Setting(containerEl).setName('Convert as you type').setDesc('Press Space to convert the current line.')
			.addToggle((t) => t.setValue(s.autoConvert).onChange(async (v) => { s.autoConvert = v; await this.plugin.saveSettings(); }));
		new Setting(containerEl).setName('Chemistry formulas').setDesc('Detect H2O, Ca(OH)2, SO4^2-, [Cu(NH3)4]2+, hydrates, states.')
			.addToggle((t) => t.setValue(s.convertChemistry).onChange(async (v) => { s.convertChemistry = v; await this.plugin.saveSettings(); }));
		new Setting(containerEl).setName('English logic words').setDesc('Also convert because, union, cup, intersect, cap, member, beta. Off by default.')
			.addToggle((t) => t.setValue(s.convertEnglishLogicWords).onChange(async (v) => { s.convertEnglishLogicWords = v; await this.plugin.saveSettings(); }));
	}
}

class MathShorthandPlugin extends Plugin {
	async onload() {
		await this.loadSettings();
		this.isConverting = false;
		this.lastUndo = null;
		this.addCommand({ id: 'convert-shorthand-math', name: 'Convert math shorthand in current line', editorCallback: (editor) => this.runConvert(editor) });
		this.addCommand({ id: 'convert-selection', name: 'Convert math shorthand in selection', editorCallback: (editor) => this.convertSelection(editor) });
		this.addCommand({ id: 'convert-note', name: 'Convert math shorthand in whole note', editorCallback: (editor) => this.convertNote(editor) });
		this.addSettingTab(new MathifySettingTab(this.app, this));
		this.registerEvent(this.app.workspace.on('editor-change', (editor) => {
			if (!this.settings.autoConvert || this.isConverting) return;
			if (editor.listSelections && editor.listSelections().length !== 1) return;
			const cursor = editor.getCursor();
			const lineText = editor.getLine(cursor.line);
			if (cursor.ch > 0 && lineText[cursor.ch - 1] === ' ') this.runConvert(editor);
		}));
	}
	runConvert(editor) {
		this.isConverting = true;
		try { this.convertMathInCurrentLine(editor); }
		catch (e) { console.error('Mathify Notes:', e); }
		finally { this.isConverting = false; }
	}
	convertMathInCurrentLine(editor) {
		const cursor = editor.getCursor();
		if (blockContext(editor, cursor.line) !== 'none') return;
		const lineText = editor.getLine(cursor.line);
		// Only convert text before the cursor so a half-typed word after it is never touched.
		const before = lineText.slice(0, cursor.ch);
		const result = convertLine(before, this.settings);
		if (!result.changed) return;
		editor.replaceRange(result.text, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: cursor.ch });
		editor.setCursor({ line: cursor.line, ch: result.text.length });
	}
	convertSelection(editor) {
		const from = editor.getCursor('from'), to = editor.getCursor('to');
		if (from.line === to.line && from.ch === to.ch) { new Notice('Select some text first.'); return; }
		const lines = [];
		let count = 0;
		for (let l = from.line; l <= to.line; l++) {
			const text = editor.getLine(l);
			const a = l === from.line ? from.ch : 0, b = l === to.line ? to.ch : text.length;
			if (blockContext(editor, l) !== 'none') { lines.push(text.slice(a, b)); continue; }
			const r = convertLine(text.slice(a, b), this.settings);
			if (r.changed) count++;
			lines.push(r.text);
		}
		if (!count) { new Notice('Nothing to convert.'); return; }
		editor.replaceRange(lines.join('\n'), from, to);
		new Notice(`Converted ${count} line${count === 1 ? '' : 's'}.`);
	}
	convertNote(editor) {
		const out = [];
		let count = 0;
		for (let l = 0; l < editor.lineCount(); l++) {
			const text = editor.getLine(l);
			if (blockContext(editor, l) !== 'none') { out.push(text); continue; }
			const r = convertLine(text, this.settings);
			if (r.changed) count++;
			out.push(r.text);
		}
		if (!count) { new Notice('Nothing to convert.'); return; }
		// One editor transaction, so a single Ctrl/Cmd+Z undoes the whole conversion.
		editor.setValue(out.join('\n'));
		new Notice(`Converted ${count} line${count === 1 ? '' : 's'}. Undo with Ctrl/Cmd+Z.`);
	}
	async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
	async saveSettings() { await this.saveData(this.settings); }
}

MathShorthandPlugin.__test = { convertLine, isChemFormula };
module.exports = MathShorthandPlugin;
