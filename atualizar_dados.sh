#!/bin/bash
cd "$(dirname "$0")"
echo "========================================"
echo " Painel de Estoque - Atualizar bases"
echo " (Food Service + Estoque Varejo)"
echo "========================================"
echo ""
python3 prepare_data.py || python prepare_data.py
echo ""
