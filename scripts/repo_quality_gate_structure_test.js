#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const packageJson = require(path.join(workspaceRoot, "package.json"));
const runnerSource = fs.readFileSync(path.join(workspaceRoot, "scripts", "run_repo_quality_gate.js"), "utf8");

function main() {
  const scripts = packageJson.scripts || {};
  const repoQuality = String(scripts["test:repo-quality"] || "");
  const governance = String(scripts["test:repo-quality:governance"] || "");
  const runtime = String(scripts["test:repo-quality:runtime"] || "");
  const surfaces = String(scripts["test:repo-quality:surfaces"] || "");
  const baselineComparison = String(scripts["test:baseline-comparison"] || "");
  const baselineArtifact = String(scripts["artifact:baseline-comparison"] || "");
  const reviewerBaselineComparison = String(scripts["reviewer:baseline-comparison"] || "");
  const currentSurfaceTruth = String(scripts["current-surface-truth"] || "");
  const artifactCurrentSurfaces = String(scripts["artifact:current-surfaces"] || "");
  const repoLocalSkills = String(scripts["test:repo-local-skills"] || "");
  const repoPreflight = String(scripts["repo:preflight"] || "");
  const repoPreflightDiagnose = String(scripts["repo:preflight:diagnose"] || "");
  const repoCloseout = String(scripts["repo:closeout"] || "");
  const repoCloseoutDiagnose = String(scripts["repo:closeout:diagnose"] || "");
  const repoStartClean = String(scripts["repo:start-clean"] || "");
  const repoStartCleanDryRun = String(scripts["repo:start-clean:dry-run"] || "");
  const repoSessionGuard = String(scripts["test:repo-session-guard"] || "");
  const harnessArtifactMcp = String(scripts["test:harness-artifact-mcp"] || "");
  const mcpToolRegistryAlignment = String(scripts["test:mcp-tool-registry-alignment"] || "");
  assert(
    repoQuality.includes("node scripts/run_repo_quality_gate.js"),
    "repo-quality must route through the stage runner"
  );
  assert(
    governance.includes("node scripts/run_repo_quality_gate.js governance"),
    "repo-quality governance script must route through the stage runner"
  );
  assert(
    runtime.includes("node scripts/run_repo_quality_gate.js runtime"),
    "repo-quality runtime script must route through the stage runner"
  );
  assert(
    surfaces.includes("node scripts/run_repo_quality_gate.js surfaces"),
    "repo-quality surfaces script must route through the stage runner"
  );
  assert(
    baselineArtifact.includes("node scripts/generate_baseline_comparison.js"),
    "artifact:baseline-comparison must regenerate the comparison report from the current signoff bundle"
  );
  assert(
    baselineComparison.includes("artifact:baseline-comparison") && baselineComparison.includes("node scripts/baseline_comparison_test.js"),
    "test:baseline-comparison must refresh the comparison report and then run the dedicated baseline comparison test"
  );
  assert(
    reviewerBaselineComparison.includes("npm run test:baseline-comparison"),
    "reviewer:baseline-comparison must stay a reviewer-first alias for the baseline comparison refresh+test flow"
  );
  assert(
    currentSurfaceTruth.includes("node scripts/current_surface_truth_test.js"),
    "current-surface-truth must stay available as an explicit script entrypoint"
  );
  assert(
    artifactCurrentSurfaces.includes("node scripts/current_surface_truth_test.js --refresh"),
    "artifact:current-surfaces must be the explicit mutating current-surface refresh entrypoint"
  );
  assert(
    repoLocalSkills.includes("node scripts/repo_local_skill_catalog_test.js"),
    "test:repo-local-skills must validate repo-local skill catalog metadata and paths"
  );
  assert(
    repoLocalSkills.includes("node scripts/generated_skill_registry_guard_test.js"),
    "test:repo-local-skills must reject stale or archived generated skill registry entries from callable skill surfaces"
  );
  assert(
    repoLocalSkills.includes("node scripts/skill_flow_contract_test.js"),
    "test:repo-local-skills must validate skill flow routing, forbidden direct edges, and standalone/support coverage"
  );
  assert(
    repoPreflight.includes("node scripts/repo_session_preflight.js"),
    "repo:preflight must expose the clean-start session gate"
  );
  assert(
    repoPreflightDiagnose.includes("--allow-dirty"),
    "repo:preflight:diagnose must expose non-failing dirty-state inspection"
  );
  assert(
    repoCloseout.includes("node scripts/repo_session_closeout.js"),
    "repo:closeout must expose the clean-finish session gate"
  );
  assert(
    repoCloseoutDiagnose.includes("--allow-dirty"),
    "repo:closeout:diagnose must expose non-failing closeout inspection"
  );
  assert(
    repoStartClean.includes("node scripts/repo_session_autoclose.js"),
    "repo:start-clean must expose the autonomous close-before-start path"
  );
  assert(
    repoStartCleanDryRun.includes("--dry-run"),
    "repo:start-clean:dry-run must expose a non-mutating autonomous close plan"
  );
  assert(
    repoSessionGuard.includes("node scripts/repo_session_guard_test.js"),
    "test:repo-session-guard must validate the repo session preflight/closeout guard"
  );
  assert(
    harnessArtifactMcp.includes("node tools/harness-artifact-mcp-server/tests/smoke_test.js"),
    "test:harness-artifact-mcp must validate the read-only harness artifact MCP"
  );
  assert(
    mcpToolRegistryAlignment.includes("node scripts/mcp_tool_registry_alignment_test.js"),
    "test:mcp-tool-registry-alignment must validate configured MCPs against the tool registry manifest"
  );
  assert(runnerSource.includes('id: "governance"'), "repo-quality runner must define the governance stage");
  assert(runnerSource.includes('id: "runtime"'), "repo-quality runner must define the runtime stage");
  assert(runnerSource.includes('id: "surfaces"'), "repo-quality runner must define the surfaces stage");
  assert(!runnerSource.includes("shell:"), "repo-quality runner must not depend on shell:true execution paths");
  assert(runnerSource.includes("runPackageScriptSync"), "repo-quality runner must use the shared package-script invocation helper");
  assert(runnerSource.includes("captureTrackedDiffNames"), "repo-quality runner must guard against validation-induced tracked diffs");
  assert(runnerSource.includes("findNewTrackedDiffNames"), "repo-quality runner must fail when a script creates new tracked diffs");

  assert(
    runnerSource.includes('"test:request-handler-context-split"'),
    "governance stage must include the request-handler context split test"
  );
  assert(
    runnerSource.includes('"test:route-services-split"'),
    "governance stage must include the route services split test"
  );
  assert(
    runnerSource.includes('"test:traceability-service-split"'),
    "governance stage must include the traceability service split test"
  );
  assert(
    runnerSource.includes('"test:harness-overview-snapshot-service-split"'),
    "governance stage must include the harness overview snapshot service split test"
  );
  assert(
    runnerSource.includes('"test:current-log-surface-service-split"'),
    "governance stage must include the current-log surface service split test"
  );
  assert(
    runnerSource.includes('"test:control-overview-service-split"'),
    "governance stage must include the control/overview service split test"
  );
  assert(
    runnerSource.includes('"test:current-surface-service-split"'),
    "governance stage must include the current-surface service split test"
  );
  assert(
    runnerSource.includes('"test:eval-lane-policy-path-length"'),
    "governance stage must include eval lane path-length regression coverage"
  );
  assert(
    runnerSource.includes('"test:bounded-multi-agent-simulator-mode"'),
    "governance stage must include bounded multi-agent simulator provenance coverage"
  );
  assert(
    runnerSource.includes('"test:github-governance-surface"'),
    "governance stage must include the github governance surface test"
  );
  assert(
    runnerSource.includes('"test:repo-local-skills"'),
    "governance stage must include repo-local skill catalog checks"
  );
  assert(
    runnerSource.includes('"test:mcp-tool-registry-alignment"'),
    "governance stage must include MCP tool registry alignment checks"
  );
  assert(
    runnerSource.includes('"test:docs:drift"'),
    "governance stage must include docs drift checks"
  );
  assert(
    runnerSource.includes('"test:conversation-voice-service-split"'),
    "runtime stage must include the conversation/voice split test"
  );
  assert(
    runnerSource.includes('"test:replay-app-service-split"'),
    "runtime stage must include the replay/app split test"
  );
  assert(
    runnerSource.includes('"test:app-platform-read-surface-security"'),
    "runtime stage must include app-platform percent-decode security checks"
  );
  assert(
    runnerSource.includes('"test:english-standalone-static-security"'),
    "runtime stage must include standalone static path containment checks"
  );
  assert(
    runnerSource.includes('"test:playwright-mcp"'),
    "runtime stage must include Playwright MCP smoke checks"
  );
  assert(
    !runnerSource.includes('"housekeeping:surfaces"'),
    "surfaces stage must not refresh tracked surfaces while validating them"
  );
  assert(
    runnerSource.includes('"test:repo-session-guard"'),
    "surfaces stage must include repo session guard coverage"
  );
  assert(
    runnerSource.includes('"current-surface-truth"'),
    "surfaces stage must keep current_surface_truth_test in the repo-quality gate"
  );
  assert(
    runnerSource.includes('"test:harness-artifact-mcp"'),
    "surfaces stage must include Harness Artifact MCP smoke checks"
  );

  console.log("PASS repo_quality_gate_structure_test");
}

main();
