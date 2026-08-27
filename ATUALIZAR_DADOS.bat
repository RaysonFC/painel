@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================
echo  Food Service - Atualizar base do site
echo ========================================
echo.
echo Coloque o Geral.xlsx atualizado nesta pasta e pressione ENTER...
pause >nul
echo.
python prepare_data.py
if errorlevel 1 (
  echo.
  echo Tentando com py...
  py prepare_data.py
)
echo.
pause
