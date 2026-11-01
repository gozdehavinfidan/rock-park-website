@echo off
rem Rock Park website - local launcher. Double-click to open the site in your browser.
setlocal EnableDelayedExpansion
cd /d "%~dp0site"

rem Pick the first free port
set PORT=
for %%P in (8080 8081 8090 5500 5600 3000) do (
  if not defined PORT (
    netstat -ano | findstr /r /c:":%%P .*LISTENING" >nul || set PORT=%%P
  )
)
if not defined PORT (
  echo No free port found among 8080, 8081, 8090, 5500, 5600, 3000.
  pause & exit /b 1
)

rem Start a static server in its own window (close that window to stop the site)
where python >nul 2>nul && (
  start "Rock Park server - close to stop" /min python -m http.server !PORT! --bind 127.0.0.1
  goto open
)
where py >nul 2>nul && (
  start "Rock Park server - close to stop" /min py -m http.server !PORT! --bind 127.0.0.1
  goto open
)
where npx >nul 2>nul && (
  start "Rock Park server - close to stop" /min npx -y serve@14.2.4 -l !PORT! .
  goto open
)
echo Python or Node.js is needed to run the site locally.
echo Install Python from https://www.python.org/downloads/ and try again.
pause & exit /b 1

:open
rem Give the server a moment, then open the browser
timeout /t 2 /nobreak >nul
start "" "http://localhost:!PORT!/"
echo Rock Park is running at http://localhost:!PORT!/
echo Close the "Rock Park server" window to stop it.
timeout /t 5 >nul
