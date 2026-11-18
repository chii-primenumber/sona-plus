@echo off
setlocal
chcp 65001 >nul
set "SONA_PLUGIN_DIR=%~dp0"
if "%SONA_PLUGIN_DIR:~-1%"=="\" set "SONA_PLUGIN_DIR=%SONA_PLUGIN_DIR:~0,-1%"
set "SONA_TMP_PS=%TEMP%\SonaPlus_Update_%RANDOM%%RANDOM%.ps1"
copy /y "%~dp0Update-Sona.ps1" "%SONA_TMP_PS%" >nul
cd /d "%TEMP%"
set "SONA_PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if exist "%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe" set "SONA_PS=%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
"%SONA_PS%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SONA_TMP_PS%" -PluginDir "%SONA_PLUGIN_DIR%"
set "SONA_RESULT=%ERRORLEVEL%"
del /f /q "%SONA_TMP_PS%" >nul 2>&1
if not "%SONA_RESULT%"=="0" if not "%SONA_RESULT%"=="1" (
    echo.
    echo 无法启动 Windows PowerShell，错误码：%SONA_RESULT%。
    pause
)
exit /b %SONA_RESULT%
