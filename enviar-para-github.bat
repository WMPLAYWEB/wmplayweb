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

echo [*] Preparando arquivos...
%GIT_PATH% add .

echo [*] Criando commit...
%GIT_PATH% commit -m "WMPlayWeb: Versao completa com Filmes, Series, Canais e Auth"

echo.
echo [*] Enviando para o GitHub (https://github.com/WMPLAYWEB/WMPLAYWEB)...
echo [*] Se uma janela do navegador abrir, confirme o login do GitHub.
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
    echo  [AVISO] Se o envio falhou, certifique-se de que fez
    echo  login no GitHub na tela que apareceu.
    echo ======================================================
)

echo.
pause
