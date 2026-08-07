import { TeamController as BaseTeamController } from './team-final.js?v=7';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

function formatDeadline(timestamp) {
  const remain = Math.max(0, Number(timestamp || 0) - Date.now());
  const minutes = Math.floor(remain / 60000);
  const seconds = Math.floor((remain % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export class TeamController extends BaseTeamController {
  preferenceForm({ includeName = true, submitAction, submitLabel }) {
    return `
      ${includeName ? `<div class="field"><div class="field-header"><span class="field-label">닉네임</span></div><input class="text-input" id="team-participant-name" maxlength="20" placeholder="예: 남우"></div>` : ''}
      <div class="field"><div class="field-header"><span class="field-label">먹고 싶은 카테고리</span><span class="field-help">복수 선택</span></div><div class="choice-grid">${this.preferenceChoices()}</div></div>
      <div class="field"><div class="toggle-row"><div class="toggle-copy"><strong>해장 필요</strong><span>국밥·해장국·짬뽕 계열 가중치</span></div><button class="switch ${this.preferences.hangover ? 'is-on' : ''}" data-team-action="hangover"></button></div></div>
      <div class="field"><div class="field-header"><span class="field-label">어제 먹은 메뉴 제외</span><span class="field-help">선택 입력</span></div><input class="text-input" id="team-excluded-menu" value="${escapeHtml(this.preferences.excludedMenu)}" placeholder="예: 김치찌개"></div>
      <button class="primary-button" data-team-action="${submitAction}">${submitLabel}</button>`;
  }

  renderLanding() {
    return `<section class="screen">
      <header class="screen-header"><span class="eyebrow">실시간 팀 모드</span><h2>링크 하나로 같이 결정</h2><p>방을 만든 뒤 공유 링크를 보내면 팀원이 바로 참여할 수 있습니다.</p></header>
      <div class="mode-grid team-mode-grid">
        <button class="mode-card" data-team-action="open-create"><span class="mode-icon">＋</span><span class="mode-copy"><strong>새 팀 방 만들기</strong><span>위치와 마감 시간을 정하고 링크 공유</span></span><span class="mode-arrow">›</span></button>
      </div>
      <div class="notice-card" style="margin-top:18px"><span class="notice-icon">🔗</span><div><strong>코드 입력 없이 참여</strong><span>공유받은 링크를 열고 닉네임과 조건만 제출하면 됩니다.</span></div></div>
    </section>`;
  }

  renderJoin() {
    const roomName = this.room?.name ? `“${escapeHtml(this.room.name)}”` : '점심 결정방';
    const canJoin = Boolean(this.code && this.room);
    return `<section class="screen">
      <header class="screen-header"><span class="eyebrow">링크로 참여</span><h2>${roomName}</h2><p>${canJoin ? '닉네임과 조건을 입력해 참여하세요.' : '방장이 보낸 공유 링크를 다시 열어 주세요.'}</p></header>
      <div class="form-card">
        ${canJoin ? this.preferenceForm({ includeName: true, submitAction: 'join', submitLabel: '조건 제출하고 참여' }) : '<div class="notice-card"><span class="notice-icon">🔗</span><div><strong>유효한 공유 링크가 필요합니다.</strong><span>수동 방 코드 입력은 지원하지 않습니다.</span></div></div>'}
      </div>
      <button class="ghost-button" style="width:100%" data-team-action="back">팀 모드 처음으로</button>
    </section>`;
  }

  participantList() {
    return this.room.participants.map((participant) => `
      <div class="participant"><span class="avatar">${escapeHtml(participant.name.slice(0, 1))}</span><span class="participant-copy"><strong>${escapeHtml(participant.name)}${participant.isHost ? ' · 방장' : ''}</strong><span>${participant.categories.join(' · ')}${participant.hangover ? ' · 해장' : ''}</span></span><span class="participant-status">${participant.hasVoted ? '투표완료' : '참여완료'}</span></div>`).join('');
  }

  renderCollecting() {
    const shareUrl = `${location.origin}${location.pathname}?room=${this.code}`;
    return `<section class="screen">
      <header class="screen-header"><span class="eyebrow">조건 수집 중</span><h2>${escapeHtml(this.room.name)}</h2><p>마감까지 <strong class="deadline">${formatDeadline(this.room.deadline)}</strong> · ${this.room.participants.length}명 참여</p></header>
      <div class="room-card">
        <div class="room-title"><strong>팀원 초대</strong><span class="status-pill">공유 링크</span></div>
        <p style="margin:8px 0 14px;color:var(--muted);font-size:12px;line-height:1.5">링크를 받은 팀원은 별도 코드 입력 없이 바로 참여합니다.</p>
        <button class="primary-button" data-team-action="share">링크 공유하기</button>
      </div>
      <div class="share-link"><span>${escapeHtml(shareUrl)}</span><button data-team-action="copy">복사</button></div>
      ${this.weatherCard()}
      ${this.room.lastError ? `<div class="notice-card"><span class="notice-icon">⚠️</span><div><strong>후보 생성 오류</strong><span>${escapeHtml(this.room.lastError)}</span></div></div>` : ''}
      <div class="room-card"><div class="room-title"><strong>참여자 조건</strong><span class="status-pill">${this.room.participants.length}명</span></div><div class="participant-list">${this.participantList()}</div></div>
      <div class="button-row"><button class="ghost-button" data-team-action="edit">내 조건 수정</button>${this.room.me?.isHost ? '<button class="secondary-button" data-team-action="close">모집 마감</button>' : '<button class="secondary-button" data-team-action="refresh">새로고침</button>'}</div>
      <button class="ghost-button leave-room-button" data-team-action="leave">방 나가기</button>
    </section>`;
  }

  async closeCollectingNow() {
    if (!this.code || !this.token || !this.room?.me?.isHost) {
      this.showToast('방장만 모집을 마감할 수 있습니다.');
      return;
    }

    this.stopPolling();
    this.loading = true;
    this.onChange();

    try {
      const data = await this.api(`/api/team/${this.code}/close`, {
        method: 'POST',
        body: JSON.stringify({ participantToken: this.token }),
      });

      this.room = data.room;
      this.error = '';
      this.mode = 'room';
      this.loading = false;
      this.onChange();
      this.startPolling();
      this.showToast('모집을 마감하고 메뉴 선택을 시작했습니다.');
    } catch (error) {
      this.loading = false;
      this.showToast(error.message);
      this.onChange();
      this.startPolling();
    }
  }

  async handleClick(button) {
    if (button.dataset.teamAction === 'close') {
      return this.closeCollectingNow();
    }
    return super.handleClick(button);
  }
}
