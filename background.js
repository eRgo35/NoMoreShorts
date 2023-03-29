let pattern = /^https?:\/\/(www\.)?youtube\.com\/shorts\/[^/]+$/;
const target = "https://youtube.com/watch?v=";
const id = /(?<=shorts\/)[^/]+/;

function redirect(details) {
  const { tabId, url } = details;
  const isShort = url.match(pattern);
  const shortId = url.match(id);
  if (isShort && shortId) {
    const newUrl = target + shortId[0];
    console.log("YouTube Short found! Exterminate!");
    browser.tabs.update(tabId, { url: newUrl });
  }
}

browser.webRequest.onBeforeRequest.addListener(
  redirect,
  {urls: ['*://*.youtube.com/shorts/*']},
  ["blocking"]
);

browser.webNavigation.onHistoryStateUpdated.addListener(
  redirect,
  { url: [{ urlMatches: 'https://www.youtube.com/*' }] }
);
