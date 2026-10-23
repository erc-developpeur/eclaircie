# Éclaircie — l'actualité sans l'anxiété

Agrégateur d'actualités francophones avec **bouclier IA** : vous choisissez vos thèmes, et l'IA masque guerres, meurtres, violences sexuelles, catastrophes… selon vos réglages.

## Lancer

```bash
node --env-file-if-exists=.env server.js
```

Ouvrez http://localhost:3000. Aucune dépendance (Node 22+).

**Filtrage par IA (recommandé)** : copiez `.env.example` en `.env` et collez votre clé après `GEMINI_API_KEY=` (Gemini, clé sur https://aistudio.google.com/apikey) ou `ANTHROPIC_API_KEY=` (Claude, clé sur https://console.anthropic.com/settings/keys). Sans clé, un filtre par mots-clés prend le relais. Vérifiez avec http://localhost:3000/api/health → `"ai": true`.
Le fichier `.env` est ignoré par git : ne le partagez jamais.

## Contenu

| Fichier | Rôle |
|---|---|
| `server.js` | API REST + lecture des flux RSS + flux perso + classification par Claude |
| `public/shared.js` | Catalogue des 20 sources, thèmes, sous-thèmes, sujets bloquables et filtre (partagé navigateur/serveur) |
| `public/app.js` | Application : inscription en 16 étapes, fil, explorer, sauvegardés, lecteur, profil |

Sources : Le Monde, Franceinfo, Libération, Ouest-France, Le Figaro, L'Obs, Le Parisien, 20 Minutes, La Croix, Les Échos, France 24, Courrier international, Positivr, Numerama, Les Numériques, Futura Sciences, Sciences et Avenir, Reporterre, L'Équipe. Pour en ajouter une, complétez `SOURCES` dans `public/shared.js`.
| `public/newtab.html` | Page d'accueil du navigateur (heure, recherche, 6 bonnes nouvelles) |
| `public/sw.js` + `manifest.webmanifest` | App mobile installable (PWA), hors ligne, notifications |

## API

```
GET  /api/news?topics=sport,tech&subtopics=foot,ia&interests=PSG&sources=lemonde,lequipe&block=war,murder&tone=40&limit=20
GET  /api/news?raw=1&extra=<url rss>,<url rss>   tous les articles (+ flux perso) avec leur classification
GET  /api/topics              thèmes, sous-thèmes et sujets bloquables
GET  /api/sources             médias disponibles (count = 0 → indisponible)
GET  /api/sources/test?url=…  vérifie un flux RSS perso
POST /api/classify            {"title":"…","summary":"…"} → {topic, sensitive[], tone}
POST /api/feedback            {"id":"…","title":"…","category":"violence"} → signale un article mal filtré (enregistré dans data/feedback.json)
GET  /api/health
```

`tone` : 0 = uniquement du positif, 100 = toute l'actualité factuelle.

## App mobile & notifications

- Sur téléphone : ouvrez le site → « Ajouter à l'écran d'accueil ». L'app s'ouvre en plein écran.
- Notifications : quand l'app est ouverte (vérification toutes les 15 min) et en arrière-plan via *Periodic Background Sync* (Chrome/Edge, app installée).
- Pour des notifications **push** même app fermée sur iPhone, il faut ajouter un serveur Web Push (clés VAPID). Le service worker gère déjà l'événement `push`.
- Le site doit être servi en **HTTPS** en production (obligatoire pour les notifications et l'installation).

## Vie privée

Les préférences restent dans le navigateur (localStorage). Le serveur ne reçoit que les paramètres de l'API si vous l'appelez vous-même.
