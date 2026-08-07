import worker, { TeamRoom } from './index.js';
import { findRestaurants } from './recommendations-v2.js';

export { TeamRoom };

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

async function handleRestaurants(request, env) {
  if (request.method !== 'POST') {
    return json({ message: 'POST 요청만 지원합니다.' }, 405);
  }

  const body = await readJson(request);
  try {
    const result = await findRestaurants({
      key: env.KAKAO_REST_API_KEY,
      coords: body.coords,
      locationText: body.locationText || '',
      categories: Array.isArray(body.categories) ? body.categories : [],
      hangoverStrength: body.hangover ? 1 : 0,
      limit: 30,
    });

    return json({
      mode: 'kakao',
      ...result,
      poolSize: result.items.length,
    });
  } catch (error) {
    return json({
      mode: 'error',
      message: error instanceof Error ? error.message : '식당 검색에 실패했습니다.',
      items: [],
    }, 502);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/restaurants') {
      return handleRestaurants(request, env);
    }
    return worker.fetch(request, env, ctx);
  },
};