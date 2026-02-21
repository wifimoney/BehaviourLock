/**
 * Session state store + simple event emitter.
 */
const State = (() => {
  const _data = {
    sessionId: null,
    pipelineRunning: false,
    results: {
      graph: null,
      tests: null,
      baseline: null,
      risk: null,
      patch: null,
      validation: null,
      report: null,
      deadCode: null,
    },
  };

  const _listeners = {};

  function on(event, fn) {
    (_listeners[event] ||= []).push(fn);
  }

  function emit(event, payload) {
    (_listeners[event] || []).forEach(fn => fn(payload));
  }

  function setSession(id) {
    _data.sessionId = id;
    emit('session', id);
  }

  function getSession() {
    return _data.sessionId;
  }

  function setPipelineRunning(v) {
    _data.pipelineRunning = v;
    emit('pipelineRunning', v);
  }

  function isPipelineRunning() {
    return _data.pipelineRunning;
  }

  function setResult(key, val) {
    _data.results[key] = val;
    emit(`result:${key}`, val);
  }

  function getResult(key) {
    return _data.results[key];
  }

  return { on, emit, setSession, getSession, setPipelineRunning, isPipelineRunning, setResult, getResult };
})();
