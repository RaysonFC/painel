// script.js - Dashboard Food Service | Estoque

const VENDAS_COLORS = {
  Crescimento: "#7cb342",
  Queda: "#e04b3f",
  Estavel: "#2a3d6b",
};
const VENDAS_ORDER = ["Estavel", "Crescimento", "Queda"];
const VENDAS_LABELS = {
  Crescimento: "📈 Crescimento",
  Queda: "📉 Queda",
  Estavel: "➡️ Estável",
};

const STATUS_LABELS = { Ruptura: "Ruptura", Critico: "Crítico", OK: "OK", Over: "Over" };

const SITUACAO_LABELS = {
  "Bateu a Meta": "Bateu a Meta",
  "Em Andamento": "Em Andamento",
  "Abaixo da Meta": "Abaixo da Meta",
  "Sem Vendas": "Sem Vendas",
};
const SITUACAO_CLASS = {
  "Bateu a Meta": "sit-bateu",
  "Em Andamento": "sit-andamento",
  "Abaixo da Meta": "sit-abaixo",
  "Sem Vendas": "sit-sem",
};

const data = DASHBOARD_DATA;
const META_MENSAL = (data.kpis && data.kpis.meta_mensal) || 644633;
const PAGE_SIZE = 20;

let state = {
  status: "Todos",
  search: "",
  sortKey: "faturamento",
  sortDir: "desc",
  page: 1,
  topN: 0,
  selectedMarcas: new Set(),
  selectedDept: null,
  selectedVendasStatus: null,
  entradaSearch: "",
  entradaSortKey: "data_ultima_entrada",
  entradaSortDir: "desc",
  entradaPage: 1,
};

const ALL_MARCAS = (() => {
  const set = new Set();
  (data.produtos || []).forEach((p) => {
    const m = (p.marca || "").trim();
    if (m) set.add(m);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
})();

const fmtMoney = (v) =>
  "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtInt = (v) => Number(v || 0).toLocaleString("pt-BR");
const fmtNum = (v, d) =>
  Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPct = (v) =>
  (Number(v || 0) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";

function logScale(value, maxVal) {
  const v = Math.max(0, Number(value) || 0);
  const m = Math.max(1e-9, Number(maxVal) || 1);
  if (v <= 0) return 0;
  return (Math.log10(1 + v) / Math.log10(1 + m)) * 100;
}

/**
 * Filtro central de produtos. Cada painel do dashboard usa esta mesma
 * função, escolhendo quais eixos de filtro aplicar — assim toda regra
 * de filtro vive num único lugar, em vez de repetida em cada painel.
 *   marca:  respeita as marcas selecionadas no dropdown
 *   dept:   respeita o departamento selecionado (clique na tabela de saúde)
 *   status: respeita o status de estoque selecionado (clique nos chips)
 */
function filterProducts({ marca = true, dept = true, status = true, vendasStatus = true } = {}) {
  let rows = data.produtos || [];
  if (marca && state.selectedMarcas.size > 0) {
    rows = rows.filter((p) => state.selectedMarcas.has((p.marca || "").trim()));
  }
  if (dept && state.selectedDept) {
    rows = rows.filter((p) => (p.departamento || "") === state.selectedDept);
  }
  if (status && state.status && state.status !== "Todos") {
    rows = rows.filter((p) => p.status === state.status);
  }
  if (vendasStatus && state.selectedVendasStatus) {
    rows = rows.filter((p) => (p.status_vendas || "Sem Dados") === state.selectedVendasStatus);
  }
  return rows;
}

function getBaseProducts() {
  return filterProducts(); // marca + departamento + status, todos ativos
}

function classifySituacao(vendas_un, media_mensal_un) {
  const v = Number(vendas_un) || 0;
  const m = Number(media_mensal_un) || 0;
  if (v <= 0) return "Sem Vendas";
  if (m <= 0) return "Em Andamento";
  const pct = v / m;
  if (pct >= 1) return "Bateu a Meta";
  if (pct >= 0.5) return "Em Andamento";
  return "Abaixo da Meta";
}

function computeKpis(products) {
  const venda_atual = products.reduce((s, p) => s + (Number(p.faturamento) || 0), 0);
  const estoque_total_un = products.reduce((s, p) => s + (Number(p.estoque_un) || 0), 0);
  return {
    meta_mensal: META_MENSAL,
    venda_atual: Math.round(venda_atual * 100) / 100,
    falta_meta: Math.round((META_MENSAL - venda_atual) * 100) / 100,
    estoque_total_un: Math.round(estoque_total_un),
  };
}

function computeVendasStatusSummary(products) {
  const totals = { Crescimento: 0, Queda: 0, Estavel: 0, "Sem Dados": 0 };
  products.forEach((p) => {
    const st = p.status_vendas || "Sem Dados";
    totals[st] = (totals[st] || 0) + (Number(p.vendas_un) || 0);
  });
  const total = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
  return VENDAS_ORDER.map((st) => ({
    status_vendas: st,
    vendas_un: totals[st] || 0,
    pct: Math.round(((totals[st] || 0) / total) * 10000) / 100,
  }));
}

function computeDeptBars(products) {
  const map = {};
  products.forEach((p) => {
    const d = p.departamento || "OUTROS";
    if (!map[d]) map[d] = { departamento: d, faturamento: 0, vendas_un: 0 };
    map[d].faturamento += Number(p.faturamento) || 0;
    map[d].vendas_un += Number(p.vendas_un) || 0;
  });
  return Object.values(map)
    .filter((d) => d.faturamento > 0 && d.vendas_un > 0)
    .sort((a, b) => b.faturamento - a.faturamento);
}

const ESTOQUE_STATUS_ORDER = ["Ruptura", "Critico", "OK", "Over"];
const ESTOQUE_STATUS_COLORS = {
  Ruptura: "#e04b3f",
  Critico: "#f0973d",
  OK: "#7cb342",
  Over: "#2D6CDF",
};
const ESTOQUE_STATUS_LABELS = {
  Ruptura: "⚠️ Ruptura",
  Critico: "🔴 Crítico",
  OK: "🟢 OK",
  Over: "🔵 Over",
};

function computeDeptHealth(productsForHealth) {
  const map = {};
  productsForHealth.forEach((p) => {
    const d = p.departamento || "OUTROS";
    if (!map[d]) {
      map[d] = {
        departamento: d,
        faturamento: 0,
        vendas_un: 0,
        media_mensal_un: 0,
        giro_dia_un: 0,
        estoque_un: 0,
        statusCounts: { Ruptura: 0, Critico: 0, OK: 0, Over: 0 },
      };
    }
    map[d].faturamento += Number(p.faturamento) || 0;
    map[d].vendas_un += Number(p.vendas_un) || 0;
    map[d].media_mensal_un += Number(p.media_mensal_un) || 0;
    map[d].giro_dia_un += Number(p.giro_dia_un) || 0;
    map[d].estoque_un += Number(p.estoque_un) || 0;
    const st = p.status || "Ruptura";
    if (map[d].statusCounts[st] !== undefined) map[d].statusCounts[st]++;
  });
  return Object.values(map)
    .map((r) => {
      const pct = r.media_mensal_un ? r.vendas_un / r.media_mensal_un : 0;
      // status predominante (mais produtos); empate → prioridade Ruptura > Critico > OK > Over
      let best = "OK";
      let bestN = -1;
      ESTOQUE_STATUS_ORDER.forEach((st) => {
        const n = r.statusCounts[st] || 0;
        if (n > bestN) {
          bestN = n;
          best = st;
        }
      });
      return {
        ...r,
        pct_meta: pct,
        situacao: classifySituacao(r.vendas_un, r.media_mensal_un),
        status_estoque: best,
      };
    })
    .sort((a, b) => b.faturamento - a.faturamento);
}

/** Resumo de status de estoque a partir dos produtos filtrados */
function computeEstoqueStatusSummary(products) {
  const counts = { Ruptura: 0, Critico: 0, OK: 0, Over: 0 };
  products.forEach((p) => {
    const st = p.status || "Ruptura";
    if (counts[st] !== undefined) counts[st]++;
  });
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 0;
  return ESTOQUE_STATUS_ORDER.map((st) => ({
    status: st,
    qtd: counts[st],
    pct: total ? (counts[st] / total) * 100 : 0,
  }));
}

function renderUpdatedAt() {
  const el = document.getElementById("data-updated");
  if (!el) return;
  const ts = data.generated_at || "—";
  el.textContent = "Dados atualizados em: " + ts;
}

function renderKpis(kpis) {
  document.getElementById("kpi-meta-mensal").textContent = fmtMoney(kpis.meta_mensal);
  document.getElementById("kpi-venda-atual").textContent = fmtMoney(kpis.venda_atual);
  const elFalta = document.getElementById("kpi-falta-meta");
  if (elFalta) {
    elFalta.textContent = fmtMoney(kpis.falta_meta);
    elFalta.style.color = kpis.falta_meta < 0 ? "#ffb4b0" : "";
  }
  document.getElementById("kpi-estoque-un").textContent = fmtInt(kpis.estoque_total_un);
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function donutSliceD(cx, cy, rOuter, rInner, startAngle, endAngle) {
  const sa = startAngle + 90, ea = endAngle + 90;
  const p1 = polarToCartesian(cx, cy, rOuter, sa);
  const p2 = polarToCartesian(cx, cy, rOuter, ea);
  const p3 = polarToCartesian(cx, cy, rInner, ea);
  const p4 = polarToCartesian(cx, cy, rInner, sa);
  const largeArc = ea - sa > 180 ? 1 : 0;
  return (
    "M " + p1.x + " " + p1.y +
    " A " + rOuter + " " + rOuter + " 0 " + largeArc + " 1 " + p2.x + " " + p2.y +
    " L " + p3.x + " " + p3.y +
    " A " + rInner + " " + rInner + " 0 " + largeArc + " 0 " + p4.x + " " + p4.y + " Z"
  );
}

function toggleVendasStatus(st) {
  state.selectedVendasStatus = state.selectedVendasStatus === st ? null : st;
  state.page = 1;
  refreshAll();
}

function renderDonut(vendasSummary, vendaAtual) {
  const svg = document.getElementById("donut");
  const legend = document.getElementById("donut-legend");
  const ordered = VENDAS_ORDER.map((st) =>
    vendasSummary.find((s) => s.status_vendas === st)
  ).filter(Boolean);
  const totalPct = ordered.reduce((a, s) => a + s.pct, 0);

  const totalElem = document.getElementById("donut-total");
  if (totalElem) totalElem.textContent = fmtMoney(Math.round(vendaAtual));

  // viewBox 480x480 — donut grande, com miolo generoso pra caber o valor total
  const cx = 240, cy = 240, rOuter = 165, rInner = 108, rLabel = 195;
  let angleStart = -90;
  const paths = [];
  const labels = [];
  const activeSt = state.selectedVendasStatus;

  ordered.forEach((s) => {
    const frac = totalPct ? s.pct / totalPct : 0;
    const angleEnd = angleStart + frac * 360;
    const mid = (angleStart + angleEnd) / 2;
    const isActive = activeSt === s.status_vendas;
    const dimmed = !!activeSt && !isActive;
    const d = donutSliceD(cx, cy, rOuter, rInner, angleStart, angleEnd);
    paths.push(
      '<path d="' + d + '" fill="' + VENDAS_COLORS[s.status_vendas] + '"' +
      ' opacity="' + (dimmed ? 0.3 : 1) + '"' +
      ' stroke="' + (isActive ? "#0d1b3a" : "none") + '" stroke-width="' + (isActive ? 3 : 0) + '"' +
      ' class="donut-slice" data-vstatus="' + s.status_vendas + '"></path>'
    );
    if (s.pct >= 2) {
      const pos = polarToCartesian(cx, cy, rLabel, mid + 90);
      labels.push(
        '<text x="' + pos.x.toFixed(1) + '" y="' + pos.y.toFixed(1) +
        '" text-anchor="middle" dominant-baseline="middle" class="donut-pct-label">' +
        Number(s.pct).toFixed(1) + "%</text>"
      );
    }
    angleStart = angleEnd;
  });

  if (svg) svg.innerHTML = paths.join("") + labels.join("");

  if (legend) {
    legend.innerHTML = ordered
      .map((s) => {
        const isActive = activeSt === s.status_vendas;
        return (
          '<li class="legend-item' + (isActive ? " active" : "") + '" data-vstatus="' + s.status_vendas + '">' +
          '<span class="dot" style="background:' + VENDAS_COLORS[s.status_vendas] + '"></span>' +
          '<span class="lg-label">' + VENDAS_LABELS[s.status_vendas] + '</span>' +
          '<span class="lg-value">' + Number(s.pct).toFixed(1) + "% · " +
          fmtInt(Math.round(s.vendas_un)) + " un</span></li>"
        );
      })
      .join("");
  }

  svg?.querySelectorAll(".donut-slice").forEach((el) => {
    el.addEventListener("click", () => toggleVendasStatus(el.getAttribute("data-vstatus")));
  });
  legend?.querySelectorAll(".legend-item").forEach((el) => {
    el.addEventListener("click", () => toggleVendasStatus(el.getAttribute("data-vstatus")));
  });
}

function updateVendasFilterUI() {
  const btn = document.getElementById("clear-vendas-filter");
  if (!btn) return;
  if (state.selectedVendasStatus) {
    btn.hidden = false;
    btn.textContent = "✕ Limpar: " + (VENDAS_LABELS[state.selectedVendasStatus] || state.selectedVendasStatus);
  } else {
    btn.hidden = true;
  }
}

function arcPath(cx, cy, r, a1, a2) {
  const toRad = (a) => (a * Math.PI) / 180;
  const p1 = { x: cx + r * Math.cos(toRad(a1)), y: cy + r * Math.sin(toRad(a1)) };
  const p2 = { x: cx + r * Math.cos(toRad(a2)), y: cy + r * Math.sin(toRad(a2)) };
  const largeArc = a2 - a1 > 180 ? 1 : 0;
  return "M " + p1.x + " " + p1.y + " A " + r + " " + r + " 0 " + largeArc + " 1 " + p2.x + " " + p2.y;
}

function renderMetaGauge(kpis) {
  const meta = Number(kpis.meta_mensal) || 0;
  const atual = Number(kpis.venda_atual) || 0;
  const ratio = meta > 0 ? atual / meta : 0;
  const cappedRatio = Math.max(0, Math.min(1, ratio));

  const svg = document.getElementById("meta-gauge");
  if (svg) {
    const cx = 100, cy = 100, r = 82;
    const startA = -180, endA = 0;
    const valueA = startA + cappedRatio * 180;
    const bg = arcPath(cx, cy, r, startA, endA);
    const fg = arcPath(cx, cy, r, startA, valueA);
    const color =
      ratio >= 1 ? "#7cb342" : ratio >= 0.7 ? "#3b7ddd" : ratio >= 0.4 ? "#f0973d" : "#e04b3f";
    svg.innerHTML =
      '<path d="' + bg + '" stroke="#e1e5ee" stroke-width="16" fill="none" stroke-linecap="round"/>' +
      '<path d="' + fg + '" stroke="' + color + '" stroke-width="16" fill="none" stroke-linecap="round"/>';
  }

  const pctEl = document.getElementById("meta-gauge-pct");
  if (pctEl) {
    pctEl.textContent =
      (ratio * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
  }
  const metaEl = document.getElementById("meta-gauge-meta");
  if (metaEl) metaEl.textContent = fmtMoney(meta);
  const atualEl = document.getElementById("meta-gauge-atual");
  if (atualEl) atualEl.textContent = fmtMoney(atual);
}

/** Medidor dividido por status de estoque (% + qtd de itens) */
function renderStatusMeter(summary) {
  const meter = document.getElementById("status-meter");
  const legend = document.getElementById("status-meter-legend");
  const totalEl = document.getElementById("status-meter-total");
  if (!meter) return;

  const total = summary.reduce((s, x) => s + x.qtd, 0);
  if (totalEl) totalEl.textContent = fmtInt(total) + " itens";

  if (!total) {
    meter.innerHTML = '<div class="status-meter-empty">Sem itens no filtro</div>';
    if (legend) legend.innerHTML = "";
    return;
  }

  meter.innerHTML = summary
    .filter((s) => s.qtd > 0)
    .map((s) => {
      const w = Math.max(s.pct, s.pct > 0 ? 2 : 0);
      return (
        '<div class="status-meter-seg" style="width:' +
        w.toFixed(2) +
        "%;background:" +
        (ESTOQUE_STATUS_COLORS[s.status] || "#999") +
        '" title="' +
        (ESTOQUE_STATUS_LABELS[s.status] || s.status) +
        ": " +
        s.pct.toFixed(1) +
        "% · " +
        fmtInt(s.qtd) +
        ' itens"></div>'
      );
    })
    .join("");

  if (legend) {
    legend.innerHTML = summary
      .map((s) => {
        const active = state.status === s.status ? " active" : "";
        return (
          '<li class="status-meter-item' +
          active +
          '" data-status="' +
          s.status +
          '">' +
          '<span class="status-meter-dot" style="background:' +
          (ESTOQUE_STATUS_COLORS[s.status] || "#999") +
          '"></span>' +
          '<span class="status-meter-label">' +
          (ESTOQUE_STATUS_LABELS[s.status] || s.status) +
          "</span>" +
          '<span class="status-meter-vals">' +
          s.pct.toFixed(1).replace(".", ",") +
          "% · " +
          fmtInt(s.qtd) +
          " un</span></li>"
        );
      })
      .join("");

    legend.querySelectorAll(".status-meter-item").forEach((el) => {
      el.addEventListener("click", () => {
        const st = el.getAttribute("data-status");
        state.status = state.status === st ? "Todos" : st;
        state.page = 1;
        state.entradaPage = 1;
        document.querySelectorAll("#entrada-status-filters .chip").forEach((b) => {
          b.classList.toggle("active", b.dataset.status === state.status);
        });
        refreshAll();
      });
    });
  }
}

function updateSaudePanelMode() {
  const isEstoque = document.body.dataset.mobileTab === "estoque";
  const isMobile = window.matchMedia("(max-width: 768px)").matches;
  const modeMeta = document.getElementById("gauge-mode-meta");
  const modeStatus = document.getElementById("gauge-mode-status");
  const title = document.getElementById("saude-title");

  if (isMobile && isEstoque) {
    if (modeMeta) modeMeta.hidden = true;
    if (modeStatus) modeStatus.hidden = false;
    if (title) title.textContent = "SAÚDE DO ESTOQUE POR STATUS";
  } else {
    if (modeMeta) modeMeta.hidden = false;
    if (modeStatus) modeStatus.hidden = true;
    if (title) title.textContent = "SAÚDE DO ESTOQUE POR DEPARTAMENTO";
  }
}

function renderDeptBars(deptBars) {
  const el = document.getElementById("dept-bars");
  if (!el) return;
  if (!deptBars.length) {
    el.innerHTML = '<p class="empty-bars">Nenhum departamento com faturamento e vendas &gt; 0</p>';
    return;
  }

  const maxFat = Math.max(...deptBars.map((d) => d.faturamento), 1);
  const maxVend = Math.max(...deptBars.map((d) => d.vendas_un), 1);

  el.innerHTML = deptBars
    .map((d) => {
      const pctFat = logScale(d.faturamento, maxFat);
      const pctVend = logScale(d.vendas_un, maxVend);
      return (
        '<div class="cluster-row">' +
        '<span class="cluster-label" title="' + d.departamento + '">' + d.departamento + "</span>" +
        '<div class="cluster-tracks">' +
          '<div class="cluster-track-outer track-fat">' +
            '<div class="cluster-track"><div class="cluster-fill fat" style="width:' + pctFat + '%"></div></div>' +
            '<span class="cluster-val-ext">' + fmtMoney(d.faturamento) + "</span>" +
          "</div>" +
          '<div class="cluster-track-outer track-vend">' +
            '<div class="cluster-track"><div class="cluster-fill vend" style="width:' + pctVend + '%"></div></div>' +
            '<span class="cluster-val-ext">' + fmtInt(d.vendas_un) + " un</span>" +
          "</div>" +
        "</div></div>"
      );
    })
    .join("");
}

function bindDeptClick(el) {
  if (!el) return;
  el.addEventListener("click", () => {
    const dept = el.getAttribute("data-dept");
    state.selectedDept = state.selectedDept === dept ? null : dept;
    state.page = 1;
    state.entradaPage = 1;
    updateDeptFilterUI();
    refreshAll();
  });
}

function renderDeptHealth(deptHealth) {
  const tbody = document.querySelector("#dept-health-table tbody");
  if (tbody) {
    tbody.innerHTML = deptHealth
      .map((r) => {
        const sit = r.situacao || "Sem Vendas";
        const cls = SITUACAO_CLASS[sit] || "sit-sem";
        const active = state.selectedDept === r.departamento ? " row-active" : "";
        const deptAttr = (r.departamento || "").replace(/"/g, "&quot;");
        return (
          '<tr class="dept-row' + active + '" data-dept="' + deptAttr + '">' +
          "<td>" + (r.departamento || "") +
          '</td><td class="num col-fat">' + fmtMoney(r.faturamento) +
          '</td><td class="num col-hide-tablet">' + fmtNum(r.media_mensal_un, 0) +
          '</td><td class="num col-hide-tablet">' + fmtNum(r.vendas_un, 0) +
          '</td><td class="num col-hide-tablet">' + fmtNum(r.giro_dia_un, 1) +
          '</td><td><span class="sit-badge ' + cls + '">' + (SITUACAO_LABELS[sit] || sit) +
          '</span></td><td class="num col-pct">' + fmtPct(r.pct_meta) + "</td></tr>"
        );
      })
      .join("");

    tbody.querySelectorAll("tr.dept-row").forEach(bindDeptClick);
  }

  // Lista curta mobile — conteúdo muda conforme a aba
  const mobileList = document.getElementById("dept-health-mobile");
  if (mobileList) {
    const isEstoque = document.body.dataset.mobileTab === "estoque";
    // na aba estoque ordenar por estoque
    const rows = isEstoque
      ? [...deptHealth].sort((a, b) => (b.estoque_un || 0) - (a.estoque_un || 0))
      : deptHealth;

    mobileList.innerHTML = rows
      .map((r) => {
        const active = state.selectedDept === r.departamento ? " active" : "";
        const deptAttr = (r.departamento || "").replace(/"/g, "&quot;");
        let valueHtml;
        let badgeHtml;
        if (isEstoque) {
          const sc = r.statusCounts || {};
          valueHtml = fmtInt(r.estoque_un) + " un";
          // Mini breakdown: ⚠️ n · 🔴 n · 🟢 n · 🔵 n
          badgeHtml =
            '<span class="dept-status-break">' +
            '<span class="dsb dsb-rup" title="Ruptura">⚠️ ' + fmtInt(sc.Ruptura || 0) + "</span>" +
            '<span class="dsb dsb-cri" title="Crítico">🔴 ' + fmtInt(sc.Critico || 0) + "</span>" +
            '<span class="dsb dsb-ok" title="OK">🟢 ' + fmtInt(sc.OK || 0) + "</span>" +
            '<span class="dsb dsb-over" title="Over">🔵 ' + fmtInt(sc.Over || 0) + "</span>" +
            "</span>";
        } else {
          const sit = r.situacao || "Sem Vendas";
          const cls = SITUACAO_CLASS[sit] || "sit-sem";
          valueHtml = fmtMoney(r.faturamento);
          badgeHtml =
            '<span class="sit-badge ' + cls + '">' + (SITUACAO_LABELS[sit] || sit) + "</span>";
        }
        return (
          '<li class="dept-mobile-item' +
          active +
          '" data-dept="' +
          deptAttr +
          '">' +
          '<div class="dept-mobile-left">' +
          '<span class="dept-mobile-name">' +
          (r.departamento || "") +
          "</span>" +
          '<span class="dept-mobile-fat">' +
          valueHtml +
          "</span>" +
          "</div>" +
          badgeHtml +
          "</li>"
        );
      })
      .join("");
    mobileList.querySelectorAll(".dept-mobile-item").forEach(bindDeptClick);
  }
}

function updateDeptFilterUI() {
  const btn = document.getElementById("clear-dept-filter");
  if (!btn) return;
  if (state.selectedDept) {
    btn.hidden = false;
    btn.textContent = "✕ Limpar: " + state.selectedDept;
  } else {
    btn.hidden = true;
  }
}

function getFilteredProducts(baseProducts) {
  let rows = baseProducts;
  if (state.search) {
    const q = state.search.toLowerCase();
    rows = rows.filter(
      (p) =>
        String(p.cod || "").toLowerCase().includes(q) ||
        (p.descricao || "").toLowerCase().includes(q) ||
        (p.marca || "").toLowerCase().includes(q) ||
        (p.departamento || "").toLowerCase().includes(q)
    );
  }
  if (state.topN > 0) {
    rows = [...rows].sort((a, b) => (Number(b.faturamento) || 0) - (Number(a.faturamento) || 0));
    rows = rows.slice(0, state.topN);
  }
  const key = state.sortKey;
  const dir = state.sortDir === "asc" ? 1 : -1;
  rows = [...rows].sort((a, b) => {
    const va = a[key] ?? "", vb = b[key] ?? "";
    if (typeof va === "string") return String(va).localeCompare(String(vb)) * dir;
    return (va - vb) * dir;
  });
  return rows;
}

function renderTable(baseProducts) {
  const tbody = document.getElementById("product-tbody");
  if (!tbody) return;
  const rows = getFilteredProducts(baseProducts);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  state.page = Math.min(Math.max(1, state.page), totalPages);
  const startIdx = (state.page - 1) * PAGE_SIZE;
  const pageRows = rows.slice(startIdx, startIdx + PAGE_SIZE);

  tbody.innerHTML = pageRows
    .map((p) => {
      const sv = p.status_vendas || "Estavel";
      return (
        '<tr><td class="col-cod">' + (p.cod || "") +
        "</td><td>" + (p.descricao || "") +
        '</td><td class="col-hide-mobile">' + (p.departamento || "") +
        '</td><td class="col-hide-mobile">' + (p.marca || "") +
        '</td><td class="num">' + fmtInt(p.vendas_un) +
        '</td><td class="num col-hide-tablet">' + fmtInt(p.vendas_m1_un) +
        '</td><td class="num col-hide-tablet">' + fmtInt(p.vendas_m2_un) +
        '</td><td class="num col-hide-tablet">' + fmtInt(p.vendas_m3_un) +
        '</td><td class="num col-hide-tablet">' + fmtInt(p.media_mensal_un) +
        '</td><td class="num col-hide-mobile">' + fmtMoney(p.faturamento) +
        '</td><td><span class="vendas-text vendas-' + sv + '">' +
        (VENDAS_LABELS[sv] || sv) + "</span></td></tr>"
      );
    })
    .join("");

  renderPagination(rows.length, totalPages);
}

function renderPagination(totalRows, totalPages) {
  const el = document.getElementById("pagination");
  if (!el) return;
  el.innerHTML =
    '<button id="prev-page" ' + (state.page <= 1 ? "disabled" : "") + ">‹ Anterior</button>" +
    "<span>Página " + state.page + " de " + totalPages + " (" + fmtInt(totalRows) + " produtos)</span>" +
    '<button id="next-page" ' + (state.page >= totalPages ? "disabled" : "") + ">Próxima ›</button>";

  document.getElementById("prev-page")?.addEventListener("click", () => {
    state.page--;
    refreshAll();
  });
  document.getElementById("next-page")?.addEventListener("click", () => {
    state.page++;
    refreshAll();
  });
}



function updateMarcaToggleText() {
  const el = document.getElementById("marca-toggle-text");
  const hint = document.getElementById("marca-hint");
  const n = state.selectedMarcas.size;
  if (n === 0) {
    el.textContent = "Todas as marcas";
    if (hint) hint.textContent = "(" + ALL_MARCAS.length + " marcas)";
  } else if (n === 1) {
    el.textContent = Array.from(state.selectedMarcas)[0];
    if (hint) hint.textContent = "(1 marca selecionada)";
  } else {
    el.textContent = n + " marcas selecionadas";
    if (hint) hint.textContent = "";
  }
}

function renderMarcaList(filterText) {
  filterText = filterText || "";
  const list = document.getElementById("marca-list");
  if (!list) return;
  const q = filterText.trim().toLowerCase();
  const items = ALL_MARCAS.filter((m) => !q || m.toLowerCase().includes(q));

  list.innerHTML = items
    .map((m) => {
      const checked = state.selectedMarcas.has(m) ? "checked" : "";
      const safeId = "marca-" + m.replace(/[^a-zA-Z0-9]/g, "_");
      const safeAttr = m.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
      return (
        '<li class="ms-item"><label for="' + safeId +
        '"><input type="checkbox" id="' + safeId +
        '" data-marca="' + safeAttr + '" ' + checked +
        "><span>" + m.replace(/</g, "&lt;") + "</span></label></li>"
      );
    })
    .join("");

  list.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const marca = cb.getAttribute("data-marca");
      if (cb.checked) state.selectedMarcas.add(marca);
      else state.selectedMarcas.delete(marca);
      updateMarcaToggleText();
      state.page = 1;
      refreshAll();
    });
  });
}

function setupMarcaDropdown() {
  const toggle = document.getElementById("marca-toggle");
  const panel = document.getElementById("marca-panel");
  const search = document.getElementById("marca-search");
  const selectAll = document.getElementById("marca-select-all");
  const clearBtn = document.getElementById("marca-clear");
  const dropdown = document.getElementById("marca-dropdown");
  if (!toggle || !panel) return;

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = !panel.hidden;
    panel.hidden = open;
    toggle.setAttribute("aria-expanded", String(!open));
    if (!open) {
      if (search) search.value = "";
      renderMarcaList("");
      if (search) search.focus();
    }
  });

  document.addEventListener("click", (e) => {
    if (dropdown && !dropdown.contains(e.target)) {
      panel.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
    }
  });

  if (search) search.addEventListener("input", () => renderMarcaList(search.value));

  if (selectAll) {
    selectAll.addEventListener("click", () => {
      ALL_MARCAS.forEach((m) => state.selectedMarcas.add(m));
      updateMarcaToggleText();
      renderMarcaList(search ? search.value : "");
      state.page = 1;
      refreshAll();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      state.selectedMarcas.clear();
      updateMarcaToggleText();
      renderMarcaList(search ? search.value : "");
      state.page = 1;
      refreshAll();
    });
  }

  const clearDept = document.getElementById("clear-dept-filter");
  if (clearDept) {
    clearDept.addEventListener("click", () => {
      state.selectedDept = null;
      state.page = 1;
      updateDeptFilterUI();
      refreshAll();
    });
  }

  const clearVendas = document.getElementById("clear-vendas-filter");
  if (clearVendas) {
    clearVendas.addEventListener("click", () => {
      state.selectedVendasStatus = null;
      state.page = 1;
      updateVendasFilterUI();
      refreshAll();
    });
  }

  renderMarcaList("");
  updateMarcaToggleText();
  updateDeptFilterUI();
}

function setupTableControls() {
  const searchBox = document.getElementById("search-box");
  if (searchBox) {
    searchBox.addEventListener("input", (e) => {
      state.search = e.target.value;
      state.page = 1;
      refreshAll();
    });
  }

  document.querySelectorAll("#entrada-status-filters .chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#entrada-status-filters .chip").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.status = btn.dataset.status;
      state.page = 1;
      state.entradaPage = 1;
      refreshAll();
    });
  });

  document.querySelectorAll(".top-filters .chip-top").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".top-filters .chip-top").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.topN = Number(btn.dataset.top) || 0;
      state.page = 1;
      refreshAll();
    });
  });

  document.querySelectorAll(".product-table th[data-key]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = key;
        state.sortDir = "desc";
      }
      state.page = 1;
      refreshAll();
    });
  });
}

/* ---------- Exportar ---------- */

/** Lê checkboxes de status de um modal. Retorna [] = todos os status. */
function readExportStatusChecks(containerId) {
  const root = document.getElementById(containerId);
  if (!root) return [];
  const allCb = root.querySelector(".export-status-all");
  if (allCb && allCb.checked) return [];
  const selected = Array.from(root.querySelectorAll(".export-status-item:checked")).map(
    (el) => el.value
  );
  return selected; // vazio também = todos
}

/** Liga a lógica Todos ↔ itens individuais nos checkboxes de status */
function bindExportStatusGroup(containerId) {
  const root = document.getElementById(containerId);
  if (!root) return;
  const allCb = root.querySelector(".export-status-all");
  const items = root.querySelectorAll(".export-status-item");
  if (!allCb) return;

  allCb.addEventListener("change", () => {
    if (allCb.checked) {
      items.forEach((cb) => { cb.checked = false; });
    }
  });
  items.forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) allCb.checked = false;
      // se nenhum item marcado, volta para Todos
      const any = Array.from(items).some((c) => c.checked);
      if (!any) allCb.checked = true;
    });
  });
}

function getExportRows(topN, statusList) {
  // marca + departamento vêm do filtro central; status vem do modal (lista)
  let rows = filterProducts({ status: false });
  if (statusList && statusList.length > 0) {
    const set = new Set(statusList);
    rows = rows.filter((p) => set.has(p.status));
  }
  rows = [...rows].sort((a, b) => (Number(b.faturamento) || 0) - (Number(a.faturamento) || 0));
  if (topN > 0) rows = rows.slice(0, topN);
  return rows;
}

function escapeCsv(v) {
  const s = String(v ?? "");
  if (/[;",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function downloadBlob(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportCsv(rows) {
  const headers = [
    "COD", "Descrição", "Departamento", "Marca",
    "Vendas Atual UN", "Vendas M-1 UN", "Vendas M-2 UN", "Vendas M-3 UN",
    "Média Mensal UN", "Faturamento", "Status Vendas",
  ];
  const lines = [headers.join(";")];
  rows.forEach((p) => {
    lines.push([
      escapeCsv(p.cod),
      escapeCsv(p.descricao),
      escapeCsv(p.departamento),
      escapeCsv(p.marca),
      escapeCsv(p.vendas_un),
      escapeCsv(p.vendas_m1_un),
      escapeCsv(p.vendas_m2_un),
      escapeCsv(p.vendas_m3_un),
      escapeCsv(p.media_mensal_un),
      escapeCsv(Number(p.faturamento || 0).toFixed(2)),
      escapeCsv(VENDAS_LABELS[p.status_vendas] || p.status_vendas),
    ].join(";"));
  });
  // BOM para Excel abrir UTF-8 corretamente
  const content = "\uFEFF" + lines.join("\n");
  const stamp = (data.generated_at || "").replace(/[/: ]/g, "-") || "export";
  downloadBlob("produtos_" + stamp + ".csv", content, "text/csv;charset=utf-8");
}

function exportXls(rows) {
  // HTML table que o Excel abre como planilha
  let html = '<html><head><meta charset="UTF-8"></head><body><table border="1">';
  html += "<tr><th>COD</th><th>Descrição</th><th>Departamento</th><th>Marca</th>" +
    "<th>Estoque UN</th><th>Dias Estoque</th><th>Vendas Atual UN</th>" +
    "<th>Faturamento</th><th>Status</th></tr>";
  rows.forEach((p) => {
    html +=
      "<tr><td>" + (p.cod || "") +
      "</td><td>" + (p.descricao || "") +
      "</td><td>" + (p.departamento || "") +
      "</td><td>" + (p.marca || "") +
      "</td><td>" + (p.estoque_un || 0) +
      "</td><td>" + Number(p.dias_estoque_un || 0).toFixed(1) +
      "</td><td>" + (p.vendas_un || 0) +
      "</td><td>" + Number(p.faturamento || 0).toFixed(2) +
      "</td><td>" + (STATUS_LABELS[p.status] || p.status) +
      "</td></tr>";
  });
  html += "</table></body></html>";
  const stamp = (data.generated_at || "").replace(/[/: ]/g, "-") || "export";
  downloadBlob(
    "produtos_" + stamp + ".xls",
    html,
    "application/vnd.ms-excel;charset=utf-8"
  );
}

function setupExport() {
  const modal = document.getElementById("export-modal");
  const openBtn = document.getElementById("btn-export");
  const closeBtn = document.getElementById("export-close");
  const cancelBtn = document.getElementById("export-cancel");
  const confirmBtn = document.getElementById("export-confirm");
  if (!modal || !openBtn) return;

  bindExportStatusGroup("export-status");

  const open = () => { modal.hidden = false; };
  const close = () => { modal.hidden = true; };

  openBtn.addEventListener("click", open);
  closeBtn?.addEventListener("click", close);
  cancelBtn?.addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });

  confirmBtn?.addEventListener("click", () => {
    const topEl = document.querySelector('input[name="export-top"]:checked');
    const fmtEl = document.querySelector('input[name="export-format"]:checked');
    const topN = Number(topEl?.value || 0);
    const statusList = readExportStatusChecks("export-status");
    const format = fmtEl?.value || "csv";
    const rows = getExportRows(topN, statusList);
    if (!rows.length) {
      alert("Nenhum produto para exportar com esses filtros.");
      return;
    }
    if (format === "xlsx") exportXls(rows);
    else exportCsv(rows);
    close();
  });
}


function updateStatusCounts() {
  const rows = filterProducts({ status: false, vendasStatus: false });
  const counts = { Todos: rows.length, Ruptura: 0, Critico: 0, OK: 0, Over: 0 };
  rows.forEach((p) => {
    if (counts[p.status] !== undefined) counts[p.status]++;
  });
  ["Todos", "Ruptura", "Critico", "OK", "Over"].forEach((st) => {
    const el = document.getElementById("count-" + st);
    if (el) el.textContent = "(" + fmtInt(counts[st] || 0) + ")";
  });
}

/* ---------- ENTRADAS / PEDIDOS ---------- */
const ENTRADA_PAGE_SIZE = 20;

/** Converte dd/mm/yyyy → timestamp (ms) ou null se inválida */
function parseBRDate(s) {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
}

/**
 * Regra de Previsão de Entrada:
 * - se Data Última Entrada ≥ Previsão de Entrada → "0"
 * - se Data Última Entrada < Previsão → mantém a data
 * - se faltar alguma data válida → mantém o valor original ou "0"
 */
function displayPrevisao(p) {
  const ultima = parseBRDate(p.data_ultima_entrada);
  const prev = parseBRDate(p.previsao_entrada);
  if (ultima != null && prev != null) {
    if (ultima >= prev) return "0";
    return p.previsao_entrada || "0";
  }
  // SEM PEDIDO / texto sem data
  const raw = String(p.previsao_entrada || "").trim();
  if (!raw || raw.toUpperCase() === "SEM PEDIDO") return "0";
  return raw;
}

/** Nº pedido vazio ou inválido → "0" */
function displayPedido(p) {
  const n = String(p.numero_pedido || "").trim();
  if (!n || n === "0" || n === "0.0") return "0";
  return n;
}

function hasPedido(p) {
  const n = String(p.numero_pedido || "").trim();
  return !!n && n !== "0" && n !== "0.0";
}

/**
 * Linhas da tabela ENTRADAS.
 * opts.statusFilter: override do status (para export)
 * opts.pedidoFilter: "todos" | "com" | "sem"
 */
function getEntradaRows(opts = {}) {
  // statusFilter: string legada, ou statusList: array de status do modal
  const statusList = opts.statusList;
  const statusOverride = opts.statusFilter;
  const pedidoFilter = opts.pedidoFilter || "todos";

  let rows;
  if (Array.isArray(statusList)) {
    rows = filterProducts({ status: false, vendasStatus: false });
    if (statusList.length > 0) {
      const set = new Set(statusList);
      rows = rows.filter((p) => set.has(p.status));
    }
  } else if (statusOverride && statusOverride !== "Todos") {
    rows = filterProducts({ status: false, vendasStatus: false }).filter(
      (p) => p.status === statusOverride
    );
  } else if (statusOverride === "Todos") {
    rows = filterProducts({ status: false, vendasStatus: false });
  } else {
    // usa status do site (chips)
    rows = filterProducts({ vendasStatus: false });
  }

  if (pedidoFilter === "com") {
    rows = rows.filter(hasPedido);
  } else if (pedidoFilter === "sem") {
    rows = rows.filter((p) => !hasPedido(p));
  }

  if (state.entradaSearch) {
    const q = state.entradaSearch.toLowerCase();
    rows = rows.filter(
      (p) =>
        String(p.cod || "").toLowerCase().includes(q) ||
        (p.descricao || "").toLowerCase().includes(q) ||
        (p.marca || "").toLowerCase().includes(q) ||
        (p.departamento || "").toLowerCase().includes(q) ||
        String(p.numero_pedido || "").toLowerCase().includes(q) ||
        String(p.data_ultima_entrada || "").toLowerCase().includes(q) ||
        String(p.previsao_entrada || "").toLowerCase().includes(q)
    );
  }

  const key = state.entradaSortKey;
  const dir = state.entradaSortDir === "asc" ? 1 : -1;
  rows = [...rows].sort((a, b) => {
    let va = a[key] ?? "";
    let vb = b[key] ?? "";
    if (key === "data_ultima_entrada" || key === "previsao_entrada") {
      const parse = (s) => parseBRDate(s) || 0;
      // para previsão, ordenar pelo valor exibido (0 se última ≥ previsão)
      if (key === "previsao_entrada") {
        const da = displayPrevisao(a);
        const db = displayPrevisao(b);
        const ta = da === "0" ? 0 : parse(da);
        const tb = db === "0" ? 0 : parse(db);
        return (ta - tb) * dir;
      }
      return (parse(va) - parse(vb)) * dir;
    }
    if (key === "numero_pedido") {
      const na = hasPedido(a) ? String(a.numero_pedido) : "0";
      const nb = hasPedido(b) ? String(b.numero_pedido) : "0";
      return na.localeCompare(nb, "pt-BR", { numeric: true }) * dir;
    }
    if (typeof va === "string") return String(va).localeCompare(String(vb), "pt-BR") * dir;
    return ((Number(va) || 0) - (Number(vb) || 0)) * dir;
  });
  return rows;
}

function renderEntradaTable() {
  const tbody = document.getElementById("entrada-tbody");
  if (!tbody) return;
  const rows = getEntradaRows();
  const totalPages = Math.max(1, Math.ceil(rows.length / ENTRADA_PAGE_SIZE));
  state.entradaPage = Math.min(Math.max(1, state.entradaPage), totalPages);
  const startIdx = (state.entradaPage - 1) * ENTRADA_PAGE_SIZE;
  const pageRows = rows.slice(startIdx, startIdx + ENTRADA_PAGE_SIZE);

  tbody.innerHTML = pageRows
    .map((p) => {
      const pedido = displayPedido(p);
      const previsao = displayPrevisao(p);
      const qtd = p.qtd_pedida ? fmtInt(p.qtd_pedida) : "0";
      return (
        '<tr><td class="col-cod">' + (p.cod || "") +
        "</td><td>" + (p.descricao || "") +
        '</td><td class="num">' + fmtInt(p.estoque_un) +
        '</td><td class="num col-hide-tablet">' + Number(p.dias_estoque_un || 0).toFixed(1) +
        '</td><td class="col-hide-tablet">' + (p.departamento || "") +
        '</td><td class="col-hide-tablet">' + (p.marca || "") +
        '</td><td class="col-hide-tablet">' + (p.data_ultima_entrada || "—") +
        "</td><td>" + pedido +
        "</td><td>" + previsao +
        '</td><td class="num col-hide-mobile">' + qtd +
        '</td><td><span class="status-badge status-' + p.status + '">' +
        (STATUS_LABELS[p.status] || p.status) + "</span></td></tr>"
      );
    })
    .join("");

  const el = document.getElementById("entrada-pagination");
  if (el) {
    el.innerHTML =
      '<button id="entrada-prev" ' + (state.entradaPage <= 1 ? "disabled" : "") + ">‹ Anterior</button>" +
      "<span>Página " + state.entradaPage + " de " + totalPages + " (" + fmtInt(rows.length) + " itens)</span>" +
      '<button id="entrada-next" ' + (state.entradaPage >= totalPages ? "disabled" : "") + ">Próxima ›</button>";
    document.getElementById("entrada-prev")?.addEventListener("click", () => {
      state.entradaPage--;
      renderEntradaTable();
    });
    document.getElementById("entrada-next")?.addEventListener("click", () => {
      state.entradaPage++;
      renderEntradaTable();
    });
  }
}

function exportEntradaCsv(rows) {
  const headers = [
    "COD", "Descrição", "Estoque UN", "Dias Estoque", "Departamento", "Marca",
    "Data Última Entrada", "Nº Pedido", "Previsão de Entrada", "Qtd. Pedida", "Status",
  ];
  const lines = [headers.join(";")];
  rows.forEach((p) => {
    lines.push([
      escapeCsv(p.cod),
      escapeCsv(p.descricao),
      escapeCsv(p.estoque_un),
      escapeCsv(Number(p.dias_estoque_un || 0).toFixed(1)),
      escapeCsv(p.departamento),
      escapeCsv(p.marca),
      escapeCsv(p.data_ultima_entrada),
      escapeCsv(displayPedido(p)),
      escapeCsv(displayPrevisao(p)),
      escapeCsv(p.qtd_pedida || 0),
      escapeCsv(STATUS_LABELS[p.status] || p.status),
    ].join(";"));
  });
  const content = "\uFEFF" + lines.join("\n");
  const stamp = (data.generated_at || "").replace(/[/: ]/g, "-") || "export";
  downloadBlob("entradas_estoque_" + stamp + ".csv", content, "text/csv;charset=utf-8");
}

function exportEntradaXls(rows) {
  let html = '<html><head><meta charset="UTF-8"></head><body><table border="1">';
  html +=
    "<tr><th>COD</th><th>Descrição</th><th>Estoque UN</th><th>Dias Estoque</th>" +
    "<th>Departamento</th><th>Marca</th><th>Data Última Entrada</th>" +
    "<th>Nº Pedido</th><th>Previsão de Entrada</th><th>Qtd. Pedida</th><th>Status</th></tr>";
  rows.forEach((p) => {
    html +=
      "<tr><td>" + (p.cod || "") +
      "</td><td>" + (p.descricao || "") +
      "</td><td>" + (p.estoque_un || 0) +
      "</td><td>" + Number(p.dias_estoque_un || 0).toFixed(1) +
      "</td><td>" + (p.departamento || "") +
      "</td><td>" + (p.marca || "") +
      "</td><td>" + (p.data_ultima_entrada || "") +
      "</td><td>" + displayPedido(p) +
      "</td><td>" + displayPrevisao(p) +
      "</td><td>" + (p.qtd_pedida || 0) +
      "</td><td>" + (STATUS_LABELS[p.status] || p.status) +
      "</td></tr>";
  });
  html += "</table></body></html>";
  const stamp = (data.generated_at || "").replace(/[/: ]/g, "-") || "export";
  downloadBlob(
    "entradas_estoque_" + stamp + ".xls",
    html,
    "application/vnd.ms-excel;charset=utf-8"
  );
}

function setupEntradaTable() {
  const search = document.getElementById("search-entrada");
  if (search) {
    search.addEventListener("input", (e) => {
      state.entradaSearch = e.target.value;
      state.entradaPage = 1;
      renderEntradaTable();
    });
  }
  document.querySelectorAll(".entrada-table th[data-ekey]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.ekey;
      if (state.entradaSortKey === key) {
        state.entradaSortDir = state.entradaSortDir === "asc" ? "desc" : "asc";
      } else {
        state.entradaSortKey = key;
        state.entradaSortDir =
          key === "data_ultima_entrada" || key === "previsao_entrada" ? "desc" : "asc";
      }
      state.entradaPage = 1;
      renderEntradaTable();
    });
  });

  // Modal de exportação de estoque
  const modal = document.getElementById("export-entrada-modal");
  const openBtn = document.getElementById("btn-export-entrada");
  const closeBtn = document.getElementById("export-entrada-close");
  const cancelBtn = document.getElementById("export-entrada-cancel");
  const confirmBtn = document.getElementById("export-entrada-confirm");
  if (!modal || !openBtn) return;

  const open = () => { modal.hidden = false; };
  const close = () => { modal.hidden = true; };

  bindExportStatusGroup("export-entrada-status");

  openBtn.addEventListener("click", open);
  closeBtn?.addEventListener("click", close);
  cancelBtn?.addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });

  confirmBtn?.addEventListener("click", () => {
    const pedEl = document.querySelector('input[name="export-entrada-pedido"]:checked');
    const fmtEl = document.querySelector('input[name="export-entrada-format"]:checked');
    const statusList = readExportStatusChecks("export-entrada-status");
    const pedidoFilter = pedEl?.value || "todos";
    const format = fmtEl?.value || "csv";
    const rows = getEntradaRows({ statusList, pedidoFilter });
    if (!rows.length) {
      alert("Nenhum item para exportar com esses filtros.");
      return;
    }
    if (format === "xlsx") exportEntradaXls(rows);
    else exportEntradaCsv(rows);
    close();
  });
}


function refreshAll() {
  const products = getBaseProducts();
  // marca + status(estoque) + status_vendas, mas SEM departamento — assim a
  // tabela de saúde continua mostrando todos os departamentos (clicáveis).
  const productsForHealth = filterProducts({ dept: false });
  // marca + dept + status(estoque), mas SEM status_vendas — assim o donut
  // sempre mostra as 3 fatias completas, mesmo com uma delas selecionada.
  const productsForDonut = filterProducts({ vendasStatus: false });
  // para o medidor de status: marca + dept, SEM status (mostra os 4 sempre)
  const productsForStatusMeter = filterProducts({ status: false, vendasStatus: false });

  const kpis = computeKpis(products);
  const vendasSummary = computeVendasStatusSummary(productsForDonut);
  const deptBars = computeDeptBars(products);
  const deptHealth = computeDeptHealth(productsForHealth);
  const estoqueStatusSummary = computeEstoqueStatusSummary(productsForStatusMeter);

  renderUpdatedAt();
  renderKpis(kpis);
  renderDonut(vendasSummary, kpis.venda_atual);
  renderMetaGauge(kpis);
  renderStatusMeter(estoqueStatusSummary);
  updateSaudePanelMode();
  renderDeptBars(deptBars);
  renderDeptHealth(deptHealth);
  renderTable(products);
  updateStatusCounts();
  updateVendasFilterUI();
  renderEntradaTable();
}

/* ---------- Mobile tabs (pills) ---------- */
function setMobileTab(tab) {
  const next = tab === "estoque" ? "estoque" : "faturamento";
  document.body.dataset.mobileTab = next;

  document.querySelectorAll(".mobile-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === next);
  });

  document.querySelectorAll(".grid > .panel[data-mobile-tab]").forEach((panel) => {
    const scope = panel.getAttribute("data-mobile-tab");
    const show = scope === "both" || scope === next;
    panel.classList.toggle("is-tab-hidden", !show);
  });

  updateSaudePanelMode();
  // re-render lista mobile (estoque vs faturamento)
  const productsForHealth = filterProducts({ dept: false });
  renderDeptHealth(computeDeptHealth(productsForHealth));
  const productsForStatusMeter = filterProducts({ status: false, vendasStatus: false });
  renderStatusMeter(computeEstoqueStatusSummary(productsForStatusMeter));
}

function setupMobileNav() {
  setMobileTab("faturamento");
  document.querySelectorAll(".mobile-tab").forEach((btn) => {
    btn.addEventListener("click", () => setMobileTab(btn.dataset.tab));
  });
  window.addEventListener("resize", () => {
    updateSaudePanelMode();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  if (typeof DASHBOARD_DATA === "undefined" || !DASHBOARD_DATA.produtos) {
    console.error("DASHBOARD_DATA não carregado. Verifique data.js");
    return;
  }
  setupMarcaDropdown();
  setupTableControls();
  setupExport();
  setupEntradaTable();
  setupMobileNav();
  refreshAll();
});
