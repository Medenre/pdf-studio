# PDF Studio

Un atelier PDF en français, avec une interface épurée et un traitement des documents dans le navigateur.

L’application se trouve dans [`pdf-studio-app`](./pdf-studio-app). Node.js 22.13 ou supérieur est nécessaire.

Sous Windows, double-cliquer sur **Lancer PDF Studio.cmd**, puis ouvrir l’adresse indiquée dans le navigateur. Garder la fenêtre du serveur ouverte pendant l’utilisation.

```powershell
cd pdf-studio-app
npm ci
npm run dev
```

Ouvrir l’adresse locale affichée par le serveur (par défaut `http://127.0.0.1:5173`). Les commandes `npm run typecheck` et `npm run build` vérifient le projet. Avec le serveur lancé, `npm run test:browser` exécute les parcours de vérification dans Chrome.

Voir le [guide de l’application](./pdf-studio-app/README.md) pour les fonctions et les limites de cette version.

## Publication sur GitHub Pages

Une compilation statique et un workflow GitHub Actions sont prêts. Le [guide GitHub Pages](./GITHUB_PAGES.md) explique comment envoyer le projet dans votre dépôt et activer la publication automatique.
