#!/usr/bin/env node
// ios-icon-generator — generate-icon
// -----------------------------------------------------------------------------
// Genere plusieurs propositions d'icone d'app iOS a partir d'une description en
// langage naturel, via OpenAI (gpt-image-1). Zero dependance : Node 18+ suffit
// (fetch + fs sont natifs).
//
// Chaque proposition combine 3 axes DIFFERENTS (pas juste un rendu different du
// meme dessin) : un style de rendu, une PALETTE DE COULEUR, et un ANGLE CREATIF
// (quel motif/metaphore visuelle representer). C'est ce qui evite le piege du
// "8 fois le meme livre de recette orange, juste redessine differemment".
//
// Usage :
//   node scripts/generate-icon.mjs --prompt "app de recettes de cuisine, chaleureuse"
//        [--n 8]                  (nombre total d'icones, defaut : 8 -> les 8 variations)
//        [--only <label>]         (une seule variation precise, voir --list)
//        [--list]                 (affiche les variations disponibles et quitte)
//        [--out ./icons]
//        [--size 1024x1024]
//        [--quality high|medium|low]   (defaut: high)
//        [--no-collage]                (saute la planche-contact PNG)
//
// Cle lue depuis l'environnement (ou un fichier .env a la racine du repo) :
//   OPENAI_API_KEY   -> https://platform.openai.com/api-keys
//
// Sortie : des PNG (un par variation) dans --out, + collage.png (planche-contact
// en UNE image, via scripts/make-collage.mjs) + contact-sheet.html.
// -----------------------------------------------------------------------------

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// ---- .env minimal (pas de dependance dotenv) ---------------------------------

function loadDotEnv() {
  const envPath = path.join(REPO_ROOT, '.env');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (val && process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}

// ---- Petit parseur d'arguments ------------------------------------------------

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) flags[key] = true;
      else { flags[key] = next; i++; }
    }
  }
  return flags;
}

function die(msg) {
  console.error(`\n  ✖ ${msg}\n`);
  process.exit(1);
}

// ---- Les 8 variations : render x couleur x angle creatif, TOUTES differentes -
// Le but : forcer une vraie diversite visuelle, pas 8 rendus du meme dessin.
// `angle` dit a l'IA QUOI dessiner (le motif), independamment de la couleur —
// c'est ce qui evite de retomber sur "le meme objet evident" a chaque fois.

const VARIATIONS = [
  {
    label: 'flat-ember',
    render: 'flat modern vector illustration, bold clean shapes, subtle soft shadow only',
    color: 'warm ember red and burnt orange, cream highlights',
    angle: "the single most iconic tool or object used in this app, drawn literally and boldly",
  },
  {
    label: 'gradient-ocean',
    render: 'smooth modern gradient background, soft glossy highlight, contemporary SaaS look',
    color: 'deep ocean blue fading to teal, white highlight',
    angle: "an abstract geometric emblem or mark that captures the FEELING of this app — not a literal object",
  },
  {
    label: 'glass-berry',
    render: 'frosted glass / glassmorphism style, translucent layered shapes, soft blur highlights',
    color: 'berry purple and soft pink, translucent white',
    angle: "a nature-inspired motif (a plant, a fruit, a natural shape) connected to this app's theme",
  },
  {
    label: 'clay-forest',
    render: 'soft 3D clay / claymorphism render, rounded volumes, gentle studio lighting',
    color: 'forest green and mustard gold',
    angle: "a small friendly mascot-like character or creature (simplified, geometric, no face detail) representing this app",
  },
  {
    label: 'flat-sunshine',
    render: 'flat modern vector illustration, bold clean shapes, minimal gradient',
    color: 'bright sunshine yellow and warm coral',
    angle: "the core ACTION someone takes in this app, shown as a single dynamic symbol (not a static object)",
  },
  {
    label: 'mono-mint',
    render: 'minimal line-art / near-monochrome illustration with exactly one accent color',
    color: 'charcoal black and white, with a single mint green accent',
    angle: "an everyday object related to this app, reimagined in a surprising or unexpected way",
  },
  {
    label: 'gradient-midnight',
    render: 'smooth modern gradient background, soft glossy highlight, premium app look',
    color: 'midnight navy blue and gold',
    angle: "a bold, simplified silhouette shape that represents this app's core value or benefit",
  },
  {
    label: 'clay-coral',
    render: 'soft 3D clay / claymorphism render, rounded volumes, gentle studio lighting',
    color: 'coral pink and cream, no other colors',
    angle: "a playful abstract pattern or texture element related to this app's theme, used as the main shape",
  },
];

function buildPrompt(userPrompt, v) {
  return [
    `Design a single professional iOS app icon for an app described as: "${userPrompt}".`,
    `What to depict (creative direction — follow this, do NOT default to the most generic/obvious illustration): ${v.angle}.`,
    `Color palette — use ONLY these colors, do not default to any other palette: ${v.color}.`,
    `Rendering style: ${v.render}.`,
    'Strict rules: one single clear focal symbol or motif, centered, filling the frame edge-to-edge in a perfect 1:1 square composition.',
    'Absolutely NO text, NO letters, NO words, NO logos of other brands anywhere in the image.',
    'No phone mockup, no browser chrome, no drop shadow outside the frame, no watermark.',
    'Fully opaque background (no transparency), must stay readable and recognizable at very small sizes (like a 40x40 icon).',
  ].join(' ');
}

// ---- OpenAI (gpt-image-1) -----------------------------------------------------

async function genOpenAI({ prompt, size, quality, apiKey }) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt,
      n: 1,
      size,
      quality,
      background: 'opaque', // App Store REFUSE l'alpha sur l'icone -> on force un fond plein
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = json?.error?.message || `HTTP ${res.status}`;
    throw new Error(`OpenAI : ${detail}`);
  }
  const d = json.data?.[0];
  if (!d?.b64_json) throw new Error('reponse OpenAI sans image (data[0].b64_json manquant)');
  return Buffer.from(d.b64_json, 'base64');
}

// ---- Contact sheet HTML (pour tout voir d'un coup, sans serveur) ------------

function writeContactSheet(outDir, entries) {
  const cards = entries.map(({ file, label }) => `
    <figure>
      <img src="./${file}" alt="${label}">
      <figcaption>${label}</figcaption>
    </figure>`).join('\n');

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<title>Propositions d'icone</title>
<style>
  body { background:#0c0c0f; color:#f2f2f7; font-family:-apple-system,Helvetica,Arial,sans-serif; margin:0; padding:32px; }
  h1 { font-size:20px; font-weight:600; margin:0 0 24px; }
  .grid { display:flex; flex-wrap:wrap; gap:24px; }
  figure { margin:0; width:200px; text-align:center; }
  img { width:200px; height:200px; object-fit:cover; border-radius:22px; box-shadow:0 4px 24px rgba(0,0,0,.4); background:#fff; }
  figcaption { margin-top:8px; font-size:13px; color:#9a9aa2; }
</style></head>
<body>
  <h1>Propositions d'icone — choisis celle que tu preferes</h1>
  <div class="grid">${cards}</div>
</body></html>`;
  writeFileSync(path.join(outDir, 'contact-sheet.html'), html, 'utf8');
}

function listVariations() {
  console.log('\n  Variations disponibles (--only <label>) :\n');
  for (const v of VARIATIONS) {
    console.log(`     • ${v.label.padEnd(18)} ${v.color}`);
    console.log(`       ${' '.repeat(18)} motif : ${v.angle}`);
  }
  console.log('');
}

// ---- Main ---------------------------------------------------------------------

async function main() {
  loadDotEnv();
  const flags = parseArgs(process.argv.slice(2));

  if (flags.help || flags.h) return usage();
  if (flags.list) return listVariations();

  const userPrompt = flags.prompt || flags.p;
  if (!userPrompt) die('Donne une description de ton app :  --prompt "app de recettes de cuisine, chaleureuse"');

  const size = flags.size || '1024x1024';
  const quality = flags.quality || 'high';
  const outDir = path.resolve(flags.out || './icons');

  let selected;
  if (flags.only) {
    const v = VARIATIONS.find((x) => x.label === flags.only);
    if (!v) die(`Variation inconnue : « ${flags.only} ». Lance --list pour voir les options.`);
    selected = [v];
  } else {
    const n = parseInt(flags.n || String(VARIATIONS.length), 10);
    // Cycle sur la liste si n depasse le nombre de variations definies.
    selected = Array.from({ length: n }, (_, i) => VARIATIONS[i % VARIATIONS.length]);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    die(
      "Aucune cle OPENAI_API_KEY trouvee. Colle-la dans .env a la racine du repo :\n" +
      "      OPENAI_API_KEY=sk-...   (https://platform.openai.com/api-keys)"
    );
  }

  mkdirSync(outDir, { recursive: true });

  console.log(`\n  \u{1F3A8} Generation en cours — ${selected.length} icone(s), toutes avec une couleur + un motif differents...\n`);

  const entries = [];
  const usedLabels = new Map();
  for (const v of selected) {
    const occurrence = (usedLabels.get(v.label) || 0) + 1;
    usedLabels.set(v.label, occurrence);
    const label = occurrence > 1 ? `${v.label}-${occurrence}` : v.label;
    const prompt = buildPrompt(userPrompt, v);
    try {
      console.log(`     -> ${label}  (${v.color})...`);
      const buf = await genOpenAI({ prompt, size, quality, apiKey });
      const file = `${label}.png`;
      writeFileSync(path.join(outDir, file), buf);
      entries.push({ file, label });
      console.log(`        ✓ ${file}`);
    } catch (e) {
      console.error(`     ✖ ${label} a echoue : ${e.message}`);
    }
  }

  if (entries.length === 0) die('Aucune image generee (voir les erreurs ci-dessus).');

  writeContactSheet(outDir, entries);

  let collageLine = '';
  if (!flags['no-collage']) {
    try {
      const { buildCollage } = await import('./make-collage.mjs');
      const collagePath = await buildCollage({
        inDir: outDir,
        outFile: path.join(outDir, 'collage.png'),
        files: entries.map((e) => e.file),
      });
      collageLine = `     🖼️  Planche-contact (1 seule image) : ${collagePath}\n`;
    } catch (e) {
      collageLine =
        `     ⚠️  Planche-contact PNG non generee (${e.message}).\n` +
        `        Installe sharp puis relance :  npm i sharp && node scripts/make-collage.mjs --in ${path.relative(process.cwd(), outDir)}\n`;
    }
  }

  console.log(`
  ✅ ${entries.length} icone(s) generee(s) dans : ${outDir}
${collageLine}     Ouvre contact-sheet.html dans un navigateur pour tout comparer.

  Etape suivante (toutes tailles + splash + favicon, via sharp) :
     node ../la-recette/scripts/generate-assets.mjs icon --src ${path.join(outDir, entries[0].file)} --out ./assets/images
`);
}

function usage() {
  console.log(`
  ios-icon-generator — genere des icones d'app iOS via OpenAI (gpt-image-1)
  Chaque icone combine une PALETTE DE COULEUR et un MOTIF differents (pas juste
  un style de rendu different sur le meme dessin).

  node scripts/generate-icon.mjs --prompt "description de ton app" [options]

  Options :
    --prompt, -p     Description de l'app en langage naturel (obligatoire)
    --n              Nombre total d'icones (defaut : 8 -> les 8 variations predefinies)
    --only <label>   Une seule variation precise (voir --list)
    --list           Affiche les variations disponibles et quitte
    --out            Dossier de sortie (defaut : ./icons)
    --size           Taille (defaut : 1024x1024)
    --quality        Qualite : high | medium | low (defaut : high)
    --no-collage     Ne genere pas la planche-contact PNG (juste les icones + le HTML)

  Cle (dans .env a la racine, voir .env.example) :
    OPENAI_API_KEY   https://platform.openai.com/api-keys
`);
}

main().catch((e) => die(e && e.message ? e.message : String(e)));
