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

  // YouTube's SPA often calls history.pushState with a *relative* URL like
  // "/shorts/<id>". The pushState `url` argument then doesn't match our
  // absolute URL regex. After pushState returns, however, location.href
  // always reflects the resolved absolute URL. So we let the original call
  // happen, then check location.href. This catches both absolute and
  // relative pushState URL arguments.
  const origPush = history.pushState;
  history.pushState = function (_state, _title, _url) {
    const result = origPush.apply(this, arguments);
    if (redirectIfShort(location.href)) return undefined;
    return result;
  };

  const origReplace = history.replaceState;
  history.replaceState = function (_state, _title, _url) {
    const result = origReplace.apply(this, arguments);
    if (redirectIfShort(location.href)) return undefined;
    return result;
  };

  window.addEventListener("popstate", () => {
    redirectIfShort(location.href);
  });
})();