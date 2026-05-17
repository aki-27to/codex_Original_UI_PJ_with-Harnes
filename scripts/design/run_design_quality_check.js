#!/usr/bin/env node
"use strict";

const { main } = require("./design_quality_operator");

// Preserve the command name users expect while delegating to the operator CLI.
main(process.argv.slice(2).length ? process.argv.slice(2) : ["run", "--require-screenshots"]);
