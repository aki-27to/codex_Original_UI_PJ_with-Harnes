"use strict";

const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..", "..");
const defaultExperimentPath = path.join(workspaceRoot, "scripts", "config", "structured_work_graph_experiment.json");

function loadStructuredWorkGraphExperiment(filePath = defaultExperimentPath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function uniqueStrings(values) {
  const out = [];
  for (const value of Array.isArray(values) ? values : []) {
    const text = String(value || "").trim();
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}

function validateStructuredWorkGraph(graph) {
  if (!graph || graph.schema !== "structured-work-graph-experiment.v1") {
    throw new Error("structured work graph schema mismatch");
  }
  const tasks = Array.isArray(graph.tasks) ? graph.tasks : [];
  if (!tasks.length) throw new Error("structured work graph has no tasks");
  if (tasks.length > Number(graph.maxTaskCount || 5)) throw new Error("structured work graph exceeds maxTaskCount");
  const ids = tasks.map((task) => String(task && task.id || "").trim());
  if (ids.some((id) => !id)) throw new Error("structured work graph task missing id");
  if (new Set(ids).size !== ids.length) throw new Error("structured work graph task ids must be unique");
  const idSet = new Set(ids);
  for (const task of tasks) {
    for (const dependency of Array.isArray(task.dependsOn) ? task.dependsOn : []) {
      if (!idSet.has(dependency)) throw new Error(`unknown dependency ${dependency} for ${task.id}`);
    }
  }
  for (const id of ids) {
    const visiting = new Set();
    const visited = new Set();
    function visit(taskId) {
      if (visiting.has(taskId)) throw new Error(`cycle detected at ${taskId}`);
      if (visited.has(taskId)) return;
      visiting.add(taskId);
      const task = tasks.find((entry) => entry.id === taskId);
      for (const dependency of Array.isArray(task && task.dependsOn) ? task.dependsOn : []) visit(dependency);
      visiting.delete(taskId);
      visited.add(taskId);
    }
    visit(id);
  }
  return true;
}

function deriveReadyWork(graph, done = []) {
  validateStructuredWorkGraph(graph);
  const doneSet = new Set(uniqueStrings(done));
  return graph.tasks
    .filter((task) => !doneSet.has(task.id))
    .filter((task) => (Array.isArray(task.dependsOn) ? task.dependsOn : []).every((dependency) => doneSet.has(dependency)))
    .map((task) => task.id);
}

module.exports = {
  defaultExperimentPath,
  deriveReadyWork,
  loadStructuredWorkGraphExperiment,
  validateStructuredWorkGraph,
};
