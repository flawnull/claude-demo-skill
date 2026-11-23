// Style rules for a film. Errors block the render; warnings are reported.

const RULES = [
  { id: "css-transition", level: "error", re: /(^|[\s;{"'])transition(-[a-z]+)?\s*:/m, msg: "CSS transitions are banned: animate in renderFrame(t) with Motion.spring or Motion.tween" },
  { id: "css-animation", level: "error", re: /@keyframes|(^|[\s;{"'])animation(-[a-z]+)?\s*:/m, msg: "CSS animations are banned: every frame must come from renderFrame(t)" },
  { id: "realtime", level: "error", re: /requestAnimationFrame|setTimeout|setInterval|Date\.now|performance\.now|new Date\(/, msg: "real-time clocks are banned: the film is a pure function of t" },
  { id: "random", level: "error", re: /Math\.random/, msg: "unseeded random is banned: use Motion.rng(seed)" },
  { id: "web-animations", level: "error", re: /\.animate\(/, msg: "the Web Animations API is banned: use renderFrame(t)" },
  { id: "lorem", level: "error", re: /lorem ipsum|dolor sit amet|consectetur adipiscing/i, msg: "no lorem ipsum: rebuild real screens with real, specific values" },
  { id: "synth-sound", level: "error", re: /AudioContext|createOscillator|OscillatorNode|aevalsrc|anoisesrc|sine=f/, msg: "no sounds made in code: use recorded files from the SFX library" },
  { id: "frosted-glass", level: "warning", re: /backdrop-filter\s*:[^;]*blur\(/, msg: "frosted blur glass is the default AI look: use clear glass (Motion.glass) over busy detail, or a flat card" },
  { id: "gradient", level: "warning", re: /(linear|radial)-gradient\(/, msg: "gradient washes read as generated: one flat background from the palette" },
  { id: "plain-chart", level: "warning", re: /conic-gradient\(|stroke-dasharray|class=["'][^"']*\b(donut|pie|bar-?chart)\b/, msg: "a plain chart: give the number a face instead (a character that eats, steals or bites it)" },
  { id: "vanity-stat", level: "warning", re: />[^<]*(\b(99|100)(\.9)?%|\b\d+(\.\d)?[KkMm]\+|\$\d{1,3}(,000)+(?![\d.,])|\b10x\b)[^<]*</, msg: "a round placeholder number: use the real, specific value (odd cents, real dates)" },
  { id: "network", level: "error", re: /(src|href)=["']https?:\/\/|fetch\(|@import\s+url\(["']?https?:/, msg: "renders never fetch: put fonts, images and media in assets/" },
];

/** files: [{ path, text }]. refs: list of files in assets/ref. */
export function lint(files, refs = []) {
  const findings = [];
  for (const f of files) {
    const text = f.path.endsWith("motion.js") ? "" : stripComments(f.text);
    for (const r of RULES) {
      const lines = text.split("\n");
      lines.forEach((line, n) => {
        if (r.re.test(line)) findings.push({ level: r.level, rule: r.id, file: f.path, line: n + 1, msg: r.msg });
      });
    }
  }
  const all = files.map((f) => stripComments(f.text)).join("\n");

  // rule 1: one background, one accent, one colour that means bad news, two fonts, for the whole film
  const pal = /palette\s*[:=]\s*\{([^}]*)\}/.exec(all);
  const body = pal ? pal[1] : "";
  const key = (re) => new RegExp(`(^|[\\s,{])["']?(${re})["']?\\s*:\\s*["']#[0-9a-fA-F]{3,8}`).test(body);
  if (!pal || !key("bg|background") || !key("accent") || !key("bad|danger|loss|negative|alert"))
    findings.push({ level: "error", rule: "palette", msg: "declare palette: { bg, accent, bad, ... }: one background, one accent and one colour that means bad news, kept for the whole film" });
  const fonts = new Set();
  for (const m of all.matchAll(/font-family\s*:\s*([^;}"\n]+|"[^"]+")/g)) fonts.add(firstFamily(m[1]));
  for (const m of all.matchAll(/(^|[\s;{])font\s*:\s*([^;}\n]+)/g)) {
    const fam = /\d[\d.]*(px|em|rem|vmin|vh|vw|%)(\/[\d.]+[a-z%]*)?\s+(.+)$/.exec(m[2].trim());
    if (fam) fonts.add(firstFamily(fam[3]));
  }
  fonts.delete("");
  ["sans-serif", "serif", "monospace", "system-ui", "inherit", "cursive"].forEach((g) => fonts.delete(g));
  if (fonts.size > 2) findings.push({ level: "error", rule: "fonts", msg: `use two fonts for the whole film, found ${fonts.size}: ${[...fonts].join(", ")}` });

  // one look: no colour outside the palette (greys, black, white and tints of palette colours are fine)
  const palHex = new Set([...body.matchAll(/#([0-9a-fA-F]{3,8})\b/g)].map((m) => rgbOf(m[1]).join(",")));
  for (const f of files) {
    if (f.path.endsWith("motion.js")) continue;
    stripComments(f.text).split("\n").forEach((line, n) => {
      if (/palette\s*[:=]\s*\{/.test(line)) return;
      const seen = [
        ...[...line.matchAll(/(?:[:(,]\s*|["'\s])#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![\w-])/g)].map((m) => [m[0].trim(), rgbOf(m[1])]),
        ...[...line.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)].map((m) => [m[0], [+m[1], +m[2], +m[3]]]),
      ];
      for (const [txt, rgb] of seen) {
        if (Math.max(...rgb) - Math.min(...rgb) <= 12 || palHex.has(rgb.join(","))) continue;
        findings.push({ level: "error", rule: "off-palette", file: f.path, line: n + 1, msg: `${txt.replace(/^[:(,\s"']+/, "")} is not in the palette: one background, one accent, one bad-news colour for the whole film` });
      }
      // glow: a coloured shadow
      for (const m of line.matchAll(/(box-shadow|text-shadow)\s*:[^;"]*|drop-shadow\([^)]*\)/g)) {
        const cols = [...m[0].matchAll(/#([0-9a-fA-F]{3,8})\b|rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)|var\(--(accent|bad)\)/g)];
        if (cols.some((c) => c[5] || (c[1] ? spread(rgbOf(c[1])) : spread([+c[2], +c[3], +c[4]])) > 12))
          findings.push({ level: "warning", rule: "glow", file: f.path, line: n + 1, msg: "a coloured shadow is a glow, the default AI look: shadows are neutral, or none" });
      }
    });
  }

  // rule 3: straight-line, constant-speed moves look generated
  if (/tween\([^)]*["']linear["']\)|ease\.linear\(/.test(all))
    findings.push({ level: "warning", rule: "linear-motion", msg: "a linear tween moves at constant speed: use Motion.move (anticipation + spring) for anything that travels" });

  if (!refs.length) findings.push({ level: "error", rule: "reference-assets", msg: "assets/ref/ is empty: add real screenshots, logos or product images" });
  else if (!refs.some((r) => all.includes(r))) findings.push({ level: "error", rule: "reference-assets", msg: "no file from assets/ref/ is used on screen" });

  const gradient = /background(-image)?\s*:[^;]*(linear|radial)-gradient/.test(all);
  const centered = /text-align\s*:\s*center/.test(all);
  if (gradient && centered) findings.push({ level: "warning", rule: "centered-gradient", msg: "centered text on a gradient is the default AI look: anchor type to a grid edge and show a real asset" });

  if (!/kinetic\(|splitWords\(/.test(all)) findings.push({ level: "warning", rule: "kinetic-type", msg: "no kinetic type: use Motion.kinetic on at least the headline" });
  if (!/spring\(|springUnit\(|kinetic\(/.test(all)) findings.push({ level: "error", rule: "physics", msg: "no spring motion: moves must use Motion.spring (closed form)" });
  return findings;
}

function rgbOf(hex) {
  const h = hex.length <= 4 ? [...hex.slice(0, 3)].map((c) => c + c).join("") : hex.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
const spread = (rgb) => Math.max(...rgb) - Math.min(...rgb);

function firstFamily(list) {
  return list.split(",")[0].trim().replace(/^["']|["']$/g, "").toLowerCase();
}

function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:"'])\/\/.*$/gm, "$1").replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
}
