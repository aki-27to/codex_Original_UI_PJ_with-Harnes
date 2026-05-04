# Requirement Foundation V1 Exit Audit

- Status: FAIL
- Score: 4/8
- requirementFoundationV1: not_done
- completedAt: -
- auditReportPath: output/phase_exit_requirement_foundation_v1.json
- markdownReportPath: output/phase_exit_requirement_foundation_v1.md
- freezePolicy: bug_fix_only

## Checks

- [FAIL] A. Requirement Lock is contract-driven single-card
  - Detail: single-card Requirement Lock architecture note was not found in docs/CURRENT_ARCHITECTURE.md.
  - Evidence: web/01.HarnesUI/app.js:1907 :: title:"AIの方針"
  - Evidence: web/01.HarnesUI/app.js:1874 :: label:"進め方",text:`${approachParts.join("。")}。`}); } const holdReason=snapshot.contractStatus==="BLOCKED" ?( snapshot.displayHoldReason || snapshot.contractStatusReason || ((snapshot.validationHighlights&&snapshot.validationHighlights.length
  - Evidence: scripts/harnesui_requirement_summary_test.js:130 :: assert.strictEqual(progressGroups[0].title, "AIの方針", "the single requirement card should focus on the AI's direction"); assert.strictEqual(progressGroups[0].summary, "既存UIを大きく崩さず、AIの進行方向が一目で読めるようにする", "the summary should foreground the esse
- [PASS] B. requirement-contract.v5 carries the V1 Step 1 contract fields
  - Detail: All required evidence was found.
  - Evidence: scripts/config/requirement_contract.schema.json :: schema=requirement-contract.v5 required=lockedGoal, intentHypotheses, questionPlan, delightPlan, displayContract
- [FAIL] C. requestCoverage is prompt-derived and carries core / parked / dropped lanes
  - Detail: prompt-derived requestCoverage architecture note was not found in docs/CURRENT_ARCHITECTURE.md.
  - Evidence: scripts/planning_mode_policy_test.js:77 :: requestCoverage.rawRequestClauses) && fastArtifacts.requirementContract.requestCoverage.rawRequestClauses.length >= 1, "requirement contracts should persist a request-coverage ledger" ); assert.ok( Array.isArray(fastArtifacts.requirementCon
  - Evidence: scripts/config/requirement_contract.schema.json :: requestCoverage.required=rawRequestClauses, coreObligations, mappedRequirements, parkedItems, droppedItems, coverageSummary
- [PASS] D. Unmapped core clauses are blocked
  - Detail: All required evidence was found.
  - Evidence: scripts/lib/planning_mode_policy.js:3525 :: "request_coverage_core_mapped", "Core request obligations are mapped into the contract", requestCoverage.coverageSummary.coreUnmapped > 0 ? "BLOCK" : "PASS"
  - Evidence: scripts/planning_mode_policy_test.js:193 :: entry.id === "request_coverage_core_mapped" && entry.status === "BLOCK"
- [PASS] E. Plan and dispatch carry requestClauseRefs / requirementRefs / acceptanceCheckRefs
  - Detail: All required evidence was found.
  - Evidence: scripts/config/dispatch_plan.schema.json :: dispatch.required=dispatchId, ownerAgent, participationMode, mayWrite, ownedPaths, taskSummary, requestClauseRefs, requirementRefs, acceptanceCheckRefs, acceptanceChecks, toolsMcpRequirements, reviewerRequired, testerRequired, escalationPoint, expectedEvidence
  - Evidence: scripts/planning_mode_policy_test.js:97 :: dispatchPlan.dispatches[0].requestClauseRefs) && fastArtifacts.dispatchPlan.dispatches[0].requestClauseRefs.length >= 1, "dispatch plans should carry requestClauseRefs from Step 1 coverage" ); assert.ok( Array.isArray(fastArtifacts.dispatch
  - Evidence: scripts/operator_plan_surface_test.js:65 :: requirementRefs) && docsEvent.steps[0].requirementRefs.length >= 1, "execution step should carry requirementRefs"); assert.strictEqual(docsEvent.steps[docsEvent.steps.length - 1].phase, "report", "plan should end with report phase"); assert
- [PASS] F. postLockDrift eval is part of the default eval suite
  - Detail: All required evidence was found.
  - Evidence: scripts/config/eval_suite_default.json :: post_lock_drift_probe cases=post_lock_drift_clean_trace, post_lock_drift_detects_missing_downstream_refs
  - Evidence: scripts/eval_harness_policy_test.js:46 :: postLockDriftCase = suite.cases.find((entry) => entry && entry.id === "post_lock_drift_clean_trace"); assert(postLockDriftCase && postLockDriftCase.driver === "post_lock_drift_probe", "suite should cover post-lock drift without downstream g
  - Evidence: scripts/eval_replay_api_smoke_test.js:147 :: post_lock_drift_clean_trace"), "default eval suite should include post-lock drift pass coverage"); assert(defaultSuite.caseIds.includes("post_lock_drift_detects_missing_downstream_refs"), "default eval suite should include post-lock drift d
- [FAIL] G. runtime revisionGate blocks silent rewrite and can RETURN_TO_INTAKE
  - Detail: runtime revision gate enforcement was not found in server.js.
  - Evidence: scripts/requirement_revision_policy_test.js:61 :: silent rewrite attempts should BLOCK"); assert.strictEqual( silentRewrite.taskOutcomeReason, "silent_requirement_rewrite", "silent rewrite attempts should map to silent_requirement_rewrite" ); const downstreamProposal = buildRuntimeRevision
- [FAIL] H. clauseCompletionScorecard rejects final completion when core clauses are still unmet
  - Detail: runtime final-completion clause scorecard gate was not found in server.js.
  - Evidence: scripts/requirement_revision_policy_test.js:148 :: clauseCompletionScorecard.status, "FAIL", "missing dispatch coverage for a core clause should fail the scorecard" ); assert.strictEqual( clauseCompletionScorecard.summary.unsatisfiedCount, 1, "exactly one core clause should remain unsatisfi
