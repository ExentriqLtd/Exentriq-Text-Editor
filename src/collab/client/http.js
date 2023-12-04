// A simple wrapper for XHR.
export function req({ url, ...options }) {
  const reqCtrl = new AbortController();
  let aborted = false;
  const result = new Promise((resolve, reject) => {
    return fetch(url, {
      signal: reqCtrl.signal,
      ...options,
    })
        .then(result => {
            if (result.status < 400) {
                return resolve(result.json());
            } else {
                let err = new Error("Request failed: " + result.statusText)
                err.status = result.status
                return reject(err);
            }
        })
        .catch((error) => {
            // error
        });
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
