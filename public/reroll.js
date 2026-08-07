(() => {
  const nativeFetch = window.fetch.bind(window);
  let activeSignature = '';
  let cycleSeen = new Set();
  let lastShown = new Set();
  let cleanupScheduled = false;

  const SOLO_BLOCK_TERMS = [
    '호텔', '백화점', '리조트', '웨딩', '컨벤션', '오마카세', '파인다이닝', '파인 다이닝',
    'vip', '브이아이피', '프리미엄', '프라이빗 다이닝', 'private dining', '스시카세',
    '롯데호텔', '롯데백화점', '웨스틴조선', '조선호텔', '신라호텔', '포시즌스', '메리어트',
    '하얏트', '인터컨티넨탈', '콘래드', '소피텔', '앰배서더', '반얀트리',
    '신세계백화점', '현대백화점', '더현대', '갤러리아',
  ];

  const SOLO_SOFT_BLOCK_TERMS = [
    '참치', '참치회', '참치전문', '참치 전문', '참치코스', '참치 코스', '코스요리', '코스 요리',
    '스테이크하우스', '라운지', '뷔페', '룸식당', '룸 식당', '접대', '상견례',
  ];

  function itemId(item) {
    return String(item?.id || `${item?.name || ''}:${item?.address || ''}`);
  }

  function itemText(item) {
    return `${item?.name || ''} ${item?.categoryRaw || ''} ${item?.address || ''}`.toLowerCase();
  }

  function hasAnyTerm(text, terms) {
    return terms.some((term) => text.includes(term.toLowerCase()));
  }

  function filterPoolForCompanion(items, companion) {
    if (companion !== '혼밥') return items;
    const hardSafe = items.filter((item) => !hasAnyTerm(itemText(item), SOLO_BLOCK_TERMS));
    if (!hardSafe.length) return [];

    const strict = hardSafe.filter((item) => !hasAnyTerm(itemText(item), SOLO_SOFT_BLOCK_TERMS));
    return strict.length ? strict : hardSafe;
  }

  function shuffleByQuality(items) {
    return [...items]
      .map((item) => ({
        item,
        rank:
          Number(item.score || 0) * 1.2
          + Number(item.contextScore || 0) * 0.8
          + Math.random() * 8,
      }))
      .sort((a, b) => b.rank - a.rank)
      .map(({ item }) => item);
  }

  function diversify(items, signature) {
    const pool = items.slice(0, 30);
    if (signature !== activeSignature) {
      activeSignature = signature;
      cycleSeen = new Set();
      lastShown = new Set();
    }

    let available = pool.filter((item) => !cycleSeen.has(itemId(item)));
    if (available.length < Math.min(5, pool.length)) {
      cycleSeen = new Set(lastShown);
      available = pool.filter((item) => !cycleSeen.has(itemId(item)));
    }

    const selected = shuffleByQuality(available).slice(0, Math.min(5, available.length));
    if (selected.length < Math.min(5, pool.length)) {
      const selectedIds = new Set(selected.map(itemId));
      const supplement = shuffleByQuality(
        pool.filter((item) => !selectedIds.has(itemId(item)) && !lastShown.has(itemId(item))),
      ).slice(0, 5 - selected.length);
      selected.push(...supplement);
    }

    const selectedIds = new Set(selected.map(itemId));
    lastShown = selectedIds;
    for (const id of selectedIds) cycleSeen.add(id);

    return [
      ...selected,
      ...pool.filter((item) => !selectedIds.has(itemId(item))),
      ...items.slice(30),
    ];
  }

  function removePriceFields() {
    document.querySelectorAll('.field-label').forEach((label) => {
      if (label.textContent.trim() === '예산') {
        label.closest('.field')?.remove();
      }
    });

    document.querySelectorAll('.result-card .meta').forEach((meta) => {
      if (/가격 확인|원대/.test(meta.textContent.trim())) meta.remove();
    });

    document.querySelectorAll('.participant-copy span').forEach((element) => {
      const cleaned = element.textContent
        .split(' · ')
        .filter((part) => !/^(1만원 이하|1~2만원|2만원 이상)$/.test(part.trim()))
        .join(' · ');
      if (element.textContent !== cleaned) element.textContent = cleaned;
    });
  }

  function updateRadiusCopy() {
    const replacements = [
      ['반경 2km', '반경 1km'],
      ['2km 검색', '1km 검색'],
      ['현재 위치 반경 2km', '현재 위치 반경 1km'],
      ['위치 조건', '1km 위치 조건'],
    ];

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      let value = node.nodeValue;
      for (const [from, to] of replacements) value = value.replaceAll(from, to);
      if (value !== node.nodeValue) node.nodeValue = value;
    }
  }

  function cleanupUi() {
    cleanupScheduled = false;
    removePriceFields();
    updateRadiusCopy();
  }

  function scheduleCleanup() {
    if (cleanupScheduled) return;
    cleanupScheduled = true;
    queueMicrotask(cleanupUi);
  }

  new MutationObserver(scheduleCleanup).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  document.addEventListener('DOMContentLoaded', scheduleCleanup, { once: true });

  window.fetch = async (input, init = {}) => {
    const requestUrl = typeof input === 'string' || input instanceof URL
      ? new URL(input, location.origin)
      : new URL(input.url, location.origin);
    const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

    if (requestUrl.pathname !== '/api/restaurants' || method !== 'POST') {
      return nativeFetch(input, init);
    }

    let requestBody = {};
    try {
      const rawBody = init.body || (input instanceof Request ? await input.clone().text() : '');
      requestBody = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      requestBody = {};
    }

    const signature = JSON.stringify({
      coords: requestBody.coords || null,
      locationText: requestBody.locationText || '',
      categories: requestBody.categories || [],
      hangover: Boolean(requestBody.hangover),
      companion: requestBody.companion || '',
    });

    const response = await nativeFetch(input, init);
    if (!response.ok) return response;

    let data;
    try {
      data = await response.clone().json();
    } catch {
      return response;
    }

    if (!Array.isArray(data.items) || data.items.length <= 1) return response;

    const safePool = filterPoolForCompanion(data.items, requestBody.companion || '');
    data.items = diversify(safePool, signature);
    data.poolSize = data.items.length;
    data.reroll = {
      enabled: data.items.length > 1,
      poolSize: data.items.length,
      searchRadiusM: 1000,
      shownIds: data.items.slice(0, 5).map(itemId),
    };

    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.set('cache-control', 'no-store');
    scheduleCleanup();
    return new Response(JSON.stringify(data), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
})();