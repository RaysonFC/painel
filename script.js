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

const STATUS_ORDER = ["Ruptura", "Critico", "OK", "Over"];
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

let state = {
  status: "Todos",
  search: "",
  sortKey: "faturamento",
  sortDir: "desc",
  selectedMarcas: new Set(),
  selectedDept: null,
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

/** Escala logarítmica dinâmica: 0 → 0%, max → 100% */
function logScale(value, maxVal) {
  const v = Math.max(0, Number(value) || 0);
  const m = Math.max(1e-9, Number(maxVal) || 1);
  if (v <= 0) return 0;
  // log10(1+v) / log10(1+max)  → barras dinâmicas, valores pequenos ainda visíveis
  return (Math.log10(1 + v) / Math.log10(1 + m)) * 100;
}

function getBaseProducts() {
  let rows = data.produtos || [];
  if (state.selectedMarcas.size > 0) {
    rows = rows.filter((p) => state.selectedMarcas.has((p.marca || "").trim()));
  }
  if (state.selectedDept) {
    rows = rows.filter((p) => (p.departamento || "") === state.selectedDept);
  }
  return rows;
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

/** Retorna % e quantidade absoluta de UN por status de vendas */
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
  return Object.values(map).sort((a, b) => b.faturamento - a.faturamento);
}

function computeDeptHealth(productsForHealth) {
  const map = {};
  productsForHealth.forEach((p) => {
    const d = p.departamento || "OUTROS";
    if (!map[d]) {
      map[d] = { departamento: d, faturamento: 0, vendas_un: 0, media_mensal_un: 0, giro_dia_un: 0 };
    }
    map[d].faturamento += Number(p.faturamento) || 0;
    map[d].vendas_un += Number(p.vendas_un) || 0;
    map[d].media_mensal_un += Number(p.media_mensal_un) || 0;
    map[d].giro_dia_un += Number(p.giro_dia_un) || 0;
  });
  return Object.values(map)
    .map((r) => {
      const pct = r.media_mensal_un ? r.vendas_un / r.media_mensal_un : 0;
      return { ...r, pct_meta: pct, situacao: classifySituacao(r.vendas_un, r.media_mensal_un) };
    })
    .sort((a, b) => b.faturamento - a.faturamento);
}

function renderKpis(kpis) {
  document.getElementById("kpi-meta-mensal").textContent = fmtMoney(kpis.meta_mensal);
  document.getElementById("kpi-venda-atual").textContent = fmtMoney(kpis.venda_atual);
  const elFalta = document.getElementById("kpi-falta-meta");
  if (elFalta) {
    elFalta.textContent = fmtMoney(kpis.falta_meta);
    elFalta.style.color = kpis.falta_meta < 0 ? "#e04b3f" : "";
  }
  document.getElementById("kpi-estoque-un").textContent = fmtInt(kpis.estoque_total_un);
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function donutSlice(cx, cy, rOuter, rInner, startAngle, endAngle, color) {
  const sa = startAngle + 90, ea = endAngle + 90;
  const p1 = polarToCartesian(cx, cy, rOuter, sa);
  const p2 = polarToCartesian(cx, cy, rOuter, ea);
  const p3 = polarToCartesian(cx, cy, rInner, ea);
  const p4 = polarToCartesian(cx, cy, rInner, sa);
  const largeArc = ea - sa > 180 ? 1 : 0;
  const d =
    "M " + p1.x + " " + p1.y +
    " A " + rOuter + " " + rOuter + " 0 " + largeArc + " 1 " + p2.x + " " + p2.y +
    " L " + p3.x + " " + p3.y +
    " A " + rInner + " " + rInner + " 0 " + largeArc + " 0 " + p4.x + " " + p4.y + " Z";
  return '<path d="' + d + '" fill="' + color + '"></path>';
}

function renderDonut(vendasSummary, vendaAtual) {
  const svg = document.getElementById("donut");
  const legend = document.getElementById("donut-legend");
  const ordered = VENDAS_ORDER.map((st) =>
    vendasSummary.find((s) => s.status_vendas === st)
  ).filter(Boolean);
  const totalPct = ordered.reduce((a, s) => a + s.pct, 0);

  const totalElem = document.getElementById("donut-total");
  if (totalElem) totalElem.textContent = fmtInt(Math.round(vendaAtual));

  const cx = 120, cy = 120, rOuter = 85, rInner = 52, rLabel = 102;
  let angleStart = -90;
  const paths = [];
  const labels = [];

  ordered.forEach((s) => {
    const frac = totalPct ? s.pct / totalPct : 0;
    const angleEnd = angleStart + frac * 360;
    const mid = (angleStart + angleEnd) / 2;
    paths.push(donutSlice(cx, cy, rOuter, rInner, angleStart, angleEnd, VENDAS_COLORS[s.status_vendas]));

    // percentual próximo da fatia
    if (s.pct >= 1) {
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

  // Legenda: status + quantidade em UN
  if (legend) {
    legend.innerHTML = ordered
      .map(
        (s) =>
          '<li><span class="dot" style="background:' +
          VENDAS_COLORS[s.status_vendas] +
          '"></span><span class="lg-label">' +
          VENDAS_LABELS[s.status_vendas] +
          '</span><span class="lg-value">' +
          Number(s.pct).toFixed(1) +
          "% · " +
          fmtInt(Math.round(s.vendas_un)) +
          " un</span></li>"
      )
      .join("");
  }
}

/**
 * Barras por departamento — escala LOGARÍTMICA dinâmica.
 * Valores SEMPRE no lado externo (ponta direita da barra), cor azul escuro.
 */
function renderDeptBars(deptBars) {
  const el = document.getElementById("dept-bars");
  if (!el) return;

  const items = deptBars;
  const maxFat = Math.max(...items.map((d) => d.faturamento), 1);
  const maxVend = Math.max(...items.map((d) => d.vendas_un), 1);

  el.innerHTML = items
    .map((d) => {
      const pctFat = logScale(d.faturamento, maxFat);
      const pctVend = logScale(d.vendas_un, maxVend);
      return (
        '<div class="cluster-row">' +
        '<span class="cluster-label" title="' + d.departamento + '">' + d.departamento + "</span>" +
        '<div class="cluster-tracks">' +
          '<div class="cluster-track-outer">' +
            '<div class="cluster-track">' +
              '<div class="cluster-fill fat" style="width:' + pctFat + '%"></div>' +
            "</div>" +
            '<span class="cluster-val-ext">' + fmtMoney(d.faturamento) + "</span>" +
          "</div>" +
          '<div class="cluster-track-outer">' +
            '<div class="cluster-track">' +
              '<div class="cluster-fill vend" style="width:' + pctVend + '%"></div>' +
            "</div>" +
            '<span class="cluster-val-ext">' + fmtInt(d.vendas_un) + " un</span>" +
          "</div>" +
        "</div></div>"
      );
    })
    .join("");
}

function renderDeptHealth(deptHealth) {
  const tbody = document.querySelector("#dept-health-table tbody");
  if (!tbody) return;

  tbody.innerHTML = deptHealth
    .map((r) => {
      const sit = r.situacao || "Sem Vendas";
      const cls = SITUACAO_CLASS[sit] || "sit-sem";
      const active = state.selectedDept === r.departamento ? " row-active" : "";
      return (
        '<tr class="dept-row' + active + '" data-dept="' +
        (r.departamento || "").replace(/"/g, "&quot;") + '">' +
        "<td>" + (r.departamento || "") +
        '</td><td class="num">' + fmtMoney(r.faturamento) +
        '</td><td class="num">' + fmtNum(r.media_mensal_un, 0) +
        '</td><td class="num">' + fmtNum(r.vendas_un, 0) +
        '</td><td class="num">' + fmtNum(r.giro_dia_un, 1) +
        '</td><td><span class="sit-badge ' + cls + '">' + (SITUACAO_LABELS[sit] || sit) +
        '</span></td><td class="num">' + fmtPct(r.pct_meta) + "</td></tr>"
      );
    })
    .join("");

  tbody.querySelectorAll("tr.dept-row").forEach((tr) => {
    tr.addEventListener("click", () => {
      const dept = tr.getAttribute("data-dept");
      state.selectedDept = state.selectedDept === dept ? null : dept;
      updateDeptFilterUI();
      refreshAll();
    });
  });
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
  if (state.status !== "Todos") rows = rows.filter((p) => p.status === state.status);
  if (state.search) {
    const q = state.search.toLowerCase();
    rows = rows.filter(
      (p) =>
        (p.descricao || "").toLowerCase().includes(q) ||
        (p.marca || "").toLowerCase().includes(q) ||
        (p.departamento || "").toLowerCase().includes(q)
    );
  }
  const key = state.sortKey;
  const dir = state.sortDir === "asc" ? 1 : -1;
  rows = [...rows].sort((a, b) => {
    const va = a[key] ?? "", vb = b[key] ?? "";
    if (typeof va === "string") return va.localeCompare(vb) * dir;
    return (va - vb) * dir;
  });
  return rows;
}

function renderTable(baseProducts) {
  const tbody = document.getElementById("product-tbody");
  if (!tbody) return;
  const rows = getFilteredProducts(baseProducts);

  tbody.innerHTML = rows
    .map(
      (p) =>
        "<tr><td>" + (p.descricao || "") +
        "</td><td>" + (p.departamento || "") +
        "</td><td>" + (p.marca || "") +
        '</td><td class="num">' + fmtInt(p.estoque_un) +
        '</td><td class="num">' + Number(p.dias_estoque_un || 0).toFixed(1) +
        '</td><td class="num">' + fmtInt(p.vendas_un) +
        '</td><td class="num">' + fmtMoney(p.faturamento) +
        '</td><td><span class="status-badge status-' + p.status + '">' +
        (STATUS_LABELS[p.status] || p.status) + "</span></td></tr>"
    )
    .join("");

  const footer = document.getElementById("table-footer");
  if (footer) footer.textContent = fmtInt(rows.length) + " produtos";
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
      refreshAll();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      state.selectedMarcas.clear();
      updateMarcaToggleText();
      renderMarcaList(search ? search.value : "");
      refreshAll();
    });
  }

  const clearDept = document.getElementById("clear-dept-filter");
  if (clearDept) {
    clearDept.addEventListener("click", () => {
      state.selectedDept = null;
      updateDeptFilterUI();
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
      refreshAll();
    });
  }

  document.querySelectorAll(".status-filters .chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".status-filters .chip").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.status = btn.dataset.status;
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
      refreshAll();
    });
  });
}

function refreshAll() {
  const products = getBaseProducts();
  let productsForHealth = data.produtos || [];
  if (state.selectedMarcas.size > 0) {
    productsForHealth = productsForHealth.filter((p) =>
      state.selectedMarcas.has((p.marca || "").trim())
    );
  }

  const kpis = computeKpis(products);
  const vendasSummary = computeVendasStatusSummary(products);
  const deptBars = computeDeptBars(products);
  const deptHealth = computeDeptHealth(productsForHealth);

  renderKpis(kpis);
  renderDonut(vendasSummary, kpis.venda_atual);
  renderDeptBars(deptBars);
  renderDeptHealth(deptHealth);
  renderTable(products);
}

document.addEventListener("DOMContentLoaded", () => {
  if (typeof DASHBOARD_DATA === "undefined" || !DASHBOARD_DATA.produtos) {
    console.error("DASHBOARD_DATA não carregado. Verifique data.js");
    return;
  }
  setupMarcaDropdown();
  setupTableControls();
  refreshAll();
});
