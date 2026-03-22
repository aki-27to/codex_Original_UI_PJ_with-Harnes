"use strict";

const REVISION_PROPOSAL_MARKER = "[REVISION_PROPOSAL_V1]";

function safeString(value, max = 4000) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (!Number.isFinite(Number(max)) || Number(max) <= 0) {
    return trimmed;
  }
  return trimmed.slice(0, Math.trunc(Number(max)));
}

function uniqueStrings(values, max = 12) {
  const result = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const text = safeString(String(value || ""), 320);
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    result.push(text);
    if (result.length >= max) {
      break;
    }
  }
  return result;
}

function normalizeAgentName(value) {
  return safeString(value, 80).toLowerCase();
}

function normalizeProposalStatus(value, fallback = "pending") {
  const normalized = safeString(value, 40).toLowerCase();
  if (!normalized && fallback === "") {
    return "";
  }
  if (["pending", "accepted", "rejected"].includes(normalized)) {
    return normalized;
  }
  return fallback;
}

function normalizeRevisionGateStatus(value, fallback = "clear") {
  const normalized = safeString(value, 80).toLowerCase();
  if ([
    "clear",
    "proposal_required",
    "pending_intake_confirmation",
    "accepted_by_intake",
  ].includes(normalized)) {
    return normalized;
  }
  return fallback;
}

function buildRequirementRevisionProposal(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const changedFields = uniqueStrings(source.changedFields, 24);
  const evidence = uniqueStrings(source.evidence, 12);
  const reason = safeString(source.reason, 320);
  const originatingAgent = normalizeAgentName(source.originatingAgent) || "unknown";
  const hasContent = Boolean(
    safeString(source.proposalId, 120)
    || changedFields.length
    || reason
    || evidence.length
    || source.requiresReapproval
  );
  if (!hasContent) {
    return {
      proposalId: "",
      changedFields: [],
      reason: "",
      evidence: [],
      requiresReapproval: false,
      originatingAgent: normalizeAgentName(source.originatingAgent),
      status: normalizeProposalStatus(source.status, ""),
      summary: "",
      previousPromptHash: "",
      currentPromptHash: "",
      createdFromRevisionNumber: 0,
      reviewedBy: "",
      reviewedAt: "",
    };
  }
  const proposalId = safeString(source.proposalId, 120)
    || `revision-${normalizeAgentName(source.originatingAgent || "unknown") || "unknown"}-${Math.max(1, Math.trunc(Number(source.createdFromRevisionNumber) || 1))}`;
  return {
    proposalId,
    changedFields,
    reason,
    evidence,
    requiresReapproval: Boolean(source.requiresReapproval),
    originatingAgent,
    status: normalizeProposalStatus(source.status, "pending"),
    summary: safeString(source.summary, 320) || reason,
    previousPromptHash: safeString(source.previousPromptHash, 120),
    currentPromptHash: safeString(source.currentPromptHash, 120),
    createdFromRevisionNumber: Math.max(0, Math.trunc(Number(source.createdFromRevisionNumber) || 0)),
    reviewedBy: normalizeAgentName(source.reviewedBy),
    reviewedAt: safeString(source.reviewedAt, 120),
  };
}

function sanitizeRequirementRevisionProposal(value, options = {}) {
  const source = value && typeof value === "object" ? value : {};
  const fallbackAgent = normalizeAgentName(options && options.fallbackAgent);
  const proposal = buildRequirementRevisionProposal({
    ...source,
    originatingAgent: safeString(source.originatingAgent, 80) || fallbackAgent || "unknown",
    status: safeString(source.status, 40) || safeString(options && options.fallbackStatus, 40) || "pending",
  });
  if (!proposal.proposalId && !proposal.changedFields.length && !proposal.reason && !proposal.evidence.length) {
    return {
      ...proposal,
      status: "",
    };
  }
  return proposal;
}

function buildRequirementRevisionGate(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return {
    status: normalizeRevisionGateStatus(source.status, "clear"),
    reason: safeString(source.reason, 320),
    authoritativeOwner: normalizeAgentName(source.authoritativeOwner) || "intake",
    currentAgent: normalizeAgentName(source.currentAgent),
    blockingProposalId: safeString(source.blockingProposalId, 120),
    returnToIntake: Boolean(source.returnToIntake),
    changedFields: uniqueStrings(source.changedFields, 24),
  };
}

function sanitizeRequirementRevisionGate(value, options = {}) {
  const source = value && typeof value === "object" ? value : {};
  return buildRequirementRevisionGate({
    ...source,
    authoritativeOwner: safeString(source.authoritativeOwner, 80)
      || safeString(options && options.fallbackOwner, 80)
      || "intake",
    currentAgent: safeString(source.currentAgent, 80)
      || safeString(options && options.fallbackAgent, 80),
    status: safeString(source.status, 80) || safeString(options && options.fallbackStatus, 80) || "clear",
  });
}

function mergeRequirementRevisionProposal(baseValue, overrideValue, options = {}) {
  const base = sanitizeRequirementRevisionProposal(baseValue, options);
  const override = sanitizeRequirementRevisionProposal(overrideValue, options);
  const overrideHasContent = Boolean(
    override.proposalId
    || override.changedFields.length
    || override.reason
    || override.evidence.length
  );
  if (!overrideHasContent) {
    return base;
  }
  return buildRequirementRevisionProposal({
    proposalId: safeString(override.proposalId, 120) || base.proposalId,
    changedFields: uniqueStrings([...base.changedFields, ...override.changedFields], 24),
    reason: safeString(override.reason, 320) || base.reason,
    evidence: uniqueStrings([...base.evidence, ...override.evidence], 12),
    requiresReapproval: override.requiresReapproval || base.requiresReapproval,
    originatingAgent: safeString(override.originatingAgent, 80) || base.originatingAgent,
    status: safeString(override.status, 40) || base.status,
    summary: safeString(override.summary, 320) || base.summary,
    previousPromptHash: safeString(override.previousPromptHash, 120) || base.previousPromptHash,
    currentPromptHash: safeString(override.currentPromptHash, 120) || base.currentPromptHash,
    createdFromRevisionNumber: Math.max(
      Number(base.createdFromRevisionNumber || 0),
      Number(override.createdFromRevisionNumber || 0)
    ),
    reviewedBy: safeString(override.reviewedBy, 80) || base.reviewedBy,
    reviewedAt: safeString(override.reviewedAt, 120) || base.reviewedAt,
  });
}

function extractMarkedJsonObject(text, marker) {
  const source = safeString(text, 16000);
  const token = safeString(marker, 120);
  if (!source || !token) {
    return "";
  }
  const markerIndex = source.indexOf(token);
  if (markerIndex < 0) {
    return "";
  }
  const afterMarker = source.slice(markerIndex + token.length);
  const braceIndex = afterMarker.indexOf("{");
  if (braceIndex < 0) {
    return "";
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  let started = false;
  let collected = "";
  for (const char of afterMarker.slice(braceIndex)) {
    if (!started) {
      if (char !== "{") {
        continue;
      }
      started = true;
    }
    collected += char;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return collected.trim();
      }
    }
  }
  return "";
}

function parseRequirementRevisionProposalText(text, options = {}) {
  const objectText = extractMarkedJsonObject(text, REVISION_PROPOSAL_MARKER);
  if (!objectText) {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(objectText);
  } catch {
    return null;
  }
  const proposal = sanitizeRequirementRevisionProposal(parsed, options);
  if (!proposal.changedFields.length || !proposal.reason) {
    return null;
  }
  return proposal;
}

function collectRequirementRevisionProposalsFromTexts(entries, options = {}) {
  const results = [];
  const seen = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const item = entry && typeof entry === "object" ? entry : {};
    const proposal = parseRequirementRevisionProposalText(item.text, {
      fallbackAgent: item.fallbackAgent || (options && options.fallbackAgent) || "",
    });
    if (!proposal) {
      continue;
    }
    const key = JSON.stringify([
      proposal.proposalId,
      proposal.originatingAgent,
      proposal.reason,
      proposal.changedFields,
    ]);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    results.push(proposal);
  }
  return results;
}

function buildRuntimeRevisionGateDecision({
  activeRevisionProposal = null,
  revisionGate = null,
  observedRevisionProposals = [],
  agentName = "",
  ownerAgent = "intake",
} = {}) {
  const normalizedAgent = normalizeAgentName(agentName);
  const normalizedOwner = normalizeAgentName(ownerAgent) || "intake";
  const gate = sanitizeRequirementRevisionGate(revisionGate, {
    fallbackAgent: normalizedAgent,
    fallbackOwner: normalizedOwner,
  });
  const pendingProposal = sanitizeRequirementRevisionProposal(activeRevisionProposal, {
    fallbackAgent: normalizedAgent,
    fallbackStatus: "pending",
  });
  const observed = Array.isArray(observedRevisionProposals)
    ? observedRevisionProposals.map((entry) => sanitizeRequirementRevisionProposal(entry, { fallbackAgent: normalizedAgent }))
    : [];
  const mergedProposal = observed.length
    ? observed.reduce((acc, entry) => mergeRequirementRevisionProposal(acc, entry, { fallbackAgent: normalizedAgent }), pendingProposal)
    : pendingProposal;

  if (normalizedAgent && normalizedAgent === normalizedOwner) {
    return {
      status: "CLEAR",
      reason: "authoritative_intake_owner",
      proposal: mergedProposal,
      enforceFinalStatus: "",
      taskOutcomeStatus: "",
      taskOutcomeReason: "",
    };
  }

  if (observed.length > 0) {
    return {
      status: "RETURN_TO_INTAKE",
      reason: "downstream_revision_proposal_pending",
      proposal: mergedProposal,
      enforceFinalStatus: "interrupted",
      taskOutcomeStatus: "BLOCKED",
      taskOutcomeReason: "return_to_intake_required",
    };
  }

  if (gate.status === "pending_intake_confirmation") {
    return {
      status: "RETURN_TO_INTAKE",
      reason: "pending_intake_revision_confirmation",
      proposal: mergedProposal,
      enforceFinalStatus: "interrupted",
      taskOutcomeStatus: "BLOCKED",
      taskOutcomeReason: "return_to_intake_required",
    };
  }

  if (gate.status === "proposal_required") {
    return {
      status: "BLOCK",
      reason: "silent_requirement_rewrite_attempt",
      proposal: mergedProposal,
      enforceFinalStatus: "failed",
      taskOutcomeStatus: "FAILED_VALIDATION",
      taskOutcomeReason: "silent_requirement_rewrite",
    };
  }

  return {
    status: "CLEAR",
    reason: "no_revision_gate",
    proposal: mergedProposal,
    enforceFinalStatus: "",
    taskOutcomeStatus: "",
    taskOutcomeReason: "",
  };
}

function normalizeAcceptanceStatus(value) {
  const normalized = safeString(value, 40).toUpperCase();
  if (["PASS", "FAIL", "SKIPPED"].includes(normalized)) {
    return normalized;
  }
  return "UNKNOWN";
}

function buildClauseCompletionScorecard({
  clauses = [],
  acceptanceResults = [],
  postLockDrift = null,
  finalStatus = "",
  taskOutcomeStatus = "",
  docSyncEvidence = null,
  childEvidenceLedger = [],
} = {}) {
  const coreClauses = (Array.isArray(clauses) ? clauses : []).filter((entry) => entry && entry.core);
  const driftSnapshot = postLockDrift && typeof postLockDrift === "object" ? postLockDrift : {};
  const driftedClauseIds = new Set(uniqueStrings(driftSnapshot.driftedClauseIds, 48));
  const unmappedCoreClauseIds = new Set(uniqueStrings(driftSnapshot.unmappedCoreClauseIds, 48));
  const acceptanceById = new Map(
    (Array.isArray(acceptanceResults) ? acceptanceResults : []).map((entry) => [
      safeString(entry && entry.id, 80),
      {
        status: normalizeAcceptanceStatus(entry && entry.status),
        evidence: uniqueStrings(entry && entry.evidence, 12),
      },
    ]).filter((entry) => entry[0])
  );
  const docSyncPaths = docSyncEvidence && docSyncEvidence.status === "PASS"
    ? uniqueStrings(docSyncEvidence.updatedPaths, 8)
    : [];
  const childEvidenceRefs = uniqueStrings(
    (Array.isArray(childEvidenceLedger) ? childEvidenceLedger : []).flatMap((entry) => {
      const agent = safeString(entry && entry.agent, 80);
      if (!agent) {
        return [];
      }
      const refs = [];
      if (entry && entry.reviewerObserved) refs.push(`review:${agent}`);
      if (entry && entry.testerObserved) refs.push(`test:${agent}`);
      return refs;
    }),
    12
  );
  const rows = coreClauses.map((entry) => {
    const clauseId = safeString(entry && entry.clauseId, 80);
    const requirementRefs = uniqueStrings(entry && entry.requirementRefs, 16);
    const dispatchIds = uniqueStrings(entry && entry.dispatchIds, 12);
    const planStepIds = uniqueStrings(entry && entry.planStepIds, 16);
    const acceptanceRefs = uniqueStrings(entry && entry.acceptanceCheckRefs, 16);
    const linkedAcceptanceResults = acceptanceRefs
      .map((acceptanceId) => acceptanceById.get(acceptanceId))
      .filter(Boolean);
    const reasons = [];
    let status = "satisfied";

    if (safeString(entry && entry.state, 40) === "dropped") {
      status = "waived";
      reasons.push(safeString(entry && entry.droppedReasonCode, 80) || "dropped");
    } else {
      if (!requirementRefs.length || unmappedCoreClauseIds.has(clauseId)) {
        status = "unsatisfied";
        reasons.push("requirement_unmapped");
      }
      if (!dispatchIds.length) {
        status = "unsatisfied";
        reasons.push("dispatch_missing");
      }
      if (!planStepIds.length) {
        status = "unsatisfied";
        reasons.push("plan_missing");
      }
      if (driftedClauseIds.has(clauseId)) {
        status = "unsatisfied";
        reasons.push("post_lock_drift");
      }
      if (linkedAcceptanceResults.length && linkedAcceptanceResults.some((result) => result.status !== "PASS")) {
        status = "unsatisfied";
        reasons.push("acceptance_failed");
      }
    }

    const evidenceRefs = uniqueStrings([
      ...dispatchIds.map((id) => `dispatch:${id}`),
      ...planStepIds.map((id) => `plan:${id}`),
      ...linkedAcceptanceResults.flatMap((result) => result.evidence),
      ...docSyncPaths,
      ...childEvidenceRefs,
      "flow_trace_summary.json",
    ], 16);

    if (status === "satisfied" && !linkedAcceptanceResults.length && !evidenceRefs.length) {
      status = "unsatisfied";
      reasons.push("evidence_missing");
    }

    return {
      clauseId,
      text: safeString(entry && entry.text, 320),
      status,
      requirementRefs,
      dispatchIds,
      planStepIds,
      acceptanceRefs,
      evidenceRefs,
      reasons: uniqueStrings(reasons, 8),
      finalStatus: safeString(finalStatus, 40),
      taskOutcomeStatus: safeString(taskOutcomeStatus, 80).toUpperCase(),
    };
  });

  const summary = {
    coreTotal: rows.length,
    satisfiedCount: rows.filter((entry) => entry.status === "satisfied").length,
    unsatisfiedCount: rows.filter((entry) => entry.status === "unsatisfied").length,
    waivedCount: rows.filter((entry) => entry.status === "waived").length,
  };

  return {
    schema: "clause-completion-scorecard.v1",
    status: summary.unsatisfiedCount > 0 ? "FAIL" : "PASS",
    reason: summary.unsatisfiedCount > 0 ? "core_clause_unsatisfied" : "all_core_clauses_satisfied",
    summary,
    clauses: rows,
  };
}

module.exports = {
  REVISION_PROPOSAL_MARKER,
  buildClauseCompletionScorecard,
  buildRequirementRevisionGate,
  buildRequirementRevisionProposal,
  buildRuntimeRevisionGateDecision,
  collectRequirementRevisionProposalsFromTexts,
  mergeRequirementRevisionProposal,
  parseRequirementRevisionProposalText,
  sanitizeRequirementRevisionGate,
  sanitizeRequirementRevisionProposal,
};
