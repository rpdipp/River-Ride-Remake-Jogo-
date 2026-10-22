@echo off
setlocal
title River Strike 1944
rem Abre o jogo (arquivo unico pc\index.html) numa janela de jogo do Edge ou do Chrome.
rem Se nenhum dos dois for encontrado, abre no navegador padrao.

set "GAME=%~dp0pc\index.html"
if not exist "%GAME%" goto :missing

set "BROWSER="
call :try "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
call :try "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
call :try "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
call :try "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
call :try "%LocalAppData%\Google\Chrome\Application\chrome.exe"

if defined BROWSER (
  start "" "%BROWSER%" --app="file:///%GAME%" --start-maximized
) else (
  start "" "%GAME%"
)
exit /b 0

:try
if not defined BROWSER if exist "%~1" set "BROWSER=%~1"
exit /b 0

:missing
echo.
echo   Arquivo do jogo nao encontrado:
echo   %GAME%
echo   Baixe o projeto completo, incluindo a pasta "pc".
echo.
pause
exit /b 1
