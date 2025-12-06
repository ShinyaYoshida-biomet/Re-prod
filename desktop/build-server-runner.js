#!/usr/bin/env node
const path = require("node:path");

// Resolve script relative to this file so it works regardless of CWD.
const target = path.join(__dirname, "scripts", "build-server.js");
require(target);
