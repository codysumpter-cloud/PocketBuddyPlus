import assert from "node:assert/strict";

import { buildBuddyChatAiRequest, normalizeBuddyChatReply, parseBuddyChatRequest, sameDocumentUrl } from "../src/buddy-chat.js";

const history = Array.from({ length: 15 }, (_, index) => ({
  role: index % 2 === 0 ? "user" as const : "buddy" as const,
  text: `message-${index}`,
}));

const parsed = parseBuddyChatRequest({
  message: "  How are you today?  ",
  history,
  buddy: {
    name: "BMO",
    mood: "curious",
    activity: "hanging out",
    dominantNeed: "company",
    affection: 0.72,
  },
  notes: ["must never be forwarded"],
  tasks: ["also private"],
});

assert.equal(parsed.message, "How are you today?");
assert.equal(parsed.history.length, 12);
assert.equal(parsed.history[0]?.text, "message-3");
assert.equal(parsed.buddy.name, "BMO");

const request = buildBuddyChatAiRequest(parsed);
assert.equal(request.messages.length, 13);
assert.deepEqual(request.messages[0], { role: "assistant", content: "message-3" });
assert.deepEqual(request.messages.at(-1), { role: "user", content: "How are you today?" });
assert.match(request.system ?? "", /BMO/);
assert.match(request.system ?? "", /mood=curious/);
assert.match(request.system ?? "", /dominantNeed=company/);
assert.match(request.system ?? "", /Do not claim you read notes, tasks, files, screens, plugins, private memory, or the internet/);
assert.doesNotMatch(JSON.stringify(request), /must never be forwarded|also private/);
assert.equal(request.maxTokens, 320);

assert.throws(() => parseBuddyChatRequest(null), /must be an object/);
assert.throws(() => parseBuddyChatRequest({ message: "", history: [], buddy: {} }), /message is required/i);
assert.throws(() => parseBuddyChatRequest({
  message: "hello",
  history: [],
  buddy: { name: "BMO", mood: "happy", activity: "idle", dominantNeed: "play", affection: 2 },
}), /between 0 and 1/);
assert.throws(() => parseBuddyChatRequest({
  message: "x".repeat(501),
  history: [],
  buddy: { name: "BMO", mood: "happy", activity: "idle", dominantNeed: "play", affection: 0.5 },
}), /too long/);

assert.equal(normalizeBuddyChatReply("  hello  "), "hello");
assert.equal(normalizeBuddyChatReply(undefined), "");
assert.equal(sameDocumentUrl("file:///app/dist/renderer/index.html?route=dashboard", "file:///app/dist/renderer/index.html"), true);
assert.equal(sameDocumentUrl("https://127.0.0.1:5173/?route=pets", "https://127.0.0.1:5173/"), true);
assert.equal(sameDocumentUrl("https://evil.example/", "https://127.0.0.1:5173/"), false);

console.error("Buddy chat validation, context, and privacy boundary passed.");
