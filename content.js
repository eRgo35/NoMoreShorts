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

  // YouTube is a SPA: navigation between Shorts and /watch pages happens
  // via history.pushState/replaceState without firing a network request,
  // so the declarativeNetRequest rule never sees it. We need to detect
  // SPA navigations from the content script.
  //
  // Approach: observe mutations on the document. YouTube's React app
  // mutates the DOM on every navigation, and location.href is shared
  // between the page world and content scripts. When the URL becomes a
  // /shorts URL, force a navigation to /watch?v=<id>.
  //
  // This works from the ISOLATED world (default content_scripts world)
  // because location.href is shared, unlike the history object whose
  // pushState method is not shared across worlds in Chrome MV3. So we
  // don't need `world: "MAIN"` (which would force a Firefox 128+ floor
  // instead of the current 115+).
  let lastUrl = location.href;
  redirectIfShort(lastUrl);

  const observer = new MutationObserver(() => {
    const current = location.href;
    if (current === lastUrl) return;
    lastUrl = current;
    redirectIfShort(current);
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        observer.observe(document.body, { childList: true, subtree: true });
      },
      { once: true },
    );
  }

  // Backstop: popstate fires for back/forward navigation in some SPA
  // setups. YouTube uses history.pushState rather than hashchange or
  // popstate for its SPA transitions, so this is mostly belt-and-braces.
  window.addEventListener("popstate", () => {
    redirectIfShort(location.href);
  });

  // Clean up on tab close so we don't leak observers.
  window.addEventListener(
    "pagehide",
    () => observer.disconnect(),
    { once: true },
  );
})();