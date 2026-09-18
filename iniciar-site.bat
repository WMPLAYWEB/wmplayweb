@echo off
title WMPlayWeb
echo ========================================================
echo   Iniciando WMPlayWeb (Sem Kodi)...
echo   Acesse no navegador: http://localhost:3000
echo ========================================================
start http://localhost:3000
node server.js
pause
