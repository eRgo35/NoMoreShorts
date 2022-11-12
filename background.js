let pattern = /.*:\/\/.*\.youtube\.com\/shorts\/.*/gm;
const target = "https://youtube.com/watch?v=";
const id = /(?<=shorts\/).*/gm;

function redirect(requestDetails) {
  // console.log(`Loading: ${requestDetails.url}`);
  const isShort = requestDetails.url.match(pattern);
  const shortId = requestDetails.url.match(id)[0];
  const newUrl = target + shortId;
  console.log(isShort, " /// ", shortId, " /// ", newUrl);
  if (isShort) {
    console.log("YouTube Short found! Exterminate!");
    return { redirectUrl: newUrl };
  }
}

browser.webRequest.onBeforeRequest.addListener(
  redirect,
  {urls: ['<all_urls>']},
  ["blocking"]
);