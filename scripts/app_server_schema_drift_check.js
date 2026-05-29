#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const contractPath = path.join(workspaceRoot, "scripts", "config", "app_server_schema_contract.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}

function routeNeedle(route) {
  return route.path || route.pathPrefix || "";
}

function assertRoutePresent(route) {
  const source = readText(route.source);
  const needle = routeNeedle(route);
  assert(needle, `route ${route.id} must define path or pathPrefix`);
  assert(source.includes(`method: "${route.method}"`), `${route.id} missing method ${route.method} in ${route.source}`);
  assert(source.includes(needle), `${route.id} missing route path ${needle} in ${route.source}`);
}

function discoverRouteStrings() {
  const routeRoot = path.join(workspaceRoot, "server", "routes");
  const rows = [];
  for (const fileName of fs.readdirSync(routeRoot)) {
    if (!fileName.endsWith(".js")) continue;
    const relative = `server/routes/${fileName}`;
    const source = readText(relative);
    const methodMatches = [...source.matchAll(/method:\s*"([A-Z]+)"/g)].map((match) => match[1]);
    const pathMatches = [
      ...source.matchAll(/pathname\s*===\s*"([^"]+)"/g),
      ...source.matchAll(/pathname\.startsWith\("([^"]+)"\)/g),
    ].map((match) => match[1]);
    const count = Math.max(methodMatches.length, pathMatches.length);
    for (let index = 0; index < count; index += 1) {
      rows.push({
        source: relative,
        method: methodMatches[index] || "",
        path: pathMatches[index] || "",
      });
    }
  }
  return rows;
}

function buildReport({ writeReport }) {
  const contract = readJson(contractPath);
  assert.strictEqual(contract.schema, "app-server-schema-contract.v1", "app server schema contract mismatch");
  const allRoutes = [
    ...contract.primaryRoutes,
    ...contract.expectedRoutes,
  ];
  for (const route of allRoutes) {
    assertRoutePresent(route);
  }
  const handlerSource = readText(contract.requestHandler.source);
  for (const factoryName of contract.requestHandler.requiredRouteFactories) {
    assert(handlerSource.includes(factoryName), `request handler missing route factory ${factoryName}`);
  }
  assert(handlerSource.includes("Unknown API route"), "request handler must keep explicit unknown API route behavior");
  const forbiddenMatches = [];
  const scanTargets = [
    "server/request_handler.js",
    "server_impl.js",
    ...fs.readdirSync(path.join(workspaceRoot, "server", "routes")).filter((name) => name.endsWith(".js")).map((name) => `server/routes/${name}`),
  ];
  for (const relativePath of scanTargets) {
    const source = readText(relativePath).toLowerCase();
    for (const pattern of contract.forbiddenRoutePatterns) {
      if (source.includes(String(pattern).toLowerCase())) {
        forbiddenMatches.push({ relativePath, pattern });
      }
    }
  }
  assert.deepStrictEqual(forbiddenMatches, [], "forbidden route pattern found");
  const discoveredRoutes = discoverRouteStrings();
  const report = {
    schema: "app-server-schema-drift-report.v1",
    generatedAt: new Date().toISOString(),
    status: "PASS",
    contract: "scripts/config/app_server_schema_contract.json",
    primaryRouteCount: contract.primaryRoutes.length,
    expectedRouteCount: allRoutes.length,
    discoveredRouteCount: discoveredRoutes.length,
    discoveredRoutes,
  };
  if (writeReport) {
    const reportPath = path.join(workspaceRoot, contract.reportArtifact);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  return report;
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const report = buildReport({ writeReport: !checkOnly });
  console.log(`[app-server-schema-drift] status=${report.status} primary=${report.primaryRouteCount} discovered=${report.discoveredRouteCount}`);
  console.log("PASS app_server_schema_drift_check");
}

try {
  main();
} catch (error) {
  console.error(`FAIL app_server_schema_drift_check: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
