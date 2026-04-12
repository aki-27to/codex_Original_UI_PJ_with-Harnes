"use strict";

const path = require("path");

function resolveServerImplementationPath(workspaceRoot) {
  const root = path.resolve(workspaceRoot || path.join(__dirname, "..", ".."));
  const serverModule = require(path.join(root, "server.js"));
  const implementationPath =
    serverModule && typeof serverModule.__implementationPath === "string"
      ? serverModule.__implementationPath
      : path.join(root, "server.js");
  return {
    wrapperPath: path.join(root, "server.js"),
    implementationPath,
  };
}

module.exports = {
  resolveServerImplementationPath,
};
