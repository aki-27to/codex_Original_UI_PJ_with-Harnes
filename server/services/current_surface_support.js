"use strict";

function createCurrentSurfaceSupport(deps = {}) {
  const {
    safeString,
    listBundleSummaryCandidates,
    repoRelativePath,
    workspaceRoot,
    isCompletedOperatorOutcome,
  } = deps;

  function isLikelyChangedPath(entry) {
    const value = safeString(entry, 260);
    if (!value) return false;
    if (/\s{2,}/.test(value) && !/[\\/]/.test(value)) return false;
    if (!/[\\/]/.test(value) && !/^[A-Za-z]:/.test(value)) return false;
    return true;
  }

  function collectChangedPathsFromArtifacts({ manifest, evidenceManifest, flowTraceSummary } = {}) {
    const manifestObserved = manifest && manifest.execution && manifest.execution.observed && typeof manifest.execution.observed === "object"
      ? manifest.execution.observed
      : {};
    const childEvidenceLedger = Array.isArray(evidenceManifest && evidenceManifest.childEvidenceLedger)
      ? evidenceManifest.childEvidenceLedger
      : Array.isArray(flowTraceSummary && flowTraceSummary.childEvidenceLedger)
        ? flowTraceSummary.childEvidenceLedger
        : [];
    return [
      ...(Array.isArray(manifestObserved.changedPaths) ? manifestObserved.changedPaths : []),
      ...(Array.isArray(manifestObserved.sampleChangedPaths) ? manifestObserved.sampleChangedPaths : []),
      ...childEvidenceLedger.flatMap((entry) => Array.isArray(entry && entry.ownedPaths) ? entry.ownedPaths : []),
    ].filter(isLikelyChangedPath);
  }

  function buildLatestBundleReference(rootDir, summaryFileName, buildSnapshot) {
    const candidates = listBundleSummaryCandidates(rootDir, summaryFileName);
    if (!candidates.length) return null;
    const candidate = candidates[0];
    const snapshot = buildSnapshot(candidate);
    return {
      ...snapshot,
      bundlePath: repoRelativePath(workspaceRoot, candidate.dirPath),
      summaryPath: repoRelativePath(workspaceRoot, candidate.summaryPath),
    };
  }

  function toOperatorCanonicalKey(key) {
    const raw = safeString(key, 160);
    if (!raw) return "";
    return raw.replace(/_([a-z0-9])/g, (_, char) => String(char).toUpperCase());
  }

  function isOperatorEmptyValue(value) {
    if (value == null) return true;
    if (typeof value === "string") return !value.trim();
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === "object") return !Array.isArray(value) && Object.keys(value).length === 0;
    return false;
  }

  function canonicalizeOperatorFacingValue(value) {
    if (Array.isArray(value)) return value.map((entry) => canonicalizeOperatorFacingValue(entry));
    if (!value || typeof value !== "object") return value;
    const source = value && typeof value === "object" ? value : {};
    const result = {};
    const keys = Object.keys(source).sort((left, right) => {
      const leftSnake = left.includes("_") ? 1 : 0;
      const rightSnake = right.includes("_") ? 1 : 0;
      return leftSnake - rightSnake;
    });
    for (const key of keys) {
      const canonicalKey = toOperatorCanonicalKey(key) || key;
      const normalizedValue = canonicalizeOperatorFacingValue(source[key]);
      if (Object.prototype.hasOwnProperty.call(result, canonicalKey)) {
        if (isOperatorEmptyValue(result[canonicalKey]) && !isOperatorEmptyValue(normalizedValue)) {
          result[canonicalKey] = normalizedValue;
        }
        continue;
      }
      result[canonicalKey] = normalizedValue;
    }
    return result;
  }

  function normalizeOperatorResidualSemantics({ finalOutcome, residualRisks } = {}) {
    const notes = Array.isArray(residualRisks) ? residualRisks.map((entry) => safeString(entry, 320)).filter(Boolean) : [];
    const completed = isCompletedOperatorOutcome(finalOutcome);
    const blockerPattern = /(implementation is intentionally paused|user decision|open questions|needs[_\s-]?input|awaiting approval|awaiting user|unresolved blocker|blocked\b|before signoff|requires dedicated verification)/i;
    const normalized = {
      residualRisks: [],
      informationalNotes: [],
      operatorCaveats: [],
    };
    for (const note of notes) {
      if (completed && blockerPattern.test(note)) {
        normalized.informationalNotes.push(
          /implementation is intentionally paused until user decisions resolve the open questions/i.test(note)
            ? "Historical planning note only: discovery handling originally surfaced open questions, but this recorded run completed without an unresolved user-decision blocker."
            : /requires dedicated verification before signoff/i.test(note)
              ? "Historical planning note only: dedicated verification was required for signoff and has already been satisfied on this completed run."
              : `Historical planning note only: ${note}`
        );
        continue;
      }
      normalized.residualRisks.push(note);
    }
    return {
      residualRisks: Array.from(new Set(normalized.residualRisks)).slice(0, 12),
      informationalNotes: Array.from(new Set(normalized.informationalNotes)).slice(0, 12),
      operatorCaveats: Array.from(new Set(normalized.operatorCaveats)).slice(0, 12),
    };
  }

  return Object.freeze({
    buildLatestBundleReference,
    canonicalizeOperatorFacingValue,
    normalizeOperatorResidualSemantics,
    isLikelyChangedPath,
    collectChangedPathsFromArtifacts,
  });
}

module.exports = {
  createCurrentSurfaceSupport,
};
