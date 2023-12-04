const { schema } = require('../schema');
const db = require('./db');

const MAX_STEP_HISTORY = 10000;

// A collaborative editing document instance.
class Instance {
  constructor(id, version, doc) {
    this.id = id;
    this.doc = doc || schema.node("doc", null, [schema.node("paragraph", null, [
      schema.text("This is a collaborative test document. Start editing to make it more interesting!")
    ])]);
    // The version number of the document instance.
    this.version = version;
    this.steps = [];
    this.lastActive = Date.now();
    this.users = Object.create(null);
    this.userCount = 0;
    this.waiting = [];
    this.isUpdated = false;

    this.collecting = null;
  }

  stop() {
    if (this.collecting != null) {
      clearInterval(this.collecting);
    }
  }

  addEvents(version, steps, clientID) {
    this.checkVersion(version);
    if (this.version !== version) {
      return false;
    }
    let doc = this.doc;

    for (let i = 0; i < steps.length; i++) {
      steps[i].clientID = clientID;
      let result = steps[i].apply(doc);
      doc = result.doc;
    }

    this.doc = doc;
    this.version += steps.length;
    this.steps = this.steps.concat(steps);
    this.isUpdated = true;

    if (this.steps.length > MAX_STEP_HISTORY) {
      this.steps = this.steps.slice(this.steps.length - MAX_STEP_HISTORY);
    }

    this.sendUpdates();
    scheduleSave();
    return { version: this.version };
  }

  sendUpdates() {
    while (this.waiting.length) {
      this.waiting.pop().finish();
    }
  }

  // : (Number)
  // Check if a document version number relates to an existing
  // document version.
  checkVersion(version) {
    if (version < 0 || version > this.version) {
      let err = new Error("Invalid version " + version);
      err.status = 400;
      throw err;
    }
  }

  // : (Number, Number)
  // Get events between a given document version and
  // the current document version.
  getEvents(version) {
    this.checkVersion(version);
    let startIndex = this.steps.length - (this.version - version);

    if (startIndex < 0) {
      return false;
    }

    return {
      steps: this.steps.slice(startIndex),
      users: this.userCount,
    };
  }

  collectUsers() {
    const oldUserCount = this.userCount;
    this.users = Object.create(null);
    this.userCount = 0;
    this.collecting = null;

    for (let i = 0; i < this.waiting.length; i++) {
      this._registerUser(this.waiting[i].ip);
    }

    if (this.userCount !== oldUserCount) {
      this.sendUpdates();
    }
  }

  registerUser(ip) {
    if (!(ip in this.users)) {
      this._registerUser(ip);
      this.sendUpdates();
    }
  }

  _registerUser(ip) {
    if (!(ip in this.users)) {
      this.users[ip] = true;
      this.userCount++;

      if (this.collecting == null) {
        this.collecting = setTimeout(() => this.collectUsers(), 5000);
      }
    }
  }
}

const instances = Object.create(null);
const saveEvery = 5_000;
let saveTimeout = null;

function scheduleSave() {
  if (saveTimeout != null) {
    return;
  }
  saveTimeout = setTimeout(doSave, saveEvery);
}

function doSave() {
  saveTimeout = null;
  const out = {};

  for (const prop in instances) {
    const inst = instances[prop];

    if (inst.isUpdated) {
      out[prop] = {
        doc: inst.doc.toJSON(),
      };
      inst.isUpdated = false;

      db().collection('entity').updateOne(
        { _id: inst.id },
        {
          $set: {
            'meta.description': inst.doc.textContent,
            'meta.descriptionMeta.doc': inst.doc.toJSON(),
            'meta.descriptionMeta.version': inst.version,
          },
        },
      );
    }
  }
}

async function getInstance(id, ip) {
  let inst = instances[id] || await newInstance(id);

  if (ip) {
    inst.registerUser(ip);
  }

  inst.lastActive = Date.now();
  return inst;
}

exports.getInstance = getInstance;

async function newInstance(id) {
  // TODO: handle properly
  const result = await db().collection('entity')
    .findOne(
      { _id: id },
      {
        projection: {
          'meta.descriptionMeta.doc': 1,
          'meta.descriptionMeta.version': 1,
        }
      }
    );
  const doc = result?.meta.descriptionMeta?.doc;
  const version = result?.meta.descriptionMeta?.version || 0;

  return instances[id] = await new Instance(id, version, schema.nodeFromJSON(doc));
}

function instanceInfo() {
  console.log('=== instance info ===');
  let found = [];
  for (let id in instances) {
    found.push({id: id, users: instances[id].userCount})
  }
  return found;
}

exports.instanceInfo = instanceInfo;

// TODO: clean up abandoned instances.
// right now the problem is that when it's cleaned the new one is not picked up

// clean abandoned instances
// setInterval(() => {
//   for (const prop in instances) {
//     const inst = instances[prop];
//
//     // if the description was not updated for more then 5 minutes - remove it
//     if (inst.lastActive + 1_000 * 10 < Date.now()) {
//       delete instances[prop];
//       console.log('== deleted ==');
//     }
//   }
// }, 1_000 * 10);

