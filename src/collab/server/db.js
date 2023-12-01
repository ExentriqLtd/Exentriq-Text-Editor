const { MongoClient } = require('mongodb');

// Connection URL
const url = 'mongodb://127.0.0.1:27017';
const client = new MongoClient(url);
const dbName = 'ema-boards';

let db = null;

(async () => {
    const conn = await client.connect();
    db = conn.db(dbName);
})();

module.exports = () => db;
