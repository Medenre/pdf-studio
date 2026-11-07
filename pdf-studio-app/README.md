# PDF Studio

Application web en français pour créer, lire, annoter, signer et organiser des documents PDF. Interface claire, accent violet, accueil avec bibliothèque et lecteur avec miniatures. Trois PDF de démonstration sont créés à la première ouverture.

## Démarrage

Node.js ≥ 22.13.0.

```sh
npm ci
npm run dev
```

Adresse par défaut : `http://127.0.0.1:5173`.

```sh
npm run typecheck
npm run build
npm start
```

`npm start` sert la compilation de production avec Wrangler en local. Les scripts `predev` et `prebuild` copient le worker PDF.js, les polices et les tables de caractères depuis les dépendances vers `public/`. Aucun CDN n’est nécessaire pour lire les PDF.

## GitHub Pages

Le projet peut être hébergé comme un site statique avec `npm run build:pages`. Les fichiers à publier sont générés dans `dist-pages/`. `npm run preview:pages` permet de les essayer en local ; `PAGES_BASE_PATH` configure le chemin du dépôt, par exemple `/pdf-studio/`.

Le [guide de publication GitHub Pages](../GITHUB_PAGES.md) décrit le workflow automatique présent à la racine du projet. Il utilise les mêmes composants et les mêmes outils PDF que l’application locale.

## Fonctions

- Import par sélection ou glisser-déposer ; création A4 portrait, paysage ou Lettre ; image PNG/JPEG/WebP vers PDF.
- Lecture avec miniatures, zoom, ajustement, sélection de texte, recherche dans le texte et impression.
- Ajout de texte, commentaires visuels, surlignages, dessins, rectangles et images ; déplacement et suppression des annotations.
- Signature saisie ou dessinée. Les signatures sont visuelles, sans certificat.
- Remplissage des champs texte, cases à cocher, listes et boutons radio d’un formulaire PDF existant.
- Rotation, duplication, déplacement, insertion, suppression et extraction de pages ; ajout de PDF et fusion de documents.
- Export du PDF complet, de la page courante en PNG/JPEG, ou du texte sélectionnable du document.
- Bibliothèque avec recherche, tri, grille/liste, favoris, renommage, duplication, corbeille et restauration.
- Sauvegarde locale dans IndexedDB ; annulation/rétablissement pendant l’édition. `Ctrl/⌘+S` télécharge le PDF, `Ctrl/⌘+Z` annule et `N` crée un document depuis l’accueil.

## Confidentialité et limites

Les fichiers et les opérations PDF restent dans le navigateur. La bibliothèque dépend de cet appareil, de ce navigateur et de l’origine du site. Les téléchargements permettent de conserver les documents indépendamment des données du navigateur.

Cette version ne reproduit pas toute la suite Acrobat : pas de réécriture du texte original, d’OCR, de suppression sécurisée de contenu, de chiffrement ou de signature par certificat. Les PDF chiffrés doivent être déverrouillés au préalable. Le texte ajouté utilise des polices PDF standards ; les caractères non représentables sont exportés en image pour conserver leur apparence. L’export texte extrait le texte du PDF de base et ignore les annotations non encore intégrées. Les champs de formulaire sont aplatis lors d’une fusion. Les commentaires sont des notes visuelles intégrées à la page, pas des fils de discussion PDF.

## Validation

Avec le serveur local lancé :

```sh
npm run test:browser
```

Le script utilise Chrome installé sur Windows, ou Chromium de Playwright sur les autres systèmes (`npx playwright install chromium`). Il vérifie les parcours réels et les fichiers exportés : annotations recherchables, organisation de pages, extraction, images, formulaires remplis, fusion, persistance, corbeille et responsive. Les captures et résultats sont écrits dans `outputs/` (ignoré par Git). `PDF_STUDIO_URL` permet de tester une autre adresse locale.

## Structure

- `components/studio/studio.tsx` : bibliothèque, import, création et fusion.
- `components/studio/editor.tsx` : lecteur, annotation et organisation.
- `components/studio/ui.tsx` : miniatures partagées et dialogues accessibles.
- `lib/studio.ts` : IndexedDB, création, rendu PDF.js et export pdf-lib.
- `app/globals.css` : interface responsive.
- `.openai/hosting.json` : identité Sites ; déploiement Worker Vinext.

La publication n’inclut pas les PDF de votre bibliothèque locale. Les données ne sont pas synchronisées entre l’aperçu local et le site publié.
