import worker, { TeamRoom } from './index.js';
import { findRestaurants } from './recommendations-v2.js';

export { TeamRoom };

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

const SOLO_CASUAL_TERMS = [
  '김밥', '분식', '떡볶이', '라면', '라멘', '우동', '소바', '짜장면', '짬뽕', '국밥', '순대국',
  '해장국', '백반', '덮밥', '돈까스', '돈카츠', '햄버거', '버거', '샌드위치', '쌀국수', '칼국수',
  '제육', '도시락', '죽', '설렁탕', '곰탕', '냉면', '기사식당', '토스트', '비빔밥', '김치찌개',
];

const SOLO_HARD_EXCLUDE_TERMS = [
  '호텔', '백화점', '리조트', '웨딩', '컨벤션', '오마카세', '파인다이닝', '파인 다이닝',
  'vip', '브이아이피', '프리미엄', '프라이빗 다이닝', 'private dining',
];

const SOLO_SOFT_EXCLUDE_TERMS = [
  '참치회', '참치전문', '참치 전문', '참치코스', '참치 코스', '코스요리', '코스 요리',
  '스테이크하우스', '라운지', '뷔페', '룸식당', '룸 식당', '접대', '상견례',
];

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

function restaurantText(item) {
  return `${item?.name || ''} ${item?.categoryRaw || ''} ${item?.address || ''}`.toLowerCase();
}

function hasAnyTerm(text, terms) {
  return terms.some((term) => text.includes(term.toLowerCase()));
}

function tagsOf(item) {
  return Array.isArray(item?.searchTags) ? item.searchTags : [];
}

function hasTagPrefix(item, prefix) {
  return tagsOf(item).some((tag) => String(tag).startsWith(prefix));
}

function soloEvidence(item) {
  const text = restaurantText(item);
  if (hasTagPrefix(item, 'menu:')) return 4;
  if (hasAnyTerm(text, SOLO_CASUAL_TERMS)) return 3;
  if (hasTagPrefix(item, 'intent:')) return 2;
  if (tagsOf(item).some((tag) => !String(tag).startsWith('broad:'))) return 1;
  return 0;
}

function rankSoloItems(items) {
  return [...items].sort((a, b) => {
    const evidenceGap = soloEvidence(b) - soloEvidence(a);
    if (evidenceGap) return evidenceGap;
    return Number(b?.score || 0) - Number(a?.score || 0)
      || Number(a?.distance_m || 0) - Number(b?.distance_m || 0);
  });
}

function filterSoloCandidates(items) {
  if (!Array.isArray(items) || !items.length) return items || [];

  const withoutHard = items.filter((item) => !hasAnyTerm(restaurantText(item), SOLO_HARD_EXCLUDE_TERMS));
  const strict = withoutHard.filter((item) => !hasAnyTerm(restaurantText(item), SOLO_SOFT_EXCLUDE_TERMS));

  // 1순위: 카카오의 혼밥용 메뉴 검색에 직접 걸렸거나, 이름/분류 자체가 명확히 혼밥형인 곳.
  // 도시 지역에서는 이 그룹만 사용해 호텔/고급식당이 넓은 음식점 검색에서 섞이는 것을 막는다.
  const strongSolo = strict.filter((item) => hasTagPrefix(item, 'menu:') || hasAnyTerm(restaurantText(item), SOLO_CASUAL_TERMS));
  if (strongSolo.length >= 3) return rankSoloItems(strongSolo);

  // 2순위: '혼밥/혼밥 맛집/혼밥 식당' 검색에 직접 잡힌 곳까지 허용하되 broad-only 결과는 제외한다.
  const contextual = strict.filter((item) => hasTagPrefix(item, 'intent:') || hasTagPrefix(item, 'menu:'));
  if (contextual.length >= 3) return rankSoloItems(contextual);

  // 3순위: 카테고리·날씨 등 의미 있는 키워드 검색 결과만 사용한다.
  const nonBroad = strict.filter((item) => tagsOf(item).some((tag) => !String(tag).startsWith('broad:')));
  if (nonBroad.length >= 3) return rankSoloItems(nonBroad);

  // 정말 식당이 드문 지역에서만 넓은 검색 결과를 단계적으로 허용한다.
  if (strict.length >= 3) return rankSoloItems(strict);
  if (withoutHard.length >= 2) return rankSoloItems(withoutHard);
  return rankSoloItems(items);
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
      companion: body.companion || '동료',
      limit: 30,
    });

    const items = body.companion === '혼밥'
      ? filterSoloCandidates(result.items)
      : result.items;

    return json({
      mode: 'kakao',
      ...result,
      items,
      poolSize: items.length,
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