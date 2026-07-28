"use strict";

const assert = require("node:assert/strict");
const grouping = require("../../database/transition-grouping.js");

function message(savedAt, identity) {
  return {
    savedAt,
    truck: identity.truck || "",
    driverName: identity.driverName || "",
    driverCode: identity.driverCode || "",
    driverRaw: identity.driverRaw || "",
    identities: grouping.identityTokens(identity),
  };
}

const messages = [
  message(100, { truck: "00123", driverRaw: "507728 TREVOR SWAIN" }),
  message(200, { driverName: "Trevor Swain", driverCode: "507728" }),
  message(300, { truck: "123", driverRaw: "SWAIN, TREVOR (507728)" }),
  message(400, { truck: "987", driverName: "Another Driver", driverCode: "111222" }),
  message(500, { truck: "987", driverName: "Replacement Driver", driverCode: "333444" }),
  message(600, { truck: "555", driverName: "Separate Person", driverCode: "555666" }),
];

const groups = grouping.groupMessages(messages);
assert.equal(groups.length, 3, "matching code/name/truck identities should collapse into three groups");
assert.deepEqual(groups.map((group) => group.messages.length).sort((a, b) => b - a), [3, 2, 1]);

const trevor = groups.find((group) => group.messages.some((item) => item.driverCode === "507728"));
assert.ok(trevor, "Trevor group should exist");
assert.equal(trevor.messages.length, 3, "code, reversed name, and normalized truck should share one group");
assert.deepEqual(trevor.messages.map((item) => item.savedAt), [100, 200, 300], "messages should remain chronological");

const reusedTruck = groups.find((group) => group.messages.some((item) => item.truck === "987"));
assert.equal(reusedTruck.messages.length, 2, "same truck should group even when driver identity changes");

assert.equal(grouping.normalizeDriverName("SWAIN, TREVOR (507728)"), grouping.normalizeDriverName("Trevor Swain"));
assert.equal(grouping.normalizeTruck("00123"), grouping.normalizeTruck("123"));
assert.deepEqual(grouping.identityTokens({ driverName: "Unknown Driver", truck: "No Truck" }), []);

console.log("Transition grouping tests passed.");
