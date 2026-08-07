(() => {
  let queued = false;

  function patchCopy() {
    queued = false;
    document.querySelectorAll('button[data-eat]').forEach((button) => {
      if (button.textContent.trim() === '오늘 먹었어요') {
        button.textContent = '이걸로 먹을게요';
        button.setAttribute('aria-label', '이 식당으로 결정');
      }
    });
  }

  function queuePatch() {
    if (queued) return;
    queued = true;
    queueMicrotask(patchCopy);
  }

  new MutationObserver(queuePatch).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  document.addEventListener('DOMContentLoaded', queuePatch, { once: true });
})();
