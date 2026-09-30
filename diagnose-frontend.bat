@echo off
rem Frontend diagnostic. Run it from the folder that contains package.json and src.
rem It prints a report and also saves it to diagnostic-result.txt
call :run > diagnostic-result.txt 2>&1
type diagnostic-result.txt
echo.
echo Report saved in diagnostic-result.txt - copy its content and send it back.
exit /b

:run
echo ===== Frontend diagnostic =====
echo Folder: %CD%
echo Date:   %DATE% %TIME%
echo.
if not exist package.json echo [!] No package.json in this folder. Run the script from the folder that has package.json and src.
echo --- 1. Key files: last modified / size
for %%F in (index.html src\main.jsx src\App.jsx src\index.css src\components\ChatBot.jsx src\components\Header.jsx src\components\HsbcLogo.jsx src\components\ReviewPanel.jsx src\components\ReviewResult.jsx src\components\AxisRadar.jsx vite.config.js) do call :file "%%F"
echo.
echo --- 2. Markers of the newest version
call :check src\components\ChatBot.jsx "switchMode" "per-mode drafts"
call :check src\components\ChatBot.jsx "analyse:" "chip icons"
call :check src\components\ChatBot.jsx "reviewResult" "real review result"
call :check src\components\ChatBot.jsx "optionsSignal" "env/market validation"
call :check src\components\ChatBot.jsx "stickRef" "scroll handling"
call :check src\components\ReviewPanel.jsx "SOURCE_HINT" "new ReviewPanel"
call :check src\components\HsbcLogo.jsx "HSBC" "logo component"
call :check src\index.css "f5f5f6" "graphite light theme"
call :check src\index.css "--col: 1080px" "wide layout"
call :check src\index.css "review-result" "review result styles"
call :check src\index.css "hint-error" "latest index.css (env/market validation)"
echo.
echo --- 3. Who is listening on port 5173
netstat -ano | findstr ":5173" | findstr LISTENING
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":5173" ^| findstr LISTENING') do call :proc %%P
echo.
echo --- 4. npm scripts in package.json
findstr /C:"\"dev\"" /C:"\"build\"" /C:"\"preview\"" /C:"\"start" package.json
echo.
echo --- 5. start-frontend.bat
if exist start-frontend.bat (type start-frontend.bat) else echo not found in this folder
echo.
echo --- 6. Build and cache folders
if exist dist\index.html (dir /T:W dist\index.html | findstr /I "index.html") else echo dist\index.html not found
if exist node_modules\.vite (echo node_modules\.vite exists) else echo node_modules\.vite not found
echo.
echo --- 7. Versions
node -v
call npm -v
echo.
echo --- 8. Git
where git >nul 2>&1 && (git log -1 --format="%%h %%ad %%s" --date=iso & git status --short) || echo git not available
echo.
echo ===== end =====
exit /b

:file
if exist %1 (echo %~t1  %~z1 bytes  %~1) else echo MISSING                      %~1
exit /b

:check
findstr /C:%2 "%~1" >nul 2>&1 && echo FOUND    %~3 || echo MISSING  %~3  -  %~1
exit /b

:proc
echo PID %1
powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=%1').CommandLine"
exit /b
