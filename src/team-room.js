import { DurableObject } from 'cloudflare:workers';
import { aggregateTeamPreferences, fetchCurrentWeather, findRestaurants } from './recommendations.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function cleanText(value, max = 50) {
  return String(value || '').trim().slice(0, max);
}

function normalizePreferences(input = {}) {
  const allowedCategories = ['한식', '중식', '일식', '양식', '분식', '기타'];
  const categories = Array.isArray(input.categories)
    ? input.categories.filter((value) => allowedCategories.includes(value)).slice(0, 6)
    : [];
  const allowedBudgets = ['under-10000', '10000-20000', 'over-20000'];

  return {
    categories: categories.length ? categories : ['한식'],
    budget: allowedBudgets.includes(input.budget) ? input.budget : '10000-20000',
    excludedMenu: cleanText(input.excludedMenu, 40),
    hangover: Boolean(input.hangover),
  };
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

export class TeamRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
  }

  async getRoom() {
    return (await this.ctx.storage.get('room')) || null;
  }

  async putRoom(room) {
    room.updatedAt = Date.now();
    await this.ctx.storage.put('room', room);
  }

  participantByToken(room, token) {
    return room.participants.find((participant) => participant.token === token);
  }

  publicRoom(room, token = '') {
    const me = token ? this.participantByToken(room, token) : null;
    const voteCounts = {};
    for (const participant of room.participants) {
      if (participant.vote) voteCounts[participant.vote] = (voteCounts[participant.vote] || 0) + 1;
    }

    return {
      code: room.code,
      name: room.name,
      status: room.status,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      deadline: room.deadline,
      locationText: room.locationText,
      hasGps: Boolean(room.coords?.lat && room.coords?.lng),
      weather: room.weather || null,
      appliedSignals: room.appliedSignals || [],
      aggregation: room.aggregation || null,
      candidates: room.candidates || [],
      result: room.result || null,
      lastError: room.lastError || '',
      participants: room.participants.map((participant) => ({
        id: participant.id,
        name: participant.name,
        isHost: participant.isHost,
        categories: participant.categories,
        budget: participant.budget,
        excludedMenu: participant.excludedMenu,
        hangover: participant.hangover,
        hasVoted: Boolean(participant.vote),
        joinedAt: participant.joinedAt,
      })),
      voteCounts,
      me: me
        ? {
            id: me.id,
            name: me.name,
            isHost: me.isHost,
            vote: me.vote || null,
            categories: me.categories,
            budget: me.budget,
            excludedMenu: me.excludedMenu,
            hangover: me.hangover,
          }
        : null,
    };
  }

  async prepareCandidates(room) {
    const aggregation = aggregateTeamPreferences(room.participants);
    const result = await findRestaurants({
      key: this.env.KAKAO_REST_API_KEY,
      coords: room.coords,
      locationText: room.locationText,
      categories: aggregation.categories,
      hangoverStrength: aggregation.hangoverStrength,
      limit: 8,
    });

    const excluded = aggregation.excludedMenus.map((value) => value.toLowerCase());
    const candidates = result.items
      .filter((item) => !excluded.some((menu) => `${item.name} ${item.categoryRaw || ''}`.toLowerCase().includes(menu)))
      .slice(0, 5);

    if (candidates.length < 2) {
      throw new Error('팀 조건에 맞는 식당 후보가 부족합니다. 조건을 완화해 주세요.');
    }

    room.status = 'voting';
    room.aggregation = aggregation;
    room.weather = result.weather;
    room.appliedSignals = result.appliedSignals;
    room.candidates = candidates;
    room.lastError = '';
    for (const participant of room.participants) participant.vote = null;
    await this.putRoom(room);
    return room;
  }

  async handleCreate(request) {
    const existing = await this.getRoom();
    if (existing) return json({ message: '이미 사용 중인 방 코드입니다.' }, 409);

    const body = await readJson(request);
    const now = Date.now();
    const deadlineMinutes = Math.min(30, Math.max(3, Number(body.deadlineMinutes || 10)));
    const hostToken = crypto.randomUUID();
    const hostId = crypto.randomUUID();
    const preferences = normalizePreferences(body.preferences);
    const coords = body.coords?.lat && body.coords?.lng
      ? { lat: Number(body.coords.lat), lng: Number(body.coords.lng) }
      : null;

    const room = {
      code: cleanText(body.code, 6),
      name: cleanText(body.roomName || '오늘 점심 뭐먹지', 40),
      status: 'collecting',
      createdAt: now,
      updatedAt: now,
      deadline: now + deadlineMinutes * 60 * 1000,
      locationText: cleanText(body.locationText || (coords ? '현재 위치' : '서울 광화문'), 80),
      coords,
      weather: coords ? await fetchCurrentWeather(coords) : null,
      participants: [
        {
          id: hostId,
          token: hostToken,
          name: cleanText(body.participantName || '방장', 20),
          isHost: true,
          joinedAt: now,
          vote: null,
          ...preferences,
        },
      ],
      candidates: [],
      result: null,
      aggregation: null,
      appliedSignals: [],
      lastError: '',
    };

    await this.putRoom(room);
    return json({ token: hostToken, participantId: hostId, room: this.publicRoom(room, hostToken) }, 201);
  }

  async handleState(request) {
    let room = await this.getRoom();
    if (!room) return json({ message: '존재하지 않는 방입니다.' }, 404);

    if (room.status === 'collecting' && Date.now() >= room.deadline) {
      try {
        room = await this.prepareCandidates(room);
      } catch (error) {
        room.lastError = error instanceof Error ? error.message : '후보 생성에 실패했습니다.';
        await this.putRoom(room);
      }
    }

    const token = new URL(request.url).searchParams.get('participantToken') || '';
    return json({ room: this.publicRoom(room, token) });
  }

  async handleJoin(request) {
    const room = await this.getRoom();
    if (!room) return json({ message: '존재하지 않는 방입니다.' }, 404);
    if (room.status !== 'collecting') return json({ message: '이미 조건 취합이 끝난 방입니다.' }, 409);
    if (Date.now() >= room.deadline) return json({ message: '참여 마감 시간이 지났습니다.' }, 409);
    if (room.participants.length >= 20) return json({ message: '최대 참여 인원은 20명입니다.' }, 409);

    const body = await readJson(request);
    const token = crypto.randomUUID();
    const participantId = crypto.randomUUID();
    const participant = {
      id: participantId,
      token,
      name: cleanText(body.participantName || `참여자 ${room.participants.length + 1}`, 20),
      isHost: false,
      joinedAt: Date.now(),
      vote: null,
      ...normalizePreferences(body.preferences),
    };
    room.participants.push(participant);
    await this.putRoom(room);

    return json({ token, participantId, room: this.publicRoom(room, token) }, 201);
  }

  async handlePreferences(request) {
    const room = await this.getRoom();
    if (!room) return json({ message: '존재하지 않는 방입니다.' }, 404);
    if (room.status !== 'collecting') return json({ message: '조건 입력이 마감됐습니다.' }, 409);

    const body = await readJson(request);
    const participant = this.participantByToken(room, body.participantToken);
    if (!participant) return json({ message: '참여자 인증에 실패했습니다.' }, 401);
    Object.assign(participant, normalizePreferences(body.preferences));
    await this.putRoom(room);
    return json({ room: this.publicRoom(room, body.participantToken) });
  }

  async handleClose(request) {
    let room = await this.getRoom();
    if (!room) return json({ message: '존재하지 않는 방입니다.' }, 404);
    const body = await readJson(request);
    if (body.participantToken !== room.participants.find((participant) => participant.isHost)?.token) {
      return json({ message: '방장만 조건 입력을 마감할 수 있습니다.' }, 403);
    }
    if (room.status !== 'collecting') return json({ room: this.publicRoom(room, body.participantToken) });

    try {
      room = await this.prepareCandidates(room);
      return json({ room: this.publicRoom(room, body.participantToken) });
    } catch (error) {
      room.lastError = error instanceof Error ? error.message : '후보 생성에 실패했습니다.';
      await this.putRoom(room);
      return json({ message: room.lastError, room: this.publicRoom(room, body.participantToken) }, 502);
    }
  }

  async handleVote(request) {
    const room = await this.getRoom();
    if (!room) return json({ message: '존재하지 않는 방입니다.' }, 404);
    if (room.status !== 'voting') return json({ message: '현재 투표할 수 없는 상태입니다.' }, 409);
    const body = await readJson(request);
    const participant = this.participantByToken(room, body.participantToken);
    if (!participant) return json({ message: '참여자 인증에 실패했습니다.' }, 401);
    if (!room.candidates.some((candidate) => candidate.id === body.candidateId)) {
      return json({ message: '올바르지 않은 후보입니다.' }, 400);
    }
    participant.vote = body.candidateId;
    await this.putRoom(room);
    return json({ room: this.publicRoom(room, body.participantToken) });
  }

  async handleDecide(request) {
    const room = await this.getRoom();
    if (!room) return json({ message: '존재하지 않는 방입니다.' }, 404);
    const body = await readJson(request);
    const host = room.participants.find((participant) => participant.isHost);
    if (body.participantToken !== host?.token) return json({ message: '방장만 최종 결정할 수 있습니다.' }, 403);
    if (room.status !== 'voting') return json({ message: '최종 결정 단계가 아닙니다.' }, 409);

    let winner;
    const mode = body.mode === 'vote' ? 'vote' : 'roulette';
    if (mode === 'vote') {
      const counts = new Map();
      for (const participant of room.participants) {
        if (participant.vote) counts.set(participant.vote, (counts.get(participant.vote) || 0) + 1);
      }
      const maxVotes = Math.max(0, ...counts.values());
      const tiedIds = [...counts.entries()].filter(([, count]) => count === maxVotes).map(([id]) => id);
      const pool = maxVotes > 0 ? room.candidates.filter((candidate) => tiedIds.includes(candidate.id)) : room.candidates;
      winner = randomItem(pool);
    } else {
      winner = randomItem(room.candidates);
    }

    room.status = 'decided';
    room.result = {
      ...winner,
      mode,
      decidedAt: Date.now(),
    };
    await this.putRoom(room);
    return json({ room: this.publicRoom(room, body.participantToken) });
  }

  async fetch(request) {
    const action = new URL(request.url).pathname.split('/').filter(Boolean).pop() || 'state';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: JSON_HEADERS });

    if (action === 'create' && request.method === 'POST') return this.handleCreate(request);
    if (action === 'state' && request.method === 'GET') return this.handleState(request);
    if (action === 'join' && request.method === 'POST') return this.handleJoin(request);
    if (action === 'preferences' && request.method === 'POST') return this.handlePreferences(request);
    if (action === 'close' && request.method === 'POST') return this.handleClose(request);
    if (action === 'vote' && request.method === 'POST') return this.handleVote(request);
    if (action === 'decide' && request.method === 'POST') return this.handleDecide(request);
    return json({ message: '지원하지 않는 팀 방 요청입니다.' }, 404);
  }
}
