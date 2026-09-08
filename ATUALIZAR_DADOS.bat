@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================
echo  Painel de Estoque - Atualizar bases
echo  (Food Service + Estoque Varejo)
echo ========================================
echo.
echo Coloque o Geral.xlsx atualizado nesta pasta (raiz do site) e pressione ENTER...
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
