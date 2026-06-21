'use strict';

/** Programmatic entry point for SHARIL. */
module.exports = {
  config: require('./config'),
  state: require('./state'),
  transcript: require('./transcript'),
  khazanah: require('./khazanah'),
  capture: require('./capture'),
  llm: require('./llm'),
  heuristic: require('./heuristic'),
  alfred: require('./alfred'),
  util: require('./util'),
};
