const CATEGORY_META = { 한식: '🍚', 중식: '🥟', 일식: '🍣', 양식: '🍝', 분식: '🌶️', 기타: '🥗' };
const BUDGET_LABELS = {
  'under-10000': '1만원 이하',
  '10000-20000': '1~2만원',
  'over-20000': '2만원 이상',
};

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

function formatDeadline(timestamp) {
  const remain = Math.max(0, timestamp - Date.now());
  const minutes = Math.floor(remain / 60000);
  const seconds = Math.floor((remain % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function mapUrl(item) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.name} ${item.address || ''}`)}`;
}

export class TeamController {
  constructor({ showToast, onChange }) {
    this.showToast = showToast;
    this.onChange = onChange;
    this.mode = 'landing';
    this.code = '';
    this.token = '';
    this.room = null;
    this.loading = false;
    this.error = '';
    this.pollTimer = null;
    this.coords = null;
    this.locationText = '현재 위치';
    this.preferences = {
      categories: ['한식', '일식'],
      budget: '10000-20000',
      excludedMenu: '',
      hangover: false,
    };
  }

  sessionKey(code) {
    return `jeommechu.team.session.${code}`;
  }

  readSession(code) {
    try {
      return JSON.parse(localStorage.getItem(this.sessionKey(code))) || null;
    } catch {
      return null;
    }
  }

  saveSession(code, token) {
    localStorage.setItem(this.sessionKey(code), JSON.stringify({ token }));
  }

  clearSession(code) {
    localStorage.removeItem(this.sessionKey(code));
  }

  async api(path, options = {}) {
    const response = await fetch(path, {
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `요청 오류 ${response.status}`);
    return data;
  }

  async initFromUrl() {
    const code = new URL(location.href).searchParams.get('room');
    if (!/^\d{6}$/.test(code || '')) return false;
    this.code = code;
    const session = this.readSession(code);
    this.token = session?.token || '';
    this.mode = this.token ? 'room' : 'join';
    await this.loadState(true);
    return true;
  }

  setUrl(code = '') {
    const url = new URL(location.href);
    if (code) url.searchParams.set('room', code);
    else url.searchParams.delete('room');
    history.replaceState({}, '', url);
  }

  startPolling() {
    this.stopPolling();
    if (!this.code || this.room?.status === 'decided') return;
    this.pollTimer = setInterval(() => this.loadState(true), 3000);
  }

  stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  async loadState(silent = false) {
    if (!this.code) return;
    if (!silent) this.loading = true;
    try {
      const query = this.token ? `?participantToken=${encodeURIComponent(this.token)}` : '';
      const data = await this.api(`/api/team/${this.code}/state${query}`, { method: 'GET', headers: {} });
      this.room = data.room;
      this.error = '';
      if (this.room?.me) {
        this.preferences = {
          categories: [...this.room.me.categories],
          budget: this.room.me.budget,
          excludedMenu: this.room.me.excludedMenu || '',
          hangover: Boolean(this.room.me.hangover),
        };
      }
      this.startPolling();
    } catch (error) {
      this.error = error.message;
      if (!silent) this.showToast(error.message);
    } finally {
      this.loading = false;
      this.onChange();
    }
  }

  preferenceChoices() {
    return Object.entries(CATEGORY_META).map(([category, icon]) => `
      <button type="button" class="choice ${this.preferences.categories.includes(category) ? 'is-selected' : ''}" data-team-category="${category}">
        <span class="emoji">${icon}</span>${category}
      </button>`).join('');
  }

  budgetChoices() {
    return Object.entries(BUDGET_LABELS).map(([value, label]) => `
      <button type="button" class="choice ${this.preferences.budget === value ? 'is-selected' : ''}" data-team-budget="${value}">${label}</button>`).join('');
  }

  preferenceForm({ includeName = true, submitAction, submitLabel }) {
    return `
      ${includeName ? `<div class="field"><div class="field-header"><span class="field-label">닉네임</span></div><input class="text-input" id="team-participant-name" maxlength="20" placeholder="예: 남우"></div>` : ''}
      <div class="field"><div class="field-header"><span class="field-label">먹고 싶은 카테고리</span><span class="field-help">복수 선택</span></div><div class="choice-grid">${this.preferenceChoices()}</div></div>
      <div class="field"><div class="field-header"><span class="field-label">예산</span></div><div class="segmented">${this.budgetChoices()}</div></div>
      <div class="field"><div class="toggle-row"><div class="toggle-copy"><strong>해장 필요</strong><span>국밥·해장국·짬뽕 계열 가중치</span></div><button class="switch ${this.preferences.hangover ? 'is-on' : ''}" data-team-action="hangover"></button></div></div>
      <div class="field"><div class="field-header"><span class="field-label">어제 먹은 메뉴 제외</span><span class="field-help">선택 입력</span></div><input class="text-input" id="team-excluded-menu" value="${escapeHtml(this.preferences.excludedMenu)}" placeholder="예: 김치찌개"></div>
      <button class="primary-button" data-team-action="${submitAction}">${submitLabel}</button>`;
  }

  renderLanding() {
    return `<section class="screen">
      <header class="screen-header"><span class="eyebrow">실시간 팀 모드</span><h2>각자 고르고, 같이 결정</h2><p>공유 링크나 6자리 코드로 참여하면 모든 휴대폰에 같은 방 상태가 반영됩니다.</p></header>
      <div class="mode-grid team-mode-grid">
        <button class="mode-card" data-team-action="open-create"><span class="mode-icon">＋</span><span class="mode-copy"><strong>새 방 만들기</strong><span>방장이 위치와 마감 시간을 설정</span></span><span class="mode-arrow">›</span></button>
        <button class="mode-card" data-team-action="open-join"><span class="mode-icon">⌨️</span><span class="mode-copy"><strong>코드로 참여</strong><span>전달받은 6자리 방 코드 입력</span></span><span class="mode-arrow">›</span></button>
      </div>
      <div class="notice-card" style="margin-top:18px"><span class="notice-icon">☁️</span><div><strong>Cloudflare 실시간 공유</strong><span>방 정보는 Durable Objects에 저장되고 화면은 약 3초 간격으로 동기화됩니다.</span></div></div>
    </section>`;
  }

  renderCreate() {
    return `<section class="screen">
      <header class="screen-header"><span class="eyebrow">방 만들기</span><h2>점심 결정방 설정</h2><p>방장의 위치를 기준으로 최종 식당 후보를 검색합니다.</p></header>
      <div class="form-card">
        <div class="field"><div class="field-header"><span class="field-label">방 이름</span></div><input class="text-input" id="team-room-name" value="오늘 점심 뭐먹지" maxlength="40"></div>
        <div class="field"><div class="field-header"><span class="field-label">참여 마감</span></div><div class="segmented"><button class="choice" data-team-deadline="5">5분</button><button class="choice is-selected" data-team-deadline="10">10분</button><button class="choice" data-team-deadline="15">15분</button></div></div>
        <div class="field"><div class="field-header"><span class="field-label">식당 검색 위치</span><span class="field-help">${this.coords ? 'GPS 확인 완료' : '방장 위치 사용'}</span></div><div class="inline-input"><input class="text-input" id="team-location-text" value="${escapeHtml(this.coords ? '현재 위치' : this.locationText)}" placeholder="예: 광화문"><button class="location-button" data-team-action="gps">${this.coords ? 'GPS ✓' : 'GPS'}</button></div></div>
        ${this.preferenceForm({ includeName: true, submitAction: 'create', submitLabel: '방 만들고 공유하기' })}
      </div>
      <button class="ghost-button" style="width:100%" data-team-action="back">뒤로</button>
    </section>`;
  }

  renderJoin() {
    const roomName = this.room?.name ? `“${escapeHtml(this.room.name)}”` : '점심 결정방';
    return `<section class="screen">
      <header class="screen-header"><span class="eyebrow">방 참여</span><h2>${roomName}</h2><p>${this.code ? `방 코드 ${this.code}` : '전달받은 6자리 코드를 입력하세요.'}</p></header>
      <div class="form-card">
        ${this.code ? '' : `<div class="field"><div class="field-header"><span class="field-label">방 코드</span></div><input class="text-input team-code-input" id="team-code" inputmode="numeric" maxlength="6" placeholder="000000"></div>`}
        ${this.code && this.room ? this.preferenceForm({ includeName: true, submitAction: 'join', submitLabel: '조건 제출하고 참여' }) : `<button class="primary-button" data-team-action="lookup">방 찾기</button>`}
      </div>
      <button class="ghost-button" style="width:100%" data-team-action="back">뒤로</button>
    </section>`;
  }

  weatherCard() {
    const weather = this.room?.weather;
    if (!weather) return '';
    return `<div class="weather-card"><span class="weather-icon">${weather.icon}</span><div><strong>${weather.label} · ${weather.temperature ?? '-'}℃</strong><span>날씨를 추천 가중치에 반영 · ${weather.source}</span></div></div>`;
  }

  participantList() {
    return this.room.participants.map((participant) => `
      <div class="participant"><span class="avatar">${escapeHtml(participant.name.slice(0, 1))}</span><span class="participant-copy"><strong>${escapeHtml(participant.name)}${participant.isHost ? ' · 방장' : ''}</strong><span>${participant.categories.join(' · ')} · ${BUDGET_LABELS[participant.budget]}${participant.hangover ? ' · 해장' : ''}</span></span><span class="participant-status">${participant.hasVoted ? '투표완료' : '참여완료'}</span></div>`).join('');
  }

  renderCollecting() {
    const shareUrl = `${location.origin}${location.pathname}?room=${this.code}`;
    return `<section class="screen">
      <header class="screen-header"><span class="eyebrow">조건 수집 중</span><h2>${escapeHtml(this.room.name)}</h2><p>마감까지 <strong class="deadline">${formatDeadline(this.room.deadline)}</strong> · ${this.room.participants.length}명 참여</p></header>
      <div class="room-code-box"><div><span>공유 코드</span><strong>${this.code}</strong></div><button data-team-action="share">공유</button></div>
      <div class="share-link"><span>${escapeHtml(shareUrl)}</span><button data-team-action="copy">복사</button></div>
      ${this.weatherCard()}
      ${this.room.lastError ? `<div class="notice-card"><span class="notice-icon">⚠️</span><div><strong>후보 생성 오류</strong><span>${escapeHtml(this.room.lastError)}</span></div></div>` : ''}
      <div class="room-card"><div class="room-title"><strong>참여자 조건</strong><span class="status-pill">${this.room.participants.length}명</span></div><div class="participant-list">${this.participantList()}</div></div>
      <div class="button-row"><button class="ghost-button" data-team-action="edit">내 조건 수정</button>${this.room.me?.isHost ? '<button class="secondary-button" data-team-action="close">지금 마감</button>' : '<button class="secondary-button" data-team-action="refresh">새로고침</button>'}</div>
      <button class="ghost-button leave-room-button" data-team-action="leave">방 나가기</button>
    </section>`;
  }

  renderEdit() {
    return `<section class="screen">
      <header class="screen-header"><span class="eyebrow">내 조건 수정</span><h2>${escapeHtml(this.room?.me?.name || '')}</h2><p>방장이 마감하기 전까지 수정할 수 있습니다.</p></header>
      <div class="form-card">${this.preferenceForm({ includeName: false, submitAction: 'update', submitLabel: '조건 수정 완료' })}</div>
      <button class="ghost-button" style="width:100%" data-team-action="room">취소</button>
    </section>`;
  }

  candidateCards() {
    return this.room.candidates.map((candidate, index) => {
      const votes = this.room.voteCounts[candidate.id] || 0;
      const voted = this.room.me?.vote === candidate.id;
      return `<article class="result-card"><div class="result-top"><div class="food-icon">${CATEGORY_META[candidate.category] || '🍽️'}</div><div class="result-title"><strong>${escapeHtml(candidate.name)}</strong><span>${escapeHtml(candidate.address)}</span></div><span class="score-badge">${candidate.score}점</span></div><div class="meta-row"><span class="meta">${candidate.category}</span><span class="meta">${candidate.distance_m ? `${candidate.distance_m}m` : '거리 확인'}</span><span class="meta">${votes}표</span></div><div class="reason">${escapeHtml((candidate.reasons || []).join(' · ') || '팀 조건 교집합 반영')}</div><div class="card-actions"><a class="map-button" href="${mapUrl(candidate)}" target="_blank" rel="noopener">구글맵 보기</a><button class="eat-button ${voted ? 'is-voted' : ''}" data-team-action="vote" data-candidate-id="${candidate.id}">${voted ? '내 선택 ✓' : '이곳에 투표'}</button></div></article>`;
    }).join('');
  }

  renderVoting() {
    const aggregation = this.room.aggregation;
    return `<section class="screen">
      <header class="screen-header"><span class="eyebrow">최종 결정</span><h2>후보 ${this.room.candidates.length}곳</h2><p>${aggregation?.categories?.join(' · ') || ''}${aggregation?.hangoverCount ? ` · 해장 ${aggregation.hangoverCount}명` : ''}</p></header>
      ${this.weatherCard()}
      <div class="result-list">${this.candidateCards()}</div>
      ${this.room.me?.isHost ? `<div class="decision-panel"><strong>방장 최종 결정</strong><span>투표 결과 확정 또는 후보 전체 룰렛</span><div class="button-row"><button class="secondary-button" data-team-action="decide-vote">투표로 확정</button><button class="primary-button" data-team-action="decide-roulette">룰렛으로 결정</button></div></div>` : '<div class="notice-card" style="margin-top:14px"><span class="notice-icon">🗳️</span><div><strong>방장의 최종 결정을 기다리는 중</strong><span>투표 결과는 모든 참여자 화면에 자동 반영됩니다.</span></div></div>'}
    </section>`;
  }

  renderDecided() {
    const result = this.room.result;
    return `<section class="screen">
      <header class="screen-header"><span class="eyebrow">결정 완료</span><h2>오늘 점심은 여기</h2><p>${result.mode === 'vote' ? '팀 투표 결과' : '공정한 룰렛 결과'}가 모든 참여자에게 공유됐습니다.</p></header>
      <div class="winner"><div class="trophy">🎯</div><span>${result.mode === 'vote' ? '최다 득표' : '룰렛 당첨'}</span><h3>${escapeHtml(result.name)}</h3><p>${escapeHtml(result.address)}</p></div>
      <a class="map-button winner-map" href="${mapUrl(result)}" target="_blank" rel="noopener">구글맵에서 보기</a>
      ${this.weatherCard()}
      <div class="room-card"><div class="room-title"><strong>함께 결정한 사람</strong><span class="status-pill">${this.room.participants.length}명</span></div><div class="participant-list">${this.participantList()}</div></div>
      <button class="primary-button" data-team-action="leave">팀 모드 나가기</button>
    </section>`;
  }

  render() {
    if (this.loading && !this.room) return `<section class="screen"><div class="loading"><div class="loading-dots"><span></span><span></span><span></span></div><strong>팀 방을 불러오는 중</strong></div></section>`;
    if (this.error && !this.room) return `<section class="screen"><header class="screen-header"><span class="eyebrow">팀 모드</span><h2>방을 찾지 못했습니다</h2><p>${escapeHtml(this.error)}</p></header><button class="primary-button" data-team-action="leave">처음으로</button></section>`;
    if (this.mode === 'create') return this.renderCreate();
    if (this.mode === 'join') return this.renderJoin();
    if (this.mode === 'edit') return this.renderEdit();
    if (!this.code || !this.room) return this.renderLanding();
    if (!this.token || !this.room.me) return this.renderJoin();
    if (this.room.status === 'collecting') return this.renderCollecting();
    if (this.room.status === 'voting') return this.renderVoting();
    return this.renderDecided();
  }

  readPreferencesFromDom() {
    this.preferences.excludedMenu = document.querySelector('#team-excluded-menu')?.value.trim() || '';
    return { ...this.preferences, categories: [...this.preferences.categories] };
  }

  async locate() {
    if (!navigator.geolocation) return this.showToast('이 브라우저는 위치 기능을 지원하지 않습니다.');
    this.showToast('현재 위치를 확인하는 중입니다.');
    navigator.geolocation.getCurrentPosition((position) => {
      this.coords = { lat: position.coords.latitude, lng: position.coords.longitude };
      this.locationText = '현재 위치';
      this.showToast('방장 위치를 확인했습니다.');
      this.onChange();
    }, () => this.showToast('위치 권한을 허용해 주세요.'), { enableHighAccuracy: true, timeout: 12000 });
  }

  async createRoom() {
    const participantName = document.querySelector('#team-participant-name')?.value.trim();
    if (!participantName) return this.showToast('닉네임을 입력해 주세요.');
    const locationText = document.querySelector('#team-location-text')?.value.trim() || '서울 광화문';
    const roomName = document.querySelector('#team-room-name')?.value.trim() || '오늘 점심 뭐먹지';
    this.loading = true;
    this.onChange();
    try {
      const data = await this.api('/api/team/create', {
        method: 'POST',
        body: JSON.stringify({
          roomName,
          participantName,
          deadlineMinutes: this.deadlineMinutes || 10,
          coords: this.coords,
          locationText,
          preferences: this.readPreferencesFromDom(),
        }),
      });
      this.code = data.room.code;
      this.token = data.token;
      this.room = data.room;
      this.mode = 'room';
      this.saveSession(this.code, this.token);
      this.setUrl(this.code);
      this.startPolling();
      this.showToast('공유방을 만들었습니다.');
    } catch (error) {
      this.showToast(error.message);
    } finally {
      this.loading = false;
      this.onChange();
    }
  }

  async lookupRoom() {
    const code = document.querySelector('#team-code')?.value.replace(/\D/g, '') || '';
    if (!/^\d{6}$/.test(code)) return this.showToast('6자리 방 코드를 입력해 주세요.');
    this.code = code;
    this.setUrl(code);
    await this.loadState();
    this.mode = 'join';
    this.onChange();
  }

  async joinRoom() {
    const participantName = document.querySelector('#team-participant-name')?.value.trim();
    if (!participantName) return this.showToast('닉네임을 입력해 주세요.');
    try {
      const data = await this.api(`/api/team/${this.code}/join`, {
        method: 'POST',
        body: JSON.stringify({ participantName, preferences: this.readPreferencesFromDom() }),
      });
      this.token = data.token;
      this.room = data.room;
      this.mode = 'room';
      this.saveSession(this.code, this.token);
      this.startPolling();
      this.showToast('팀 방에 참여했습니다.');
      this.onChange();
    } catch (error) {
      this.showToast(error.message);
    }
  }

  async updatePreferences() {
    try {
      const data = await this.api(`/api/team/${this.code}/preferences`, {
        method: 'POST',
        body: JSON.stringify({ participantToken: this.token, preferences: this.readPreferencesFromDom() }),
      });
      this.room = data.room;
      this.mode = 'room';
      this.showToast('조건을 수정했습니다.');
      this.onChange();
    } catch (error) {
      this.showToast(error.message);
    }
  }

  async closeRoom() {
    this.showToast('팀 조건으로 식당 후보를 찾는 중입니다.');
    try {
      const data = await this.api(`/api/team/${this.code}/close`, {
        method: 'POST',
        body: JSON.stringify({ participantToken: this.token }),
      });
      this.room = data.room;
      this.onChange();
    } catch (error) {
      this.showToast(error.message);
      await this.loadState(true);
    }
  }

  async vote(candidateId) {
    try {
      const data = await this.api(`/api/team/${this.code}/vote`, {
        method: 'POST',
        body: JSON.stringify({ participantToken: this.token, candidateId }),
      });
      this.room = data.room;
      this.showToast('투표를 반영했습니다.');
      this.onChange();
    } catch (error) {
      this.showToast(error.message);
    }
  }

  async decide(mode) {
    try {
      const data = await this.api(`/api/team/${this.code}/decide`, {
        method: 'POST',
        body: JSON.stringify({ participantToken: this.token, mode }),
      });
      this.room = data.room;
      this.stopPolling();
      this.showToast(mode === 'vote' ? '투표 결과를 확정했습니다.' : '룰렛 결과가 나왔습니다.');
      this.onChange();
    } catch (error) {
      this.showToast(error.message);
    }
  }

  async share() {
    const url = `${location.origin}${location.pathname}?room=${this.code}`;
    if (navigator.share) {
      await navigator.share({ title: this.room.name, text: `점메추 방 코드 ${this.code}`, url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url).catch(() => {});
      this.showToast('공유 링크를 복사했습니다.');
    }
  }

  leave() {
    this.stopPolling();
    if (this.code) this.clearSession(this.code);
    this.code = '';
    this.token = '';
    this.room = null;
    this.error = '';
    this.mode = 'landing';
    this.setUrl('');
    this.onChange();
  }

  async handleClick(button) {
    const action = button.dataset.teamAction;
    if (!action && !button.dataset.teamCategory && !button.dataset.teamBudget && !button.dataset.teamDeadline) return false;

    if (button.dataset.teamCategory) {
      const category = button.dataset.teamCategory;
      this.preferences.categories = this.preferences.categories.includes(category)
        ? this.preferences.categories.filter((value) => value !== category)
        : [...this.preferences.categories, category];
      if (!this.preferences.categories.length) this.preferences.categories = ['한식'];
      this.onChange();
      return true;
    }
    if (button.dataset.teamBudget) {
      this.preferences.budget = button.dataset.teamBudget;
      this.onChange();
      return true;
    }
    if (button.dataset.teamDeadline) {
      this.deadlineMinutes = Number(button.dataset.teamDeadline);
      document.querySelectorAll('[data-team-deadline]').forEach((item) => item.classList.toggle('is-selected', item === button));
      return true;
    }

    if (action === 'open-create') { this.mode = 'create'; this.onChange(); }
    if (action === 'open-join') { this.mode = 'join'; this.onChange(); }
    if (action === 'back') { this.mode = 'landing'; this.code = ''; this.room = null; this.setUrl(''); this.onChange(); }
    if (action === 'hangover') { this.preferences.hangover = !this.preferences.hangover; this.onChange(); }
    if (action === 'gps') await this.locate();
    if (action === 'create') await this.createRoom();
    if (action === 'lookup') await this.lookupRoom();
    if (action === 'join') await this.joinRoom();
    if (action === 'edit') { this.mode = 'edit'; this.onChange(); }
    if (action === 'room') { this.mode = 'room'; this.onChange(); }
    if (action === 'update') await this.updatePreferences();
    if (action === 'refresh') await this.loadState();
    if (action === 'close') await this.closeRoom();
    if (action === 'vote') await this.vote(button.dataset.candidateId);
    if (action === 'decide-vote') await this.decide('vote');
    if (action === 'decide-roulette') await this.decide('roulette');
    if (action === 'share') await this.share();
    if (action === 'copy') {
      const url = `${location.origin}${location.pathname}?room=${this.code}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      this.showToast('공유 링크를 복사했습니다.');
    }
    if (action === 'leave') this.leave();
    return true;
  }
}
