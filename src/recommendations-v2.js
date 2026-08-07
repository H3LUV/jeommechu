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

function normalizeCategory(raw = '') {
  if (raw.includes('한식')) return '한식';
  if (raw.includes('중식') || raw.includes('중국')) return '중식';
  if (raw.includes('일식') || raw.includes('초밥') || raw.includes('돈까스')) return '일식';
  if (raw.includes('양식') || raw.includes('이탈리안') || raw.includes('패밀리레스토랑')) return '양식';
  if (raw.includes('분식')) return '분식';
  return '기타';
}

async function kakaoJson(url, key) {
  const response = await fetch(url, {
    headers: { Authorization: `KakaoAK ${key}` },
  });

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
      label = '눈';
      icon = '🌨️';
    } else if (wet) {
      label = '비';
      icon = '🌧️';
    } else if (hot) {
      label = '더움';
      icon = '☀️';
    } else if (cold) {
      label = '쌀쌀함';
      icon = '🧥';
    } else if (code <= 1) {
      label = '맑음';
      icon = '☀️';
    }

    return {
      temperature: Number.isFinite(temperature) ? temperature : null,
      apparentTemperature: Number.isFinite(apparentTemperature) ? apparentTemperature : null,
      precipitation,
      rain,
      snowfall,
      weatherCode: code,
      wet,
      cold,
      hot,
      label,
      icon,
      source: 'Open-Meteo',
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
  };
}

function scoreItem(item, categories, signals) {
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

  return {
    ...item,
    score: Math.round(Math.min(99, score)),
    reasons: [...new Set(reasons)].slice(0, 3),
  };
}

function uniquePlaces(documents) {
  const map = new Map();
  for (const place of documents) {
    const key = place.id || `${place.place_name}:${place.road_address_name || place.address_name}`;
    if (!map.has(key)) map.set(key, place);
  }
  return [...map.values()];
}

async function resolveCenter(coords, locationText, key) {
  if (coords?.lat && coords?.lng) {
    return { lat: Number(coords.lat), lng: Number(coords.lng), source: 'gps' };
  }

  const query = String(locationText || '').trim();
  if (!query || query === '현재 위치') {
    throw new Error('GPS를 누르거나 검색할 지역명을 입력해 주세요.');
  }

  const addressParams = new URLSearchParams({ query, size: '1' });
  try {
    const addressData = await kakaoJson(`https://dapi.kakao.com/v2/local/search/address.json?${addressParams}`, key);
    const address = addressData.documents?.[0];
    if (address?.x && address?.y) {
      return { lat: Number(address.y), lng: Number(address.x), source: 'text' };
    }
  } catch {
    // 장소명 검색으로 한 번 더 해석한다.
  }

  const keywordParams = new URLSearchParams({ query, size: '1' });
  const keywordData = await kakaoJson(`https://dapi.kakao.com/v2/local/search/keyword.json?${keywordParams}`, key);
  const place = keywordData.documents?.[0];
  if (!place?.x || !place?.y) {
    throw new Error('검색 위치를 좌표로 확인하지 못했습니다. 역명이나 도로명 주소를 입력해 주세요.');
  }

  return { lat: Number(place.y), lng: Number(place.x), source: 'text' };
}

function categorySearch(center, key, page) {
  const params = new URLSearchParams({
    category_group_code: 'FD6',
    x: String(center.lng),
    y: String(center.lat),
    radius: String(SEARCH_RADIUS_M),
    size: '15',
    page: String(page),
    sort: 'distance',
  });
  return kakaoJson(`https://dapi.kakao.com/v2/local/search/category.json?${params}`, key);
}

function keywordSearch(center, query, key) {
  const params = new URLSearchParams({
    query,
    x: String(center.lng),
    y: String(center.lat),
    radius: String(SEARCH_RADIUS_M),
    size: '15',
    sort: 'distance',
  });
  return kakaoJson(`https://dapi.kakao.com/v2/local/search/keyword.json?${params}`, key);
}

async function settleSearches(requests) {
  const settled = await Promise.allSettled(requests);
  const documents = settled
    .filter((result) => result.status === 'fulfilled')
    .flatMap((result) => result.value.documents || []);
  const firstError = settled.find((result) => result.status === 'rejected')?.reason || null;
  return { documents, firstError };
}

export async function findRestaurants({
  key,
  coords,
  locationText = '',
  categories = [],
  hangoverStrength = 0,
  limit = 5,
}) {
  if (!key) throw new Error('KAKAO_REST_API_KEY가 등록되지 않았습니다.');

  const center = await resolveCenter(coords, locationText, key);
  const selectedCategories = categories.length
    ? categories
    : ['한식', '중식', '일식', '양식', '분식', '기타'];
  const weather = await fetchCurrentWeather(center);
  const signals = buildSignals(weather, hangoverStrength);

  const requests = [
    categorySearch(center, key, 1),
    categorySearch(center, key, 2),
    categorySearch(center, key, 3),
  ];

  const keywords = [
    ...selectedCategories.slice(0, 3).flatMap((category) => CATEGORY_TERMS[category] || []),
    ...signals.queryTerms.slice(0, 3),
    '음식점',
    '점심',
  ].filter(Boolean);

  for (const keyword of [...new Set(keywords)].slice(0, 10)) {
    requests.push(keywordSearch(center, keyword, key));
  }

  const searched = await settleSearches(requests);
  if (!searched.documents.length) {
    throw searched.firstError || new Error('반경 1km 안에서 식당을 찾지 못했습니다.');
  }

  const scored = uniquePlaces(searched.documents)
    .map(placeToItem)
    .filter((item) => Number.isFinite(item.distance_m) && item.distance_m <= SEARCH_RADIUS_M)
    .map((item) => scoreItem(item, selectedCategories, signals))
    .sort((a, b) => b.score - a.score || a.distance_m - b.distance_m);

  const matching = scored.filter((item) => selectedCategories.includes(item.category));
  const alternatives = scored.filter((item) => !selectedCategories.includes(item.category));
  const ordered = [...matching, ...alternatives];
  const safeLimit = Math.min(MAX_POOL_SIZE, Math.max(1, Number(limit || 5)));
  const items = ordered.slice(0, safeLimit);

  if (!items.length) throw new Error('반경 1km 안에서 추천 가능한 식당이 없습니다.');

  return {
    items,
    weather,
    appliedSignals: signals.labels,
    source: center.source,
    searchRadiusM: SEARCH_RADIUS_M,
    poolSize: items.length,
  };
}

export function aggregateTeamPreferences(participants) {
  const categoryVotes = new Map();
  const excludedMenus = new Set();
  let hangoverCount = 0;

  for (const participant of participants) {
    for (const category of participant.categories || []) {
      categoryVotes.set(category, (categoryVotes.get(category) || 0) + 1);
    }
    if (participant.excludedMenu) excludedMenus.add(participant.excludedMenu.trim());
    if (participant.hangover) hangoverCount += 1;
  }

  const categories = [...categoryVotes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([category]) => category);

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
