---
name: ios-icon-generator
description: >
  Genere plusieurs propositions d'icone d'app iOS a partir d'une description en langage
  naturel, via OpenAI (gpt-image-1), dans 4 styles differents, avec une planche-contact
  (collage) automatique en une seule image. Charge ce skill des qu'on parle de
  creer/generer une icone d'app, un logo d'app, un app icon, ou dès que l'utilisateur
  tape /icon.
---

# ios-icon-generator — icone d'app iOS par IA

## Ce que fait ce skill

A partir d'**une phrase** decrivant l'app ("app de recettes de cuisine, chaleureuse,
orange"), il genere **plusieurs propositions d'icone carree (1024×1024)**, prêtes pour
l'App Store, via un vrai appel a l'API OpenAI (`gpt-image-1`) — pas un mockup, une vraie
image generee. Par defaut il couvre **4 styles** (`flat`, `gradient`, `glass`, `3d`) pour
donner un vrai choix, puis assemble tout dans **une seule image de planche-contact**
(`collage.png`) facile a montrer/comparer d'un coup d'œil.

## Prerequis

Une cle API OpenAI, dans `.env` a la racine de ce repo (dupliquer `.env.example`) :

```
OPENAI_API_KEY=sk-...     # https://platform.openai.com/api-keys
```

> ⚠️ La cle **Claude/Anthropic ne fonctionne PAS ici** : l'API Claude ne genere pas
> d'images (texte + lecture d'image seulement).

Pour la planche-contact (optionnel mais active par defaut) : `npm i sharp` — lib native de
traitement d'image, 1-2 min de compilation la 1re fois. Sans elle, le script genere quand
meme les icones (juste pas le collage PNG) et le dit clairement.

## Deroule (ce que Claude fait, sans que l'humain code)

1. **Demande la description de l'app** en une phrase (si pas deja donnee).
2. **Verifie qu'une cle `OPENAI_API_KEY`** est presente dans `.env` (sinon guide
   l'utilisateur : ou la recuperer, comment la coller — une seule action a la fois).
3. **Lance le script** :
   ```
   node scripts/generate-icon.mjs --prompt "<description>"
   ```
   (par defaut : les 4 styles, 2 propositions chacun = 8 icones + 1 collage).
4. **Montre le rendu** : affiche `icons/collage.png` a l'utilisateur (une seule image,
   toutes les propositions labellisees par style).
5. **Laisse l'utilisateur choisir** sa preferee — une seule question, pas dix.
6. **Etape suivante (optionnelle)** : brancher l'icone choisie dans une vraie app Expo via
   le pipeline `sharp` de La Recette (icone App Store opaque + icone adaptative Android +
   splash + favicon, toutes tailles) :
   ```
   node <chemin-vers-la-recette>/scripts/generate-assets.mjs icon --src ./icons/flat-1.png
   ```

## Garde-fous

- **Jamais de texte dans l'icone** : le prompt envoye a l'IA interdit explicitement
  texte/lettres/mots (Apple + lisibilite en petit format le deconseillent).
- **Fond opaque force** (`background: "opaque"`) — Apple **refuse l'alpha** sur l'icone
  App Store.
- **Cle qui ne marche pas / quota atteint** : le script affiche l'erreur exacte de l'API
  (pas de stacktrace brute) — cle invalide, ou verification d'organisation OpenAI requise
  pour `gpt-image-1`.
- **Cout** : chaque image generee est facturee par OpenAI (quelques centimes a ~10-15
  centimes selon la qualite). Le lot par defaut = 8 images. `--n` et `--style` controlent
  le volume — reduis si besoin (`--style flat --n 2` = juste 2 images).
