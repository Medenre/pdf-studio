# Publier PDF Studio sur GitHub Pages

La version GitHub Pages est entièrement statique : toutes les opérations PDF s’exécutent dans le navigateur. Aucun serveur Node.js, Worker ou compte Sites n’est nécessaire une fois le site publié.

## Publication

1. Créer un dépôt GitHub, par exemple `pdf-studio`, et y envoyer **le contenu de ce dossier de projet**, en conservant le sous-dossier `pdf-studio-app` et le fichier `.github/workflows/pages.yml` à la racine du dépôt. Le workflow utilise la branche `main`.
2. Dans le dépôt, ouvrir **Settings → Pages → Build and deployment → Source**, puis sélectionner **GitHub Actions**.
3. Dans **Actions**, lancer le workflow **Publier PDF Studio sur GitHub Pages** avec **Run workflow**. Les prochains envois sur `main` déclencheront aussi une publication.

Le workflow installe les dépendances, vérifie TypeScript, compile l’application et publie uniquement `pdf-studio-app/dist-pages`. L’adresse finale est affichée dans le déploiement et dans **Settings → Pages**. Pour un dépôt `pdf-studio`, elle prend généralement la forme `https://VOTRE-COMPTE.github.io/pdf-studio/`.

Les chemins des scripts, du lecteur PDF, des polices et des fichiers de rendu sont adaptés automatiquement à l’adresse fournie par GitHub Pages. Un dépôt `VOTRE-COMPTE.github.io` ou un domaine personnalisé utilise la racine `/`.

Le code du workflow est disponible dans [`.github/workflows/pages.yml`](./.github/workflows/pages.yml). Il ne demande aucun jeton personnel : il utilise les autorisations intégrées de GitHub Actions.

## Tester la version statique sur votre ordinateur

Dans PowerShell, depuis ce dossier :

```powershell
cd pdf-studio-app
npm ci
$env:PAGES_BASE_PATH='/pdf-studio/'
npm run build:pages
npm run preview:pages
```

Ouvrir l’adresse affichée, généralement `http://127.0.0.1:4173/pdf-studio/`. Le chemin sert à simuler un site de projet GitHub Pages. Le workflow détermine le vrai chemin automatiquement ; il ne faut pas modifier le code avec votre nom de compte.

Pour compiler à la racine d’un domaine :

```powershell
$env:PAGES_BASE_PATH='/'
npm run build:pages
npm run preview:pages
```

Les fichiers de `dist-pages` doivent être servis par HTTP ; ouvrir `index.html` directement avec un double-clic ne suffit pas pour charger le lecteur PDF.

## Les documents des utilisateurs

Chaque utilisateur conserve sa propre bibliothèque dans son navigateur. Le dépôt et la publication ne contiennent pas les PDF importés dans l’application. Les documents ne sont pas partagés entre visiteurs, ordinateurs ou domaines ; un changement d’adresse peut donc nécessiter de réimporter vos fichiers. Les téléchargements restent les copies indépendantes du stockage du navigateur.

Les limites fonctionnelles de cette version sont décrites dans le [guide de l’application](./pdf-studio-app/README.md#confidentialité-et-limites).

Références officielles : [workflows GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [déploiement Vite sur GitHub Pages](https://vite.dev/guide/static-deploy.html#github-pages).
