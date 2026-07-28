@echo off
setlocal
cd /d "%~dp0"

if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" run.py
) else (
    echo Local virtual environment not found; trying the Python launcher.
    py run.py
)

exit /b %ERRORLEVEL%
