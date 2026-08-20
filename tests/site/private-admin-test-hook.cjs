"use strict";

const fs = require("node:fs");
const { syncBuiltinESMExports } = require("node:module");

const originalReadFileSync = fs.readFileSync;

fs.readFileSync = function readConsteraTestFile(path, ...args) {
  if (path === "admin.html") {
    return originalReadFileSync.call(this, "private/admin.html", ...args);
  }
  return originalReadFileSync.call(this, path, ...args);
};

// Existing ESM site tests import readFileSync as a named builtin export.
// Synchronize that binding after the CommonJS preload applies the test-only mapping.
syncBuiltinESMExports();
