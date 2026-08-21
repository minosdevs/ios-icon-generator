#!/usr/bin/env node
// ios-icon-generator — generate-icon
// -----------------------------------------------------------------------------
// Genere plusieurs propositions d'icone d'app iOS a partir d'une description en
// langage naturel, via OpenAI (gpt-image-1) et/ou Google Gemini (image gen
// native). Zero dependance : Node 18+ suffit (fetch + fs sont natifs).
//
// Usage :
//   node scripts/generate-icon.mjs --prompt "app de recettes de cuisine, chaleureuse, orange"
//        [--provider openai|gemini|both]   (defaut: auto -> selon les cles presentes)
//        [--n 4]                           (nombre de propositions PAR provider)
//        [--style flat|gradient|glass|3d]  (defaut: flat)
//        [--out ./icons]
//        [--size 1024x1024]                (OpenAI uniquement)
//        [--quality high|medium|low]       (OpenAI uniquement, defaut: high)
//
// Cles lues depuis l'environnement (ou un fichier .env a la racine du repo) :
//   OPENAI_API_KEY   -> https://platform.openai.com/api-keys
//   GEMINI_API_KEY   -> https://aistudio.google.com/apikey
//
// Sortie : des PNG numerotes dans --out, + un contact-sheet.html pour tout
// comparer d'un coup d'oeil dans un navigateur (file://, aucun serveur requis).
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

// ---- Provider : OpenAI (gpt-image-1) -----------------------------------------

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

// ---- Provider : Google Gemini (image gen native, "nano banana") --------------
// Les noms de modele changent vite cote Google : on essaie une petite liste de
// candidats, dans l'ordre, et on garde le premier qui repond.

const GEMINI_MODEL_CANDIDATES = [
  'gemini-2.5-flash-image',
  'gemini-2.5-flash-image-preview',
  'gemini-2.0-flash-exp-image-generation',
];

async function callGeminiModel(model, prompt, apiKey, withAspect) {
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
  };
  if (withAspect) body.generationConfig.imageConfig = { aspectRatio: '1:1' };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = json?.error?.message || `HTTP ${res.status}`;
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find((p) => p.inlineData?.data);
  if (!imgPart) throw new Error('Aucune image dans la reponse Gemini (le modele a peut-etre repondu en texte seul).');
  return Buffer.from(imgPart.inlineData.data, 'base64');
}

async function genOneGemini(prompt, apiKey) {
  let lastErr;
  for (const model of GEMINI_MODEL_CANDIDATES) {
    // 1re tentative avec aspectRatio 1:1 (modeles recents), repli sans si refuse.
    for (const withAspect of [true, false]) {
      try {
        return await callGeminiModel(model, prompt, apiKey, withAspect);
      } catch (e) {
        lastErr = e;
        // 404 = modele inconnu -> on passe au candidat suivant sans boucler sur l'aspect.
        if (e.status === 404) break;
      }
    }
  }
  throw new Error(`Gemini : ${lastErr ? lastErr.message : 'echec inconnu'} (modeles testes : ${GEMINI_MODEL_CANDIDATES.join(', ')})`);
}

async function genGemini({ prompt, n, apiKey }) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(await genOneGemini(prompt, apiKey));
  }
  return out;
}

// ---- Contact sheet HTML (pour tout voir d'un coup, sans serveur) ------------

function writeContactSheet(outDir, entries) {
  const cards = entries.map(({ file, provider, index }) => `
    <figure>
      <img src="./${file}" alt="${provider} #${index}">
      <figcaption>${provider} — #${index}</figcaption>
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

  const n = parseInt(flags.n || '4', 10);
  const style = flags.style || 'flat';
  const size = flags.size || '1024x1024';
  const quality = flags.quality || 'high';
  const outDir = path.resolve(flags.out || './icons');

  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  let provider = flags.provider;
  if (!provider) {
    if (openaiKey && geminiKey) provider = 'both';
    else if (openaiKey) provider = 'openai';
    else if (geminiKey) provider = 'gemini';
    else die(
      "Aucune cle trouvee. Colle-en une dans .env a la racine du repo :\n" +
      "      OPENAI_API_KEY=sk-...   (https://platform.openai.com/api-keys)\n" +
      "      GEMINI_API_KEY=...      (https://aistudio.google.com/apikey)\n" +
      "    Une seule des deux suffit."
    );
  }

  if ((provider === 'openai' || provider === 'both') && !openaiKey) die('--provider openai demande OPENAI_API_KEY dans .env');
  if ((provider === 'gemini' || provider === 'both') && !geminiKey) die('--provider gemini demande GEMINI_API_KEY dans .env');

  const prompt = buildPrompt(userPrompt, style);
  mkdirSync(outDir, { recursive: true });

  console.log(`\n  \u{1F3A8} Generation en cours (${provider}, style "${style}", ${n} proposition(s) par provider)...\n`);

  const entries = [];

  if (provider === 'openai' || provider === 'both') {
    try {
      console.log('     -> OpenAI (gpt-image-1)...');
      const buffers = await genOpenAI({ prompt, n, size, quality, apiKey: openaiKey });
      buffers.forEach((buf, i) => {
        const file = `openai-${i + 1}.png`;
        writeFileSync(path.join(outDir, file), buf);
        entries.push({ file, provider: 'openai', index: i + 1 });
        console.log(`        ✓ ${file}`);
      });
    } catch (e) {
      console.error(`     ✖ OpenAI a echoue : ${e.message}`);
    }
  }

  if (provider === 'gemini' || provider === 'both') {
    try {
      console.log('     -> Gemini (image gen native)...');
      const buffers = await genGemini({ prompt, n, apiKey: geminiKey });
      buffers.forEach((buf, i) => {
        const file = `gemini-${i + 1}.png`;
        writeFileSync(path.join(outDir, file), buf);
        entries.push({ file, provider: 'gemini', index: i + 1 });
        console.log(`        ✓ ${file}`);
      });
    } catch (e) {
      console.error(`     ✖ Gemini a echoue : ${e.message}`);
    }
  }

  if (entries.length === 0) die('Aucune image generee (voir les erreurs ci-dessus).');

  writeContactSheet(outDir, entries);

  console.log(`
  ✅ ${entries.length} icone(s) generee(s) dans : ${outDir}
     Ouvre contact-sheet.html dans un navigateur pour tout comparer.

  Etape suivante (toutes tailles + splash + favicon, via sharp) :
     node ../la-recette/scripts/generate-assets.mjs icon --src ${path.join(outDir, entries[0].file)} --out ./assets/images
`);
}

function usage() {
  console.log(`
  ios-icon-generator — genere des icones d'app iOS via IA (OpenAI et/ou Gemini)

  node scripts/generate-icon.mjs --prompt "description de ton app" [options]

  Options :
    --prompt, -p     Description de l'app en langage naturel (obligatoire)
    --provider       openai | gemini | both   (defaut : auto, selon les cles presentes)
    --n              Nombre de propositions PAR provider (defaut : 4)
    --style          flat | gradient | glass | 3d   (defaut : flat)
    --out            Dossier de sortie (defaut : ./icons)
    --size           Taille OpenAI (defaut : 1024x1024)
    --quality        Qualite OpenAI : high | medium | low (defaut : high)

  Cles (dans .env a la racine, voir .env.example) :
    OPENAI_API_KEY   https://platform.openai.com/api-keys
    GEMINI_API_KEY   https://aistudio.google.com/apikey
`);
}

main().catch((e) => die(e && e.message ? e.message : String(e)));
