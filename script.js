// script.js - Dashboard Estoque Varejo

const ESTOQUE_STATUS_ORDER = ["Ruptura", "Critico", "OK", "Over", "SemGiro"];
const ESTOQUE_STATUS_COLORS = {
  Ruptura: "#e04b3f",
  Critico: "#f0973d",
  OK: "#7cb342",
  Over: "#2D6CDF",
  SemGiro: "#8a94a8",
};
const ESTOQUE_STATUS_LABELS = {
  Ruptura: "⚠️ Ruptura",
  Critico: "🔴 Crítico",
  OK: "🟢 OK",
  Over: "🔵 Over",
  SemGiro: "⚪ Sem Giro",
};
const STATUS_BADGE_LABELS = { Ruptura: "Ruptura", Critico: "Crítico", OK: "OK", Over: "Over", SemGiro: "Sem Giro" };

const data = DASHBOARD_DATA;
const PAGE_SIZE = 20;

let state = {
  status: "Todos",
  search: "",
  sortKey: "valor_estoque",
  sortDir: "desc",
  page: 1,
  topN: 0,
  selectedMarcas: new Set(),
  selectedDept: null,
  pedidoSearch: "",
  pedidoSortKey: "valor_pendente",
  pedidoSortDir: "desc",
  pedidoPage: 1,
};

const PEDIDOS_PAGE_SIZE = 20;

const ALL_MARCAS = (() => {
  const estoquePorMarca = new Map();
  (data.produtos || []).forEach((p) => {
    const m = (p.marca || "").trim();
    if (!m) return;
    const atual = estoquePorMarca.get(m) || 0;
    estoquePorMarca.set(m, atual + Number(p.estoque_un || 0));
  });
  const set = new Set();
  estoquePorMarca.forEach((total, marca) => {
    if (total > 0) set.add(marca);
    else set.add(marca); // mantém marcas mesmo sem estoque atual, para não sumirem do filtro
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
})();

const fmtMoney = (v) =>
  "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtInt = (v) => Number(v || 0).toLocaleString("pt-BR");
const fmtNum = (v, d) =>
  Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

function logScale(value, maxVal) {
  const v = Math.max(0, Number(value) || 0);
  const m = Math.max(1e-9, Number(maxVal) || 1);
  if (v <= 0) return 0;
  return (Math.log10(1 + v) / Math.log10(1 + m)) * 100;
}

/**
 * Filtro central de produtos. Cada painel do dashboard usa esta mesma
 * função, escolhendo quais eixos de filtro aplicar.
 *   marca:  respeita as marcas selecionadas no dropdown
 *   dept:   respeita o departamento selecionado (clique na tabela de saúde)
 *   status: respeita o status de estoque selecionado (clique nos chips)
 */
function filterProducts({ marca = true, dept = true, status = true } = {}) {
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
  return rows;
}

function getBaseProducts() {
  return filterProducts();
}

function computeKpis(products) {
  const estoque_total_un = products.reduce((s, p) => s + (Number(p.estoque_un) || 0), 0);
  const valor_estoque = products.reduce((s, p) => s + (Number(p.valor_estoque) || 0), 0);
  const ruptura = products.filter((p) => p.status === "Ruptura").length;
  return {
    estoque_total_un: Math.round(estoque_total_un),
    valor_estoque: Math.round(valor_estoque * 100) / 100,
    qtd_produtos: products.length,
    ruptura,
  };
}

function computeStatusSummary(products) {
  const counts = { Ruptura: 0, Critico: 0, OK: 0, Over: 0, SemGiro: 0 };
  const valores = { Ruptura: 0, Critico: 0, OK: 0, Over: 0, SemGiro: 0 };
  products.forEach((p) => {
    const st = p.status || "Ruptura";
    if (counts[st] === undefined) return;
    counts[st]++;
    valores[st] += Number(p.valor_estoque) || 0;
  });
  return ESTOQUE_STATUS_ORDER.map((st) => ({ status: st, qtd: counts[st], valor: valores[st] }));
}

function computeDeptBars(products) {
  const map = {};
  products.forEach((p) => {
    const d = p.departamento || "OUTROS";
    if (!map[d]) map[d] = { departamento: d, valor_estoque: 0, vendas_un: 0 };
    map[d].valor_estoque += Number(p.valor_estoque) || 0;
    map[d].vendas_un += Number(p.vendas_un) || 0;
  });
  return Object.values(map)
    .filter((d) => d.valor_estoque > 0)
    .sort((a, b) => b.valor_estoque - a.valor_estoque);
}

function computeDeptHealth(products) {
  const map = {};
  products.forEach((p) => {
    const d = p.departamento || "OUTROS";
    if (!map[d]) {
      map[d] = {
        departamento: d,
        valor_estoque: 0,
        estoque_un: 0,
        vendas_un: 0,
        giro_dia_un: 0,
        diasSum: 0,
        diasN: 0,
        statusCounts: { Ruptura: 0, Critico: 0, OK: 0, Over: 0, SemGiro: 0 },
      };
    }
    map[d].valor_estoque += Number(p.valor_estoque) || 0;
    map[d].estoque_un += Number(p.estoque_un) || 0;
    map[d].vendas_un += Number(p.vendas_un) || 0;
    map[d].giro_dia_un += Number(p.giro_dia_un) || 0;
    if (p.status !== "Ruptura" && p.status !== "SemGiro") {
      map[d].diasSum += Number(p.dias_estoque_un) || 0;
      map[d].diasN++;
    }
    const st = p.status || "Ruptura";
    if (map[d].statusCounts[st] !== undefined) map[d].statusCounts[st]++;
  });
  return Object.values(map)
    .map((r) => {
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
        dias_medio: r.diasN ? r.diasSum / r.diasN : 0,
        status_predominante: best,
      };
    })
    .sort((a, b) => b.valor_estoque - a.valor_estoque);
}

function renderUpdatedAt() {
  const el = document.getElementById("data-updated");
  if (!el) return;
  el.textContent = "Dados atualizados em: " + (data.generated_at || "—");
}

function renderKpis(kpis) {
  document.getElementById("kpi-estoque-total").textContent = fmtInt(kpis.estoque_total_un);
  document.getElementById("kpi-valor-estoque").textContent = fmtMoney(kpis.valor_estoque);
  document.getElementById("kpi-qtd-produtos").textContent = fmtInt(kpis.qtd_produtos);
  document.getElementById("kpi-ruptura").textContent = fmtInt(kpis.ruptura);
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

function toggleStatusFromDonut(st) {
  state.status = state.status === st ? "Todos" : st;
  state.page = 1;
  document.querySelectorAll("#status-filters .chip").forEach((b) => {
    b.classList.toggle("active", b.dataset.status === state.status);
  });
  refreshAll();
}

function renderDonut(summary) {
  const svg = document.getElementById("donut");
  const legend = document.getElementById("donut-legend");
  const totalValor = summary.reduce((s, x) => s + x.valor, 0) || 1;

  const totalElem = document.getElementById("donut-total");
  if (totalElem) totalElem.textContent = fmtMoney(totalValor);

  const cx = 240, cy = 240, rOuter = 165, rInner = 108, rLabel = 195;
  let angleStart = -90;
  const paths = [];
  const labels = [];
  const activeSt = state.status !== "Todos" ? state.status : null;

  summary.forEach((s) => {
    const frac = s.valor / totalValor;
    const angleEnd = angleStart + frac * 360;
    const mid = (angleStart + angleEnd) / 2;
    const isActive = activeSt === s.status;
    const dimmed = !!activeSt && !isActive;
    const d = donutSliceD(cx, cy, rOuter, rInner, angleStart, angleEnd);
    paths.push(
      '<path d="' + d + '" fill="' + ESTOQUE_STATUS_COLORS[s.status] + '"' +
      ' opacity="' + (dimmed ? 0.3 : 1) + '"' +
      ' stroke="' + (isActive ? "#0d1b3a" : "none") + '" stroke-width="' + (isActive ? 3 : 0) + '"' +
      ' class="donut-slice" data-status="' + s.status + '"></path>'
    );
    const pct = (frac * 100);
    if (pct >= 2) {
      const pos = polarToCartesian(cx, cy, rLabel, mid + 90);
      labels.push(
        '<text x="' + pos.x.toFixed(1) + '" y="' + pos.y.toFixed(1) +
        '" text-anchor="middle" dominant-baseline="middle" class="donut-pct-label">' +
        pct.toFixed(1) + "%</text>"
      );
    }
    angleStart = angleEnd;
  });

  if (svg) svg.innerHTML = paths.join("") + labels.join("");

  if (legend) {
    legend.innerHTML = summary
      .map((s) => {
        const isActive = activeSt === s.status;
        const pct = totalValor ? (s.valor / totalValor) * 100 : 0;
        return (
          '<li class="legend-item' + (isActive ? " active" : "") + '" data-status="' + s.status + '">' +
          '<span class="dot" style="background:' + ESTOQUE_STATUS_COLORS[s.status] + '"></span>' +
          '<span class="lg-label">' + ESTOQUE_STATUS_LABELS[s.status] + '</span>' +
          '<span class="lg-value">' + pct.toFixed(1) + "% · " + fmtInt(s.qtd) + " itens</span></li>"
        );
      })
      .join("");
  }

  svg?.querySelectorAll(".donut-slice").forEach((el) => {
    el.addEventListener("click", () => toggleStatusFromDonut(el.getAttribute("data-status")));
  });
  legend?.querySelectorAll(".legend-item").forEach((el) => {
    el.addEventListener("click", () => toggleStatusFromDonut(el.getAttribute("data-status")));
  });
}

function renderDeptBars(deptBars) {
  const el = document.getElementById("dept-bars");
  if (!el) return;
  if (!deptBars.length) {
    el.innerHTML = '<p class="empty-bars">Nenhum departamento com valor de estoque &gt; 0</p>';
    return;
  }
  const maxValor = Math.max(...deptBars.map((d) => d.valor_estoque), 1);
  const maxVend = Math.max(...deptBars.map((d) => d.vendas_un), 1);

  el.innerHTML = deptBars
    .map((d) => {
      const pctValor = logScale(d.valor_estoque, maxValor);
      const pctVend = logScale(d.vendas_un, maxVend);
      return (
        '<div class="cluster-row">' +
        '<span class="cluster-label" title="' + d.departamento + '">' + d.departamento + "</span>" +
        '<div class="cluster-tracks">' +
          '<div class="cluster-track-outer track-fat">' +
            '<div class="cluster-track"><div class="cluster-fill fat" style="width:' + pctValor + '%"></div></div>' +
            '<span class="cluster-val-ext">' + fmtMoney(d.valor_estoque) + "</span>" +
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
    updateDeptFilterUI();
    refreshAll();
  });
}

function renderDeptHealth(deptHealth) {
  const tbody = document.querySelector("#dept-health-table tbody");
  if (!tbody) return;
  tbody.innerHTML = deptHealth
    .map((r) => {
      const cls = "status-badge status-" + r.status_predominante;
      const active = state.selectedDept === r.departamento ? " row-active" : "";
      const deptAttr = (r.departamento || "").replace(/"/g, "&quot;");
      return (
        '<tr class="dept-row' + active + '" data-dept="' + deptAttr + '">' +
        "<td>" + (r.departamento || "") +
        '</td><td class="num col-fat">' + fmtMoney(r.valor_estoque) +
        '</td><td class="num col-hide-tablet">' + fmtInt(r.estoque_un) +
        '</td><td class="num col-hide-tablet">' + fmtInt(r.vendas_un) +
        '</td><td class="num col-hide-tablet">' + fmtNum(r.giro_dia_un, 1) +
        '</td><td><span class="' + cls + '">' + (STATUS_BADGE_LABELS[r.status_predominante] || r.status_predominante) +
        '</span></td><td class="num col-pct">' + fmtNum(r.dias_medio, 1) + "</td></tr>"
      );
    })
    .join("");
  tbody.querySelectorAll("tr.dept-row").forEach(bindDeptClick);
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
    rows = [...rows].sort((a, b) => (Number(b.valor_estoque) || 0) - (Number(a.valor_estoque) || 0));
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
      return (
        '<tr><td class="col-cod">' + (p.cod || "") +
        "</td><td>" + (p.descricao || "") +
        '</td><td class="col-hide-mobile">' + (p.departamento || "") +
        '</td><td class="col-hide-mobile">' + (p.marca || "") +
        '</td><td class="num">' + fmtInt(p.estoque_un) +
        '</td><td class="num col-hide-tablet">' + fmtInt(p.estoque_cx) +
        '</td><td class="num col-hide-tablet">' + fmtInt(p.vendas_un) +
        '</td><td class="num col-hide-tablet">' + fmtNum(p.giro_dia_un, 1) +
        '</td><td class="num">' + (p.status === "SemGiro" ? "—" : fmtNum(p.dias_estoque_un, 1)) +
        '</td><td class="num col-hide-mobile">' + fmtMoney(p.valor_estoque) +
        '</td><td class="col-hide-tablet">' + (p.data_ultima_entrada || "—") +
        '</td><td><span class="status-badge status-' + p.status + '">' +
        (STATUS_BADGE_LABELS[p.status] || p.status) + "</span></td></tr>"
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

function updateStatusCounts() {
  const all = filterProducts({ status: false });
  const counts = { Todos: all.length, Ruptura: 0, Critico: 0, OK: 0, Over: 0, SemGiro: 0 };
  all.forEach((p) => {
    if (counts[p.status] !== undefined) counts[p.status]++;
  });
  Object.keys(counts).forEach((st) => {
    const el = document.getElementById("count-" + st);
    if (el) el.textContent = "(" + fmtInt(counts[st]) + ")";
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

  document.querySelectorAll("#status-filters .chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#status-filters .chip").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.status = btn.dataset.status;
      state.page = 1;
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

function readExportStatusChecks(containerId) {
  const root = document.getElementById(containerId);
  if (!root) return [];
  const allCb = root.querySelector(".export-status-all");
  if (allCb && allCb.checked) return [];
  return Array.from(root.querySelectorAll(".export-status-item:checked")).map((el) => el.value);
}

function bindExportStatusGroup(containerId) {
  const root = document.getElementById(containerId);
  if (!root) return;
  const allCb = root.querySelector(".export-status-all");
  const items = root.querySelectorAll(".export-status-item");
  if (!allCb) return;

  allCb.addEventListener("change", () => {
    if (allCb.checked) items.forEach((cb) => { cb.checked = false; });
  });
  items.forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) allCb.checked = false;
      const any = Array.from(items).some((c) => c.checked);
      if (!any) allCb.checked = true;
    });
  });
}

function getExportRows(topN, statusList) {
  let rows = filterProducts({ status: false });
  if (statusList && statusList.length > 0) {
    const set = new Set(statusList);
    rows = rows.filter((p) => set.has(p.status));
  }
  rows = [...rows].sort((a, b) => (Number(b.valor_estoque) || 0) - (Number(a.valor_estoque) || 0));
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
    "COD", "Descrição", "Departamento", "Marca", "Estoque UN", "Estoque CX",
    "Vendas UN (mês)", "Giro Dia UN", "Dias Estoque", "Valor Estoque",
    "Última Entrada", "Status",
  ];
  const lines = [headers.join(";")];
  rows.forEach((p) => {
    lines.push([
      escapeCsv(p.cod),
      escapeCsv(p.descricao),
      escapeCsv(p.departamento),
      escapeCsv(p.marca),
      escapeCsv(p.estoque_un),
      escapeCsv(p.estoque_cx),
      escapeCsv(p.vendas_un),
      escapeCsv(Number(p.giro_dia_un || 0).toFixed(2)),
      escapeCsv(Number(p.dias_estoque_un || 0).toFixed(1)),
      escapeCsv(Number(p.valor_estoque || 0).toFixed(2)),
      escapeCsv(p.data_ultima_entrada),
      escapeCsv(STATUS_BADGE_LABELS[p.status] || p.status),
    ].join(";"));
  });
  const content = "\uFEFF" + lines.join("\n");
  const stamp = (data.generated_at || "").replace(/[/: ]/g, "-") || "export";
  downloadBlob("estoque_varejo_" + stamp + ".csv", content, "text/csv;charset=utf-8");
}

function exportXls(rows) {
  let html = '<html><head><meta charset="UTF-8"></head><body><table border="1">';
  html += "<tr><th>COD</th><th>Descrição</th><th>Departamento</th><th>Marca</th>" +
    "<th>Estoque UN</th><th>Estoque CX</th><th>Vendas UN</th><th>Giro Dia UN</th>" +
    "<th>Dias Estoque</th><th>Valor Estoque</th><th>Última Entrada</th><th>Status</th></tr>";
  rows.forEach((p) => {
    html +=
      "<tr><td>" + (p.cod || "") +
      "</td><td>" + (p.descricao || "") +
      "</td><td>" + (p.departamento || "") +
      "</td><td>" + (p.marca || "") +
      "</td><td>" + (p.estoque_un || 0) +
      "</td><td>" + (p.estoque_cx || 0) +
      "</td><td>" + (p.vendas_un || 0) +
      "</td><td>" + Number(p.giro_dia_un || 0).toFixed(2) +
      "</td><td>" + Number(p.dias_estoque_un || 0).toFixed(1) +
      "</td><td>" + Number(p.valor_estoque || 0).toFixed(2) +
      "</td><td>" + (p.data_ultima_entrada || "") +
      "</td><td>" + (STATUS_BADGE_LABELS[p.status] || p.status) +
      "</td></tr>";
  });
  html += "</table></body></html>";
  const stamp = (data.generated_at || "").replace(/[/: ]/g, "-") || "export";
  downloadBlob("estoque_varejo_" + stamp + ".xls", html, "application/vnd.ms-excel;charset=utf-8");
}

function setupExport() {
  const modal = document.getElementById("export-modal");
  const openBtn = document.getElementById("btn-export");
  const closeBtn = document.getElementById("export-close");
  const cancelBtn = document.getElementById("export-cancel");
  const confirmBtn = document.getElementById("export-confirm");
  if (!modal || !openBtn) return;

  const open = () => { modal.hidden = false; };
  const close = () => { modal.hidden = true; };

  bindExportStatusGroup("export-status");

  openBtn.addEventListener("click", open);
  closeBtn?.addEventListener("click", close);
  cancelBtn?.addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });

  confirmBtn?.addEventListener("click", () => {
    const topEl = document.querySelector('input[name="export-top"]:checked');
    const fmtEl = document.querySelector('input[name="export-format"]:checked');
    const statusList = readExportStatusChecks("export-status");
    const topN = Number(topEl?.value || 0);
    const format = fmtEl?.value || "csv";
    const rows = getExportRows(topN, statusList);
    if (!rows.length) {
      alert("Nenhum item para exportar com esses filtros.");
      return;
    }
    if (format === "xlsx") exportXls(rows);
    else exportCsv(rows);
    close();
  });
}

/* ---------- Pedidos em Trânsito ---------- */

function getFilteredPedidos() {
  let rows = data.pedidos || [];
  if (state.selectedMarcas.size > 0) {
    rows = rows.filter((p) => state.selectedMarcas.has((p.marca || "").trim()));
  }
  if (state.pedidoSearch) {
    const q = state.pedidoSearch.toLowerCase();
    rows = rows.filter(
      (p) =>
        String(p.cod || "").toLowerCase().includes(q) ||
        (p.descricao || "").toLowerCase().includes(q) ||
        (p.marca || "").toLowerCase().includes(q) ||
        String(p.numero_pedido || "").toLowerCase().includes(q)
    );
  }
  const key = state.pedidoSortKey;
  const dir = state.pedidoSortDir === "asc" ? 1 : -1;
  rows = [...rows].sort((a, b) => {
    const va = a[key] ?? "";
    const vb = b[key] ?? "";
    if (typeof va === "string" && typeof vb === "string") {
      return String(va).localeCompare(String(vb), "pt-BR") * dir;
    }
    return ((Number(va) || 0) - (Number(vb) || 0)) * dir;
  });
  return rows;
}

function renderPedidos() {
  const tbody = document.getElementById("pedidos-tbody");
  if (!tbody) return;
  const rows = getFilteredPedidos();
  const totalValor = rows.reduce((s, p) => s + (Number(p.valor_pendente) || 0), 0);
  const totalSaldo = rows.reduce((s, p) => s + (Number(p.saldo_pendente) || 0), 0);
  const kpiEl = document.getElementById("pedidos-kpi");
  if (kpiEl) {
    kpiEl.textContent =
      fmtInt(rows.length) + " pedidos · Saldo " + fmtInt(totalSaldo) + " un · " + fmtMoney(totalValor);
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / PEDIDOS_PAGE_SIZE));
  state.pedidoPage = Math.min(Math.max(1, state.pedidoPage), totalPages);
  const startIdx = (state.pedidoPage - 1) * PEDIDOS_PAGE_SIZE;
  const pageRows = rows.slice(startIdx, startIdx + PEDIDOS_PAGE_SIZE);

  tbody.innerHTML = pageRows
    .map((p) => {
      const prev = p.previsao_entrada || "—";
      return (
        "<tr>" +
        '<td class="col-cod">' + (p.cod || "") +
        "</td><td>" + (p.descricao || "") +
        '</td><td class="col-hide-mobile">' + (p.marca || "") +
        '</td><td class="col-hide-tablet">' + (p.numero_pedido || "—") +
        '</td><td class="num">' + fmtInt(p.qtd_pedida) +
        '</td><td class="num col-hide-tablet">' + fmtInt(p.qtd_entregue) +
        '</td><td class="num">' + fmtInt(p.saldo_pendente) +
        '</td><td class="num">' + fmtMoney(p.valor_pendente) +
        '</td><td class="col-hide-tablet">' + (p.data_ultima_entrada || "—") +
        "</td><td>" + prev +
        "</td></tr>"
      );
    })
    .join("");

  const pag = document.getElementById("pedidos-pagination");
  if (pag) {
    pag.innerHTML =
      '<button id="ped-prev" ' + (state.pedidoPage <= 1 ? "disabled" : "") + ">‹ Anterior</button>" +
      "<span>Página " + state.pedidoPage + " de " + totalPages + " (" + fmtInt(rows.length) + " pedidos)</span>" +
      '<button id="ped-next" ' + (state.pedidoPage >= totalPages ? "disabled" : "") + ">Próxima ›</button>";
    document.getElementById("ped-prev")?.addEventListener("click", () => {
      state.pedidoPage--;
      renderPedidos();
    });
    document.getElementById("ped-next")?.addEventListener("click", () => {
      state.pedidoPage++;
      renderPedidos();
    });
  }
}

function setupPedidosControls() {
  const search = document.getElementById("search-pedidos");
  if (search) {
    search.addEventListener("input", (e) => {
      state.pedidoSearch = e.target.value;
      state.pedidoPage = 1;
      renderPedidos();
    });
  }
  document.querySelectorAll("#pedidos-table th[data-pkey]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.pkey;
      if (state.pedidoSortKey === key) {
        state.pedidoSortDir = state.pedidoSortDir === "asc" ? "desc" : "asc";
      } else {
        state.pedidoSortKey = key;
        state.pedidoSortDir = "desc";
      }
      state.pedidoPage = 1;
      renderPedidos();
    });
  });
}

function refreshAll() {
  const products = getBaseProducts();
  const productsForHealth = filterProducts({ dept: false });
  const productsForDonut = filterProducts({ status: false });

  const kpis = computeKpis(products);
  const statusSummary = computeStatusSummary(productsForDonut);
  const deptBars = computeDeptBars(products);
  const deptHealth = computeDeptHealth(productsForHealth);

  renderUpdatedAt();
  renderKpis(kpis);
  renderDonut(statusSummary);
  renderDeptBars(deptBars);
  renderDeptHealth(deptHealth);
  renderTable(products);
  updateStatusCounts();
  renderPedidos();
}

document.addEventListener("DOMContentLoaded", () => {
  if (typeof DASHBOARD_DATA === "undefined" || !DASHBOARD_DATA.produtos) {
    console.error("DASHBOARD_DATA não carregado. Verifique data.js");
    return;
  }
  setupMarcaDropdown();
  setupTableControls();
  setupExport();
  setupPedidosControls();
  refreshAll();
});
