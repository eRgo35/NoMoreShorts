(function () {
  const SHORTS_RE = /^https?:\/\/(?:www\.)?youtube\.com\/shorts\/([^/?#]+)\/?(?:[?#].*)?$/;
  const TARGET_BASE = "https://www.youtube.com/watch?v=";

  function redirectIfShort(url) {
    if (typeof url !== "string") return false;
    const m = SHORTS_RE.exec(url);
    if (!m) return false;
    const target = TARGET_BASE + m[1];
    if (url === target) return false; // guard: don't redirect to ourselves
    location.replace(target);
    return true;
  }

  const origPush = history.pushState;
  history.pushState = function (state, title, url) {
    if (url !== undefined && redirectIfShort(String(url))) {
      return undefined; // caller sees the call as a no-op; navigation has begun
    }
    return origPush.apply(this, arguments);
  };

  const origReplace = history.replaceState;
  history.replaceState = function (state, title, url) {
    if (url !== undefined && redirectIfShort(String(url))) {
      return undefined;
    }
    return origReplace.apply(this, arguments);
  };

  window.addEventListener("popstate", () => {
    redirectIfShort(location.href);
  });
})();
