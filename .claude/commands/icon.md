---
description: Genere des propositions d'icone d'app iOS via IA (OpenAI / Gemini)
---

Charge et applique le skill `ios-icon-generator`.

1. Si l'utilisateur n'a pas deja donne de description de son app dans son message,
   demande-la en une phrase (ex: "app de recettes de cuisine, chaleureuse, orange").
2. Verifie qu'une cle `OPENAI_API_KEY` ou `GEMINI_API_KEY` est presente dans `.env` a la
   racine de ce repo. Si aucune n'est presente, guide l'utilisateur pour en recuperer
   une (une seule action a la fois) plutot que d'echouer sans explication.
3. Lance `node scripts/generate-icon.mjs --prompt "<description>"` (ajoute `--style` si
   l'utilisateur en a precise un parmi flat/gradient/glass/3d).
4. Montre le resultat : affiche les images generees dans `./icons/` a l'utilisateur.
5. Demande laquelle il prefere — une seule question.
