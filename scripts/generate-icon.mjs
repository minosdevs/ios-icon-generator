#!/usr/bin/env node
// ios-icon-generator — generate-icon
// -----------------------------------------------------------------------------
// Genere plusieurs propositions d'icone d'app iOS a partir d'une description en
// langage naturel, via OpenAI (gpt-image-1). Zero dependance : Node 18+ suffit
// (fetch + fs sont natifs).
//
// Usage :
//   node scripts/generate-icon.mjs --prompt "app de recettes de cuisine, chaleureuse, orange"
//        [--style flat|gradient|glass|3d|all]  (defaut: all -> genere dans les 4 styles)
//        [--n 2]                               (nombre de propositions PAR style)
//        [--out ./icons]
//        [--size 1024x1024]
//        [--quality high|medium|low]           (defaut: high)
//        [--no-collage]                        (saute la planche-contact PNG)
//
// Cle lue depuis l'environnement (ou un fichier .env a la racine du repo) :
//   OPENAI_API_KEY   -> https://platform.openai.com/api-keys
//
// Sortie : des PNG numerotes dans --out, + collage.png (planche-contact en UNE
// image, via scripts/make-collage.mjs) + contact-sheet.html (version navigateur).
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

// ---- Prompt de design -------------------------------------------------------
// On transforme la description utilisateur en un vrai brief de designer d'icone,
// avec les regles qui font qu'une icone marche VRAIMENT sur l'App Store (carre,
// un seul motif, pas de texte, lisible en petit).

const STYLE_HINTS = {
  flat: 'flat modern vector illustration style, bold clean shapes, subtle soft shadow only, minimal gradient',
  gradient: 'smooth modern gradient background, soft glossy highlight, contemporary SaaS app style',
  glass: 'frosted glass / glassmorphism style, translucent layered shapes, soft blur highlights, iOS 26 liquid glass aesthetic',
  '3d': 'soft 3D clay / claymorphism render, rounded volumes, gentle studio lighting, subtle shadow',
};

const ALL_STYLES = Object.keys(STYLE_HINTS);

function buildPrompt(userPrompt, style) {
  const hint = STYLE_HINTS[style] || STYLE_HINTS.flat;
  return [
    `Design a single professional iOS app icon for an app described as: "${userPrompt}".`,
    `Visual style: ${hint}.`,
    'Strict rules: one single clear focal symbol or motif, centered, filling the frame edge-to-edge in a perfect 1:1 square composition.',
    'Absolutely NO text, NO letters, NO words, NO logos of other brands anywhere in the image.',
    'No phone mockup, no browser chrome, no drop shadow outside the frame, no watermark.',
    'Fully opaque background (no transparency), bold saturated colors, must stay readable and recognizable at very small sizes (like a 40x40 icon).',
  ].join(' ');
}

// ---- OpenAI (gpt-image-1) -----------------------------------------------------

async function genOpenAI({ prompt, n, size, quality, apiKey }) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt,
      n,
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
  return (json.data || []).map((d) => Buffer.from(d.b64_json, 'base64'));
}

// ---- Contact sheet HTML (pour tout voir d'un coup, sans serveur) ------------

function writeContactSheet(outDir, entries) {
  const cards = entries.map(({ file, style, index }) => `
    <figure>
      <img src="./${file}" alt="${style} #${index}">
      <figcaption>${style} — #${index}</figcaption>
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

// ---- Main ---------------------------------------------------------------------

async function main() {
  loadDotEnv();
  const flags = parseArgs(process.argv.slice(2));

  if (flags.help || flags.h) return usage();

  const userPrompt = flags.prompt || flags.p;
  if (!userPrompt) die('Donne une description de ton app :  --prompt "app de recettes de cuisine, orange, minimaliste"');

  const n = parseInt(flags.n || '2', 10);
  const styleArg = flags.style || 'all';
  const styles = styleArg === 'all' ? ALL_STYLES : [styleArg];
  const size = flags.size || '1024x1024';
  const quality = flags.quality || 'high';
  const outDir = path.resolve(flags.out || './icons');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    die(
      "Aucune cle OPENAI_API_KEY trouvee. Colle-la dans .env a la racine du repo :\n" +
      "      OPENAI_API_KEY=sk-...   (https://platform.openai.com/api-keys)"
    );
  }

  mkdirSync(outDir, { recursive: true });

  const total = n * styles.length;
  console.log(`\n  \u{1F3A8} Generation en cours — ${total} icone(s) au total (${styles.join(', ')}, ${n} par style)...\n`);

  const entries = [];
  for (const style of styles) {
    const prompt = buildPrompt(userPrompt, style);
    try {
      console.log(`     -> style "${style}"...`);
      const buffers = await genOpenAI({ prompt, n, size, quality, apiKey });
      buffers.forEach((buf, i) => {
        const file = `${style}-${i + 1}.png`;
        writeFileSync(path.join(outDir, file), buf);
        entries.push({ file, style, index: i + 1 });
        console.log(`        ✓ ${file}`);
      });
    } catch (e) {
      console.error(`     ✖ style "${style}" a echoue : ${e.message}`);
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

  node scripts/generate-icon.mjs --prompt "description de ton app" [options]

  Options :
    --prompt, -p     Description de l'app en langage naturel (obligatoire)
    --style          flat | gradient | glass | 3d | all   (defaut : all -> les 4 styles)
    --n              Nombre de propositions PAR style (defaut : 2)
    --out            Dossier de sortie (defaut : ./icons)
    --size           Taille (defaut : 1024x1024)
    --quality        Qualite : high | medium | low (defaut : high)
    --no-collage     Ne genere pas la planche-contact PNG (juste les icones + le HTML)

  Cle (dans .env a la racine, voir .env.example) :
    OPENAI_API_KEY   https://platform.openai.com/api-keys
`);
}

main().catch((e) => die(e && e.message ? e.message : String(e)));
