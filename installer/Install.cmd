@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
set "SONA_PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if exist "%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe" set "SONA_PS=%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
"%SONA_PS%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Sona.ps1"
set "SONA_RESULT=%ERRORLEVEL%"
if not "%SONA_RESULT%"=="0" if not "%SONA_RESULT%"=="1" (
    echo.
    echo 无法启动 Windows PowerShell，错误码：%SONA_RESULT%。
    pause
)
exit /b %SONA_RESULT%
