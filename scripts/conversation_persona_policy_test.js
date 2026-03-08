#!/usr/bin/env node
"use strict";

const {
  normalizeConversationMode,
  normalizePersonaUserId,
  createDefaultPersonaMemoryStore,
  ensurePersonaMemoryRecord,
  extractPersonaFactsFromText,
  applyPersonaMemoryUpdate,
  selectPersonaMemoryContext,
  buildConversationPromptSections,
} = require("./lib/conversation_persona_policy");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testNormalizeConversationMode() {
  assert(normalizeConversationMode("persona_friend") === "persona_friend", "persona mode should pass through");
  assert(normalizeConversationMode("PERSONA_FRIEND") === "persona_friend", "mode should normalize case");
  assert(normalizeConversationMode("unknown") === "normal", "unknown mode should fallback to normal");
}

function testNormalizePersonaUserId() {
  const normalized = normalizePersonaUserId("  My User#01  ");
  assert(normalized === "my-user-01", "persona user id should be sanitized");
  assert(normalizePersonaUserId("") === "local_user", "empty persona user id should fallback");
}

function testEnsurePersonaMemoryRecord() {
  const store = createDefaultPersonaMemoryStore();
  const ensured = ensurePersonaMemoryRecord(store, "tester");
  assert(ensured.userId === "tester", "ensured user id mismatch");
  assert(ensured.record.turns === 0, "new record should start at turn 0");
  assert(Array.isArray(ensured.record.facts) && ensured.record.facts.length === 0, "new record facts should be empty");
}

function testFactExtraction() {
  const text = "My name is Akira. I live in Tokyo. I like jazz and coffee. I want to practice speaking about traveling in English.";
  const facts = extractPersonaFactsFromText(text);
  assert(facts.some((item) => /your name is akira\./i.test(item)), "name fact should be extracted");
  assert(facts.some((item) => /you live in tokyo\./i.test(item)), "location fact should be extracted");
  assert(facts.some((item) => /you like jazz and coffee\./i.test(item)), "interest fact should be extracted");
  assert(
    facts.some((item) => /you want to practice speaking about traveling in english\./i.test(item)),
    "practice-topic fact should be extracted"
  );
}

function testMemoryUpdateAndContext() {
  const baseRecord = {
    turns: 1,
    updatedAt: 1,
    facts: ["You like hiking."],
    topics: ["travel"],
  };
  const updated = applyPersonaMemoryUpdate(baseRecord, {
    message: "I work as an engineer and I love baseball.",
    topic: "daily life",
    nowMs: 123456,
  });
  assert(updated.turns === 2, "turn count should increment");
  assert(updated.updatedAt === 123456, "updatedAt mismatch");
  assert(updated.facts.some((item) => /you work as an engineer\./i.test(item)), "work fact should be recorded");
  assert(updated.topics.includes("daily life"), "topic should be tracked");

  const context = selectPersonaMemoryContext(updated, { maxFacts: 2, maxTopics: 1 });
  assert(Array.isArray(context.facts) && context.facts.length <= 2, "context facts should be limited");
  assert(Array.isArray(context.topics) && context.topics.length <= 1, "context topics should be limited");
}

function testPromptSplit() {
  const normalPrompt = buildConversationPromptSections({
    mode: "normal",
    learnerLevel: "intermediate",
    topic: "travel",
    latestMessage: "How can I improve my speaking?",
    historyLines: ["Learner: hello", "AI: hi"],
  }).join("\n");

  assert(/conversation partner/i.test(normalPrompt), "normal prompt should keep neutral partner framing");
  assert(!/close American friend/i.test(normalPrompt), "normal prompt should not include friend persona frame");

  const personaPrompt = buildConversationPromptSections({
    mode: "persona_friend",
    learnerLevel: "intermediate",
    topic: "weekend",
    latestMessage: "I went surfing yesterday.",
    historyLines: ["Learner: hi", "Friend: hey!"],
    memoryContext: {
      facts: ["You love surfing."],
      topics: ["sports"],
    },
  }).join("\n");

  assert(/close American friend/i.test(personaPrompt), "persona prompt should include friend framing");
  assert(/Never act like a teacher/i.test(personaPrompt), "persona prompt should block teacher framing");
  assert(/You love surfing\./i.test(personaPrompt), "persona prompt should include memory facts");
  assert(/Friend:/i.test(personaPrompt), "persona prompt should end with Friend role");
}

function run() {
  const tests = [
    ["normalize conversation mode", testNormalizeConversationMode],
    ["normalize persona user id", testNormalizePersonaUserId],
    ["ensure persona memory record", testEnsurePersonaMemoryRecord],
    ["extract persona facts", testFactExtraction],
    ["persona memory update and context", testMemoryUpdateAndContext],
    ["prompt split normal vs persona", testPromptSplit],
  ];

  let passed = 0;
  for (const [name, fn] of tests) {
    fn();
    passed += 1;
    console.log(`[conversation-persona-policy-test] PASS ${name}`);
  }
  console.log(`[conversation-persona-policy-test] total=${tests.length} pass=${passed} fail=0`);
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(`[conversation-persona-policy-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}

