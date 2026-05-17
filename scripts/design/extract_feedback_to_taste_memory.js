#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..", "..");

function argValue(name) {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function main() {
  const feedback = String(argValue("feedback") || "").trim();
  const decisionPath = path.resolve(workspaceRoot, argValue("decision") || path.join("web", "design-quality", "latest", "decision.json"));
  if (!feedback) {
    console.error("feedback is required. Use --feedback \"A is closer...\"");
    process.exit(1);
  }
  const decision = readJson(decisionPath);
  const candidate = {
    schema: "taste-memory-candidate.v1",
    generatedAt: new Date().toISOString(),
    sourceDecision: path.relative(workspaceRoot, decisionPath).replace(/\\/g, "/"),
    target: decision.target || {},
    rawFeedback: feedback,
    proposedSignals: [
      {
        type: "preference",
        text: `User feedback for ${decision.recommendation && decision.recommendation.label ? decision.recommendation.label : "recommended candidate"}: ${feedback}`
      }
    ],
    applyPolicy: "Do not auto-persist. Review this candidate before merging into default_user_taste_memory.json or anti_taste_memory.json."
  };
  const outPath = path.resolve(workspaceRoot, argValue("out") || path.join("web", "design-quality", "latest", "taste-memory-candidate.json"));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
  fs.mkdirSync(path.join(workspaceRoot, "logs"), { recursive: true });
  fs.appendFileSync(path.join(workspaceRoot, "logs", "design_feedback.jsonl"), `${JSON.stringify({
    event: "design_feedback_candidate",
    at: candidate.generatedAt,
    decision: candidate.sourceDecision,
    feedback,
  })}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, outPath }, null, 2));
}

main();
