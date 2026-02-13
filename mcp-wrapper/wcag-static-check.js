/**
 * WCAG Static CSS Contrast Checker
 *
 * Analysiert style.css OHNE laufende App. Prüft:
 * 1. Alle color:#fff / color:#000 Deklarationen gegen bekannte Hintergründe
 * 2. Alle CSS-Variablen-Paare (--text-* auf --bg-*)
 * 3. Fehlende ::placeholder-Regeln für Inputs
 * 4. Inline-Farbkombinationen (background: X; color: Y;)
 *
 * Exit-Code 0 = keine Probleme
 * Exit-Code 1 = Probleme gefunden
 *
 * Nutzung: node mcp-wrapper/wcag-static-check.js [--fix-suggestions]
 */
const fs = require('fs');
const path = require('path');

// === WCAG Contrast Math ===
function srgbToLinear(c) {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(r, g, b) {
    return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrastRatio(fg, bg) {
    const l1 = luminance(fg[0], fg[1], fg[2]);
    const l2 = luminance(bg[0], bg[1], bg[2]);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    return [parseInt(hex.substr(0, 2), 16), parseInt(hex.substr(2, 2), 16), parseInt(hex.substr(4, 2), 16)];
}

// === Theme-Variablen (Dark Theme als Standard) ===
const DARK_THEME = {
    '--bg-primary': '#0f1117',
    '--bg-secondary': '#181b25',
    '--bg-card': '#1a1e2e',
    '--bg-tertiary': '#2a2e42',
    '--bg-hover': '#2a2e42',
    '--text-primary': '#e8e9ed',
    '--text-secondary': '#b0b4c8',
    '--text-muted': '#9ba2b8',
    '--accent': '#6c5ce7',
    '--accent-text': '#c4b5fd',
    '--danger': '#e94560',
    '--success': '#4ecca3',
    '--warning': '#ffc107',
    '--info': '#00b4d8',
    '--border': '#2a2e42',
};

// Alle Hintergründe gegen die geprüft wird
const ALL_BACKGROUNDS = [
    ['--bg-primary', DARK_THEME['--bg-primary']],
    ['--bg-secondary', DARK_THEME['--bg-secondary']],
    ['--bg-card', DARK_THEME['--bg-card']],
    ['--bg-tertiary', DARK_THEME['--bg-tertiary']],
];

// === CSS Parsing ===
const cssFile = path.resolve(__dirname, '../renderer/css/style.css');
const css = fs.readFileSync(cssFile, 'utf-8');
const lines = css.split('\n');

let problems = [];
let warnings = [];

// --- Check 1: color:#fff / #000 auf expliziten Hintergründen ---
// Suche nach Regeln die sowohl background als auch color definieren
console.log('\n=== CHECK 1: Inline Farbkombinationen (background + color in einer Regel) ===\n');

// Parse CSS rules with both background and color
const ruleRegex = /([^{}]+)\{([^}]+)\}/g;
let match;
while ((match = ruleRegex.exec(css)) !== null) {
    const selector = match[1].trim();
    const body = match[2];

    // Suche background und color in derselben Regel
    const bgMatch = body.match(/background(?:-color)?:\s*(#[0-9a-fA-F]{3,8}|var\(--[^)]+\))/);
    const colorMatch = body.match(/(?:^|[;\s])color:\s*(#[0-9a-fA-F]{3,8}|var\(--[^)]+\))/);

    if (bgMatch && colorMatch) {
        let bgColor = bgMatch[1];
        let fgColor = colorMatch[1];

        // Resolve variables
        if (bgColor.startsWith('var(')) {
            const varName = bgColor.match(/var\((--[^),]+)/)[1];
            bgColor = DARK_THEME[varName] || null;
        }
        if (fgColor.startsWith('var(')) {
            const varName = fgColor.match(/var\((--[^),]+)/)[1];
            fgColor = DARK_THEME[varName] || null;
        }

        if (bgColor && fgColor && bgColor.startsWith('#') && fgColor.startsWith('#')) {
            const bg = hexToRgb(bgColor);
            const fg = hexToRgb(fgColor);
            const ratio = contrastRatio(fg, bg);

            if (ratio < 4.5) {
                const lineNum = css.substring(0, match.index).split('\n').length;
                problems.push({
                    check: 1,
                    line: lineNum,
                    selector,
                    ratio: ratio.toFixed(2),
                    fg: fgColor,
                    bg: bgColor,
                    msg: `${ratio.toFixed(2)}:1 — ${fgColor} auf ${bgColor}`
                });
                console.log(`  FAIL L${lineNum}: ${selector}`);
                console.log(`       ${ratio.toFixed(2)}:1 (min 4.5:1) | ${fgColor} auf ${bgColor}`);
            }
        }
    }
}
if (problems.filter(p => p.check === 1).length === 0) {
    console.log('  Alle Inline-Kombinationen bestanden.');
}

// --- Check 2: CSS-Variablen-Paarungen ---
console.log('\n=== CHECK 2: Text-Variablen auf allen Hintergründen ===\n');

const textVars = [
    ['--text-primary', DARK_THEME['--text-primary']],
    ['--text-secondary', DARK_THEME['--text-secondary']],
    ['--text-muted', DARK_THEME['--text-muted']],
    ['--accent-text', DARK_THEME['--accent-text']],
];

for (const [textName, textHex] of textVars) {
    const fg = hexToRgb(textHex);
    for (const [bgName, bgHex] of ALL_BACKGROUNDS) {
        const bg = hexToRgb(bgHex);
        const ratio = contrastRatio(fg, bg);
        const status = ratio >= 4.5 ? 'OK' : 'FAIL';
        if (ratio < 4.5) {
            problems.push({
                check: 2,
                msg: `${textName} (${textHex}) auf ${bgName} (${bgHex}): ${ratio.toFixed(2)}:1`
            });
        }
        console.log(`  ${status} ${ratio.toFixed(2)}:1 | ${textName} (${textHex}) auf ${bgName} (${bgHex})`);
    }
}

// --- Check 3: Alle color: #fff Stellen gegen ihren Kontext ---
console.log('\n=== CHECK 3: Alle color: #fff Deklarationen ===\n');

const whiteColorRegex = /color:\s*#fff\b/g;
let whiteMatch;
let whiteCount = 0;
let whiteOnAccent = 0;
let whiteOther = 0;
while ((whiteMatch = whiteColorRegex.exec(css)) !== null) {
    const lineNum = css.substring(0, whiteMatch.index).split('\n').length;
    const line = lines[lineNum - 1].trim();

    // Prüfe ob die Zeile oder der umgebende Block einen Hintergrund hat
    // Suche rückwärts nach background
    const blockStart = css.lastIndexOf('{', whiteMatch.index);
    const block = css.substring(blockStart, whiteMatch.index + 30);
    const bgInBlock = block.match(/background(?:-color)?:\s*(#[0-9a-fA-F]{3,8}|var\(--[^)]+\))/);

    whiteCount++;
    if (bgInBlock) {
        let bgColor = bgInBlock[1];
        if (bgColor.startsWith('var(')) {
            const varName = bgColor.match(/var\((--[^),]+)/)[1];
            bgColor = DARK_THEME[varName] || bgColor;
        }
        if (bgColor.startsWith('#')) {
            const bg = hexToRgb(bgColor);
            const ratio = contrastRatio([255, 255, 255], bg);
            if (ratio < 4.5) {
                problems.push({ check: 3, line: lineNum, ratio: ratio.toFixed(2), bg: bgColor });
                console.log(`  FAIL L${lineNum}: #fff auf ${bgColor} = ${ratio.toFixed(2)}:1`);
                console.log(`       ${line}`);
            } else {
                whiteOnAccent++;
            }
        }
    } else {
        whiteOther++;
    }
}
console.log(`  Gesamt: ${whiteCount} Stellen mit color:#fff`);
console.log(`  Davon ${whiteOnAccent} mit Hintergrund ≥4.5:1, ${whiteOther} ohne erkennbaren Hintergrund in derselben Regel`);

// --- Check 4: Placeholder-Regeln ---
console.log('\n=== CHECK 4: Placeholder-Styling ===\n');

const hasGlobalPlaceholder = css.includes('input::placeholder') || css.includes('::placeholder {');
if (hasGlobalPlaceholder) {
    console.log('  OK: Globale ::placeholder Regel vorhanden');
} else {
    problems.push({ check: 4, msg: 'Keine globale ::placeholder Regel gefunden' });
    console.log('  FAIL: Keine globale ::placeholder Regel gefunden');
}

// Prüfe ob die Placeholder-Farbe ausreichend Kontrast hat
const placeholderColorMatch = css.match(/::placeholder\s*\{[^}]*color:\s*(var\(--[^)]+\)|#[0-9a-fA-F]+)/);
if (placeholderColorMatch) {
    let phColor = placeholderColorMatch[1];
    if (phColor.startsWith('var(')) {
        const varName = phColor.match(/var\((--[^),]+)/)[1];
        phColor = DARK_THEME[varName] || phColor;
    }
    if (phColor.startsWith('#')) {
        const fg = hexToRgb(phColor);
        for (const [bgName, bgHex] of ALL_BACKGROUNDS) {
            const bg = hexToRgb(bgHex);
            const ratio = contrastRatio(fg, bg);
            const status = ratio >= 4.5 ? 'OK' : 'FAIL';
            if (ratio < 4.5) {
                problems.push({ check: 4, msg: `Placeholder ${phColor} auf ${bgName}: ${ratio.toFixed(2)}:1` });
            }
            console.log(`  ${status} Placeholder ${phColor} auf ${bgName} (${bgHex}): ${ratio.toFixed(2)}:1`);
        }
    }
}

// --- Check 5: Bekannte gefährliche Muster ---
console.log('\n=== CHECK 5: Gefährliche Muster ===\n');

// color: #fff auf danger/success/warning Hintergründen
const dangerousPatterns = [
    { pattern: /background:\s*var\(--danger\)[^}]*color:\s*#fff/g, label: '#fff auf --danger' },
    { pattern: /background:\s*var\(--success\)[^}]*color:\s*#fff/g, label: '#fff auf --success' },
    { pattern: /background:\s*var\(--warning\)[^}]*color:\s*#fff/g, label: '#fff auf --warning' },
    { pattern: /background:\s*#e94560[^}]*color:\s*#fff/g, label: '#fff auf #e94560' },
    { pattern: /background:\s*#ffa500[^}]*color:\s*#fff/g, label: '#fff auf #ffa500' },
];

let patternFails = 0;
for (const { pattern, label } of dangerousPatterns) {
    let m;
    while ((m = pattern.exec(css)) !== null) {
        const lineNum = css.substring(0, m.index).split('\n').length;
        problems.push({ check: 5, line: lineNum, msg: label });
        console.log(`  FAIL L${lineNum}: ${label}`);
        patternFails++;
    }
}
if (patternFails === 0) {
    console.log('  Keine gefährlichen Muster gefunden.');
}

// === Summary ===
console.log('\n' + '='.repeat(60));
console.log(`ZUSAMMENFASSUNG: ${problems.length} Probleme gefunden`);
if (problems.length > 0) {
    console.log('ERGEBNIS: NICHT BESTANDEN');
    for (const p of problems) {
        console.log(`  [Check ${p.check}] ${p.msg || `L${p.line}: ${p.ratio}:1`}`);
    }
} else {
    console.log('ERGEBNIS: BESTANDEN');
}
console.log('='.repeat(60));

process.exit(problems.length > 0 ? 1 : 0);
