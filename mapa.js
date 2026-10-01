'use strict';

/**
 * Painel de Ônibus - tela do mapa
 * Usa Leaflet + OpenStreetMap.
 *  - Mapa interativo centrado no Recife
 *  - Paradas (mock) com popup e botão de favoritar
 *  - Favoritos persistidos em localStorage
 *  - Geolocalização do usuário
 *  - Alternância de camada (ruas / satélite)
 *  - Busca por parada ou linha (também via ?q= e ?linha=)
 *  - Bottom sheet com listas
 *
 * As coordenadas são aproximadas e servem de exemplo: troque STOPS por dados da sua API.
 */
(() => {
  // ---------- Dados (mock) ----------
  const STOPS = [
    { id: 'ti-joana-bezerra', name: 'Terminal Integrado Joana Bezerra', lat: -8.0716, lng: -34.8894, lines: ['307'] },
    { id: 'terminal-central', name: 'Terminal Central', lat: -8.0631, lng: -34.8808, lines: ['201'] },
    { id: 'boa-vista', name: 'Boa Vista', lat: -8.0589, lng: -34.8896, lines: ['412'] },
    { id: 'derby', name: 'Praça do Derby', lat: -8.0536, lng: -34.8995, lines: ['518', '201'] },
    { id: 'marco-zero', name: 'Marco Zero', lat: -8.0630, lng: -34.8711, lines: ['201', '307'] },
    { id: 'boa-viagem', name: 'Boa Viagem', lat: -8.1190, lng: -34.9000, lines: ['623'] },
  ];
  const RECIFE = [-8.0476, -34.877];
  const FAV_KEY = 'painel:favoritos';

  // ---------- Utilitários ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const normalize = (s) =>
    String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  const el = (tag, className, text) => {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  const storage = {
    read() {
      try {
        return new Set(JSON.parse(localStorage.getItem(FAV_KEY)) || []);
      } catch {
        return new Set();
      }
    },
    write(set) {
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify([...set]));
      } catch {
        /* storage indisponível: segue sem persistir */
      }
    },
  };

  const favorites = storage.read();

  // ---------- Toast ----------
  let toastTimer;
  function toast(message) {
    let t = $('#toast');
    if (!t) {
      t = el('div');
      t.id = 'toast';
      t.setAttribute('role', 'status');
      t.style.cssText =
        'position:fixed;left:50%;bottom:110px;transform:translateX(-50%);background:#222;color:#fff;' +
        'padding:10px 16px;border-radius:20px;font-size:14px;z-index:2000;max-width:90%;text-align:center;';
      document.body.appendChild(t);
    }
    t.textContent = message;
    t.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.style.display = 'none'), 3000);
  }

  // ---------- Elementos ----------
  const mapEl = $('.map-placeholder');
  const searchInput = $('.floating-search-bar input');
  const clearBtn = $('.clear-btn');
  const [locateBtn, layerBtn] = document.querySelectorAll('.control-btn');
  const [favBtn, stopsBtn] = document.querySelectorAll('.sheet-button');
  const sheet = $('.bottom-sheet');
  const handle = $('.drag-handle');

  if (typeof L === 'undefined') {
    toast('Não foi possível carregar o mapa. Verifique sua conexão.');
    return;
  }

  // Garante que o mapa tenha dimensão e que a UI flutue acima das camadas do Leaflet
  mapEl.id = 'map';
  mapEl.style.position = 'absolute';
  mapEl.style.inset = '0';
  [$('.floating-search-bar'), $('.floating-controls'), sheet].forEach((n) => {
    if (n) n.style.zIndex = 1000;
  });

  // ---------- Mapa ----------
  const map = L.map(mapEl, { zoomControl: false }).setView(RECIFE, 13);

  const baseLayers = {
    ruas: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }),
    satelite: L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: 'Tiles &copy; Esri' }
    ),
  };
  let currentBase = 'ruas';
  baseLayers[currentBase].addTo(map);

  const stopsLayer = L.layerGroup().addTo(map);
  const markers = new Map(); // id -> marker

  const stopIcon = (isFav) =>
    L.divIcon({
      className: 'stop-marker',
      html: `<div style="width:30px;height:30px;border-radius:50%;background:${isFav ? '#f1c40f' : '#1e6fff'};
        color:#fff;display:flex;align-items:center;justify-content:center;border:2px solid #fff;
        box-shadow:0 2px 6px rgba(0,0,0,.35);font-size:14px;"><i class="fa-solid fa-bus"></i></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -14],
    });

  function buildPopup(stop) {
    const box = el('div');
    box.append(el('strong', '', stop.name), el('br'));
    box.append(el('span', '', `Linhas: ${stop.lines.join(', ')}`), el('br'));

    const btn = el('button', '', favorites.has(stop.id) ? '★ Remover dos favoritos' : '☆ Favoritar');
    btn.style.cssText = 'margin-top:8px;padding:6px 10px;border:0;border-radius:8px;background:#1e6fff;color:#fff;cursor:pointer;';
    btn.addEventListener('click', () => {
      toggleFavorite(stop.id);
      btn.textContent = favorites.has(stop.id) ? '★ Remover dos favoritos' : '☆ Favoritar';
    });
    box.appendChild(btn);
    return box;
  }

  STOPS.forEach((stop) => {
    const m = L.marker([stop.lat, stop.lng], {
      icon: stopIcon(favorites.has(stop.id)),
      title: stop.name,
      keyboard: true,
    }).bindPopup(() => buildPopup(stop));
    markers.set(stop.id, m);
    m.addTo(stopsLayer);
  });

  // ---------- Favoritos ----------
  function toggleFavorite(id) {
    const wasFav = favorites.has(id);
    wasFav ? favorites.delete(id) : favorites.add(id);
    storage.write(favorites);
    markers.get(id)?.setIcon(stopIcon(!wasFav));
    toast(wasFav ? 'Removido dos favoritos' : 'Adicionado aos favoritos');
    if (panelMode) renderPanel();
  }

  // ---------- Painel inferior ----------
  const panel = el('div', 'sheet-list');
  panel.hidden = true;
  panel.style.cssText = 'max-height:40vh;overflow-y:auto;margin-top:12px;';
  sheet.appendChild(panel);
  let panelMode = null; // 'favoritos' | 'paradas' | null

  function focusStop(stop) {
    map.flyTo([stop.lat, stop.lng], 16, { duration: 0.8 });
    markers.get(stop.id)?.openPopup();
  }

  function renderPanel() {
    const items =
      panelMode === 'favoritos' ? STOPS.filter((s) => favorites.has(s.id)) : STOPS;

    panel.replaceChildren();

    if (!items.length) {
      const p = el('p', '', 'Você ainda não tem favoritos. Toque em uma parada no mapa para favoritar.');
      p.style.cssText = 'text-align:center;color:#777;padding:12px;';
      panel.appendChild(p);
      return;
    }

    items.forEach((stop) => {
      const row = el('button', 'sheet-row');
      row.type = 'button';
      row.style.cssText =
        'display:flex;justify-content:space-between;align-items:center;width:100%;padding:12px;' +
        'background:none;border:0;border-bottom:1px solid #eee;text-align:left;cursor:pointer;font:inherit;';
      const info = el('span');
      info.append(el('strong', '', stop.name), el('br'), el('small', '', `Linhas: ${stop.lines.join(', ')}`));
      row.append(info, el('span', '', favorites.has(stop.id) ? '★' : ''));
      row.addEventListener('click', () => focusStop(stop));
      panel.appendChild(row);
    });
  }

  function setPanel(mode) {
    panelMode = panelMode === mode ? null : mode;
    panel.hidden = panelMode === null;
    favBtn.classList.toggle('active', panelMode === 'favoritos');
    stopsBtn.classList.toggle('active', panelMode === 'paradas');
    if (panelMode) renderPanel();
  }

  favBtn.addEventListener('click', () => setPanel('favoritos'));
  stopsBtn.addEventListener('click', () => setPanel('paradas'));
  handle.style.cursor = 'pointer';
  handle.addEventListener('click', () => {
    panelMode = null;
    panel.hidden = true;
    favBtn.classList.remove('active');
    stopsBtn.classList.remove('active');
  });

  // ---------- Controles flutuantes ----------
  let userMarker;
  locateBtn.addEventListener('click', () => {
    if (!navigator.geolocation) return toast('Geolocalização não suportada neste navegador.');
    toast('Buscando sua localização...');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const pos = [coords.latitude, coords.longitude];
        userMarker?.remove();
        userMarker = L.circleMarker(pos, {
          radius: 8, color: '#fff', weight: 3, fillColor: '#1e6fff', fillOpacity: 1,
        }).addTo(map);
        map.flyTo(pos, 16);
      },
      (err) =>
        toast(err.code === err.PERMISSION_DENIED
          ? 'Permissão de localização negada.'
          : 'Não foi possível obter sua localização.'),
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  });

  layerBtn.addEventListener('click', () => {
    map.removeLayer(baseLayers[currentBase]);
    currentBase = currentBase === 'ruas' ? 'satelite' : 'ruas';
    baseLayers[currentBase].addTo(map).bringToBack();
    toast(currentBase === 'ruas' ? 'Camada: ruas' : 'Camada: satélite');
  });

  // ---------- Busca ----------
  function search(query) {
    const q = normalize(query);
    if (!q) return resetView();

    const found = STOPS.filter(
      (s) => normalize(s.name).includes(q) || s.lines.some((l) => normalize(l).includes(q))
    );

    if (!found.length) return toast('Nenhuma parada ou linha encontrada.');

    stopsLayer.clearLayers();
    found.forEach((s) => markers.get(s.id).addTo(stopsLayer));

    if (found.length === 1) focusStop(found[0]);
    else map.flyToBounds(L.latLngBounds(found.map((s) => [s.lat, s.lng])), { padding: [60, 60] });
  }

  function resetView() {
    stopsLayer.clearLayers();
    markers.forEach((m) => m.addTo(stopsLayer));
  }

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') search(searchInput.value);
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    resetView();
    searchInput.focus();
  });

  // ---------- Parâmetros da URL (?q= / ?linha=) ----------
  const params = new URLSearchParams(window.location.search);
  const initial = params.get('linha') || params.get('q');
  if (initial) {
    searchInput.value = initial;
    search(initial);
  }
})();
