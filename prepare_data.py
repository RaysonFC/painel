import json
import pandas as pd

# Arquivos na mesma pasta do script
SRC = "Geral.xlsx"
SHEET = "COMPARAT_FOOD"
OUT_FILE = "data.js"

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
    "GIRO SEMANA UN": "giro_semana_un",
    "ESTOQUE UN": "estoque_un",
    "ESTOQUE CX": "estoque_cx",
    "DIAS ESTOQUE UN": "dias_estoque_un",
    "ATINGIMENTO META": "atingimento_meta",
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

def main():
    df = pd.read_excel(SRC, sheet_name=SHEET, usecols=list(COLS.keys()))
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

    for c in ["faturamento", "vendas_cx", "vendas_un", "vendas_m1_un",
              "vendas_m2_un", "vendas_m3_un", "media_mensal_un",
              "giro_semana_un", "estoque_un", "estoque_cx", "dias_estoque_un",
              "atingimento_meta"]:
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)

    df["status"] = df.apply(classify_status_estoque, axis=1)

    produtos = df[[
        "cod", "descricao", "marca", "departamento", "faturamento",
        "vendas_cx", "vendas_un", "estoque_un", "estoque_cx",
        "dias_estoque_un", "atingimento_meta", "status", "status_vendas",
    ]].to_dict(orient="records")

    venda_atual = round(df["faturamento"].sum(), 2)
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

    # Cálculo percentual para o gráfico Donut
    total_vendas_un = df["vendas_un"].sum()
    vendas_df = df.groupby("status_vendas").agg(vendas_un=("vendas_un", "sum")).reset_index()
    if total_vendas_un > 0:
        vendas_df["vendas_un"] = (vendas_df["vendas_un"] / total_vendas_un * 100).round(2)
    vendas_status_summary = vendas_df.to_dict(orient="records")

    dept_summary = (
        df.groupby("departamento")
        .agg(
            faturamento=("faturamento", "sum"),
            vendas_un=("vendas_un", "sum"),
            estoque_un=("estoque_un", "sum"),
        )
        .reset_index()
        .sort_values("faturamento", ascending=False)
        .to_dict(orient="records")
    )

    dept_status = (
        df.groupby(["departamento", "status"])
        .agg(qtd_produtos=("cod", "count"), estoque_un=("estoque_un", "sum"))
        .reset_index()
        .to_dict(orient="records")
    )

    output = {
        "kpis": kpis,
        "status_summary": status_summary,
        "vendas_status_summary": vendas_status_summary,
        "dept_summary": dept_summary,
        "dept_status": dept_status,
        "produtos": produtos,
    }

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        f.write("const DASHBOARD_DATA = ")
        json.dump(output, f, ensure_ascii=False)
        f.write(";\n")

    print(f"Sucesso! Arquivo '{OUT_FILE}' atualizado com {len(produtos)} produtos.")

if __name__ == "__main__":
    main()
