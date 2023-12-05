import { Meteor } from 'meteor/meteor';
import { startServer } from '../src/devserver';

Meteor.startup(() => {
  // code to run on server at startup
    WebApp.connectHandlers.use('/collab-backend/docs/Example', (req, res, next) => {
        console.log('trigger', req.url);

        req.url = '/collab-backend/docs/Example' + req.url;
        startServer(req, res);
    });

    WebApp.connectHandlers.use('/collab-backend/docs/Example/events', (req, res, next) => {
        console.log('trigger', req.url);

        req.url = '/collab-backend/docs/Example/events' + req.url;
        startServer(req, res);
    });
});
