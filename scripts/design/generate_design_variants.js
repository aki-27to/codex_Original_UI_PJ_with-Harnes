#!/usr/bin/env node
"use strict";

const { main } = require("./design_quality_operator");

main(process.argv.slice(2).length ? process.argv.slice(2) : ["generate", "--skip-screenshots"]);
