import { TeamController as FixedTeamController } from './team-fixed.js?v=5';

function formatRemaining(timestamp) {
  const remain = Math.max(0, Number(timestamp || 0) - Date.now());
  const minutes = Math.floor(remain / 60000);
  const seconds = Math.floor((remain % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export class TeamController extends FixedTeamController {
  constructor(options) {
    super(options);
    this.countdownTimer = null;
    this.pollInFlight = false;
  }

  resetExpiredRoom(message = '마감된 방을 정리했습니다. 새 팀 방을 만들 수 있습니다.') {
    this.stopPolling();
    if (this.code) this.clearSession(this.code);
    this.code = '';
    this.token = '';
    this.room = null;
    this.error = '';
    this.mode = 'landing';
    this.setUrl('');
    this.showToast(message);
    this.onChange();
  }

  isUnrecoverableRoomError() {
    return /존재하지 않는 방|참여 마감 시간이 지났|이미 조건 취합이 끝난 방/.test(this.error || '');
  }

  async createRoom() {
    this.captureDraft();
    const locationText = (this.draft['team-location-text'] || '').trim();
    if (!this.coords && (!locationText || locationText === '현재 위치')) {
      this.showToast('GPS를 누르거나 검색할 지역명을 입력해 주세요.');
      return;
    }
    await super.createRoom();
  }

  roomFingerprint(room = this.room) {
    if (!room) return '';
    return JSON.stringify({
      updatedAt: room.updatedAt || 0,
      status: room.status,
      deadline: room.deadline,
      lastError: room.lastError || '',
      participants: (room.participants || []).map((participant) => ({
        id: participant.id,
        name: participant.name,
        isHost: participant.isHost,
        categories: participant.categories,
        budget: participant.budget,
        hangover: participant.hangover,
        hasVoted: participant.hasVoted,
        joinedAt: participant.joinedAt,
      })),
      candidates: (room.candidates || []).map((candidate) => ({
        id: candidate.id,
        score: candidate.score,
      })),
      voteCounts: room.voteCounts || {},
      result: room.result || null,
      me: room.me ? {
        id: room.me.id,
        vote: room.me.vote,
        categories: room.me.categories,
        budget: room.me.budget,
        excludedMenu: room.me.excludedMenu,
        hangover: room.me.hangover,
      } : null,
    });
  }

  updateLiveDom() {
    const deadline = document.querySelector('.deadline');
    if (deadline && this.room?.deadline) {
      deadline.textContent = formatRemaining(this.room.deadline);
    }
  }

  startPolling() {
    this.stopPolling();
    if (!this.shouldPoll()) return;

    this.pollTimer = setInterval(() => {
      if (!this.shouldPoll()) {
        this.stopPolling();
        return;
      }
      if (this.pollInFlight) return;

      this.pollInFlight = true;
      Promise.resolve(this.loadState(true)).finally(() => {
        this.pollInFlight = false;
      });
    }, 1000);

    this.countdownTimer = setInterval(() => this.updateLiveDom(), 1000);
    this.updateLiveDom();
  }

  stopPolling() {
    super.stopPolling();
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = null;
  }

  async loadState(silent = false) {
    if (!silent) {
      await super.loadState(false);
      this.handleRoomLifecycle();
      return;
    }

    const before = this.roomFingerprint();
    const renderChange = this.onChange;
    const scrollPosition = window.scrollY;

    this.onChange = () => {};
    try {
      await super.loadState(true);
    } finally {
      this.onChange = renderChange;
    }

    if (this.handleRoomLifecycle()) return;

    const after = this.roomFingerprint();
    if (before !== after) {
      renderChange();
      requestAnimationFrame(() => window.scrollTo({ top: scrollPosition, behavior: 'auto' }));
    } else {
      this.updateLiveDom();
    }
  }

  handleRoomLifecycle() {
    if (this.room?.status === 'expired') {
      this.resetExpiredRoom();
      return true;
    }

    const deadlineFailed = this.room?.status === 'collecting'
      && Date.now() >= Number(this.room.deadline || 0)
      && Boolean(this.room.lastError);

    if (deadlineFailed) {
      this.resetExpiredRoom(`마감 후 후보 생성에 실패해 기존 방을 정리했습니다: ${this.room.lastError}`);
      return true;
    }

    if (!this.room && this.isUnrecoverableRoomError()) {
      this.resetExpiredRoom('사용할 수 없는 팀 방을 정리했습니다.');
      return true;
    }

    return false;
  }
}
