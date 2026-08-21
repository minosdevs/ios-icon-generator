---
description: Genere des propositions d'icone d'app iOS via IA (OpenAI gpt-image-1)
---

Charge et applique le skill `ios-icon-generator`.

1. Si l'utilisateur n'a pas deja donne de description de son app dans son message,
   demande-la en une phrase (ex: "app de recettes de cuisine, chaleureuse, orange").
2. Verifie qu'une cle `OPENAI_API_KEY` est presente dans `.env` a la racine de ce repo.
   Si absente, guide l'utilisateur pour en recuperer une (une seule action a la fois)
   plutot que d'echouer sans explication.
3. Lance `node scripts/generate-icon.mjs --prompt "<description>"` (par defaut : 8
   variations couleur+motif differentes + 1 planche-contact ; ajoute `--n 3` pour moins,
   ou `--only <label>` pour une seule variation precise — voir `--list`).
4. Montre le resultat : affiche `icons/collage.png` (toutes les propositions en une
   image) a l'utilisateur.
5. Demande laquelle il prefere — une seule question.
