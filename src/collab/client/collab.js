import {exampleSetup} from "prosemirror-example-setup";
import {Step} from "prosemirror-transform";
import {EditorState} from "prosemirror-state";
import {EditorView} from "prosemirror-view";
import {collab, receiveTransaction, sendableSteps, getVersion} from "prosemirror-collab";

import {schema} from "../schema";
import {GET, POST} from "./http";

function badVersion(err) {
  return err.status === 400 && /invalid version/i.test(err);
}

class State {
  constructor(edit, comm) {
    this.edit = edit;
    this.comm = comm;
  }
}

const URL = "/api-collab/docs/Example";

class EditorConnection {
  constructor(id) {
    this.id = id;
    this.url = URL;
    this.state = new State(null, "start");
    this.request = null;
    this.backOff = 0;
    this.view = null;
    this.reqCtrl = new AbortController();
    this.dispatch = this.dispatch.bind(this);
    this.start();
  }

  // All state changes go through this
  dispatch(action) {
    let newEditState = null;

    if (action.type === 'loaded') {
      let editState = EditorState.create({
        doc: action.doc,
        plugins: exampleSetup({ schema }).concat([
          collab({ version: action.version }),
        ]),
      });

      this.state = new State(editState, "poll");
      this.poll();
    } else if (action.type === 'restart') {
      this.state = new State(null, 'start');
      this.start();
    } else if (action.type === "poll") {
      this.state = new State(this.state.edit, "poll");
      this.poll();
    } else if (action.type === "recover") {
      if (action.error.status && action.error.status < 500) {
        this.state = new State(null, null);
      } else {
        this.state = new State(this.state.edit, "recover");
        this.recover(action.error);
      }
    } else if (action.type === "transaction") {
      newEditState = this.state.edit.apply(action.transaction);
    }

    if (newEditState) {
      let sendable;

      if (newEditState.doc.content.size > 40000) {
        this.state = new State(newEditState, "detached");
      } else if ((this.state.comm === "poll" || action.requestDone) && (sendable = this.sendable(newEditState))) {
        this.closeRequest();
        this.state = new State(newEditState, "send");
        this.send(newEditState, sendable);
      } else if (action.requestDone) {
        this.state = new State(newEditState, "poll");
        this.poll();
      } else {
        this.state = new State(newEditState, this.state.comm);
      }
    }

    // Sync the editor with this.state.edit
    if (this.state.edit) {
      if (this.view) {
        this.view.updateState(this.state.edit);
      } else {
        this.setView(new EditorView(document.querySelector("#editor"), {
          state: this.state.edit,
          dispatchTransaction: transaction => this.dispatch({ type: 'transaction', transaction }),
        }));
      }
    } else {
      this.setView(null);
    }
  }

  // Load the document from the server and start up
  start() {
    this.run(GET(`${this.url}?cardId=${this.id}`)).then(data => {
      this.backOff = 0;
      this.dispatch({
        type: 'loaded',
        doc: schema.nodeFromJSON(data.doc),
        version: data.version,
        users: data.users,
      });
    }, err => {
      // this.report.failure(err)
    });
  }

  // Send a request for events that have happened since the version
  // of the document that the client knows about. This request waits
  // for a new version of the document to be created if the client
  // is already up-to-date.
  poll() {
    let query = `version=${getVersion(this.state.edit)}&cardId=${this.id}`;

    this.run(GET(`${this.url}/events?${query}`)).then(data => {
      this.backOff = 0;

      if (data.steps && (data.steps.length)) {
        let tr = receiveTransaction(this.state.edit, data.steps.map(j => Step.fromJSON(schema, j)), data.clientIDs);
        this.dispatch({type: "transaction", transaction: tr, requestDone: true});
      } else {
        this.poll();
      }
    }, err => {
      if (err.status === 410 || badVersion(err)) {
        // Too far behind. Revert to server state
        // this.report.failure(err)
        this.dispatch({type: "restart"});
      } else if (err) {
        this.dispatch({type: "recover", error: err});
      }
    });
  }

  sendable(editState) {
    let steps = sendableSteps(editState);
    if (steps) {
      return { steps };
    }
  }

  // Send the given steps to the server
  send(editState, {steps}) {
    let json = JSON.stringify({
      version: getVersion(editState),
      steps: steps ? steps.steps.map(s => s.toJSON()) : [],
      clientID: steps ? steps.clientID : 0,
      cardId: this.id,
    });

    this.run(POST(`${this.url}/events?cardId=${this.id}`, json, "application/json")).then(data => {
      this.backOff = 0;
      let tr = steps
          ? receiveTransaction(this.state.edit, steps.steps, repeat(steps.clientID, steps.steps.length))
          : this.state.edit.tr;

      this.dispatch({type: "transaction", transaction: tr, requestDone: true});
    }, err => {
      if (err.status === 409) {
        // The client's document conflicts with the server's version.
        // Poll for changes and then try again.
        this.backOff = 0;
        this.dispatch({type: "poll"});
      } else if (badVersion(err)) {
        this.dispatch({type: "restart"});
      } else {
        this.dispatch({type: "recover", error: err});
      }
    })
  }

  // Try to recover from an error
  recover(err) {
    this.backOff = this.backOff ? Math.min(this.backOff * 2, 6e4) : 200;
    setTimeout(() => {
      if (this.state.comm === 'recover') {
        this.dispatch({type: "poll"});
      }
    }, this.backOff);
  }

  closeRequest() {
    if (this.request) {
      this.request.abort()
      this.request = null
    }
  }

  run(request) {
    return this.request = request
  }

  close() {
    this.closeRequest()
    this.setView(null)
  }

  setView(view) {
    if (this.view) this.view.destroy()
    this.view = window.view = view
  }
}

function repeat(val, n) {
  let result = []
  for (let i = 0; i < n; i++) result.push(val)
  return result
}

export default EditorConnection;
