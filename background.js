const FALLBACK_RULE_ID = 100;

const fallbackRule = {
  id: FALLBACK_RULE_ID,
  priority: 2,
  action: {
    type: "redirect",
    redirect: {
      regexSubstitution: "https://www.youtube.com/watch?v=\\1",
    },
  },
  condition: {
    regexFilter: "^https?://(?:www\\.)?youtube\\.com/shorts/([^/?#]+)/?$",
    resourceTypes: ["main_frame", "sub_frame"],
  },
};

function getDNR() {
  if (typeof chrome !== "undefined" && chrome.declarativeNetRequest) {
    return chrome.declarativeNetRequest;
  }
  if (typeof browser !== "undefined" && browser.declarativeNetRequest) {
    return browser.declarativeNetRequest;
  }
  throw new Error("NoMoreShorts: declarativeNetRequest API unavailable");
}

async function registerFallbackRules() {
  const dnr = getDNR();
  const existing = await dnr.getDynamicRules();
  if (existing.some((r) => r.id === FALLBACK_RULE_ID)) return;
  await dnr.updateDynamicRules({
    addRules: [fallbackRule],
    removeRuleIds: [],
  });
}

function onInstalled() {
  registerFallbackRules().catch((err) => {
    console.error("NoMoreShorts: fallback rule registration failed", err);
  });
}

if (typeof chrome !== "undefined" && chrome.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener(onInstalled);
} else if (typeof browser !== "undefined" && browser.runtime?.onInstalled) {
  browser.runtime.onInstalled.addListener(onInstalled);
}
