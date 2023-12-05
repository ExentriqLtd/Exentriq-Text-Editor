import { Meteor } from 'meteor/meteor';
import { startServer } from '../src/devserver';

Meteor.startup(() => {
  // code to run on server at startup
    WebApp.connectHandlers.use('/api-collab/docs/Example', (req, res, next) => {
        req.url = '/api-collab/docs/Example' + req.url;
        startServer(req, res);
    });

    WebApp.connectHandlers.use('/api-collab/docs/Example/events', (req, res, next) => {
        req.url = '/api-collab/docs/Example/events' + req.url;
        startServer(req, res);
    });
});
