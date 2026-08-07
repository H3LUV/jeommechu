(() => {
  const nativeFetch = window.fetch.bind(window);
  let activeSignature = '';
  let cycleSeen = new Set();
  let lastShown = new Set();
  let cleanupScheduled = false;

  function itemId(item) {
    return String(item?.id || `${item?.name || ''}:${item?.address || ''}`);
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

    data.items = diversify(data.items, signature);
    data.reroll = {
      enabled: true,
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