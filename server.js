"use strict";

const implementation = require("./server_impl");

module.exports = implementation;

if (require.main === module) {
  implementation.runHarnessServerCli();
}
