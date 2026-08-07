import { TeamController } from './team-final.js?v=3';

const META = { 한식: '🍚', 중식: '🥟', 일식: '🍣', 양식: '🍝', 분식: '🌶️', 기타: '🥗' };
const BUDGETS = [
  { value: 'under-10000', label: '1만원 이하' },
  { value: '10000-20000', label: '1~2만원' },
  { value: 'over-20000', label: '2만원 이상' },
];
const state = {
  screen: 'home',
  categories: ['한식', '일식'],
  budget: '10000-20000',
  companion: '동료',
  excludeSpicy: false,
  hangover: false,
  previousMenu: '',
  locationText: '서울 광화문',
  coords: null,
  results: [],
  loading: false,
  weather: null,
  appliedSignals: [],
  error: '',
};

const app = document.querySelector('#app');
const toast = document.querySelector('#toast');
const $ = (selector, root = document) => root.querySelector(selector);
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
const load = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const mealHistory = () => load('jeommechu.history.v1', []);

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-showing');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('is-showing'), 2800);
}

const team = new TeamController({ showToast, onChange: render });

function activeNav() {
  const active = state.screen.startsWith('personal') ? 'personal' : state.screen;
  document.querySelectorAll('.bottom-nav__item').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.action === active);
  });
}

function go(screen) {
  if (screen !== 'team') team.stopPolling();
  state.screen = screen;
  render();
  scrollTo({ top: 0, behavior: 'smooth' });
}

function screenHeader(kicker, title, description) {
  return `<header class="screen-header"><span class="eyebrow">${kicker}</span><h2>${title}</h2><p>${description}</p></header>`;
}

function renderHome() {
  return `<section class="screen">
    <div class="hero"><span class="hero-kicker">⚡ 고민 시간 평균 30초</span><h1>점심 고민은<br><em>점메추</em>에게.</h1><p>현재 위치, 날씨, 취향, 해장 필요까지 반영해 오늘 먹을 곳을 고릅니다.</p><div class="hero-plate"></div></div>
    <div class="mode-grid">
      <button class="mode-card" data-action="personal"><span class="mode-icon">👤</span><span class="mode-copy"><strong>나 혼자 빠르게</strong><span>날씨와 조건으로 주변 식당 추천</span></span><span class="mode-arrow">›</span></button>
      <button class="mode-card" data-action="team"><span class="mode-icon">👥</span><span class="mode-copy"><strong>팀원들과 결정</strong><span>공유 링크·코드·투표·룰렛</span></span><span class="mode-arrow">›</span></button>
    </div>
    <div class="quick-info"><div class="info-chip"><strong>날씨</strong><small>메뉴 가중치</small></div><div class="info-chip"><strong>GPS</strong><small>2km 검색</small></div><div class="info-chip"><strong>실시간</strong><small>팀 공유</small></div></div>
  </section>`;
}

function choices(items, selected, type, multiple = false) {
  return items.map((value) => `<button type="button" class="choice ${(multiple ? selected.includes(value) : selected === value) ? 'is-selected' : ''}" data-select="${type}" data-value="${value}">${META[value] ? `<span class="emoji">${META[value]}</span>` : ''}${value}</button>`).join('');
}

function budgetChoices() {
  return BUDGETS.map((item) => `<button type="button" class="choice ${state.budget === item.value ? 'is-selected' : ''}" data-select="budget" data-value="${item.value}">${item.label}</button>`).join('');
}

function weatherCard(weather = state.weather) {
  if (!weather) return '';
  return `<div class="weather-card"><span class="weather-icon">${weather.icon}</span><div><strong>${weather.label} · ${weather.temperature ?? '-'}℃</strong><span>체감 ${weather.apparentTemperature ?? '-'}℃ · 날씨 추천 반영 · ${weather.source}</span></div></div>`;
}

function renderPersonal() {
  return `<section class="screen">
    ${screenHeader('개인 추천', '오늘 뭐 먹을까요?', 'GPS를 사용하면 현재 위치와 현재 날씨를 함께 반영합니다.')}
    ${weatherCard()}
    <div class="form-card">
      <div class="field"><div class="field-header"><span class="field-label">음식 카테고리</span><span class="field-help">복수 선택</span></div><div class="choice-grid">${choices(Object.keys(META), state.categories, 'category', true)}</div></div>
      <div class="field"><div class="field-header"><span class="field-label">예산</span><span class="field-help">카카오에 가격 정보가 없어 참고 조건</span></div><div class="segmented">${budgetChoices()}</div></div>
      <div class="field"><div class="field-header"><span class="field-label">누구와 먹나요?</span></div><div class="segmented">${choices(['혼밥', '동료', '비즈니스'], state.companion, 'companion')}</div></div>
      <div class="field"><div class="toggle-row"><div class="toggle-copy"><strong>해장 필요</strong><span>해장국·국밥·콩나물국밥·짬뽕 우선</span></div><button class="switch ${state.hangover ? 'is-on' : ''}" data-action="hangover"></button></div></div>
      <div class="field"><div class="toggle-row"><div class="toggle-copy"><strong>매운 음식 제외</strong><span>매운 메뉴로 추정되는 결과 제외</span></div><button class="switch ${state.excludeSpicy ? 'is-on' : ''}" data-action="spicy"></button></div></div>
      <div class="field"><div class="field-header"><span class="field-label">어제 먹은 메뉴</span><span class="field-help">선택 입력</span></div><input class="text-input" id="previous-menu" value="${escapeHtml(state.previousMenu)}" placeholder="예: 김치찌개"></div>
      <div class="field"><div class="field-header"><span class="field-label">검색 위치</span><span class="field-help">${state.coords ? 'GPS·날씨 확인 완료' : '주소 입력 또는 GPS'}</span></div><div class="inline-input"><input class="text-input" id="location-text" value="${escapeHtml(state.locationText)}" placeholder="예: 서울역"><button class="location-button" data-action="gps">${state.coords ? 'GPS ✓' : 'GPS'}</button></div></div>
    </div>
    <button class="primary-button" data-action="recommend">식당 추천받기</button>
  </section>`;
}

async function fetchWeatherPreview() {
  if (!state.coords) return;
  try {
    const response = await fetch(`/api/weather?lat=${encodeURIComponent(state.coords.lat)}&lng=${encodeURIComponent(state.coords.lng)}`);
    if (response.ok) state.weather = (await response.json()).weather;
  } catch {
    state.weather = null;
  }
}

async function locate() {
  if (!navigator.geolocation) return showToast('이 브라우저는 위치 기능을 지원하지 않습니다.');
  showToast('현재 위치와 날씨를 확인하는 중입니다.');
  navigator.geolocation.getCurrentPosition(async (position) => {
    state.coords = { lat: position.coords.latitude, lng: position.coords.longitude };
    state.locationText = '현재 위치';
    await fetchWeatherPreview();
    render();
    showToast('현재 위치와 날씨를 확인했습니다.');
  }, (error) => {
    const messages = { 1: '위치 권한이 차단되어 있습니다.', 2: '현재 위치를 확인할 수 없습니다.', 3: '위치 확인 시간이 초과됐습니다.' };
    showToast(messages[error.code] || '위치 확인에 실패했습니다.');
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
}

async function recommend() {
  state.previousMenu = $('#previous-menu')?.value.trim() || '';
  const typedLocation = $('#location-text')?.value.trim() || '';
  if (typedLocation && typedLocation !== '현재 위치') {
    state.coords = null;
    state.weather = null;
  }
  state.locationText = typedLocation || (state.coords ? '현재 위치' : '서울 광화문');
  if (!state.categories.length) return showToast('카테고리를 하나 이상 선택해 주세요.');

  state.loading = true;
  state.error = '';
  go('personal-loading');
  try {
    const response = await fetch('/api/restaurants', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        coords: state.coords,
        locationText: state.locationText,
        categories: state.categories,
        hangover: state.hangover,
        budget: state.budget,
        companion: state.companion,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `검색 오류 ${response.status}`);

    let items = data.items || [];
    if (state.excludeSpicy) items = items.filter((item) => !/(매운|불닭|마라|떡볶이|짬뽕)/.test(`${item.name} ${item.categoryRaw || ''}`));
    if (state.previousMenu) items = items.filter((item) => !`${item.name} ${item.menu || ''}`.includes(state.previousMenu));
    state.results = items.slice(0, 5);
    state.weather = data.weather || state.weather;
    state.appliedSignals = data.appliedSignals || [];
    go('personal-results');
  } catch (error) {
    state.results = [];
    state.error = error.message;
    go('personal-results');
  } finally {
    state.loading = false;
  }
}

function renderLoading() {
  return `<section class="screen">${screenHeader('식당 검색', '주변 맛집을 찾는 중', '카카오 식당 데이터와 날씨 신호를 함께 점수화합니다.')}<div class="loading"><div class="loading-dots"><span></span><span></span><span></span></div><strong>잠시만 기다려 주세요</strong><p>${state.coords ? '현재 위치 반경 2km와 현재 날씨를 분석 중입니다.' : '입력한 지역을 검색하고 있습니다.'}</p></div></section>`;
}

function mapUrl(item) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.name} ${item.address || ''}`)}`;
}

function recordMeal(index) {
  const item = state.results[index];
  const history = mealHistory();
  history.unshift({ date: new Date().toLocaleDateString('sv-SE'), name: item.name, menu: item.menu || item.category, category: item.category, address: item.address });
  save('jeommechu.history.v1', history.slice(0, 30));
  showToast('오늘의 식사 기록에 저장했습니다.');
}

function renderResults() {
  if (!state.results.length) {
    return `<section class="screen">${screenHeader('추천 결과', '조건에 맞는 식당이 없어요', '검색 위치나 카테고리 조건을 조금 완화해 보세요.')}<div class="notice-card"><span class="notice-icon">🔎</span><div><strong>${escapeHtml(state.error || '검색 결과 0곳')}</strong><span>GPS를 다시 누르거나 다른 카테고리를 선택해 보세요.</span></div></div><button class="primary-button" data-action="personal">조건 다시 설정</button></section>`;
  }

  const signalText = [state.hangover ? '해장' : '', ...(state.appliedSignals || [])].filter(Boolean).join(' · ');
  return `<section class="screen">
    ${screenHeader('추천 완료', '오늘의 후보를 골랐어요', state.coords ? '현재 위치와 날씨를 반영한 실제 주변 식당입니다.' : '입력한 지역의 실제 카카오 식당 검색 결과입니다.')}
    ${weatherCard()}
    ${signalText ? `<div class="notice-card"><span class="notice-icon">🎛️</span><div><strong>적용된 추천 신호</strong><span>${escapeHtml(signalText)}</span></div></div>` : ''}
    <div class="result-summary"><div><strong>${escapeHtml(state.locationText)} 주변 추천</strong><span>${state.categories.join(' · ')} · ${state.companion}${state.hangover ? ' · 해장' : ''}</span></div><div class="result-count">${state.results.length}</div></div>
    <div class="result-list">${state.results.map((item, index) => `<article class="result-card"><div class="result-top"><div class="food-icon">${META[item.category] || '🍽️'}</div><div class="result-title"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.address || '주소 정보 없음')}</span></div><span class="score-badge">${item.score || 75}점</span></div><div class="meta-row"><span class="meta">${escapeHtml(item.category)}</span><span class="meta">${item.distance_m ? `${item.distance_m}m` : '거리 확인'}</span><span class="meta">가격 확인</span></div><div class="reason">${escapeHtml((item.reasons || []).join(' · ') || '위치와 선택 조건 반영')}</div><div class="card-actions"><a class="map-button" href="${mapUrl(item)}" target="_blank" rel="noopener">구글맵 보기</a><button class="eat-button" data-eat="${index}">오늘 먹었어요</button></div></article>`).join('')}</div>
    <div class="button-row" style="margin-top:14px"><button class="ghost-button" data-action="personal">조건 수정</button><button class="secondary-button" data-action="recommend-again">다시 추천</button></div>
  </section>`;
}

function renderHistory() {
  const history = mealHistory();
  return `<section class="screen">${screenHeader('식사 기록', '최근에 먹은 메뉴', '기록은 현재 브라우저에 저장됩니다.')}<div class="history-list">${history.length ? history.map((item, index) => `<article class="history-card"><div class="history-date">${item.date.slice(5).replace('-', '/')}</div><div class="history-copy"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.menu)} · ${escapeHtml(item.address || '')}</span></div><button class="delete-button" data-delete="${index}">×</button></article>`).join('') : '<div class="notice-card"><span class="notice-icon">🍽️</span><div><strong>아직 기록이 없습니다.</strong><span>추천 결과에서 ‘오늘 먹었어요’를 눌러 보세요.</span></div></div>'}</div></section>`;
}

function render() {
  activeNav();
  if (state.screen === 'home') app.innerHTML = renderHome();
  else if (state.screen === 'personal') app.innerHTML = renderPersonal();
  else if (state.screen === 'personal-loading') app.innerHTML = renderLoading();
  else if (state.screen === 'personal-results') app.innerHTML = renderResults();
  else if (state.screen === 'team') app.innerHTML = team.render();
  else app.innerHTML = renderHistory();
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('button,a');
  if (!button) return;

  if (button.dataset.teamAction || button.dataset.teamCategory || button.dataset.teamBudget || button.dataset.teamDeadline) {
    await team.handleClick(button);
    return;
  }

  const action = button.dataset.action;
  if (action === 'home') go('home');
  if (action === 'personal') go('personal');
  if (action === 'team') { state.screen = 'team'; team.mode = team.code ? 'room' : 'landing'; render(); team.startPolling(); }
  if (action === 'history') go('history');
  if (action === 'spicy') { state.excludeSpicy = !state.excludeSpicy; render(); }
  if (action === 'hangover') { state.hangover = !state.hangover; render(); }
  if (action === 'gps') await locate();
  if (action === 'recommend' || action === 'recommend-again') await recommend();

  if (button.dataset.select) {
    const type = button.dataset.select;
    const value = button.dataset.value;
    if (type === 'category') {
      state.categories = state.categories.includes(value) ? state.categories.filter((item) => item !== value) : [...state.categories, value];
      if (!state.categories.length) state.categories = ['한식'];
    } else {
      state[type] = value;
    }
    render();
  }

  if (button.dataset.eat !== undefined) recordMeal(Number(button.dataset.eat));
  if (button.dataset.delete !== undefined) {
    const history = mealHistory();
    history.splice(Number(button.dataset.delete), 1);
    save('jeommechu.history.v1', history);
    render();
  }
});

(async () => {
  const sharedRoom = await team.initFromUrl();
  if (sharedRoom) state.screen = 'team';
  render();
})();