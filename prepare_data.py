#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Atualiza food/data.js e varejo/data.js a partir de Geral.xlsx.

  Food Service   <- aba COMPARAT_FOOD              -> food/data.js
  Estoque Varejo <- aba Estoque (CATEGORIA=VAREJO) -> varejo/data.js
  Pedidos        <- aba Pedidos - 8151             -> campo pedidos no varejo/data.js
"""
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
META_MENSAL = 520000

BR_TZ = timezone(timedelta(hours=-3))


def generated_at_now():
    return datetime.now(BR_TZ).strftime("%d/%m/%Y %H:%M:%S")


# =========================================================
#  FOOD SERVICE  (aba COMPARAT_FOOD)
# =========================================================
FOOD_SHEET = "COMPARAT_FOOD"
FOOD_OUT = BASE_DIR / "food" / "data.js"

FOOD_COLS = {
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


def food_classify_status_estoque(row):
    estoque = row["estoque_un"] or 0
    dias = row["dias_estoque_un"] or 0
    if estoque == 0:
        return "Ruptura"
    if dias < 20:
        return "Critico"
    if dias <= 60:
        return "OK"
    return "Over"


def food_classify_status_vendas(atual_raw, m1_raw, m2_raw, m3_raw):
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


def food_classify_situacao(vendas_un, media_mensal_un):
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


def clean_cod(x):
    return str(int(x)) if isinstance(x, float) and x == int(x) else str(x)


def build_food():
    print(f"[FOOD] Lendo: {SRC.name}  |  aba: {FOOD_SHEET}")
    try:
        df = pd.read_excel(SRC, sheet_name=FOOD_SHEET, usecols=list(FOOD_COLS.keys()))
    except ValueError as e:
        print(f"[FOOD] ERRO ao ler a planilha: {e}")
        print("Colunas esperadas:", ", ".join(FOOD_COLS.keys()))
        sys.exit(1)

    df = df.rename(columns=FOOD_COLS)
    df = df.dropna(subset=["cod"])
    df["marca"] = df["marca"].fillna("")
    df["departamento"] = df["departamento"].fillna("OUTROS")

    raw_atual = pd.to_numeric(df["vendas_un"], errors="coerce")
    raw_m1 = pd.to_numeric(df["vendas_m1_un"], errors="coerce")
    raw_m2 = pd.to_numeric(df["vendas_m2_un"], errors="coerce")
    raw_m3 = pd.to_numeric(df["vendas_m3_un"], errors="coerce")

    df["status_vendas"] = [
        food_classify_status_vendas(a, m1, m2, m3)
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
    df["status"] = df.apply(food_classify_status_estoque, axis=1)
    df["situacao"] = [
        food_classify_situacao(v, m)
        for v, m in zip(df["vendas_un"], df["media_mensal_un"])
    ]
    df["pct_meta"] = df.apply(
        lambda r: (r["vendas_un"] / r["media_mensal_un"]) if r["media_mensal_un"] else 0,
        axis=1,
    )
    df["cod"] = df["cod"].apply(clean_cod)

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
        .agg(qtd_produtos=("cod", "count"), estoque_un=("estoque_un", "sum"), faturamento=("faturamento", "sum"))
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
            faturamento=("faturamento", "sum"), vendas_un=("vendas_un", "sum"),
            media_mensal_un=("media_mensal_un", "sum"), giro_dia_un=("giro_dia_un", "sum"),
            estoque_un=("estoque_un", "sum"),
        )
        .reset_index()
        .sort_values("faturamento", ascending=False)
    )
    dept_summary["pct_meta"] = dept_summary.apply(
        lambda r: (r["vendas_un"] / r["media_mensal_un"]) if r["media_mensal_un"] else 0, axis=1
    )
    dept_summary["situacao"] = [
        food_classify_situacao(v, m)
        for v, m in zip(dept_summary["vendas_un"], dept_summary["media_mensal_un"])
    ]
    dept_summary = dept_summary.to_dict(orient="records")

    output = {
        "generated_at": generated_at_now(),
        "kpis": kpis,
        "status_summary": status_summary,
        "vendas_status_summary": vendas_status_summary,
        "dept_summary": dept_summary,
        "produtos": produtos,
    }

    FOOD_OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(FOOD_OUT, "w", encoding="utf-8") as f:
        f.write("const DASHBOARD_DATA = ")
        json.dump(output, f, ensure_ascii=False)
        f.write(";\n")

    print(f"[FOOD] OK! {FOOD_OUT.relative_to(BASE_DIR)} atualizado com {len(produtos)} produtos.")
    print(f"        Venda atual: R$ {venda_atual:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."))


# =========================================================
#  ESTOQUE VAREJO  (aba Estoque, CATEGORIA = VAREJO)
# =========================================================
VAREJO_SHEET = "Estoque"
VAREJO_OUT = BASE_DIR / "varejo" / "data.js"
VAREJO_CATEGORIA = "VAREJO"

VAREJO_COLS = {
    "CODPROD": "cod",
    "DESCRIÇÃO": "descricao",
    "MARCA": "marca",
    "DEPARTAMENTO": "departamento",
    "CATEGORIA": "categoria",
    "ESTOQUEGERALUN": "estoque_un",
    "ESTOQUEGERCX": "estoque_cx",
    "VENDMESCX": "vendas_cx",
    "VENDMESUN": "vendas_un",
    "PVENDA": "pvenda",
    "CMV": "cmv",
    "DTULTENT": "data_ultima_entrada",
    "MÉDIA MENSAL UN": "media_mensal_un",
    "GIRO DIA UN": "giro_dia_un",
    "GIRO SEMANA UN": "giro_semana_un",
}

# Pedidos em trânsito (aba Pedidos - 8151)
PEDIDOS_SHEET = "Pedidos - 8151"
PEDIDOS_COLS = {
    "Cód. Produto": "cod",
    "Descrição Produto": "descricao",
    "Marcas": "marca",
    "Número Pedido": "numero_pedido",
    "Qt. Pedida": "qtd_pedida",
    "Qt. Entregue": "qtd_entregue",
    "Saldo Pendent": "saldo_pendente",
    "Valor Pendente": "valor_pendente",
    "Dt. Última Entrada": "data_ultima_entrada",
    "Previsão Entrega": "previsao_entrada",
}


def varejo_classify_status(estoque_un, giro_dia_un, dias):
    estoque_un = estoque_un or 0
    giro_dia_un = giro_dia_un or 0
    dias = dias or 0
    if estoque_un <= 0:
        return "Ruptura"
    if giro_dia_un <= 0:
        return "SemGiro"
    if dias < 20:
        return "Critico"
    if dias <= 60:
        return "OK"
    return "Over"


def _norm_col(name):
    """Normaliza nome de coluna para comparação flexível."""
    s = str(name).strip().upper()
    # remove acentos comuns
    for a, b in (
        ("Á", "A"), ("À", "A"), ("Ã", "A"), ("Â", "A"),
        ("É", "E"), ("Ê", "E"),
        ("Í", "I"),
        ("Ó", "O"), ("Ô", "O"), ("Õ", "O"),
        ("Ú", "U"),
        ("Ç", "C"),
    ):
        s = s.replace(a, b)
    s = " ".join(s.split())
    return s


def _resolve_varejo_columns(df_columns):
    """Mapeia colunas reais da planilha para os nomes internos, tolerando
    acentos, espaços e colunas opcionais (ex.: CATEGORIA ausente no Excel do GitHub).
    """
    available = {_norm_col(c): c for c in df_columns}
    # aliases: nome lógico normalizado -> possíveis rótulos na planilha
    wanted = {
        "CODPROD": ["CODPROD", "COD PROD", "CODIGO", "CODIGO PRODUTO"],
        "DESCRICAO": ["DESCRICAO", "DESCRICAO PRODUTO", "PRODUTO"],
        "MARCA": ["MARCA"],
        "DEPARTAMENTO": ["DEPARTAMENTO", "DEPTO"],
        "CATEGORIA": ["CATEGORIA", "CATEG", "CAT"],
        "ESTOQUEGERALUN": ["ESTOQUEGERALUN", "ESTOQUE GERAL UN", "ESTOQUE UN"],
        "ESTOQUEGERCX": ["ESTOQUEGERCX", "ESTOQUE GERAL CX", "ESTOQUE CX"],
        "VENDMESCX": ["VENDMESCX", "VEND MES CX", "VENDA MES CX"],
        "VENDMESUN": ["VENDMESUN", "VEND MES UN", "VENDA MES UN"],
        "PVENDA": ["PVENDA", "PRECO VENDA", "PRECO"],
        "CMV": ["CMV"],
        "DTULTENT": ["DTULTENT", "DT ULT ENT", "DATA ULTIMA ENTRADA", "DTULTENTRADA"],
        "MEDIA MENSAL UN": ["MEDIA MENSAL UN", "MEDIA MENSALUN", "MEDIA UN"],
        "GIRO DIA UN": ["GIRO DIA UN", "GIRODIA UN", "GIRO DIA"],
        "GIRO SEMANA UN": ["GIRO SEMANA UN", "GIROSEMANA UN", "GIRO SEMANA"],
    }
    # chave VAREJO_COLS (original) -> nome interno
    logical_to_internal = {
        "CODPROD": "cod",
        "DESCRICAO": "descricao",
        "MARCA": "marca",
        "DEPARTAMENTO": "departamento",
        "CATEGORIA": "categoria",
        "ESTOQUEGERALUN": "estoque_un",
        "ESTOQUEGERCX": "estoque_cx",
        "VENDMESCX": "vendas_cx",
        "VENDMESUN": "vendas_un",
        "PVENDA": "pvenda",
        "CMV": "cmv",
        "DTULTENT": "data_ultima_entrada",
        "MEDIA MENSAL UN": "media_mensal_un",
        "GIRO DIA UN": "giro_dia_un",
        "GIRO SEMANA UN": "giro_semana_un",
    }
    rename = {}
    missing_required = []
    required = {"CODPROD", "DESCRICAO", "MARCA", "DEPARTAMENTO", "ESTOQUEGERALUN"}
    for logical, aliases in wanted.items():
        found = None
        for al in aliases:
            if _norm_col(al) in available:
                found = available[_norm_col(al)]
                break
        # também tenta match direto se a chave original existir com acento
        if found is None:
            for real in df_columns:
                if _norm_col(real) == _norm_col(logical):
                    found = real
                    break
        if found is not None:
            rename[found] = logical_to_internal[logical]
        elif logical in required:
            missing_required.append(logical)
    return rename, missing_required


def build_varejo():
    print(f"[VAREJO] Lendo: {SRC.name}  |  aba: {VAREJO_SHEET}")
    try:
        df_raw = pd.read_excel(SRC, sheet_name=VAREJO_SHEET)
    except Exception as e:
        print(f"[VAREJO] ERRO ao ler a planilha: {e}")
        sys.exit(1)

    rename_map, missing_req = _resolve_varejo_columns(df_raw.columns)
    if missing_req:
        print(f"[VAREJO] ERRO: colunas obrigatórias ausentes: {missing_req}")
        print("Colunas na planilha:", ", ".join(str(c) for c in df_raw.columns))
        sys.exit(1)

    optional_missing = [k for k in ("categoria", "estoque_cx", "vendas_cx", "vendas_un", "pvenda", "cmv",
                                      "media_mensal_un", "giro_dia_un", "giro_semana_un", "data_ultima_entrada")
                        if k not in rename_map.values()]
    if optional_missing:
        print(f"[VAREJO] Aviso: colunas opcionais ausentes (seguindo sem elas): {optional_missing}")

    df = df_raw.rename(columns=rename_map)
    # mantém só colunas mapeadas
    keep = [c for c in rename_map.values() if c in df.columns]
    df = df[keep].copy()

    df = df.dropna(subset=["cod"])
    if "categoria" in df.columns:
        before = len(df)
        df = df[df["categoria"].fillna("").astype(str).str.upper().str.contains(VAREJO_CATEGORIA, na=False)].copy()
        print(f"[VAREJO] Filtro CATEGORIA={VAREJO_CATEGORIA}: {before} -> {len(df)} linhas")
    else:
        print("[VAREJO] Aviso: coluna CATEGORIA não existe nesta planilha — usando todas as linhas da aba Estoque.")

    if "marca" not in df.columns:
        df["marca"] = ""
    if "departamento" not in df.columns:
        df["departamento"] = "OUTROS"
    df["marca"] = df["marca"].fillna("")
    df["departamento"] = df["departamento"].fillna("OUTROS")

    for c in [
        "estoque_un", "estoque_cx", "vendas_cx", "vendas_un", "pvenda", "cmv",
        "media_mensal_un", "giro_dia_un", "giro_semana_un",
    ]:
        if c not in df.columns:
            df[c] = 0
        else:
            df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)

    if "data_ultima_entrada" not in df.columns:
        df["data_ultima_entrada"] = ""
    if "descricao" not in df.columns:
        df["descricao"] = ""

    df["dias_estoque_un"] = df.apply(
        lambda r: (r["estoque_un"] / r["giro_dia_un"]) if r["giro_dia_un"] else 0, axis=1
    )
    df["valor_estoque"] = df["estoque_un"] * df["pvenda"]
    df["status"] = [
        varejo_classify_status(e, g, d)
        for e, g, d in zip(df["estoque_un"], df["giro_dia_un"], df["dias_estoque_un"])
    ]
    df["data_ultima_entrada"] = df["data_ultima_entrada"].apply(fmt_date)
    df["cod"] = df["cod"].apply(clean_cod)

    produtos = df[[
        "cod", "descricao", "marca", "departamento",
        "estoque_un", "estoque_cx", "vendas_cx", "vendas_un",
        "media_mensal_un", "giro_dia_un", "giro_semana_un",
        "pvenda", "cmv", "valor_estoque", "dias_estoque_un",
        "status", "data_ultima_entrada",
    ]].to_dict(orient="records")

    valor_estoque_total = round(float(df["valor_estoque"].sum()), 2)
    kpis = {
        "estoque_total_un": int(df["estoque_un"].sum()),
        "valor_estoque": valor_estoque_total,
        "qtd_produtos": int(df["cod"].nunique()),
        "ruptura": int((df["status"] == "Ruptura").sum()),
        "sem_giro": int((df["status"] == "SemGiro").sum()),
    }

    status_summary = (
        df.groupby("status")
        .agg(qtd_produtos=("cod", "count"), estoque_un=("estoque_un", "sum"), valor_estoque=("valor_estoque", "sum"))
        .reset_index()
        .to_dict(orient="records")
    )

    dept_summary = (
        df.groupby("departamento")
        .agg(
            valor_estoque=("valor_estoque", "sum"), estoque_un=("estoque_un", "sum"),
            vendas_un=("vendas_un", "sum"), giro_dia_un=("giro_dia_un", "sum"),
        )
        .reset_index()
        .sort_values("valor_estoque", ascending=False)
        .to_dict(orient="records")
    )

    # ---------- Pedidos em trânsito (Pedidos - 8151) ----------
    pedidos = []
    try:
        print(f"[VAREJO] Lendo pedidos: {SRC.name}  |  aba: {PEDIDOS_SHEET}")
        pdf = pd.read_excel(SRC, sheet_name=PEDIDOS_SHEET, usecols=list(PEDIDOS_COLS.keys()))
        pdf = pdf.rename(columns=PEDIDOS_COLS)
        pdf = pdf.dropna(subset=["cod"])
        for c in ["qtd_pedida", "qtd_entregue", "saldo_pendente", "valor_pendente"]:
            pdf[c] = pd.to_numeric(pdf[c], errors="coerce").fillna(0)
        pdf = pdf[pdf["saldo_pendente"] > 0].copy()
        pdf["cod"] = pdf["cod"].apply(clean_cod)
        pdf["marca"] = pdf["marca"].fillna("")
        pdf["numero_pedido"] = pdf["numero_pedido"].apply(clean_pedido)
        pdf["descricao"] = pdf["descricao"].fillna("")

        raw_ult = pd.to_datetime(pdf["data_ultima_entrada"], errors="coerce")
        raw_prev = pd.to_datetime(pdf["previsao_entrada"], errors="coerce")
        show_prev = (raw_prev.notna()) & (raw_ult.isna() | (raw_ult < raw_prev))
        pdf["data_ultima_entrada"] = raw_ult.apply(
            lambda x: x.strftime("%d/%m/%Y") if pd.notna(x) else ""
        )
        pdf["previsao_entrada"] = [
            (p.strftime("%d/%m/%Y") if show and pd.notna(p) else "")
            for p, show in zip(raw_prev, show_prev)
        ]

        pedidos = pdf[[
            "cod", "descricao", "marca", "numero_pedido",
            "qtd_pedida", "qtd_entregue", "saldo_pendente", "valor_pendente",
            "data_ultima_entrada", "previsao_entrada",
        ]].sort_values("valor_pendente", ascending=False).to_dict(orient="records")
        print(f"[VAREJO] Pedidos em trânsito: {len(pedidos)} linhas com saldo pendente > 0.")
    except Exception as e:
        print(f"[VAREJO] Aviso: não foi possível carregar pedidos ({e}). Continuando sem pedidos.")

    output = {
        "generated_at": generated_at_now(),
        "kpis": kpis,
        "status_summary": status_summary,
        "dept_summary": dept_summary,
        "produtos": produtos,
        "pedidos": pedidos,
    }

    VAREJO_OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(VAREJO_OUT, "w", encoding="utf-8") as f:
        f.write("const DASHBOARD_DATA = ")
        json.dump(output, f, ensure_ascii=False)
        f.write(";\n")

    print(f"[VAREJO] OK! {VAREJO_OUT.relative_to(BASE_DIR)} atualizado com {len(produtos)} produtos.")
    print(f"          Valor de estoque: R$ {valor_estoque_total:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."))
    print(f"          Pedidos em trânsito: {len(pedidos)}")


def main():
    if not SRC.exists():
        print(f"ERRO: Arquivo não encontrado: {SRC}")
        sys.exit(1)
    try:
        build_food()
    except Exception as e:
        print(f"[FOOD] Aviso: falha ao gerar Food Service ({e}). Continuando com Varejo.")
    build_varejo()
    print("Concluído.")


if __name__ == "__main__":
    main()
