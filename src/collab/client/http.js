// A simple wrapper for XHR.
export function req({ url, ...options }) {
  const reqCtrl = new AbortController();
  let aborted = false;
  const result = new Promise((resolve, reject) => {
    return fetch(url, {
      signal: reqCtrl.signal,
      ...options,
    })
        .then(result => result.json())
        .then(resolve)
        .catch(reject);
  });

  result.abort = () => {
    if (!aborted) {
      reqCtrl.abort();
      aborted = true
    }
  }
  return result;
}

export function GET(url) {
  return req({url, method: "GET"})
}

export function POST(url, body, type) {
  return req({url, method: "POST", body, headers: {"Content-Type": type}})
}
