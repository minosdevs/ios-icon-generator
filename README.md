# ios-icon-generator 🎨

**Génère des propositions d'icône d'app iOS à partir d'une simple description, via une vraie IA de génération d'images (OpenAI `gpt-image-1` et/ou Google Gemini).**

Pas de mockup, pas de Photoshop, pas de designer à payer : une phrase en langage naturel entre, plusieurs icônes carrées 1024×1024, prêtes pour l'App Store, sortent. Zéro dépendance (Node 18+ suffit), zéro compte de designer requis.

Disponible en **script CLI autonome** *et* en **skill/commande Claude Code** (`/icon`).

---

## Exemple réel — testé en live

Prompt donné : `"app mobile de recettes de cuisine maison, chaleureuse et simple"` (style `flat`, provider `openai`, `gpt-image-1`).

<p align="center">
  <img src="examples/recipe-app-1.png" width="200" alt="Icône générée 1">
  <img src="examples/recipe-app-2.png" width="200" alt="Icône générée 2">
  <img src="examples/recipe-app-3.png" width="200" alt="Icône générée 3">
</p>

Trois propositions, un seul appel de commande, aucune retouche manuelle. C'est exactement ce que produit le script — pas une maquette.

---

## Installation

```bash
git clone https://github.com/minosdevs/ios-icon-generator.git
cd ios-icon-generator
cp .env.example .env
```

Colle une clé API dans `.env` (une seule suffit) :

```
OPENAI_API_KEY=sk-...     # https://platform.openai.com/api-keys
GEMINI_API_KEY=...        # https://aistudio.google.com/apikey
```

> ⚠️ Une clé **Claude/Anthropic ne fonctionnera pas ici** : l'API Claude ne génère pas
> d'images (texte + lecture d'image seulement, pas de génération). Utilise OpenAI ou
> Gemini pour la génération d'images elle-même.

Aucune installation de dépendance (`npm install`) n'est nécessaire — le script n'utilise
que `fetch` et `fs`, natifs à Node 18+.

## Utilisation

```bash
node scripts/generate-icon.mjs --prompt "app de suivi de sport, énergique, bleu et noir"
```

Ça écrit les icônes générées dans `./icons/` + un `contact-sheet.html` pour tout comparer
d'un coup d'œil dans un navigateur (double-clic, aucun serveur requis).

### Options

| Flag | Défaut | Description |
|---|---|---|
| `--prompt`, `-p` | *(obligatoire)* | Description de l'app en langage naturel |
| `--provider` | auto | `openai` \| `gemini` \| `both` — auto = selon les clés présentes dans `.env` |
| `--n` | `4` | Nombre de propositions **par provider** |
| `--style` | `flat` | `flat` \| `gradient` \| `glass` \| `3d` |
| `--out` | `./icons` | Dossier de sortie |
| `--size` | `1024x1024` | Taille (OpenAI uniquement) |
| `--quality` | `high` | `high` \| `medium` \| `low` (OpenAI uniquement) |

```bash
# Comparer les deux providers sur le même brief
node scripts/generate-icon.mjs --prompt "app de méditation, apaisante, violet" --provider both --n 2

# Style glassmorphism (look iOS 26)
node scripts/generate-icon.mjs --prompt "app de finance perso, sérieuse, vert" --style glass
```

## Utilisation comme skill Claude Code

Ce repo est aussi un **plugin Claude Code** autonome (`.claude-plugin/plugin.json`). Ouvre
ce dossier avec Claude Code et tape :

```
/icon
```

Claude te demande la description de ton app (si tu ne l'as pas déjà donnée), vérifie
qu'une clé est configurée, lance la génération, et t'affiche le résultat — tu n'as rien à
taper en ligne de commande. Voir [`.claude/skills/ios-icon-generator/SKILL.md`](.claude/skills/ios-icon-generator/SKILL.md).

## Étape suivante : toutes les tailles + splash + favicon

Une fois l'icône choisie, ce repo s'arrête volontairement là (une seule responsabilité :
générer l'image source). Pour la décliner en icône App Store opaque, icône adaptative
Android, écran de démarrage et favicon à toutes les tailles requises, utilise le pipeline
`sharp` de [La Recette](https://github.com/minosdevs) :

```bash
node generate-assets.mjs icon --src ./icons/openai-1.png --out ./assets/images
```

## Comment ça marche (sans mystère)

- **OpenAI** — `POST /v1/images/generations`, modèle `gpt-image-1`, `background: "opaque"`
  forcé (Apple **refuse** la transparence sur l'icône App Store).
- **Gemini** — `generateContent` sur un modèle d'image native (les noms de modèle Google
  changent vite : le script essaie une petite liste de candidats connus dans l'ordre et
  garde le premier qui répond, plutôt que de planter sur un nom devenu obsolète).
- **Le prompt réel envoyé à l'IA** n'est pas ta phrase brute : il est enrichi en un vrai
  brief de designer (composition carrée, un seul motif centré, **aucun texte/lettre**,
  couleurs franches, lisible en petit) — voir `buildPrompt()` dans
  [`scripts/generate-icon.mjs`](scripts/generate-icon.mjs).
- **Zéro dépendance** : pas de `node_modules`, pas de compilation native, ça tourne pareil
  sur Windows, Mac, Linux.

## Limites connues

- Le chemin **Gemini** est implémenté (endpoint + parsing de réponse corrects d'après la
  doc officielle) mais n'a pas encore été testé avec une vraie clé au moment de la
  publication de ce repo — seul le chemin **OpenAI** a été validé en conditions réelles
  (voir capture ci-dessus). Une issue/PR avec un retour de test Gemini est bienvenue.
- Chaque image générée est **facturée par le provider** (quelques centimes à ~10-15
  centimes selon qualité/taille côté OpenAI). `--n` contrôle le nombre de générations —
  commence petit.
- L'icône Android « adaptative », le splash et les tailles multiples ne sont **pas**
  produits ici (voir *Étape suivante* ci-dessus) — ce repo ne fait qu'une chose, la
  génération de l'image source.

## Licence

MIT — voir [LICENSE](LICENSE).
