import { handleCollabRequest } from './collab/server/server';

const startServer = (req, resp) => {
  console.log('checke!!');
  let url = req.url,
      backend = url.replace(/\/api-collab\b/, '');

  if (backend !== url) {
    req.url = backend;

    if (handleCollabRequest(req, resp)) {
      return true;
    }
    req.url = url;
  }

  return false;
};

export {
  startServer,
};
