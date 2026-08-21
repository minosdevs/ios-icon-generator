#!/usr/bin/env node
// ios-icon-generator — make-collage
// -----------------------------------------------------------------------------
// Assemble un dossier d'icones PNG en UNE seule image (grille, coins arrondis,
// legende sous chaque case) — pratique pour comparer toutes les propositions
// d'un coup d'oeil, ou pour l'envoyer/le poster tel quel.
//
// Utilisable seul :
//   npm i sharp
//   node scripts/make-collage.mjs --in ./icons --out ./icons/collage.png [--cols 4] [--cell 300]
//
// Ou appele automatiquement par generate-icon.mjs juste apres une generation
// (via l'export buildCollage ci-dessous).
//
// Dependance : `sharp` (traitement d'image natif), PAS livree avec ce repo
// (node_modules est gitignore). Etape explicite : `npm i sharp` (1-2 min de
// compilation native la 1re fois). Si absent, on echoue proprement avec
// l'instruction exacte plutot que de planter sans explication.
// -----------------------------------------------------------------------------

import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

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

function loadSharp() {
  const require = createRequire(import.meta.url);
  try {
    const mod = require('sharp');
    return mod.default || mod;
  } catch {
    throw new Error(
      "le module « sharp » n'est pas installe — lance d'abord :  npm i sharp  " +
      '(lib native, compte 1-2 min de compilation la 1re fois)'
    );
  }
}

const IMG_RE = /\.(png|jpe?g|webp)$/i;

/**
 * Compose `files` (noms de fichiers dans inDir) en une grille -> outFile.
 * Retourne le chemin absolu du fichier ecrit.
 */
export async function buildCollage({ inDir, outFile, files, cols, cell = 280, bg = '#0c0c0f', label = true }) {
  const sharp = loadSharp();

  const names = files && files.length ? files : readdirSync(inDir).filter((f) => IMG_RE.test(f) && f !== 'collage.png');
  if (!names.length) throw new Error(`aucune image trouvee dans ${inDir}`);

  const nCols = cols || Math.min(4, names.length) || 1;
  const nRows = Math.ceil(names.length / nCols);
  const margin = Math.round(cell * 0.08);
  const radius = Math.round(cell * 0.22); // coin arrondi App Store-like (squircle approx)
  const labelH = label ? Math.round(cell * 0.16) : 0;
  const cardH = cell + labelH;

  const W = nCols * cell + (nCols + 1) * margin;
  const H = nRows * cardH + (nRows + 1) * margin;

  const layers = [];

  for (let i = 0; i < names.length; i++) {
    const file = names[i];
    const row = Math.floor(i / nCols);
    const col = i % nCols;
    const left = margin + col * (cell + margin);
    const top = margin + row * (cardH + margin);

    // Icone redimensionnee en carre + coins arrondis (masque SVG dest-in).
    let iconBuf = await sharp(path.join(inDir, file))
      .resize(cell, cell, { fit: 'cover' })
      .png()
      .toBuffer();
    const maskSvg = `<svg width="${cell}" height="${cell}" xmlns="http://www.w3.org/2000/svg"><rect width="${cell}" height="${cell}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`;
    iconBuf = await sharp(iconBuf)
      .composite([{ input: Buffer.from(maskSvg), blend: 'dest-in' }])
      .png()
      .toBuffer();

    layers.push({ input: iconBuf, top, left });

    if (label) {
      const caption = path.parse(file).name;
      const fontSize = Math.round(cell * 0.09);
      const textSvg =
        `<svg width="${cell}" height="${labelH}" xmlns="http://www.w3.org/2000/svg">` +
        `<text x="${cell / 2}" y="${Math.round(labelH * 0.68)}" text-anchor="middle" ` +
        `font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="${fontSize}" ` +
        `font-weight="600" fill="#c9c9d1">${caption}</text></svg>`;
      layers.push({ input: Buffer.from(textSvg), top: top + cell, left });
    }
  }

  await sharp({ create: { width: W, height: H, channels: 4, background: bg } })
    .composite(layers)
    .png()
    .toFile(outFile);

  return outFile;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help || flags.h) {
    console.log(`
  node scripts/make-collage.mjs --in <dossier> [--out ./collage.png] [--cols 4] [--cell 300] [--no-label]
`);
    return;
  }
  const inDir = path.resolve(flags.in || './icons');
  if (!existsSync(inDir)) die(`Dossier introuvable : ${inDir}`);
  const outFile = path.resolve(flags.out || path.join(inDir, 'collage.png'));
  const cols = flags.cols ? parseInt(flags.cols, 10) : undefined;
  const cell = flags.cell ? parseInt(flags.cell, 10) : 280;
  const label = !flags['no-label'];

  try {
    const out = await buildCollage({ inDir, outFile, files: null, cols, cell, label });
    console.log(`\n  ✅ Planche-contact generee : ${out}\n`);
  } catch (e) {
    die(e.message);
  }
}

// N'execute `main` que si le fichier est lance directement (pas quand importe
// depuis generate-icon.mjs).
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main();
