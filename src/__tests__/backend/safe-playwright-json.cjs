/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");
const JSONReporter = require(path.join(path.dirname(require.resolve("playwright/package.json")), "lib/reporters/json.js")).default;
const { safeEvidence } = require("./safe-evidence.cjs");

// Keep Playwright's canonical schema and counters; sanitize the serialized value
// before its one and only output write. The installed reporter API is regression-tested.
module.exports = class SafeJSONReporter extends JSONReporter {
  _serializeReport(result) { return safeEvidence(super._serializeReport(result)); }
};
