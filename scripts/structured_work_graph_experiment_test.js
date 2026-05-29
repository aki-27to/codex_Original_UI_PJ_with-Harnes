#!/usr/bin/env node
"use strict";

const assert = require("assert");
const {
  deriveReadyWork,
  loadStructuredWorkGraphExperiment,
  validateStructuredWorkGraph,
} = require("./lib/structured_work_graph");

function main() {
  const graph = loadStructuredWorkGraphExperiment();
  assert.strictEqual(graph.schema, "structured-work-graph-experiment.v1", "graph schema mismatch");
  validateStructuredWorkGraph(graph);
  assert(graph.tasks.length >= 3 && graph.tasks.length <= 5, "experiment must stay small");
  assert.strictEqual(graph.successMetric, "ready_work_selection", "experiment must optimize ready work selection");
  for (const state of graph.sampleStates) {
    assert.deepStrictEqual(
      deriveReadyWork(graph, state.done),
      state.expectedReady,
      `ready work mismatch for ${state.id}`
    );
  }
  console.log("PASS structured_work_graph_experiment_test");
}

main();
