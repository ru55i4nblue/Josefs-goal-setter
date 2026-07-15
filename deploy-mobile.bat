@echo off
REM ============================================================
REM  Goal Setter - build the web app and deploy it to Netlify
REM  (updates the hosted site your iPhone PWA loads from).
REM
REM  First run: it will open a browser to log in to Netlify, then
REM  ask you to link a site -> choose "Use current git remote" is
REM  not needed; pick "Link this directory to an existing site" and
REM  select your Goal Setter site (or create a new one).
REM  After that first setup, future runs just deploy in one click.
REM ============================================================
setlocal
cd /d "%~dp0"
title Deploy Goal Setter (mobile)

echo.
echo  [1/2] Building web app (www/) ...
call npm run build:web
if errorlevel 1 ( echo BUILD FAILED & pause & exit /b 1 )

echo  [2/2] Deploying to Netlify ...
call npx --yes netlify-cli deploy --prod --dir=www
if errorlevel 1 ( echo DEPLOY FAILED - see messages above. & pause & exit /b 1 )

echo.
echo  Done. On your iPhone: fully close Goal Setter (swipe it away)
echo  and reopen it from the home screen to pick up the update.
echo.
pause
