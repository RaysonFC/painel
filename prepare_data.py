#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Atualiza data.js a partir de Geral.xlsx (aba COMPARAT_FOOD)."""
import json
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

try:
    import pandas as pd
except ImportError:
    print("ERRO: pandas não instalado. Rode: pip install pandas openpyxl")
    sys.exit(1)

BASE_DIR = Path(__file__).resolve().parent
SRC = BASE_DIR / "Geral.xlsx"
SHEET = "COMPARAT_FOOD"
OUT_FILE = BASE_DIR / "data.js"
META_MENSAL = 644633

COLS = {
    "COD": "cod",
    "DESCRIÇÃO": "descricao",
    "MARCA": "marca",
    "DEPARTAMENTO": "departamento",
    "FATURAMENTO_LIQUID": "faturamento",
    "VENDAS ATUAL CX": "vendas_cx",
    "VENDAS ATUAL UN": "vendas_un",
    "VENDAS M-1 UN": "vendas_m1_un",
    "VENDAS M-2 UN": "vendas_m2_un",
    "VENDAS M-3 UN": "vendas_m3_un",
    "MÉDIA MENSAL UN": "media_mensal_un",
    "GIRO DIA UN": "giro_dia_un",
    "GIRO SEMANA UN": "giro_semana_un",
    "ESTOQUE UN": "estoque_un",
    "ESTOQUE CX": "estoque_cx",
    "DIAS ESTOQUE UN": "dias_estoque_un",
    "ATINGIMENTO META": "atingimento_meta",
    "DTULENT": "data_ultima_entrada",
    "N_PEDIDO": "numero_pedido",
    "QTD_PEDIDA": "qtd_pedida",
    "PREV_ENTREGA": "previsao_entrada",
}


def classify_status_estoque(row):
    estoque = row["estoque_un"] or 0
    dias = row["dias_estoque_un"] or 0
    if estoque == 0:
        return "Ruptura"
    if dias < 20:
        return "Critico"
    if dias <= 60:
        return "OK"
    return "Over"


def classify_status_vendas(atual_raw, m1_raw, m2_raw, m3_raw):
    media_3m = (
        (0 if pd.isna(m1_raw) else m1_raw)
        + (0 if pd.isna(m2_raw) else m2_raw)
        + (0 if pd.isna(m3_raw) else m3_raw)
    ) / 3
    if pd.isna(atual_raw):
        return "Sem Dados"
    variacao = 0 if media_3m == 0 else (atual_raw - media_3m) / media_3m
    if variacao > 0.05:
        return "Crescimento"
    if variacao < -0.05:
        return "Queda"
    return "Estavel"


def classify_situacao(vendas_un, media_mensal_un):
    v = float(vendas_un or 0)
    m = float(media_mensal_un or 0)
    if v <= 0:
        return "Sem Vendas"
    if m <= 0:
        return "Em Andamento"
    pct = v / m
    if pct >= 1:
        return "Bateu a Meta"
    if pct >= 0.5:
        return "Em Andamento"
    return "Abaixo da Meta"


def fmt_date(val):
    if pd.isna(val):
        return ""
    try:
        ts = pd.to_datetime(val)
        if pd.isna(ts):
            return ""
        return ts.strftime("%d/%m/%Y")
    except Exception:
        return str(val) if val is not None else ""


def clean_pedido(x):
    if pd.isna(x):
        return ""
    try:
        f = float(x)
        if f == 0:
            return ""
        if f == int(f):
            return str(int(f))
        return str(f)
    except Exception:
        s = str(x).strip()
        return "" if s in ("0", "0.0") else s


def main():
    if not SRC.exists():
        print(f"ERRO: Arquivo não encontrado: {SRC}")
        sys.exit(1)

    print(f"Lendo: {SRC.name}  |  aba: {SHEET}")
    try:
        df = pd.read_excel(SRC, sheet_name=SHEET, usecols=list(COLS.keys()))
    except ValueError as e:
        print(f"ERRO ao ler a planilha: {e}")
        print("Colunas esperadas:", ", ".join(COLS.keys()))
        sys.exit(1)

    df = df.rename(columns=COLS)
    df = df.dropna(subset=["cod"])
    df["marca"] = df["marca"].fillna("")
    df["departamento"] = df["departamento"].fillna("OUTROS")

    raw_atual = pd.to_numeric(df["vendas_un"], errors="coerce")
    raw_m1 = pd.to_numeric(df["vendas_m1_un"], errors="coerce")
    raw_m2 = pd.to_numeric(df["vendas_m2_un"], errors="coerce")
    raw_m3 = pd.to_numeric(df["vendas_m3_un"], errors="coerce")

    df["status_vendas"] = [
        classify_status_vendas(a, m1, m2, m3)
        for a, m1, m2, m3 in zip(raw_atual, raw_m1, raw_m2, raw_m3)
    ]

    for c in [
        "faturamento", "vendas_cx", "vendas_un", "vendas_m1_un",
        "vendas_m2_un", "vendas_m3_un", "media_mensal_un",
        "giro_dia_un", "giro_semana_un", "estoque_un", "estoque_cx",
        "dias_estoque_un", "atingimento_meta", "qtd_pedida",
    ]:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)

    df["numero_pedido"] = df["numero_pedido"].apply(clean_pedido)
    df["data_ultima_entrada"] = df["data_ultima_entrada"].apply(fmt_date)
    df["previsao_entrada"] = df["previsao_entrada"].apply(fmt_date)
    df["status"] = df.apply(classify_status_estoque, axis=1)
    df["situacao"] = [
        classify_situacao(v, m)
        for v, m in zip(df["vendas_un"], df["media_mensal_un"])
    ]
    df["pct_meta"] = df.apply(
        lambda r: (r["vendas_un"] / r["media_mensal_un"]) if r["media_mensal_un"] else 0,
        axis=1,
    )
    df["cod"] = df["cod"].apply(
        lambda x: str(int(x)) if isinstance(x, float) and x == int(x) else str(x)
    )

    produtos = df[[
        "cod", "descricao", "marca", "departamento", "faturamento",
        "vendas_cx", "vendas_un", "vendas_m1_un", "vendas_m2_un", "vendas_m3_un",
        "media_mensal_un", "giro_dia_un",
        "estoque_un", "estoque_cx", "dias_estoque_un", "atingimento_meta",
        "status", "status_vendas", "situacao", "pct_meta",
        "data_ultima_entrada", "numero_pedido", "qtd_pedida", "previsao_entrada",
    ]].to_dict(orient="records")

    venda_atual = round(float(df["faturamento"].sum()), 2)
    kpis = {
        "meta_mensal": META_MENSAL,
        "venda_atual": venda_atual,
        "falta_meta": round(META_MENSAL - venda_atual, 2),
        "estoque_total_un": int(df["estoque_un"].sum()),
        "qtd_produtos": int(df["cod"].nunique()),
    }

    status_summary = (
        df.groupby("status")
        .agg(
            qtd_produtos=("cod", "count"),
            estoque_un=("estoque_un", "sum"),
            faturamento=("faturamento", "sum"),
        )
        .reset_index()
        .to_dict(orient="records")
    )

    total_vendas_un = float(df["vendas_un"].sum())
    vdf = df.groupby("status_vendas").agg(vendas_un=("vendas_un", "sum")).reset_index()
    vendas_status_summary = []
    for _, row in vdf.iterrows():
        vu = float(row["vendas_un"])
        vendas_status_summary.append({
            "status_vendas": row["status_vendas"],
            "vendas_un": round(vu, 2),
            "pct": round((vu / total_vendas_un * 100) if total_vendas_un else 0, 2),
        })

    dept_summary = (
        df.groupby("departamento")
        .agg(
            faturamento=("faturamento", "sum"),
            vendas_un=("vendas_un", "sum"),
            media_mensal_un=("media_mensal_un", "sum"),
            giro_dia_un=("giro_dia_un", "sum"),
            estoque_un=("estoque_un", "sum"),
        )
        .reset_index()
        .sort_values("faturamento", ascending=False)
    )
    dept_summary["pct_meta"] = dept_summary.apply(
        lambda r: (r["vendas_un"] / r["media_mensal_un"]) if r["media_mensal_un"] else 0,
        axis=1,
    )
    dept_summary["situacao"] = [
        classify_situacao(v, m)
        for v, m in zip(dept_summary["vendas_un"], dept_summary["media_mensal_un"])
    ]
    dept_summary = dept_summary.to_dict(orient="records")

    br_tz = timezone(timedelta(hours=-3))
    generated_at = datetime.now(br_tz).strftime("%d/%m/%Y %H:%M:%S")

    output = {
        "generated_at": generated_at,
        "kpis": kpis,
        "status_summary": status_summary,
        "vendas_status_summary": vendas_status_summary,
        "dept_summary": dept_summary,
        "produtos": produtos,
    }

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        f.write("const DASHBOARD_DATA = ")
        json.dump(output, f, ensure_ascii=False)
        f.write(";\n")

    com_pedido = sum(1 for p in produtos if p.get("numero_pedido"))
    print(f"OK! {OUT_FILE.name} atualizado com {len(produtos)} produtos ({com_pedido} com nº pedido).")
    print(f"   Gerado em:  {generated_at}")
    print(f"   Venda atual: R$ {venda_atual:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."))
    print(f"   Estoque UN:  {kpis['estoque_total_un']:,}".replace(",", "."))


if __name__ == "__main__":
    main()
