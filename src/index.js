import { fetchCurrentWeather, findRestaurants } from './recommendations.js';
export { TeamRoom } from './team-room-v2.js';

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

async function testKakao(key) {
  const params = new URLSearchParams({ query: '서울 음식점', size: '1' });
  const response = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?${params}`, {
    headers: { Authorization: `KakaoAK ${key}` },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Kakao Local API ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ''}`);
  }
}

async function handleStatus(env) {
  const keyConfigured = Boolean(env.KAKAO_REST_API_KEY);
  if (!keyConfigured) {
    return json({
      ok: false,
      keyConfigured: false,
      teamRoomsConfigured: Boolean(env.TEAM_ROOMS),
      message: 'KAKAO_REST_API_KEY가 등록되지 않았습니다.',
    }, 503);
  }

  try {
    await testKakao(env.KAKAO_REST_API_KEY);
    return json({
      ok: true,
      keyConfigured: true,
      kakaoApi: 'connected',
      weatherApi: 'Open-Meteo',
      teamRoomsConfigured: Boolean(env.TEAM_ROOMS),
    });
  } catch (error) {
    return json({
      ok: false,
      keyConfigured: true,
      kakaoApi: 'error',
      teamRoomsConfigured: Boolean(env.TEAM_ROOMS),
      message: error instanceof Error ? error.message : '카카오 API 연결에 실패했습니다.',
    }, 502);
  }
}

async function handleTeamStatus(request, env) {
  if (!env.TEAM_ROOMS) return json({ ok: false, message: 'TEAM_ROOMS 바인딩이 없습니다.' }, 503);
  const stub = env.TEAM_ROOMS.getByName('__jeommechu_status__');
  const internalUrl = new URL('/internal/status', request.url);
  const internalRequest = new Request(internalUrl, { method: 'GET' });
  if (env.KAKAO_REST_API_KEY) {
    internalRequest.headers.set('x-jeommechu-internal-kakao-key', env.KAKAO_REST_API_KEY);
  }
  return stub.fetch(internalRequest);
}

async function handleWeather(request) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return json({ message: '위도와 경도가 필요합니다.' }, 400);
  }
  const weather = await fetchCurrentWeather({ lat, lng });
  if (!weather) return json({ message: '현재 날씨를 불러오지 못했습니다.' }, 502);
  return json({ weather });
}

async function handleRestaurants(request, env) {
  if (request.method !== 'POST') return json({ message: 'POST 요청만 지원합니다.' }, 405);
  const body = await readJson(request);

  try {
    const result = await findRestaurants({
      key: env.KAKAO_REST_API_KEY,
      coords: body.coords,
      locationText: body.locationText || '',
      categories: Array.isArray(body.categories) ? body.categories : [],
      hangoverStrength: body.hangover ? 1 : 0,
      limit: 5,
    });
    return json({ mode: 'kakao', ...result });
  } catch (error) {
    return json({
      mode: 'error',
      message: error instanceof Error ? error.message : '식당 검색에 실패했습니다.',
      items: [],
    }, 502);
  }
}

function randomRoomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function attachInternalSecret(request, env) {
  if (env.KAKAO_REST_API_KEY) {
    request.headers.set('x-jeommechu-internal-kakao-key', env.KAKAO_REST_API_KEY);
  }
  return request;
}

async function createTeamRoom(request, env) {
  const body = await readJson(request);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomRoomCode();
    const stub = env.TEAM_ROOMS.getByName(code);
    const internalUrl = new URL('/internal/create', request.url);
    const internalRequest = new Request(internalUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, code }),
    });
    const response = await stub.fetch(attachInternalSecret(internalRequest, env));

    if (response.status !== 409) return response;
  }

  return json({ message: '방 코드 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.' }, 503);
}

async function routeTeamRoom(request, env, url) {
  const parts = url.pathname.split('/').filter(Boolean);
  const code = parts[2] || '';
  const action = parts[3] || 'state';
  if (!/^\d{6}$/.test(code)) return json({ message: '6자리 방 코드를 확인해 주세요.' }, 400);

  const stub = env.TEAM_ROOMS.getByName(code);
  const internalUrl = new URL(`/internal/${action}`, request.url);
  internalUrl.search = url.search;
  const internalRequest = new Request(internalUrl, request);
  return stub.fetch(attachInternalSecret(internalRequest, env));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/status') return handleStatus(env);
    if (url.pathname === '/api/team-status') return handleTeamStatus(request, env);
    if (url.pathname === '/api/weather') return handleWeather(request);
    if (url.pathname === '/api/restaurants') return handleRestaurants(request, env);
    if (url.pathname === '/api/team/create' && request.method === 'POST') return createTeamRoom(request, env);
    if (url.pathname.startsWith('/api/team/')) return routeTeamRoom(request, env, url);

    return env.ASSETS.fetch(request);
  },
};