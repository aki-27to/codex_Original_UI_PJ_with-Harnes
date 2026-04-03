"use strict";

const allowedRequestUserInputPolicies = new Set(["blocked", "auto-default", "auto-empty"]);
const defaultNonInteractivePolicy = "auto-default";
const defaultBlockedPolicy = defaultNonInteractivePolicy;

function safeTrimmedString(value, max = 2000) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.slice(0, max);
}

function normalizeRequestUserInputPolicy(value, fallback = defaultNonInteractivePolicy) {
  const normalizedFallback = (() => {
    const candidate = safeTrimmedString(fallback, 80).toLowerCase();
    if (allowedRequestUserInputPolicies.has(candidate)) {
      return candidate;
    }
    return defaultNonInteractivePolicy;
  })();
  const raw = safeTrimmedString(value, 80).toLowerCase();
  if (!raw) {
    return normalizedFallback;
  }
  if (raw === "blocked" || raw === "block" || raw === "deny" || raw === "error") {
    return "blocked";
  }
  if (raw === "auto-default" || raw === "auto_default" || raw === "autodefault" || raw === "default") {
    return "auto-default";
  }
  if (raw === "autonomy-first" || raw === "autonomy_first" || raw === "autonomy" || raw === "autonomous") {
    return "auto-default";
  }
  if (raw === "auto-empty" || raw === "auto_empty" || raw === "autoempty" || raw === "empty") {
    return "auto-empty";
  }
  return normalizedFallback;
}

function normalizeQuestionList(params) {
  const payload = params && typeof params === "object" ? params : {};
  const item = payload.item && typeof payload.item === "object" ? payload.item : {};
  const requestObj = payload.request && typeof payload.request === "object" ? payload.request : {};
  const inputObj = payload.input && typeof payload.input === "object" ? payload.input : {};
  const candidates = [payload.questions, item.questions, requestObj.questions, inputObj.questions];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((question) => question && typeof question === "object");
    }
  }
  return [];
}

function readAnswerValue(option) {
  if (typeof option === "string") {
    return safeTrimmedString(option, 400);
  }
  if (!option || typeof option !== "object") {
    return "";
  }
  return safeTrimmedString(
    typeof option.id === "string"
      ? option.id
      : typeof option.value === "string"
        ? option.value
        : typeof option.key === "string"
          ? option.key
          : typeof option.label === "string"
            ? option.label
            : "",
    400
  );
}

function pickOptionValue(options) {
  if (!Array.isArray(options) || options.length === 0) {
    return { value: "", optionIndex: -1 };
  }
  let preferredIndex = options.findIndex((option) => {
    if (!option || typeof option !== "object") {
      return false;
    }
    const label = safeTrimmedString(option.label, 120).toLowerCase();
    return label.endsWith("(recommended)") || label.includes("recommended");
  });
  if (preferredIndex < 0) {
    preferredIndex = 0;
  }
  const preferredValue = readAnswerValue(options[preferredIndex]);
  if (preferredValue) {
    return { value: preferredValue, optionIndex: preferredIndex };
  }
  for (let index = 0; index < options.length; index += 1) {
    const candidateValue = readAnswerValue(options[index]);
    if (candidateValue) {
      return { value: candidateValue, optionIndex: index };
    }
  }
  return { value: "", optionIndex: -1 };
}

function buildAutoDefaultAnswers(params) {
  const questions = normalizeQuestionList(params);
  const answers = {};
  const assumptions = [];
  let answeredCount = 0;
  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    const questionId = safeTrimmedString(question.id, 120);
    if (!questionId) {
      assumptions.push(`question[${index}] skipped: missing id`);
      continue;
    }
    const explicitDefault = safeTrimmedString(
      typeof question.default === "string"
        ? question.default
        : typeof question.defaultValue === "string"
          ? question.defaultValue
          : typeof question.value === "string"
            ? question.value
            : "",
      400
    );
    if (explicitDefault) {
      answers[questionId] = explicitDefault;
      answeredCount += 1;
      assumptions.push(`question '${questionId}': used explicit default`);
      continue;
    }
    const picked = pickOptionValue(question.options);
    if (!picked.value) {
      assumptions.push(`question '${questionId}': no selectable option`);
      continue;
    }
    answers[questionId] = picked.value;
    answeredCount += 1;
    assumptions.push(`question '${questionId}': selected option[${picked.optionIndex}]`);
  }
  return {
    answers,
    assumptions: assumptions.slice(0, 24),
    questionCount: questions.length,
    answeredCount,
  };
}

function resolveNonInteractiveUserInput({ policy, params }) {
  const normalizedPolicy = normalizeRequestUserInputPolicy(policy, defaultNonInteractivePolicy);
  if (normalizedPolicy === "blocked") {
    const questions = normalizeQuestionList(params);
    return {
      policy: normalizedPolicy,
      decision: "blocked",
      reason: "blocked_non_interactive_user_input_policy",
      businessDecisionState: "EXTERNAL_ACTION_REQUIRED",
      answers: {},
      assumptions: [],
      questionCount: questions.length,
      answeredCount: 0,
    };
  }
  if (normalizedPolicy === "auto-empty") {
    const questions = normalizeQuestionList(params);
    return {
      policy: normalizedPolicy,
      decision: "auto_empty",
      reason: "auto_empty_user_input_policy",
      answers: {},
      assumptions: ["auto-empty policy returned empty answers"],
      questionCount: questions.length,
      answeredCount: 0,
    };
  }
  const built = buildAutoDefaultAnswers(params);
  return {
    policy: normalizedPolicy,
    decision: "auto_default",
    reason: "auto_default_user_input_policy",
    answers: built.answers,
    assumptions: built.assumptions,
    questionCount: built.questionCount,
    answeredCount: built.answeredCount,
  };
}

module.exports = {
  allowedRequestUserInputPolicies,
  defaultNonInteractivePolicy,
  defaultBlockedPolicy,
  buildAutoDefaultAnswers,
  normalizeRequestUserInputPolicy,
  resolveNonInteractiveUserInput,
};
