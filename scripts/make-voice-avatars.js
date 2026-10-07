#!/usr/bin/env node
/**
 * Draws the portraits for the assistant's built-in voices into public/voices/<key>.svg.
 * Run it again after changing a look below:  node scripts/make-voice-avatars.js
 * (arthur.svg and ivanna.svg are drawn by hand and are not touched.)
 */
const fs = require("fs");
const path = require("path");

const SKIN = { light: ["#f3c7a6", "#e2ab88"], fair: ["#f0bfa0", "#dba585"], tan: ["#d9a276", "#c48a5e"], brown: ["#b97a4f", "#a1663e"], deep: ["#8a5a3c", "#74482e"] };

// key: [background from, to, skin, hair colour, hair style, shirt, extras…]
const LOOKS = {
  "marathi-male": ["#fbbf24", "#d97706", "brown", "#1c1512", "side", "#f8fafc", "moustache"],
  "marathi-female": ["#f9a8d4", "#be185d", "brown", "#1c1512", "bun", "#fde68a", "bindi", "earrings"],
  "hindi-male": ["#fdba74", "#c2410c", "tan", "#1c1512", "short", "#1e3a8a", "glasses"],
  "hindi-female": ["#c4b5fd", "#6d28d9", "tan", "#231815", "long", "#fef3c7", "earrings"],
  "english-america-male": ["#93c5fd", "#1d4ed8", "fair", "#7a4a26", "side", "#e2e8f0"],
  "english-america-female": ["#5eead4", "#0f766e", "light", "#b9793a", "bob", "#f8fafc"],
  "africa-male": ["#86efac", "#15803d", "deep", "#14100e", "buzz", "#fde047", "beard"],
  "africa-female": ["#fcd34d", "#b45309", "deep", "#14100e", "curly", "#f8fafc", "earrings"],
  "spanish-male": ["#fca5a5", "#b91c1c", "tan", "#2a1a12", "curly", "#f8fafc", "beard"],
  "spanish-female": ["#fdba74", "#be123c", "fair", "#3a2114", "long", "#fff7ed"],
  "arabic-male": ["#a7f3d0", "#047857", "tan", "#1c1512", "short", "#f8fafc", "beard"],
  "arabic-female": ["#bae6fd", "#0369a1", "tan", "#1c1512", "long", "#ecfeff", "earrings"],
  "chinese-male": ["#fecaca", "#dc2626", "light", "#111111", "short", "#1f2937", "glasses"],
  "chinese-female": ["#fbcfe8", "#db2777", "light", "#111111", "bob", "#f8fafc"],
  "english-british-male": ["#cbd5e1", "#334155", "light", "#c08a4a", "side", "#0f172a", "glasses"],
  "english-british-female": ["#ddd6fe", "#4338ca", "fair", "#8a3b1e", "bun", "#f1f5f9"],
  "portuguese-male": ["#bbf7d0", "#166534", "tan", "#2a1a12", "side", "#fef9c3"],
  "portuguese-female": ["#fde68a", "#15803d", "brown", "#2a1a12", "curly", "#f0fdf4", "earrings"],
};

const FEMALE_STYLES = new Set(["long", "bob", "bun"]);

function hairBehind(style, female, c) {
  if (!female) return "";
  if (style === "long") return `<path d="M22 46c0-20 11-32 26-32s26 12 26 32c0 16 3 28 6 38H16c3-10 6-22 6-38z" fill="${c}"/>`;
  if (style === "bob") return `<path d="M24 44c0-18 10-29 24-29s24 11 24 29c0 9 1 15 2 21H22c1-6 2-12 2-21z" fill="${c}"/>`;
  if (style === "bun") return `<circle cx="48" cy="13" r="9" fill="${c}"/><path d="M27 44c0-16 9-27 21-27s21 11 21 27v8H27z" fill="${c}"/>`;
  // curly
  return [[26, 34, 11], [34, 22, 11], [48, 17, 12], [62, 22, 11], [70, 34, 11], [22, 48, 10], [74, 48, 10], [24, 62, 9], [72, 62, 9]]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`).join("");
}

function hairFront(style, female, c) {
  if (female) {
    if (style === "curly") return [[36, 27, 8], [48, 24, 9], [60, 27, 8]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`).join("");
    if (style === "bob") return `<path d="M30 45c-1-15 6-25 18-25s19 10 18 25c-2-8-6-13-10-15-8 3-18 3-22 1-2 3-3 8-4 14z" fill="${c}"/>`;
    return `<path d="M30 46c-1-16 6-26 18-26 13 0 20 9 18 26-3-9-9-14-20-15-6 5-12 8-16 15z" fill="${c}"/>`;
  }
  if (style === "buzz") return `<path d="M31 41c-1-13 6-20 17-20s18 7 17 20c-2-6-5-9-9-10-5 1-11 1-16 0-4 1-7 4-9 10z" fill="${c}" opacity=".85"/>`;
  if (style === "curly") return [[34, 28, 7], [42, 23, 8], [52, 22, 8], [61, 27, 7], [31, 36, 5], [65, 36, 5]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`).join("");
  if (style === "side") return `<path d="M30 45c-3-18 7-27 19-27 11 0 19 8 17 25-3-8-8-12-19-12-7 0-13 4-17 14z" fill="${c}"/>`;
  return `<path d="M30 43c-2-16 6-25 18-25s20 9 18 25c-2-7-5-11-9-12-6 2-14 2-20 0-3 2-5 6-7 12z" fill="${c}"/>`;
}

function draw(key, [bg1, bg2, skinKey, hair, style, shirt, ...extras]) {
  const female = FEMALE_STYLES.has(style) || key.endsWith("-female");
  const [skin, shade] = SKIN[skinKey];
  const has = (x) => extras.includes(x);
  const label = key.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="${label} voice portrait">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient></defs>
  <rect width="96" height="96" fill="url(#bg)"/>
  ${hairBehind(style, female, hair)}
  <path d="M12 96c2-16 15-24 36-24s34 8 36 24z" fill="${shirt}"/>
  <path d="M38 72c3 6 17 6 20 0l2 4c-4 8-20 8-24 0z" fill="#000" opacity=".1"/>
  <path d="M41 58h14v14c-3 4-11 4-14 0z" fill="${shade}"/>
  ${female ? "" : `<ellipse cx="30.5" cy="48" rx="3" ry="5" fill="${shade}"/><ellipse cx="65.5" cy="48" rx="3" ry="5" fill="${shade}"/>`}
  <path d="M31 42c0-12 7-19 17-19s17 7 17 19v6c0 12-8 21-17 21s-17-9-17-21z" fill="${skin}"/>
  ${has("beard") ? `<path d="M31 50c1 12 8 19 17 19s16-7 17-19c-2 7-5 10-8 11-3-3-15-3-18 0-3-1-6-4-8-11z" fill="${hair}" opacity=".8"/>` : ""}
  ${hairFront(style, female, hair)}
  <path d="M35.5 44c2-1.500 5-1.500 7 0M53.500 44c2-1.500 5-1.500 7 0" fill="none" stroke="${hair}" stroke-width="${female ? 1.6 : 2}" stroke-linecap="round"/>
  <ellipse cx="39" cy="48.500" rx="2" ry="2.200" fill="#221a15"/><ellipse cx="57" cy="48.500" rx="2" ry="2.200" fill="#221a15"/>
  ${has("glasses") ? `<g fill="none" stroke="#1f2937" stroke-width="1.6"><rect x="33" y="44" width="12" height="9" rx="3.500"/><rect x="51" y="44" width="12" height="9" rx="3.500"/><path d="M45 47.500h6"/></g>` : ""}
  <path d="M48 50v5.500l-2 1.500h4" fill="none" stroke="${shade}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  ${has("moustache") ? `<path d="M41 59.500c3-2.500 5-2.500 7-1 2-1.500 4-1.500 7 1-3 1-5 1-7 0-2 1-4 1-7 0z" fill="${hair}"/>` : ""}
  <path d="M42.500 ${has("moustache") ? 63 : 61.500}c3 ${female ? 3 : 2} 8 ${female ? 3 : 2} 11 0" fill="none" stroke="${female ? "#b5483f" : "#6b3b2a"}" stroke-width="${female ? 2.200 : 1.800}" stroke-linecap="round"/>
  ${has("bindi") ? `<circle cx="48" cy="39.500" r="1.300" fill="#b91c1c"/>` : ""}
  ${has("earrings") ? `<circle cx="31" cy="55" r="1.800" fill="#fbbf24"/><circle cx="65" cy="55" r="1.800" fill="#fbbf24"/>` : ""}
</svg>
`.replace(/(\d)\.(\d)00\b/g, "$1.$2").replace(/\n\s*\n/g, "\n");
}

const dir = path.join(__dirname, "..", "public", "voices");
fs.mkdirSync(dir, { recursive: true });
for (const [key, look] of Object.entries(LOOKS)) fs.writeFileSync(path.join(dir, `${key}.svg`), draw(key, look));
console.log(`Drew ${Object.keys(LOOKS).length} portraits in public/voices`);
