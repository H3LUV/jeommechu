const SEARCH_RADIUS_M = 1000;
const MAX_POOL_SIZE = 30;

const CATEGORY_TERMS = {
  한식: ['한식', '백반', '국밥'],
  중식: ['중식', '중국집', '짜장면'],
  일식: ['일식', '초밥', '돈까스'],
  양식: ['양식', '파스타', '이탈리안'],
  분식: ['분식', '떡볶이', '김밥'],
  기타: ['음식점', '맛집'],
};

const HANGOVER_TERMS = ['해장국', '콩나물국밥', '북엇국', '순대국', '국밥', '짬뽕'];
const WET_TERMS = ['국밥', '찌개', '전골', '칼국수', '우동'];
const COLD_TERMS = ['국밥', '찌개', '전골', '라멘', '칼국수'];
const HOT_TERMS = ['냉면', '막국수', '소바', '샐러드', '쌀국수'];

const DINING_CONTEXTS = {
  혼밥: {
    label: '혼밥 맞춤',
    intentQueries: ['혼밥', '혼밥 맛집', '혼밥 식당', '혼자 먹기 좋은 식당'],
    menuQueries: ['김밥', '국밥', '백반', '우동', '라멘', '짜장면', '돈까스', '덮밥', '햄버거', '쌀국수', '칼국수', '분식'],
    positiveTerms: [
      '김밥', '분식', '떡볶이', '라면', '라멘', '우동', '소바', '짜장면', '짬뽕', '국밥', '순대국',
      '해장국', '백반', '덮밥', '돈까스', '돈카츠', '햄버거', '버거', '샌드위치', '쌀국수', '칼국수',
      '제육', '도시락', '죽', '설렁탕', '곰탕', '냉면', '기사식당', '토스트', '비빔밥', '김치찌개',
    ],
    negativeTerms: [
      '한정식', '오마카세', '파인다이닝', '파인 다이닝', '코스요리', '코스 요리', '스테이크하우스',
      '라운지', '뷔페', '참치회', '참치전문', '참치 전문', '룸식당', '룸 식당', '접대', '상견례',
    ],
    hardExcludeTerms: [
      '호텔', '백화점', '리조트', '웨딩', '컨벤션', '오마카세', '파인다이닝', '파인 다이닝',
      'vip', '브이아이피', '프리미엄', '프라이빗 다이닝', 'private dining',
    ],
    positiveWeight: 28,
    negativeWeight: 34,
    intentBoost: 34,
    menuBoost: 18,
  },
  동료: {
    label: '동료 식사 맞춤',
    intentQueries: ['직장인 점심', '점심 맛집', '회사 점심', '점심 식당'],
    menuQueries: ['백반', '찌개', '돈까스', '파스타', '중식', '국밥', '제육', '쌀국수'],
    positiveTerms: [
      '백반', '찌개', '국밥', '돈까스', '돈카츠', '제육', '보쌈', '쌈밥', '닭갈비', '샤브샤브',
      '파스타', '중식', '일식', '초밥', '쌀국수', '칼국수', '냉면', '불고기', '갈비', '전골',
    ],
    negativeTerms: ['오마카세', '파인다이닝', '파인 다이닝', '코스요리', '코스 요리', '라운지'],
    hardExcludeTerms: ['호텔', '백화점', '리조트', '웨딩', '컨벤션', '파인다이닝', '파인 다이닝'],
    positiveWeight: 14,
    negativeWeight: 24,
    intentBoost: 20,
    menuBoost: 10,
  },
  비즈니스: {
    label: '비즈니스 식사 맞춤',
    intentQueries: ['비즈니스 식사', '접대 식당', '룸 식당', '비즈니스 미팅 식당'],
    menuQueries: ['한정식', '정식', '일식', '중식', '스시', '갈비', '장어', '샤브샤브'],
    positiveTerms: [
      '한정식', '정식', '일식', '중식', '스시', '초밥', '코스', '다이닝', '갈비', '불고기', '장어',
      '샤브샤브', '전골', '스테이크', '오마카세', '룸', '참치', '복어', '중화요리', '요리',
    ],
    negativeTerms: [
      '김밥', '분식', '떡볶이', '라면', '햄버거', '버거', '핫도그', '토스트', '도시락', '푸드코트',
      '편의점', '기사식당',
    ],
    hardExcludeTerms: [],
    positiveWeight: 24,
    negativeWeight: 34,
    intentBoost: 30,
    menuBoost: 14,
  },
};

function normalizeCategory(raw = '') {
  if (raw.includes('한식')) return '한식';
  if (raw.includes('중식') || raw.includes('중국')) return '중식';
  if (raw.includes('일식') || raw.includes('초밥') || raw.includes('돈까스')) return '일식';
  if (raw.includes('양식') || raw.includes('이탈리안') || raw.includes('패밀리레스토랑')) return '양식';
  if (raw.includes('분식')) return '분식';
  return '기타';
}

function normalizeDiningContext(value = '') {
  return Object.prototype.hasOwnProperty.call(DINING_CONTEXTS, value) ? value : '동료';
}

function itemText(item) {
  return `${item.name || ''} ${item.categoryRaw || ''} ${item.address || ''}`.toLowerCase();
}

function includesAny(text, terms = []) {
  return terms.some((term) => text.includes(term.toLowerCase()));
}

async function kakaoJson(url, key) {
  const response = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Kakao Local API ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ''}`);
  }
  return response.json();
}

export async function fetchCurrentWeather(coords) {
  if (!coords?.lat || !coords?.lng) return null;
  try {
    const params = new URLSearchParams({
      latitude: String(coords.lat),
      longitude: String(coords.lng),
      current: 'temperature_2m,apparent_temperature,precipitation,rain,snowfall,weather_code',
      timezone: 'auto',
    });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!response.ok) return null;
    const data = await response.json();
    const current = data.current || {};
    const code = Number(current.weather_code || 0);
    const temperature = Number(current.temperature_2m);
    const apparentTemperature = Number(current.apparent_temperature);
    const precipitation = Number(current.precipitation || 0);
    const rain = Number(current.rain || 0);
    const snowfall = Number(current.snowfall || 0);
    const wet = precipitation > 0 || rain > 0 || snowfall > 0 || code >= 51;
    const cold = Number.isFinite(apparentTemperature) ? apparentTemperature <= 8 : temperature <= 8;
    const hot = Number.isFinite(apparentTemperature) ? apparentTemperature >= 28 : temperature >= 28;

    let label = '무난한 날씨';
    let icon = '☁️';
    if (snowfall > 0 || [71, 73, 75, 77, 85, 86].includes(code)) {
      label = '눈'; icon = '🌨️';
    } else if (wet) {
      label = '비'; icon = '🌧️';
    } else if (hot) {
      label = '더움'; icon = '☀️';
    } else if (cold) {
      label = '쌀쌀함'; icon = '🧥';
    } else if (code <= 1) {
      label = '맑음'; icon = '☀️';
    }

    return {
      temperature: Number.isFinite(temperature) ? temperature : null,
      apparentTemperature: Number.isFinite(apparentTemperature) ? apparentTemperature : null,
      precipitation, rain, snowfall, weatherCode: code, wet, cold, hot, label, icon, source: 'Open-Meteo',
    };
  } catch {
    return null;
  }
}

function buildSignals(weather, hangoverStrength = 0) {
  const queryTerms = [];
  const labels = [];
  const matchWeights = new Map();
  const addTerms = (terms, weight, label) => {
    labels.push(label);
    for (const term of terms) {
      if (!queryTerms.includes(term)) queryTerms.push(term);
      matchWeights.set(term, Math.max(matchWeights.get(term) || 0, weight));
    }
  };
  if (hangoverStrength > 0) addTerms(HANGOVER_TERMS, hangoverStrength >= 0.5 ? 34 : 20, '해장');
  if (weather?.wet) addTerms(WET_TERMS, 16, '비·눈');
  if (weather?.cold) addTerms(COLD_TERMS, 14, '쌀쌀한 날씨');
  if (weather?.hot) addTerms(HOT_TERMS, 14, '더운 날씨');
  return { queryTerms, labels: [...new Set(labels)], matchWeights };
}

function placeToItem(place) {
  const category = normalizeCategory(place.category_name);
  return {
    id: place.id || `${place.place_name}:${place.x}:${place.y}`,
    name: place.place_name,
    category,
    menu: category,
    address: place.road_address_name || place.address_name || '',
    lat: Number(place.y),
    lng: Number(place.x),
    distance_m: Number(place.distance || 0),
    phone: place.phone || '',
    kakaoUrl: place.place_url || '',
    price: null,
    spicy: false,
    solo: true,
    group: true,
    business: false,
    categoryRaw: place.category_name || '',
    searchTags: Array.isArray(place._searchTags) ? place._searchTags : [],
  };
}

function contextSearchScore(item, diningContext) {
  const context = DINING_CONTEXTS[diningContext];
  const tags = item.searchTags || [];
  let delta = 0;
  const reasons = [];
  if (tags.some((tag) => tag.startsWith('intent:'))) {
    delta += context.intentBoost;
    reasons.push(`카카오 ${diningContext} 검색 연관`);
  }
  if (tags.some((tag) => tag.startsWith('menu:'))) delta += context.menuBoost;
  return { delta, reasons };
}

function scoreDiningContext(item, diningContext) {
  const context = DINING_CONTEXTS[diningContext];
  const text = itemText(item);
  let delta = 0;
  const reasons = [];

  if (includesAny(text, context.positiveTerms)) {
    delta += context.positiveWeight;
    reasons.push(context.label);
  }
  if (includesAny(text, context.negativeTerms)) delta -= context.negativeWeight;

  if (diningContext === '혼밥') {
    if (item.category === '분식') delta += 10;
    if (item.distance_m <= 500) delta += 6;
  } else if (diningContext === '동료') {
    if (['한식', '중식', '일식', '양식'].includes(item.category)) delta += 4;
  } else if (diningContext === '비즈니스') {
    if (['한식', '중식', '일식', '양식'].includes(item.category)) delta += 7;
    if (text.includes('호텔')) delta += 6;
  }

  const searchScore = contextSearchScore(item, diningContext);
  delta += searchScore.delta;
  reasons.push(...searchScore.reasons);
  return { delta, reasons };
}

function scoreItem(item, categories, signals, diningContext) {
  let score = 25;
  const reasons = [];
  const text = `${item.name} ${item.categoryRaw} ${item.address}`;

  if (categories.includes(item.category)) {
    score += 42;
    reasons.push(`${item.category} 선호 반영`);
  }

  if (item.distance_m >= 0 && item.distance_m <= SEARCH_RADIUS_M) {
    score += Math.max(0, 30 - item.distance_m / 35);
    if (item.distance_m <= 300) reasons.push('도보권 거리');
    else if (item.distance_m <= 700) reasons.push('1km 이내');
  }

  for (const [term, weight] of signals.matchWeights.entries()) {
    if (text.includes(term)) {
      score += weight;
      reasons.push(HANGOVER_TERMS.includes(term) ? '해장 메뉴' : '날씨 맞춤');
      break;
    }
  }

  const contextScore = scoreDiningContext(item, diningContext);
  score += contextScore.delta;
  reasons.push(...contextScore.reasons);

  return {
    ...item,
    score: Math.round(Math.max(1, Math.min(99, score))),
    diningContext,
    contextScore: contextScore.delta,
    reasons: [...new Set(reasons)].slice(0, 3),
  };
}

function uniquePlaces(documents) {
  const map = new Map();
  for (const place of documents) {
    const key = place.id || `${place.place_name}:${place.road_address_name || place.address_name}`;
    if (!map.has(key)) {
      map.set(key, { ...place, _searchTags: [...new Set(place._searchTags || [])] });
      continue;
    }
    const existing = map.get(key);
    existing._searchTags = [...new Set([...(existing._searchTags || []), ...(place._searchTags || [])])];
  }
  return [...map.values()];
}

async function resolveCenter(coords, locationText, key) {
  if (coords?.lat && coords?.lng) return { lat: Number(coords.lat), lng: Number(coords.lng), source: 'gps' };

  const query = String(locationText || '').trim();
  if (!query || query === '현재 위치') throw new Error('GPS를 누르거나 검색할 지역명을 입력해 주세요.');

  const addressParams = new URLSearchParams({ query, size: '1' });
  try {
    const addressData = await kakaoJson(`https://dapi.kakao.com/v2/local/search/address.json?${addressParams}`, key);
    const address = addressData.documents?.[0];
    if (address?.x && address?.y) return { lat: Number(address.y), lng: Number(address.x), source: 'text' };
  } catch {
    // 장소명 검색으로 한 번 더 해석한다.
  }

  const keywordParams = new URLSearchParams({ query, size: '1' });
  const keywordData = await kakaoJson(`https://dapi.kakao.com/v2/local/search/keyword.json?${keywordParams}`, key);
  const place = keywordData.documents?.[0];
  if (!place?.x || !place?.y) throw new Error('검색 위치를 좌표로 확인하지 못했습니다. 역명이나 도로명 주소를 입력해 주세요.');
  return { lat: Number(place.y), lng: Number(place.x), source: 'text' };
}

function categorySearch(center, key, page) {
  const params = new URLSearchParams({
    category_group_code: 'FD6', x: String(center.lng), y: String(center.lat), radius: String(SEARCH_RADIUS_M),
    size: '15', page: String(page), sort: 'distance',
  });
  return kakaoJson(`https://dapi.kakao.com/v2/local/search/category.json?${params}`, key);
}

function keywordSearch(center, query, key) {
  const params = new URLSearchParams({
    query, x: String(center.lng), y: String(center.lat), radius: String(SEARCH_RADIUS_M), size: '15', sort: 'distance',
  });
  return kakaoJson(`https://dapi.kakao.com/v2/local/search/keyword.json?${params}`, key);
}

async function settleTaggedSearches(searches) {
  const settled = await Promise.allSettled(searches.map((search) => search.promise));
  const documents = [];
  let firstError = null;

  settled.forEach((result, index) => {
    const search = searches[index];
    if (result.status === 'fulfilled') {
      for (const document of result.value.documents || []) {
        documents.push({ ...document, _searchTags: [search.tag] });
      }
    } else if (!firstError) {
      firstError = result.reason;
    }
  });

  return { documents, firstError };
}

function buildSearches(center, key, context, selectedCategories, signals) {
  const searches = [];
  const addKeyword = (query, tag) => {
    if (!query) return;
    searches.push({ promise: keywordSearch(center, query, key), tag });
  };

  context.intentQueries.forEach((query) => addKeyword(query, `intent:${query}`));
  context.menuQueries.slice(0, 10).forEach((query) => addKeyword(query, `menu:${query}`));
  selectedCategories.slice(0, 3).flatMap((category) => CATEGORY_TERMS[category]?.slice(0, 2) || [])
    .forEach((query) => addKeyword(query, `category:${query}`));
  signals.queryTerms.slice(0, 2).forEach((query) => addKeyword(query, `signal:${query}`));

  // 넓은 음식점 검색은 마지막 보강 후보로만 사용한다.
  searches.push({ promise: categorySearch(center, key, 1), tag: 'broad:category-1' });
  searches.push({ promise: categorySearch(center, key, 2), tag: 'broad:category-2' });
  addKeyword('음식점', 'broad:음식점');
  addKeyword('점심', 'broad:점심');
  return searches;
}

function applyContextHardFilter(items, diningContext) {
  const context = DINING_CONTEXTS[diningContext];
  if (!context.hardExcludeTerms.length) return items;
  const preferred = items.filter((item) => !includesAny(itemText(item), context.hardExcludeTerms));
  return preferred.length >= 5 ? preferred : items;
}

export async function findRestaurants({
  key,
  coords,
  locationText = '',
  categories = [],
  hangoverStrength = 0,
  companion = '동료',
  limit = 5,
}) {
  if (!key) throw new Error('KAKAO_REST_API_KEY가 등록되지 않았습니다.');

  const diningContext = normalizeDiningContext(companion);
  const context = DINING_CONTEXTS[diningContext];
  const center = await resolveCenter(coords, locationText, key);
  const selectedCategories = categories.length ? categories : ['한식', '중식', '일식', '양식', '분식', '기타'];
  const weather = await fetchCurrentWeather(center);
  const signals = buildSignals(weather, hangoverStrength);

  const searched = await settleTaggedSearches(buildSearches(center, key, context, selectedCategories, signals));
  if (!searched.documents.length) throw searched.firstError || new Error('반경 1km 안에서 식당을 찾지 못했습니다.');

  const scored = uniquePlaces(searched.documents)
    .map(placeToItem)
    .filter((item) => Number.isFinite(item.distance_m) && item.distance_m <= SEARCH_RADIUS_M)
    .map((item) => scoreItem(item, selectedCategories, signals, diningContext))
    .sort((a, b) => b.contextScore - a.contextScore || b.score - a.score || a.distance_m - b.distance_m);

  const contextFiltered = applyContextHardFilter(scored, diningContext);
  const matching = contextFiltered.filter((item) => selectedCategories.includes(item.category));
  const alternatives = contextFiltered.filter((item) => !selectedCategories.includes(item.category));
  const ordered = [...matching, ...alternatives];
  const safeLimit = Math.min(MAX_POOL_SIZE, Math.max(1, Number(limit || 5)));
  const items = ordered.slice(0, safeLimit);

  if (!items.length) throw new Error('반경 1km 안에서 추천 가능한 식당이 없습니다.');

  return {
    items,
    weather,
    appliedSignals: [...signals.labels, context.label, '카카오 상황별 검색'],
    source: center.source,
    diningContext,
    searchRadiusM: SEARCH_RADIUS_M,
    poolSize: items.length,
  };
}

export function aggregateTeamPreferences(participants) {
  const categoryVotes = new Map();
  const excludedMenus = new Set();
  let hangoverCount = 0;

  for (const participant of participants) {
    for (const category of participant.categories || []) categoryVotes.set(category, (categoryVotes.get(category) || 0) + 1);
    if (participant.excludedMenu) excludedMenus.add(participant.excludedMenu.trim());
    if (participant.hangover) hangoverCount += 1;
  }

  const categories = [...categoryVotes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([category]) => category);
  const total = Math.max(1, participants.length);
  const hangoverStrength = hangoverCount === 0 ? 0 : hangoverCount / total >= 0.5 ? 1 : 0.35;

  return {
    categories: categories.length ? categories : ['한식'],
    budgets: [],
    excludedMenus: [...excludedMenus].filter(Boolean),
    hangoverCount,
    hangoverStrength,
  };
}
