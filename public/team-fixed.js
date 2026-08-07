import { TeamController as BaseTeamController } from './team.js?base=1';

const DRAFT_FIELD_IDS = [
  'team-participant-name',
  'team-excluded-menu',
  'team-room-name',
  'team-location-text',
  'team-code',
];

export class TeamController extends BaseTeamController {
  constructor({ showToast, onChange }) {
    let controller = null;
    const guardedChange = () => {
      controller?.captureDraft();
      onChange();
      queueMicrotask(() => controller?.restoreDraft());
    };

    super({ showToast, onChange: guardedChange });
    controller = this;
    this.draft = Object.create(null);
    this.focusDraft = null;
  }

  captureDraft() {
    for (const id of DRAFT_FIELD_IDS) {
      const element = document.getElementById(id);
      if (!element) continue;
      this.draft[id] = element.value;
    }

    const active = document.activeElement;
    if (active?.id && DRAFT_FIELD_IDS.includes(active.id)) {
      this.focusDraft = {
        id: active.id,
        start: typeof active.selectionStart === 'number' ? active.selectionStart : null,
        end: typeof active.selectionEnd === 'number' ? active.selectionEnd : null,
      };
    }
  }

  restoreDraft() {
    for (const id of DRAFT_FIELD_IDS) {
      const element = document.getElementById(id);
      if (!element || this.draft[id] === undefined) continue;
      element.value = this.draft[id];
    }

    if (!this.focusDraft) return;
    const element = document.getElementById(this.focusDraft.id);
    if (!element) return;
    element.focus({ preventScroll: true });
    if (this.focusDraft.start !== null && typeof element.setSelectionRange === 'function') {
      const length = element.value.length;
      element.setSelectionRange(
        Math.min(this.focusDraft.start, length),
        Math.min(this.focusDraft.end ?? this.focusDraft.start, length),
      );
    }
  }

  shouldPoll() {
    return Boolean(
      this.code
      && this.token
      && this.room?.me
      && this.mode === 'room'
      && this.room.status !== 'decided'
    );
  }

  startPolling() {
    this.stopPolling();
    if (!this.shouldPoll()) return;

    this.pollTimer = setInterval(() => {
      if (!this.shouldPoll()) {
        this.stopPolling();
        return;
      }
      this.loadState(true);
    }, 3000);
  }

  readPreferencesFromDom() {
    this.captureDraft();
    const excludedMenu = (this.draft['team-excluded-menu'] ?? this.preferences.excludedMenu ?? '').trim();
    this.preferences.excludedMenu = excludedMenu;
    return {
      ...this.preferences,
      excludedMenu,
      categories: [...this.preferences.categories],
    };
  }

  async createRoom() {
    this.captureDraft();
    const participantName = (this.draft['team-participant-name'] || '').trim();
    if (!participantName) return this.showToast('닉네임을 입력해 주세요.');

    const locationText = (this.draft['team-location-text'] || '').trim() || '서울 광화문';
    const roomName = (this.draft['team-room-name'] || '').trim() || '오늘 점심 뭐먹지';
    const preferences = this.readPreferencesFromDom();

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
          preferences,
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

  async joinRoom() {
    this.captureDraft();
    const participantName = (this.draft['team-participant-name'] || '').trim();
    if (!participantName) return this.showToast('닉네임을 입력해 주세요.');
    const preferences = this.readPreferencesFromDom();

    try {
      const data = await this.api(`/api/team/${this.code}/join`, {
        method: 'POST',
        body: JSON.stringify({ participantName, preferences }),
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
    const preferences = this.readPreferencesFromDom();
    try {
      const data = await this.api(`/api/team/${this.code}/preferences`, {
        method: 'POST',
        body: JSON.stringify({ participantToken: this.token, preferences }),
      });
      this.room = data.room;
      this.mode = 'room';
      this.startPolling();
      this.showToast('조건을 수정했습니다.');
      this.onChange();
    } catch (error) {
      this.showToast(error.message);
    }
  }

  async handleClick(button) {
    this.captureDraft();
    const action = button.dataset.teamAction;
    if (['open-create', 'open-join', 'back', 'edit', 'leave'].includes(action)) {
      this.stopPolling();
    }
    return super.handleClick(button);
  }
}
