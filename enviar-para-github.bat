@echo off
chcp 65001 > nul
title WMPlayWeb - Enviar para o GitHub
echo ======================================================
echo    WMPLAYWEB - ENVIANDO PROJETO PARA O GITHUB
echo ======================================================
echo.

set GIT_PATH="C:\Program Files\Git\cmd\git.exe"

if not exist %GIT_PATH% (
    set GIT_PATH=git
)

echo [*] Sincronizando com o GitHub...
%GIT_PATH% pull origin main --no-edit

echo [*] Preparando arquivos...
%GIT_PATH% add .

echo [*] Registrando alteracoes...
%GIT_PATH% commit -m "WMPlayWeb: Atualizacao com pastas public e services" 2>nul

echo.
echo [*] Enviando para https://github.com/WMPLAYWEB/WMPLAYWEB ...
echo [*] Se uma janela do navegador abrir pedindo login no GitHub, confirme.
echo.

%GIT_PATH% push -u origin main

echo.
if %errorlevel% equ 0 (
    echo ======================================================
    echo  [SUCESSO] Projeto enviado com sucesso para o GitHub!
    echo  Acesse: https://github.com/WMPLAYWEB/WMPLAYWEB
    echo ======================================================
) else (
    echo ======================================================
    echo  [AVISO] Se o push foi rejeitado ou pediu permissao:
    echo  Tentando enviar com sincronizacao forcada...
    %GIT_PATH% push -u origin main --force
    echo ======================================================
)

echo.
pause
