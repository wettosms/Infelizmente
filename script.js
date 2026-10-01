'use strict';

/**
 * Painel de Ônibus - tela inicial
 * Responsabilidades:
 *  - Saudação conforme o horário
 *  - Renderização da lista de próximos ônibus (a partir de dados)
 *  - Contagem regressiva simulada
 *  - Busca com debounce + filtro; Enter leva ao mapa
 *  - "Ver todos" expande/recolhe a lista
 *  - Navegação dos cards
 *
 * Quando houver API real, basta substituir getBuses() por um fetch().
 */
(() => {
  // ---------- Dados (mock) ----------
  const BUSES = [
    { line: '201', name: 'Terminal Central', direction: 'Centro', minutes: 3 },
    { line: '307', name: 'Joana Bezerra', direction: 'Centro', minutes: 7 },
    { line: '412', name: 'Boa Vista', direction: 'Centro', minutes: 12 },
    { line: '518', name: 'Derby', direction: 'Centro', minutes: 18, color: '#8e44ad' },
    { line: '623', name: 'Boa Viagem', direction: 'Centro', minutes: 25, color: '#16a085' },
  ];
  const VISIBLE_BY_DEFAULT = 3;
  const TICK_MS = 60_000;

  // ---------- Utilitários ----------
  const $ = (sel, root = document) => root.querySelector(sel);

  const normalize = (str) =>
    String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  const debounce = (fn, delay = 200) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
  };

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  // ---------- Estado ----------
  const state = {
    buses: BUSES.map((b) => ({ ...b })),
    query: '',
    expanded: false,
  };

  // ---------- Elementos ----------
  const greetingEl = $('.user-info h1');
  const searchInput = $('.search-box input');
  const section = $('.bus-section');
  const seeAll = $('.see-all');
  const linesCard = $('.actions-grid .action-card:not(.nav-link)');
  const banner = $('.footer-banner');

  // Container da lista (substitui os itens estáticos)
  section.querySelectorAll('.bus-item').forEach((n) => n.remove());
  const list = el('div', 'bus-list');
  list.setAttribute('aria-live', 'polite');
  section.appendChild(list);

  // ---------- Saudação ----------
  function renderGreeting() {
    const h = new Date().getHours();
    const greet = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    greetingEl.textContent = `${greet}, usuário!`;
  }

  // ---------- Lista ----------
  function formatTime(min) {
    return min <= 0 ? 'Chegando >' : `${min} min >`;
  }

  function getFiltered() {
    const q = normalize(state.query);
    if (!q) return state.buses;
    return state.buses.filter(
      (b) =>
        normalize(b.line).includes(q) ||
        normalize(b.name).includes(q) ||
        normalize(b.direction).includes(q)
    );
  }

  function buildItem(bus) {
    const item = el('div', 'bus-item');
    item.tabIndex = 0;
    item.setAttribute('role', 'link');
    item.setAttribute('aria-label', `Linha ${bus.line}, ${bus.name}, ${formatTime(bus.minutes)}`);

    const badge = el('div', `bus-number badge-${bus.line}`, bus.line);
    if (bus.color) badge.style.background = bus.color;

    const details = el('div', 'bus-details');
    details.append(el('h4', '', bus.name), el('p', '', `Direção: ${bus.direction}`));

    const time = el('div', 'bus-time', formatTime(bus.minutes));
    time.dataset.line = bus.line;

    item.append(badge, details, time);

    const go = () => {
      window.location.href = `mapa.html?linha=${encodeURIComponent(bus.line)}`;
    };
    item.addEventListener('click', go);
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        go();
      }
    });
    return item;
  }

  function renderList() {
    const filtered = getFiltered();
    const searching = state.query.trim() !== '';
    const shown = searching || state.expanded ? filtered : filtered.slice(0, VISIBLE_BY_DEFAULT);

    list.replaceChildren();

    if (shown.length === 0) {
      const empty = el('p', 'bus-empty', 'Nenhuma linha encontrada. Pressione Enter para buscar no mapa.');
      empty.style.cssText = 'text-align:center;padding:16px;color:#777;';
      list.appendChild(empty);
    } else {
      shown.forEach((b) => list.appendChild(buildItem(b)));
    }

    seeAll.textContent = state.expanded ? 'Ver menos' : 'Ver todos';
    seeAll.style.display = searching || state.buses.length <= VISIBLE_BY_DEFAULT ? 'none' : '';
  }

  // Atualiza só o texto dos tempos (sem recriar a lista)
  function tick() {
    state.buses.forEach((b) => {
      b.minutes -= 1;
      if (b.minutes < 0) b.minutes = 15 + Math.floor(Math.random() * 15);
    });
    state.buses.forEach((b) => {
      const t = list.querySelector(`.bus-time[data-line="${b.line}"]`);
      if (t) t.textContent = formatTime(b.minutes);
    });
  }

  // ---------- Eventos ----------
  const onSearch = debounce((value) => {
    state.query = value;
    renderList();
  }, 200);

  searchInput.addEventListener('input', (e) => onSearch(e.target.value));

  searchInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const q = searchInput.value.trim();
    if (q) window.location.href = `mapa.html?q=${encodeURIComponent(q)}`;
  });

  seeAll.addEventListener('click', (e) => {
    e.preventDefault();
    state.expanded = !state.expanded;
    renderList();
  });

  if (linesCard) {
    linesCard.style.cursor = 'pointer';
    linesCard.tabIndex = 0;
    const focusLines = () => {
      state.expanded = true;
      renderList();
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    linesCard.addEventListener('click', focusLines);
    linesCard.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') focusLines();
    });
  }

  if (banner) {
    banner.style.cursor = 'pointer';
    banner.addEventListener('click', () => {
      window.location.href = 'mapa.html';
    });
  }

  // ---------- Init ----------
  renderGreeting();
  renderList();
  setInterval(tick, TICK_MS);
})();
