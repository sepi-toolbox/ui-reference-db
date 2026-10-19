/* Offline UI Reference Library. Source images are read-only. */
(() => {
  'use strict';
  const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
  const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '1970-01-01' && value <= '2100-12-31' && !isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  function selectGames(games, state) {
    const query = normalize(state.query);
    return games.filter(game => (!state.savedOnly || state.favorites.has(game.id))
      && (!query || [game.name, game.originalName, ...(game.aliases || [])].some(name => normalize(name).includes(query)))
      && (!state.platforms.size || (game.platforms.length ? game.platforms : ['미확인']).some(platform => state.platforms.has(platform)))
      && (!state.genres.size || state.genres.has(game.genre)))
      .sort((a, b) => {
        const name = collator.compare(a.name, b.name);
        if (state.sort === 'name-asc') return name;
        if (state.sort === 'name-desc') return -name;
        const aKnown = validDate(a.releaseDate), bKnown = validDate(b.releaseDate);
        if (aKnown !== bKnown) return aKnown ? -1 : 1;
        const direction = state.sort === 'date-asc' ? 1 : -1;
        if (aKnown) return a.releaseDate.localeCompare(b.releaseDate) * direction || name;
        const ay = /^\d{4}$/.test(String(a.archiveYear)) ? Number(a.archiveYear) : null;
        const by = /^\d{4}$/.test(String(b.archiveYear)) ? Number(b.archiveYear) : null;
        if (ay === null || by === null) return ay === by ? name : ay === null ? 1 : -1;
        return (ay - by) * direction || name;
      });
  }
  const allowedPlatforms = ['모바일', 'PC', '콘솔', '웹'];
  function cleanOverride(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('게임 정보 형식이 올바르지 않습니다.');
    if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 180) throw new Error('게임 이름을 확인해 주세요.');
    if (typeof value.genre !== 'string' || !value.genre.trim() || value.genre.length > 80) throw new Error('장르를 확인해 주세요.');
    if (!Array.isArray(value.platforms) || value.platforms.some(p => !allowedPlatforms.includes(p))) throw new Error('지원하지 않는 플랫폼 값입니다.');
    if (value.releaseDate && !validDate(value.releaseDate)) throw new Error('출시일 형식이 올바르지 않습니다.');
    return { name: value.name.trim(), genre: value.genre.trim(), platforms: [...new Set(value.platforms)], releaseDate: value.releaseDate || '', dateRegion: String(value.dateRegion || '').slice(0, 100), metadataNote: String(value.metadataNote || '').slice(0, 1500), userEdited: true };
  }
  const core = { normalize, validDate, selectGames, cleanOverride };
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  if (typeof document === 'undefined') return;

  const $ = id => document.getElementById(id);
  const catalog = window.UI_CATALOG;
  if (!catalog || !Array.isArray(catalog.games)) { $('game-grid').textContent = '자료 목록을 불러오지 못했습니다. catalog.js와 index.html을 같은 폴더에 두어 주세요.'; return; }
  const bases = new Map(catalog.games.map(game => [game.id, game]));
  const storageKey = 'ui-reference-library-v1';
  let overrides = {}, favorites = new Set(), storageAvailable = true;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    for (const [id, value] of Object.entries(saved.overrides || {})) if (bases.has(id)) { try { overrides[id] = cleanOverride(value); } catch {} }
    favorites = new Set((Array.isArray(saved.favorites) ? saved.favorites : []).filter(id => bases.has(id)));
  } catch { storageAvailable = false; }
  let games = [];
  let activeGame = null, imageIndex = 0, shownImages = 48, toastTimer;
  const state = { query: '', sort: 'date-desc', platforms: new Set(), genres: new Set(), favorites, savedOnly: false, page: 1, pageSize: 24, view: 'grid' };
  const genreNames = { '수집형RPG': '수집형 RPG', '전략SLG': '전략 SLG', '육성시뮬': '육성 시뮬', '카드TCG': '카드 TCG' };
  const genreLabel = genre => genreNames[genre] || genre;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const number = value => Number(value).toLocaleString('ko-KR');
  const dateLabel = game => validDate(game.releaseDate) ? game.releaseDate.replaceAll('-', '.') : game.archiveYear ? `${game.archiveYear} · 원본 연도` : '출시일 미확인';
  function notify(message) {
    $('toast').textContent = message;
    // An open modal is in the top layer; render its feedback there as well.
    const openDialog = [...document.querySelectorAll('dialog[open]')].at(-1);
    document.querySelectorAll('.dialog-feedback').forEach(node => node.remove());
    if (openDialog) { const feedback = document.createElement('p'); feedback.className = 'dialog-feedback'; feedback.setAttribute('role', 'status'); feedback.textContent = message; openDialog.append(feedback); setTimeout(() => feedback.remove(), 4500); }
    $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3500);
  }
  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify({ version: 1, overrides, favorites: [...favorites] })); storageAvailable = true; }
    catch { storageAvailable = false; notify('브라우저 저장 공간을 사용할 수 없어요. 안내 메뉴에서 백업을 내려받아 주세요.'); }
  }
  function showDialog(id) { if (!$(id).open) $(id).showModal(); document.body.classList.add('modal-open'); }
  function closeDialog(id) { $(id).close(); }
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('close', () => { document.body.classList.toggle('modal-open', !!document.querySelector('dialog[open]')); if (dialog.id === 'lightbox') $('image-stage').replaceChildren(); });
    dialog.addEventListener('click', event => { if (event.target !== dialog) return; const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); });
  });
  function rebuild() { games = catalog.games.map(base => ({ ...base, ...(overrides[base.id] || {}) })); renderFilters(); render(); }
  function renderFilters() {
    const platformCounts = new Map([...allowedPlatforms, '미확인'].map(platform => [platform, 0]));
    const genreCounts = new Map();
    games.forEach(game => { (game.platforms.length ? game.platforms : ['미확인']).forEach(p => platformCounts.set(p, (platformCounts.get(p) || 0) + 1)); genreCounts.set(game.genre, (genreCounts.get(game.genre) || 0) + 1); });
    function options(container, counts, selected) {
      $(container).innerHTML = [...counts].filter(([value, count]) => count > 0 || selected.has(value)).map(([value, count]) => `<label class="filter-option"><input type="checkbox" value="${escape(value)}" ${selected.has(value) ? 'checked' : ''}><span>${escape(container === 'genre-filters' ? genreLabel(value) : value)}</span><span class="count">${count}</span></label>`).join('');
    }
    options('platform-filters', platformCounts, state.platforms);
    options('genre-filters', new Map([...genreCounts].sort((a, b) => b[1] - a[1])), state.genres);
  }
  function render() {
    const selected = selectGames(games, state);
    const totalPages = Math.max(1, Math.ceil(selected.length / state.pageSize));
    state.page = Math.max(1, Math.min(state.page, totalPages));
    $('all-count').textContent = number(games.length); $('saved-count').textContent = number(favorites.size);
    $('game-total').textContent = number(games.length); $('media-total').textContent = number(catalog.stats.media);
    $('collection-title').textContent = state.savedOnly ? '저장한 게임' : '전체 게임'; $('result-count').textContent = `${number(selected.length)}개`;
    $('all-nav').classList.toggle('active', !state.savedOnly); $('saved-nav').classList.toggle('active', state.savedOnly);
    $('all-nav').setAttribute('aria-pressed', !state.savedOnly); $('saved-nav').setAttribute('aria-pressed', state.savedOnly);
    $('sort-note').textContent = state.sort.startsWith('date') ? '확인된 출시일 우선 · 날짜 미확인은 원본 연도순' : '한글·영문 게임 이름 기준 정렬';
    const chips = [...state.platforms].map(value => ['platform', value]).concat([...state.genres].map(value => ['genre', value]));
    $('active-filters').innerHTML = chips.map(([type, value]) => `<button class="filter-chip" data-type="${type}" data-value="${escape(value)}" aria-label="${escape(value)} 필터 해제">${escape(type === 'genre' ? genreLabel(value) : value)} ×</button>`).join('');
    $('game-grid').classList.toggle('list', state.view === 'list');
    const page = selected.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
    $('game-grid').innerHTML = page.map(game => {
      const cover = game.images.find(asset => asset.id === game.cover) || game.images[0];
      const saved = favorites.has(game.id);
      return `<article class="game-card"><button class="favorite${saved ? ' saved' : ''}" data-save="${game.id}" aria-label="${escape(game.name)} ${saved ? '저장 해제' : '저장'}" aria-pressed="${saved}">${saved ? '★' : '☆'}</button><button class="card-open" data-open="${game.id}"><div class="game-cover"><img src="${escape(cover.thumb)}" alt="${escape(game.name)} UI 미리보기" loading="lazy" decoding="async"><span class="media-count">▧ ${number(game.images.length)}</span></div><div class="game-info"><h3 title="${escape(game.name)}">${escape(game.name)}</h3><div class="original-name" title="${escape(game.originalName)}">${escape(game.originalName)}</div><div class="card-meta"><span class="genre-tag">${escape(genreLabel(game.genre))}</span><span class="card-date">${escape(dateLabel(game))}</span></div><div class="card-platforms">${escape(game.platforms.length ? game.platforms.join(' · ') : '플랫폼 미확인')}</div></div></button></article>`;
    }).join('');
    $('empty-state').hidden = selected.length > 0; $('pagination').hidden = selected.length <= state.pageSize;
    $('page-status').textContent = `${state.page} / ${totalPages}`; $('prev-page').disabled = state.page <= 1; $('next-page').disabled = state.page >= totalPages;
  }
  function reset() {
    state.query = ''; state.platforms.clear(); state.genres.clear(); state.page = 1; state.savedOnly = false;
    $('search').value = ''; renderFilters(); render();
  }
  function favorite(id) {
    favorites.has(id) ? favorites.delete(id) : favorites.add(id); persist(); render();
    if (activeGame) updateFavorite();
  }
  function updateFavorite() {
    const saved = favorites.has(activeGame.id); $('detail-favorite').textContent = saved ? '★ 저장됨' : '☆ 저장'; $('detail-favorite').setAttribute('aria-pressed', saved);
  }
  function renderDetail() {
    if (!activeGame) return;
    $('detail-title').textContent = activeGame.name; $('detail-original').textContent = activeGame.originalName;
    $('detail-badges').innerHTML = [genreLabel(activeGame.genre), ...(activeGame.platforms.length ? activeGame.platforms : ['플랫폼 미확인']), ...(activeGame.userEdited ? ['직접 수정한 정보'] : [])].map(value => `<span>${escape(value)}</span>`).join('');
    $('detail-date').textContent = validDate(activeGame.releaseDate) ? `출시일 ${dateLabel(activeGame)}${activeGame.dateRegion ? ` · ${activeGame.dateRegion}` : ''}` : `출시일 미확인${activeGame.archiveYear ? ` · 원본 연도 ${activeGame.archiveYear}` : ''}`;
    $('detail-amount').textContent = `이미지·영상 ${number(activeGame.images.length)}개`;
    const sourceLinks = (activeGame.sources || []).filter(source => /^https?:\/\//i.test(source.url || '')).map(source => `<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.title || source.label || '정보 출처')} ↗</a>`).join('');
    $('detail-sources').innerHTML = `<p>${escape(activeGame.metadataNote || '원본 아카이브 분류를 사용합니다.')}</p>${activeGame.userEdited ? '<p>현재 표시는 사용자가 수정한 정보입니다. 아래 링크는 최초 수집 시 참고한 출처입니다.</p>' : ''}${sourceLinks || '<p>장르·연도: 다운로드한 아카이브 메타데이터. 플랫폼과 출시 월·일은 아직 확인하지 않았습니다.</p>'}`;
    updateFavorite(); renderScreenshots();
  }
  function openGame(id) {
    activeGame = games.find(game => game.id === id); if (!activeGame) return;
    shownImages = 48; $('detail-sources').hidden = true; $('detail-sources-toggle').textContent = '정보 출처';
    renderDetail(); showDialog('game-dialog'); $('game-dialog').scrollTop = 0;
  }
  function renderScreenshots() {
    const assets = activeGame.images.slice(0, shownImages);
    $('screenshots').innerHTML = assets.map((asset, index) => `<button class="screenshot-card" data-image="${index}" aria-label="${escape(asset.category || '스크린샷')} ${index + 1} 확대"><div><img src="${escape(asset.thumb)}" alt="${escape(asset.category || activeGame.name)}" loading="lazy" decoding="async">${asset.type === 'video' || asset.animated ? `<span class="screen-type">${asset.type === 'video' ? '▶ VIDEO' : 'GIF'}</span>` : ''}</div><span class="screen-caption">${String(index + 1).padStart(3, '0')} · ${escape(asset.category ? asset.category.replaceAll('|', ' · ') : asset.name)}</span></button>`).join('');
    $('load-more').hidden = shownImages >= activeGame.images.length;
    $('load-more').textContent = `레퍼런스 더 보기 (${Math.min(shownImages, activeGame.images.length)} / ${activeGame.images.length})`;
  }
  function showImage(index) {
    imageIndex = Math.max(0, Math.min(index, activeGame.images.length - 1));
    const asset = activeGame.images[imageIndex]; $('image-stage').replaceChildren(); $('image-stage').classList.remove('zoomed');
    const media = document.createElement(asset.type === 'video' ? 'video' : 'img'); media.src = asset.src;
    if (asset.type === 'video') { media.controls = true; media.preload = 'metadata'; } else { media.alt = `${activeGame.name} — ${asset.category || asset.name}`; media.decoding = 'async'; }
    $('image-stage').append(media); $('image-stage').scrollTop = 0; $('image-stage').scrollLeft = 0;
    $('image-title').textContent = activeGame.name; $('image-counter').textContent = `${imageIndex + 1} / ${activeGame.images.length}`;
    $('original-link').href = asset.src; $('download-link').href = asset.src; $('download-link').download = asset.name;
    $('zoom-image').hidden = asset.type === 'video'; $('zoom-image').textContent = '100%'; $('zoom-image').setAttribute('aria-pressed', 'false');
    $('image-meta').textContent = [asset.category ? asset.category.replaceAll('|', ' · ') : '', asset.width && asset.height ? `${asset.width} × ${asset.height}` : '', `${(asset.bytes / 1048576).toFixed(2)} MB`].filter(Boolean).join(' · ');
    $('prev-image').disabled = imageIndex === 0; $('next-image').disabled = imageIndex === activeGame.images.length - 1;
    showDialog('lightbox');
  }
  function editGame() {
    $('edit-name').value = activeGame.name;
    const genres = [...new Set([...games.map(g => g.genre), '기타'])].sort(collator.compare);
    $('edit-genre').innerHTML = genres.map(genre => `<option value="${escape(genre)}">${escape(genreLabel(genre))}</option>`).join(''); $('edit-genre').value = activeGame.genre;
    document.querySelectorAll('input[name="platform"]').forEach(input => { input.checked = activeGame.platforms.includes(input.value); });
    $('edit-date').value = activeGame.releaseDate || ''; $('edit-region').value = activeGame.dateRegion || ''; $('edit-note').value = activeGame.metadataNote || ''; showDialog('edit-dialog');
  }

  $('search').addEventListener('input', event => { state.query = event.target.value; state.page = 1; render(); });
  $('sort').addEventListener('change', event => { state.sort = event.target.value; state.page = 1; render(); });
  for (const [id, key] of [['platform-filters', 'platforms'], ['genre-filters', 'genres']]) $(id).addEventListener('change', event => { const input = event.target; if (input.tagName !== 'INPUT') return; input.checked ? state[key].add(input.value) : state[key].delete(input.value); state.page = 1; render(); });
  $('active-filters').addEventListener('click', event => { const button = event.target.closest('button'); if (!button) return; state[button.dataset.type === 'platform' ? 'platforms' : 'genres'].delete(button.dataset.value); state.page = 1; renderFilters(); render(); });
  ['reset', 'empty-reset'].forEach(id => $(id).addEventListener('click', reset));
  document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); reset(); window.scrollTo({ top: 0 }); });
  $('all-nav').addEventListener('click', () => { state.savedOnly = false; state.page = 1; render(); });
  $('saved-nav').addEventListener('click', () => { state.savedOnly = true; state.page = 1; render(); });
  for (const view of ['grid', 'list']) $(`${view}-view`).addEventListener('click', () => { state.view = view; for (const v of ['grid', 'list']) { $(`${v}-view`).classList.toggle('active', v === view); $(`${v}-view`).setAttribute('aria-pressed', v === view); } render(); });
  for (const [id, offset] of [['prev-page', -1], ['next-page', 1]]) $(id).addEventListener('click', () => { state.page += offset; render(); $('collection-title').scrollIntoView({ block: 'start' }); });
  $('game-grid').addEventListener('click', event => { const save = event.target.closest('[data-save]'), open = event.target.closest('[data-open]'); if (save) favorite(save.dataset.save); else if (open) openGame(open.dataset.open); });
  $('detail-favorite').addEventListener('click', () => favorite(activeGame.id));
  $('detail-sources-toggle').addEventListener('click', () => { $('detail-sources').hidden = !$('detail-sources').hidden; $('detail-sources-toggle').textContent = $('detail-sources').hidden ? '정보 출처' : '정보 출처 접기'; });
  $('load-more').addEventListener('click', () => { shownImages += 48; renderScreenshots(); });
  $('screenshots').addEventListener('click', event => { const button = event.target.closest('[data-image]'); if (button) showImage(Number(button.dataset.image)); });
  $('prev-image').addEventListener('click', () => showImage(imageIndex - 1)); $('next-image').addEventListener('click', () => showImage(imageIndex + 1));
  $('zoom-image').addEventListener('click', () => { const zoom = $('image-stage').classList.toggle('zoomed'); $('zoom-image').textContent = zoom ? '화면에 맞춤' : '100%'; $('zoom-image').setAttribute('aria-pressed', zoom); });
  for (const [button, dialog] of [['close-game', 'game-dialog'], ['close-image', 'lightbox'], ['close-edit', 'edit-dialog'], ['close-info', 'info-dialog']]) $(button).addEventListener('click', () => closeDialog(dialog));
  $('edit-game').addEventListener('click', editGame);
  $('edit-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const id = activeGame.id;
      overrides[id] = cleanOverride({ name: $('edit-name').value, genre: $('edit-genre').value, platforms: [...document.querySelectorAll('input[name="platform"]:checked')].map(input => input.value), releaseDate: $('edit-date').value, dateRegion: $('edit-region').value, metadataNote: $('edit-note').value });
      persist(); rebuild(); activeGame = games.find(game => game.id === id); renderDetail(); closeDialog('edit-dialog'); notify(storageAvailable ? '게임 정보를 저장했어요.' : '이번 화면에 적용했어요. 백업 파일로 보관해 주세요.');
    } catch (error) { notify(error.message); }
  });
  $('reset-game-info').addEventListener('click', () => { const id = activeGame.id; delete overrides[id]; persist(); rebuild(); activeGame = games.find(game => game.id === id); renderDetail(); closeDialog('edit-dialog'); notify('수집 당시 정보로 복원했어요.'); });
  $('info-button').addEventListener('click', () => {
    const verified = games.filter(game => validDate(game.releaseDate)).length;
    $('info-stats').innerHTML = `${number(catalog.stats.games)}개 게임 · ${number(catalog.stats.images)}개 이미지 · ${number(catalog.stats.videos)}개 영상<br><small>출시일 확인 ${verified}개 · 플랫폼 분류 ${games.filter(g => g.platforms.length).length}개<br>이미지 없는 ${number(catalog.stats.notDownloadedGames)}개 게임은 목록에서 제외</small>`;
    showDialog('info-dialog');
  });
  $('export-data').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ schema: 'ui-reference-backup', version: 1, exportedAt: new Date().toISOString(), overrides, favorites: [...favorites] }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `UI_Reference_백업_${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); notify('분류 정보와 저장 목록을 백업했어요.');
  });
  $('import-data').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 2097152) throw new Error('2 MB 이하의 백업 JSON 파일을 선택해 주세요.');
      const backup = JSON.parse(await file.text());
      if (backup.schema !== 'ui-reference-backup' || backup.version !== 1 || !backup.overrides || typeof backup.overrides !== 'object' || Array.isArray(backup.overrides) || !Array.isArray(backup.favorites)) throw new Error('UI Reference 백업 파일이 아닙니다.');
      const imported = {}; for (const [id, value] of Object.entries(backup.overrides)) if (bases.has(id)) imported[id] = cleanOverride(value);
      overrides = { ...overrides, ...imported }; backup.favorites.filter(id => bases.has(id)).forEach(id => favorites.add(id)); persist(); rebuild(); notify('백업을 현재 자료에 합쳤어요.');
    } catch (error) { notify(`가져오기 실패: ${error.message}`); }
    event.target.value = '';
  });
  $('mobile-menu').addEventListener('click', () => $('sidebar').classList.toggle('open'));
  document.addEventListener('click', event => { if (window.innerWidth <= 760 && !event.target.closest('#sidebar') && !event.target.closest('#mobile-menu')) $('sidebar').classList.remove('open'); });
  document.addEventListener('keydown', event => {
    const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '');
    if ($('lightbox').open && !typing) { if (event.key === 'ArrowLeft') { event.preventDefault(); showImage(imageIndex - 1); } if (event.key === 'ArrowRight') { event.preventDefault(); showImage(imageIndex + 1); } }
    else if (event.key === '/' && !typing && !document.querySelector('dialog[open]')) { event.preventDefault(); $('search').focus(); }
  });
  document.addEventListener('error', event => { const img = event.target; if (img.tagName === 'IMG' && !img.dataset.fallback) { img.dataset.fallback = '1'; img.src = 'assets/unavailable.svg'; } }, true);
  rebuild();
})();
