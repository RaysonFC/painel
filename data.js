// data.js - Dados estruturados no padrão exato lido pelo script.js

const DASHBOARD_DATA = {
  // KPIs do topo
  kpis: {
    meta_mensal: 644633,          // R$ 644.633 (fixo)
    venda_atual: 15620201,        // R$ 15.620.201 (soma de FATURAMENTO_LIQUID)
    falta_meta: -14975568,        // -R$ 14.975.568 (Meta - Venda Atual)
    estoque_total_un: 8204911     // 8.204.911 (soma de ESTOQUE UN)
  },

  // Dados do gráfico Donut "Vendas Atual UN" (Distribuição DAX 3M)
  vendas_status_summary: [
    { status_vendas: "Estavel", vendas_un: 10.63 },
    { status_vendas: "Crescimento", vendas_un: 37.60 },
    { status_vendas: "Queda", vendas_un: 51.77 }
  ],

  // Barras de estoque por departamento
  dept_summary: [
    { departamento: "MERCEARIA SECA", estoque_un: 2850000 },
    { departamento: "REFRIGERADOS", estoque_un: 1940000 },
    { departamento: "CONGELADOS", estoque_un: 1420000 },
    { departamento: "LIMPEZA E HIGIENE", estoque_un: 890000 },
    { departamento: "HORTIFRUTI", estoque_un: 510000 },
    { departamento: "BEBIDAS", estoque_un: 380000 },
    { departamento: "EMBALAGENS", estoque_un: 140000 },
    { departamento: "OUTROS", estoque_un: 74911 }
  ],

  // Resumo de saúde do estoque (para o Gauge e Tabela de Status)
  status_summary: [
    { status: "Ruptura", qtd_produtos: 145, estoque_un: 0, faturamento: 120000 },
    { status: "Critico", qtd_produtos: 320, estoque_un: 850000, faturamento: 2400000 },
    { status: "OK", qtd_produtos: 1250, estoque_un: 4800000, faturamento: 9800000 },
    { status: "Over", qtd_produtos: 410, estoque_un: 2554911, faturamento: 3300201 }
  ],

  // Tabela de produtos detalhada
  produtos: [
    {
      descricao: "ARROZ TIPO 1 5KG",
      departamento: "MERCEARIA SECA",
      marca: "TIO JOAO",
      estoque_un: 45000,
      dias_estoque_un: 12.5,
      faturamento: 350000,
      status: "OK"
    },
    {
      descricao: "OLEO DE SOJA 900ML",
      departamento: "MERCEARIA SECA",
      marca: "SOYA",
      estoque_un: 12000,
      dias_estoque_un: 3.2,
      faturamento: 180000,
      status: "Critico"
    },
    {
      descricao: "FEIJAO PRETO 1KG",
      departamento: "MERCEARIA SECA",
      marca: "CAMIL",
      estoque_un: 0,
      dias_estoque_un: 0.0,
      faturamento: 95000,
      status: "Ruptura"
    },
    {
      descricao: "QUEIJO MUSSARELA KG",
      departamento: "REFRIGERADOS",
      marca: "SEARA",
      estoque_un: 85000,
      dias_estoque_un: 45.0,
      faturamento: 820000,
      status: "Over"
    }
  ]
};
