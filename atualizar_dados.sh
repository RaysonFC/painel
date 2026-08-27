#!/bin/bash
cd "$(dirname "$0")"
echo "========================================"
echo " Food Service - Atualizar base do site"
echo "========================================"
echo ""
python3 prepare_data.py || python prepare_data.py
echo ""
