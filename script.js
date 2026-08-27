// script.js - Lógica completa de renderização da Dashboard (SVG Puro)

// ---------- Configuração de cores por status de VENDAS (donut) ----------
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

// ---------- Configuração de cores por status de ESTOQUE (tabela/filtros) ----------
const STATUS_COLORS = {
  Ruptura: "#e04b3f",
  Critico: "#f0973d",
  OK: "#7cb342",
  Over: "#2d6cdf",
};
const STATUS_ORDER = ["Ruptura", "Critico", "OK", "Over"];
const STATUS_LABELS = { Ruptura: "Ruptura", Critico: "Crítico", OK: "OK", Over: "Over" };

const data = DASHBOARD_DATA;

// ---------- Helpers de formatação ----------
const fmtMoney = (v) =>
  "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtInt = (v) => Number(v || 0).toLocaleString("pt-BR");

// ---------- KPI cards ----------
function renderKpis() {
  const k = data.kpis;
  document.getElementById("kpi-meta-mensal").textContent = fmtMoney(k.meta_mensal);
  document.getElementById("kpi-venda-atual").textContent = fmtMoney(k.venda_atual);
  
  const elFalta = document.getElementById("kpi-falta-meta");
  if (elFalta) {
    elFalta.textContent = fmtMoney(k.falta_meta);
    if (k.falta_meta < 0) {
      elFalta.style.color = "#e04b3f";
    } else {
      elFalta.style.color = "";
    }
  }

  document.getElementById("kpi-estoque-un").textContent = fmtInt(k.estoque_total_un);
}

// ---------- Donut chart (SVG puro) — Vendas Atual UN por Status Vendas 3M ----------
function renderDonut() {
  const svg = document.getElementById("donut");
  const legend = document.getElementById("donut-legend");

  const ordered = VENDAS_ORDER.map((st) =>
    data.vendas_status_summary.find((s) => s.status_vendas === st)
  ).filter(Boolean);

  const total = ordered.reduce((a, s) => a + s.vendas_un, 0);
  const totalElem = document.getElementById("donut-total");
  if (totalElem) {
    totalElem.textContent = fmtInt(Math.round(data.kpis.venda_atual));
  }

  const cx = 100, cy = 100, rOuter = 90, rInner = 55;
  let angleStart = -90;

  const paths = [];
  ordered.forEach((s) => {
    const frac = total ? s.vendas_un / total : 0;
    const angleEnd = angleStart + frac * 360;
    paths.push(donutSlice(cx, cy, rOuter, rInner, angleStart, angleEnd, VENDAS_COLORS[s.status_vendas]));
    angleStart = angleEnd;
  });
  if (svg) svg.innerHTML = paths.join("");

  if (legend) {
    legend.innerHTML = ordered
      .map(
        (s) => `
        <li>
          <span class="dot" style="background:${VENDAS_COLORS[s.status_vendas]}"></span>
          <span class="lg-label">${VENDAS_LABELS[s.status_vendas]}</span>
          <span class="lg-value">${Number(s.vendas_un).toFixed(2)}%</span>
        </li>`
      )
      .join("");
  }
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
  const d = `
    M ${p1.x} ${p1.y}
    A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x} ${p2.y}
    L ${p3.x} ${p3.y}
    A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x} ${p4.y}
    Z`;
  return `<path d="${d}" fill="${color}"></path>`;
}

// ---------- Barras por departamento (estoque UN) ----------
function renderDeptBars() {
  const el = document.getElementById("dept-bars");
  if (!el) return;

  const depts = [...(data.dept_summary || [])].sort((a, b) => b.estoque_un - a.estoque_un).slice(0, 8);
  const max = Math.max(...depts.map((d) => d.estoque_un), 1);

  el.innerHTML = depts
    .map((d) => {
      const pct = max ? (d.estoque_un / max) * 100 : 0;
      return `
      <div class="bar-row">
        <span class="bar-label">${d.departamento}</span>
        <div class="bar-track">
          <div class="bar-fill" style="width:${pct}%"></div>
        </div>
        <span class="bar-value">${fmtInt(d.estoque_un)} un</span>
      </div>`;
    })
    .join("");
}

// ---------- Gauge de saúde do estoque ----------
function renderGauge() {
  const statusSummary = data.status_summary || [];
  const byStatus = Object.fromEntries(statusSummary.map((s) => [s.status, s]));
  const total = statusSummary.reduce((a, s) => a + s.qtd_produtos, 0);
  const saudavel = (byStatus.OK?.qtd_produtos || 0) + (byStatus.Over?.qtd_produtos || 0);
  const pct = total ? Math.round((saudavel / total) * 100) : 0;
  
  const elGaugePct = document.getElementById("gauge-pct");
  if (elGaugePct) elGaugePct.textContent = pct + "%";

  const svg = document.getElementById("gauge");
  if (svg) {
    const cx = 100, cy = 100, r = 85;
    const startA = -180, endA = 0;
    const valueA = startA + (pct / 100) * 180;

    const bg = arcPath(cx, cy, r, startA, endA);
    const fg = arcPath(cx, cy, r, startA, valueA);

    svg.innerHTML = `
      <path d="${bg}" stroke="#e1e5ee" stroke-width="18" fill="none" stroke-linecap="round"/>
      <path d="${fg}" stroke="#7cb342" stroke-width="18" fill="none" stroke-linecap="round"/>
    `;
  }

  // tabela por status
  const tbody = document.querySelector("#status-table tbody");
  if (tbody) {
    tbody.innerHTML = STATUS_ORDER.map((st) => {
      const s = byStatus[st] || { qtd_produtos: 0, estoque_un: 0, faturamento: 0 };
      return `<tr>
        <td><span class="status-badge status-${st}">${STATUS_LABELS[st]}</span></td>
        <td>${fmtInt(s.qtd_produtos)}</td>
        <td>${fmtInt(s.estoque_un)}</td>
        <td>${fmtMoney(s.faturamento)}</td>
      </tr>`;
    }).join("");
  }
}

function arcPath(cx, cy, r, a1, a2) {
  const toRad = (a) => (a * Math.PI) / 180;
  const p1 = { x: cx + r * Math.cos(toRad(a1)), y: cy + r * Math.sin(toRad(a1)) };
  const p2 = { x: cx + r * Math.cos(toRad(a2)), y: cy + r * Math.sin(toRad(a2)) };
  const largeArc = a2 - a1 > 180 ? 1 : 0;
  return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${largeArc} 1 ${p2.x} ${p2.y}`;
}

// ---------- Tabela de produtos (filtro + busca + paginação) ----------
const PAGE_SIZE = 50;
let state = { status: "Todos", search: "", sortKey: "faturamento", sortDir: "desc", page: 1 };

function getFilteredProducts() {
  let rows = data.produtos || [];
  if (state.status !== "Todos") rows = rows.filter((p) => p.status === state.status);
  if (state.search) {
    const q = state.search.toLowerCase();
    rows = rows.filter(
      (p) =>
        p.descricao.toLowerCase().includes(q) ||
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

function renderTable() {
  const tbody = document.getElementById("product-tbody");
  if (!tbody) return;

  const rows = getFilteredProducts();
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  state.page = Math.min(state.page, totalPages);
  const startIdx = (state.page - 1) * PAGE_SIZE;
  const pageRows = rows.slice(startIdx, startIdx + PAGE_SIZE);

  tbody.innerHTML = pageRows
    .map(
      (p) => `
    <tr>
      <td>${p.descricao}</td>
      <td>${p.departamento}</td>
      <td>${p.marca || ""}</td>
      <td class="num">${fmtInt(p.estoque_un)}</td>
      <td class="num">${Number(p.dias_estoque_un || 0).toFixed(1)}</td>
      <td class="num">${fmtMoney(p.faturamento)}</td>
      <td><span class="status-badge status-${p.status}">${STATUS_LABELS[p.status] || p.status}</span></td>
    </tr>`
    )
    .join("");

  renderPagination(rows.length, totalPages);
}

function renderPagination(totalRows, totalPages) {
  const el = document.getElementById("pagination");
  if (!el) return;

  el.innerHTML = `
    <button id="prev-page" ${state.page <= 1 ? "disabled" : ""}>‹ Anterior</button>
    <span>Página ${state.page} de ${totalPages} (${fmtInt(totalRows)} produtos)</span>
    <button id="next-page" ${state.page >= totalPages ? "disabled" : ""}>Próxima ›</button>
  `;
  document.getElementById("prev-page")?.addEventListener("click", () => {
    state.page--;
    renderTable();
  });
  document.getElementById("next-page")?.addEventListener("click", () => {
    state.page++;
    renderTable();
  });
}

function setupTableControls() {
  const searchBox = document.getElementById("search-box");
  if (searchBox) {
    searchBox.addEventListener("input", (e) => {
      state.search = e.target.value;
      state.page = 1;
      renderTable();
    });
  }

  document.querySelectorAll(".status-filters .chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".status-filters .chip").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.status = btn.dataset.status;
      state.page = 1;
      renderTable();
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
      renderTable();
    });
  });
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", () => {
  renderKpis();
  renderDonut();
  renderDeptBars();
  renderGauge();
  setupTableControls();
  renderTable();
});
