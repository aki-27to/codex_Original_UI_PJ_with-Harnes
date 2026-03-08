"use strict";

const conversationModeValues = Object.freeze(["normal", "persona_friend"]);
const allowedConversationModes = new Set(conversationModeValues);
const defaultConversationMode = "normal";
const defaultPersonaUserId = "local_user";
const personaMemoryVersion = 1;
const maxPersonaUserIdLength = 80;
const maxPersonaFactLength = 180;
const maxPersonaTopicLength = 80;
const maxPersonaFactsPerUser = 24;
const maxPersonaTopicsPerUser = 12;

function compactText(value, max = 24000) {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.slice(0, Math.max(1, Math.trunc(max)));
}

function normalizeConversationMode(value, fallback = defaultConversationMode) {
  const normalized = compactText(value, 40).toLowerCase();
  if (allowedConversationModes.has(normalized)) {
    return normalized;
  }
  const fallbackNormalized = compactText(fallback, 40).toLowerCase();
  if (allowedConversationModes.has(fallbackNormalized)) {
    return fallbackNormalized;
  }
  return defaultConversationMode;
}

function normalizePersonaUserId(value, fallback = defaultPersonaUserId) {
  const normalized = compactText(value, maxPersonaUserIdLength)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (normalized) {
    return normalized;
  }
  const fallbackNormalized = compactText(fallback, maxPersonaUserIdLength)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return fallbackNormalized || defaultPersonaUserId;
}

function normalizePersonaFact(value) {
  return compactText(String(value || "").replace(/[\s,;:]+$/g, ""), maxPersonaFactLength);
}

function normalizePersonaTopic(value) {
  return compactText(value, maxPersonaTopicLength);
}

function createDefaultPersonaMemoryStore() {
  return {
    version: personaMemoryVersion,
    users: {},
  };
}

function normalizePersonaMemoryRecord(source) {
  const input = source && typeof source === "object" ? source : {};
  const turnsRaw = Number(input.turns);
  const updatedAtRaw = Number(input.updatedAt);
  const factsInput = Array.isArray(input.facts) ? input.facts : [];
  const topicsInput = Array.isArray(input.topics) ? input.topics : [];

  const facts = [];
  for (const item of factsInput) {
    const fact = normalizePersonaFact(item);
    if (!fact) {
      continue;
    }
    upsertUniqueItem(facts, fact, maxPersonaFactsPerUser);
  }

  const topics = [];
  for (const item of topicsInput) {
    const topic = normalizePersonaTopic(item);
    if (!topic) {
      continue;
    }
    upsertUniqueItem(topics, topic, maxPersonaTopicsPerUser);
  }

  return {
    turns: Number.isFinite(turnsRaw) ? Math.max(0, Math.trunc(turnsRaw)) : 0,
    updatedAt: Number.isFinite(updatedAtRaw) ? Math.max(0, Math.trunc(updatedAtRaw)) : 0,
    facts,
    topics,
  };
}

function normalizePersonaMemoryStore(source) {
  const input = source && typeof source === "object" ? source : {};
  const usersInput = input.users && typeof input.users === "object" ? input.users : {};
  const users = {};
  const keys = Object.keys(usersInput).slice(0, 400);
  for (const key of keys) {
    const userId = normalizePersonaUserId(key, "");
    if (!userId) {
      continue;
    }
    users[userId] = normalizePersonaMemoryRecord(usersInput[key]);
  }
  return {
    version: personaMemoryVersion,
    users,
  };
}

function ensurePersonaMemoryRecord(store, userId) {
  const normalizedStore = normalizePersonaMemoryStore(store);
  const normalizedUserId = normalizePersonaUserId(userId);
  if (!Object.prototype.hasOwnProperty.call(normalizedStore.users, normalizedUserId)) {
    normalizedStore.users[normalizedUserId] = normalizePersonaMemoryRecord({});
  }
  return {
    store: normalizedStore,
    userId: normalizedUserId,
    record: normalizePersonaMemoryRecord(normalizedStore.users[normalizedUserId]),
  };
}

function normalizeFactCapture(value, max = 70) {
  return compactText(String(value || "").replace(/[.,!?;:]+$/g, ""), max);
}

function extractPersonaFactsFromText(text) {
  const input = compactText(text, 4000);
  if (!input) {
    return [];
  }
  const facts = [];
  const addFact = (value) => {
    const fact = normalizePersonaFact(value);
    if (!fact) {
      return;
    }
    upsertUniqueItem(facts, fact, maxPersonaFactsPerUser);
  };

  const captureAndAdd = (regex, formatter) => {
    const match = input.match(regex);
    if (!match) {
      return;
    }
    const value = formatter(match);
    if (value) {
      addFact(value);
    }
  };

  captureAndAdd(/(?:^|[.?!]\s*)my name is ([a-z][a-z' -]{0,40})\b/i, (match) => {
    const name = normalizeFactCapture(match[1], 42);
    return name ? `Your name is ${name}.` : "";
  });

  captureAndAdd(/(?:^|[.?!]\s*)i(?:'m| am) (\d{1,2}) years old\b/i, (match) => {
    const age = normalizeFactCapture(match[1], 2);
    return age ? `You are ${age} years old.` : "";
  });

  captureAndAdd(/(?:^|[.?!]\s*)i live in ([a-z][a-z' -]{1,50})\b/i, (match) => {
    const city = normalizeFactCapture(match[1], 50);
    return city ? `You live in ${city}.` : "";
  });

  captureAndAdd(/(?:^|[.?!]\s*)i work as (an? [a-z][a-z' -]{1,60}?)(?:[.?!]|,| and |$)/i, (match) => {
    const work = normalizeFactCapture(match[1], 62);
    return work ? `You work as ${work}.` : "";
  });

  captureAndAdd(/(?:^|[.?!]\s*)my favorite ([a-z][a-z' -]{1,30}) is ([^.!?]{2,60})/i, (match) => {
    const subject = normalizeFactCapture(match[1], 30);
    const value = normalizeFactCapture(match[2], 60);
    return subject && value ? `Your favorite ${subject} is ${value}.` : "";
  });

  captureAndAdd(/(?:^|[.?!]\s*)i (?:really )?like ([^.!?]{2,70})/i, (match) => {
    const likes = normalizeFactCapture(match[1], 70);
    return likes ? `You like ${likes}.` : "";
  });

  captureAndAdd(/(?:^|[.?!]\s*)i (?:really )?love ([^.!?]{2,70})/i, (match) => {
    const likes = normalizeFactCapture(match[1], 70);
    return likes ? `You love ${likes}.` : "";
  });

  captureAndAdd(/(?:^|[.?!]\s*)i want to practice (?:speaking|talking) about ([^.!?]{2,90})/i, (match) => {
    const topic = normalizeFactCapture(match[1], 90);
    return topic ? `You want to practice speaking about ${topic}.` : "";
  });

  captureAndAdd(/(?:^|[.?!]\s*)i(?:'d| would) like to talk about ([^.!?]{2,90})/i, (match) => {
    const topic = normalizeFactCapture(match[1], 90);
    return topic ? `You would like to talk about ${topic}.` : "";
  });

  captureAndAdd(/(?:^|[.?!]\s*)i(?:'m| am) interested in ([^.!?]{2,90})/i, (match) => {
    const interest = normalizeFactCapture(match[1], 90);
    return interest ? `You are interested in ${interest}.` : "";
  });

  captureAndAdd(/(?:^|[.?!]\s*)my goal is to ([^.!?]{2,90})/i, (match) => {
    const goal = normalizeFactCapture(match[1], 90);
    return goal ? `Your goal is to ${goal}.` : "";
  });

  return facts;
}

function upsertUniqueItem(list, value, maxItems) {
  const normalized = compactText(value, 240);
  if (!normalized) {
    return;
  }
  const index = list.findIndex((item) => item.toLowerCase() === normalized.toLowerCase());
  if (index >= 0) {
    list.splice(index, 1);
  }
  list.push(normalized);
  while (list.length > maxItems) {
    list.shift();
  }
}

function applyPersonaMemoryUpdate(record, { message, topic, nowMs = Date.now() } = {}) {
  const nextRecord = normalizePersonaMemoryRecord(record);
  const extractedFacts = extractPersonaFactsFromText(message);
  for (const fact of extractedFacts) {
    upsertUniqueItem(nextRecord.facts, fact, maxPersonaFactsPerUser);
  }
  const normalizedTopic = normalizePersonaTopic(topic);
  if (normalizedTopic) {
    upsertUniqueItem(nextRecord.topics, normalizedTopic, maxPersonaTopicsPerUser);
  }
  nextRecord.turns = Math.max(0, nextRecord.turns + 1);
  nextRecord.updatedAt = Number.isFinite(nowMs) ? Math.max(0, Math.trunc(nowMs)) : Date.now();
  return nextRecord;
}

function selectPersonaMemoryContext(record, { maxFacts = 5, maxTopics = 3 } = {}) {
  const normalizedRecord = normalizePersonaMemoryRecord(record);
  const factLimit = Number.isFinite(Number(maxFacts)) ? Math.max(0, Math.trunc(Number(maxFacts))) : 5;
  const topicLimit = Number.isFinite(Number(maxTopics)) ? Math.max(0, Math.trunc(Number(maxTopics))) : 3;
  return {
    facts: normalizedRecord.facts.slice(-factLimit),
    topics: normalizedRecord.topics.slice(-topicLimit),
    turns: normalizedRecord.turns,
    updatedAt: normalizedRecord.updatedAt,
  };
}

function normalizeHistoryLines(historyLines) {
  if (!Array.isArray(historyLines)) {
    return [];
  }
  return historyLines.map((line) => compactText(line, 900)).filter(Boolean).slice(-14);
}

function buildConversationPromptSections({
  mode,
  learnerLevel,
  topic,
  latestMessage,
  historyLines,
  memoryContext,
} = {}) {
  const normalizedMode = normalizeConversationMode(mode);
  const level = compactText(learnerLevel, 40) || "intermediate";
  const topicLine = compactText(topic, 140)
    ? `Focus topic: ${compactText(topic, 140)}`
    : "Focus topic: natural daily conversation";
  const latest = compactText(latestMessage, 2000);
  const normalizedHistoryLines = normalizeHistoryLines(historyLines);
  const context = memoryContext && typeof memoryContext === "object" ? memoryContext : {};
  const memoryFacts = Array.isArray(context.facts)
    ? context.facts.map((item) => normalizePersonaFact(item)).filter(Boolean).slice(-6)
    : [];
  const memoryTopics = Array.isArray(context.topics)
    ? context.topics.map((item) => normalizePersonaTopic(item)).filter(Boolean).slice(-4)
    : [];

  const parts = [];
  if (normalizedMode === "persona_friend") {
    parts.push("You are Jordan, the learner's close American friend.");
    parts.push("Role rules: friend-to-friend conversation only. Never act like a teacher or examiner.");
    parts.push(`Learner level: ${level}.`);
    parts.push(topicLine);
    parts.push(
      "Style rules: warm and casual spoken English with contractions, 2-4 short sentences, and one natural follow-up question."
    );
    parts.push("Behavior rules: show genuine curiosity, react like a real friend, and keep the tone encouraging.");
    if (memoryFacts.length) {
      parts.push("What you remember about the learner:");
      parts.push(memoryFacts.map((item) => `- ${item}`).join("\n"));
    }
    if (memoryTopics.length) {
      parts.push(`Recent interests: ${memoryTopics.join(", ")}`);
    }
  } else {
    parts.push("You are an American English conversation partner for speaking practice.");
    parts.push(`Learner level: ${level}.`);
    parts.push(topicLine);
    parts.push("Reply in natural spoken English, 2-4 short sentences, and ask one follow-up question to continue the conversation.");
  }

  if (normalizedHistoryLines.length) {
    parts.push("Recent conversation:");
    parts.push(normalizedHistoryLines.join("\n"));
  }
  parts.push(`Learner: ${latest}`);
  parts.push(normalizedMode === "persona_friend" ? "Friend:" : "AI:");
  return parts;
}

module.exports = {
  conversationModeValues,
  defaultConversationMode,
  defaultPersonaUserId,
  personaMemoryVersion,
  normalizeConversationMode,
  normalizePersonaUserId,
  createDefaultPersonaMemoryStore,
  normalizePersonaMemoryRecord,
  normalizePersonaMemoryStore,
  ensurePersonaMemoryRecord,
  extractPersonaFactsFromText,
  applyPersonaMemoryUpdate,
  selectPersonaMemoryContext,
  buildConversationPromptSections,
};
