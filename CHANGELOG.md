# Changelog

## 1.6.3

Fixes broken releases 1.6.0 to 1.6.2: their main.js was incomplete, so the plugin did not load. Rebuilt from the last working converter (1.5.0) with these fixes:

- ISO-style dates (`2026/09/18`) are protected, not turned into fractions
- Decimals stay put: `2.0/3.1` is not a fraction
- All-caps words (`ISO`, `OK`) and element-only words (`NaCl`) need a digit, charge, bracket or state to convert
- Complex ions: `[Cu(NH3)4]2+` with brackets outside `\text`, charge after `)` or `]`
- `e-` becomes an electron; `e-mail` is untouched
- Any derivative: `dT/dt`, `dx/dt`
- `sin(x)`, `log(x)` keep their parentheses inside math
- `cup` and `member` only convert with English logic words on
- HTML comments, `\(...\)` and `\[...\]` are protected
- Only text before the cursor is converted while typing
- Fences with `~~~` and frontmatter are detected properly
- New commands: convert selection, convert whole note (one undo step)
- Release workflow now refuses to publish a truncated main.js and runs tests/run.cjs
# Changelog

## 1.6.0

Chemistry is a real parser now, not a single greedy regex.

- Complexes keep their brackets inside math: `(NaCl)2`, `[Cu(NH3)4]2+`
- Charges work in every common style: `Fe3+`, `Fe^3+`, `SO42-`, `SO4^2-`, `(NaCl)2 2+`
- After `)` or `]`, `2+` is a charge, never a subscript
- `H2 + O2 -> H2O` is a reaction, not H2+ and O2-
- `e-` becomes an electron
- `sin(x)` keeps the parentheses
- `cup` / `member` / `subset` only convert if English logic words are on
- Dates, ISO acronyms, IME, fences, comments still protected
- Commands: selection, whole note, undo last convert
