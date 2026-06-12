#!/usr/bin/env node
"use strict";

const { runCli } = require("./lib/thinking_protocol_validator");

process.exitCode = runCli(process.argv.slice(2));
