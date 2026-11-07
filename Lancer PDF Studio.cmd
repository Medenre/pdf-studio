@echo off
setlocal
cd /d "%~dp0pdf-studio-app"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.13 ou superieur est necessaire pour lancer PDF Studio.
  pause
  exit /b 1
)
if not exist "node_modules\vinext\package.json" (
  echo Installation des dependances...
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo.
echo PDF Studio - votre atelier PDF
echo Ouvrez http://127.0.0.1:5173 dans votre navigateur.
echo Gardez cette fenetre ouverte pendant l'utilisation.
echo Ctrl+C pour arreter le serveur.
echo.
call npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
if errorlevel 1 pause
