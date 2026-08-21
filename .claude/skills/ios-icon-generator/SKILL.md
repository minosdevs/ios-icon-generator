---
name: ios-icon-generator
description: >
  Genere plusieurs propositions d'icone d'app iOS a partir d'une description en langage
  naturel, via OpenAI (gpt-image-1) et/ou Google Gemini (image gen native). Charge ce
  skill des qu'on parle de creer/generer une icone d'app, un logo d'app, un app icon, ou
  dès que l'utilisateur tape /icon. Zero dependance (Node 18+, fetch natif) — fonctionne
  sur Mac, Windows, Linux.
---

# ios-icon-generator — icone d'app iOS par IA

## Ce que fait ce skill

A partir d'**une phrase** decrivant l'app ("app de recettes de cuisine, chaleureuse,
orange"), il genere **plusieurs propositions d'icone carree (1024×1024)**, prêtes pour
l'App Store, via un vrai appel API a OpenAI et/ou Gemini — pas un mockup, une vraie
image generee.

## Prerequis

Une cle API, dans `.env` a la racine de ce repo (dupliquer `.env.example`) :

```
OPENAI_API_KEY=sk-...     # https://platform.openai.com/api-keys
GEMINI_API_KEY=...        # https://aistudio.google.com/apikey
```

Une seule des deux suffit. Les deux ensemble => le script genere les deux rendus pour
comparer.

> ⚠️ La cle **Claude/Anthropic ne fonctionne PAS ici** : l'API Claude ne genere pas
> d'images (texte + lecture d'image seulement). Utilise OpenAI ou Gemini pour la
> generation elle-meme.

## Deroule (ce que Claude fait, sans que l'humain code)

1. **Demande la description de l'app** en une phrase (si pas deja donnee), et le style
   souhaite si l'utilisateur en a un (`flat` / `gradient` / `glass` / `3d` — sinon
   `flat` par defaut, qui convient a la plupart des apps).
2. **Verifie qu'une cle est presente** dans `.env` (sinon guide l'utilisateur : quelle
   cle recuperer, sur quel site, comment la coller — **une seule action a la fois**).
3. **Lance le script** :
   ```
   node scripts/generate-icon.mjs --prompt "<description>" --style <style>
   ```
4. **Montre le rendu** : ouvre/affiche les PNG generes dans `./icons/` (et le
   `contact-sheet.html` qui les regroupe en grille pour comparer d'un coup d'œil).
5. **Laisse l'utilisateur choisir** sa preferee — une seule question, pas dix.
6. **Etape suivante (optionnelle)** : une fois l'icone choisie, la brancher dans une
   vraie app Expo via le pipeline `sharp` de La Recette (icone App Store opaque +
   icone adaptative Android + splash + favicon, toutes tailles) :
   ```
   node <chemin-vers-la-recette>/scripts/generate-assets.mjs icon --src ./icons/openai-1.png
   ```

## Garde-fous

- **Jamais de texte dans l'icone** : le prompt envoye a l'IA interdit explicitement
  texte/lettres/mots (Apple + lisibilite en petit format le deconseillent). Si le rendu
  en contient quand meme, relance avec `--n` plus eleve ou change de style.
- **Fond opaque** : force cote OpenAI (`background: "opaque"`) — Apple **refuse
  l'alpha** sur l'icone App Store.
- **Cle qui ne marche pas / quota atteint** : le script affiche l'erreur exacte de
  l'API (pas de stacktrace brute) — cle invalide, verification d'organisation OpenAI
  requise pour `gpt-image-1`, ou modele Gemini indisponible (le script essaie
  automatiquement plusieurs noms de modele Gemini avant d'abandonner).
- **Cout** : chaque image generee est facturee par le provider (quelques centimes a
  ~10-15 centimes selon la qualite/taille). `--n` controle combien de propositions sont
  generees par provider — commence a 2-4, augmente si aucune ne convient.
