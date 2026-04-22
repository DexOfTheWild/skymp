const assert = require("node:assert/strict");

const protocol = require("../shared/voipProtocol.ts");
const proximity = require("../shared/voipProximityEngine.ts");

const approxEqual = (actual: number, expected: number, epsilon = 1e-6) => {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
};

assert.equal(protocol.cycleVoiceMode("whisper"), "say");
assert.equal(protocol.cycleVoiceMode("say"), "yell");
assert.equal(protocol.cycleVoiceMode("yell"), "whisper");

const radius = 100;
assert.equal(protocol.DEFAULT_MAX_VOIP_GAIN, 0.8);
assert.equal(
  proximity.computeDistanceAttenuationGain({ distance: 0, radius }),
  protocol.DEFAULT_MAX_VOIP_GAIN,
);
assert.equal(
  proximity.computeDistanceAttenuationGain({ distance: 10, radius }),
  protocol.DEFAULT_MAX_VOIP_GAIN,
);
assert.ok(
  proximity.computeDistanceAttenuationGain({ distance: 20, radius }) < 1,
  "expected attenuation to begin before 20% of radius",
);
assert.equal(
  proximity.computeDistanceAttenuationGain({
    distance: 0,
    distanceAttenuationEnabled: false,
    radius,
  }),
  protocol.DEFAULT_MAX_VOIP_GAIN,
);

const midpointGain = proximity.computeDistanceAttenuationGain({
  distance: 60,
  radius,
});
assert.ok(midpointGain > 0 && midpointGain < 0.2);

const farGain = proximity.computeDistanceAttenuationGain({
  distance: 80,
  radius,
});
assert.ok(farGain >= 0 && farGain < 0.05);

assert.equal(
  proximity.computeDistanceAttenuationGain({ distance: 100, radius }),
  0,
);
assert.equal(
  proximity.computeDistanceAttenuationGain({ distance: 101, radius }),
  0,
);

const yaw0 = proximity.computeListenerRelativePosition({
  listenerAngleZ: 0,
  listenerPosition: [0, 0, 0],
  sourcePosition: [10, 5, 3],
});
approxEqual(yaw0.x, 10);
approxEqual(yaw0.y, 5);
approxEqual(yaw0.z, 3);

const yaw90 = proximity.computeListenerRelativePosition({
  listenerAngleZ: Math.PI / 2,
  listenerPosition: [0, 0, 0],
  sourcePosition: [10, 0, 0],
});
approxEqual(yaw90.x, 0);
approxEqual(yaw90.y, 10);

const yaw180 = proximity.computeListenerRelativePosition({
  listenerAngleZ: Math.PI,
  listenerPosition: [0, 0, 0],
  sourcePosition: [0, 10, 0],
});
approxEqual(yaw180.x, 0);
approxEqual(yaw180.y, -10);

const policy = proximity.createVoipPolicyState({
  identity: "listener",
  listenerAngleZ: 0,
  localPosition: [0, 0, 0],
  localVoiceMode: "say",
  localWorldOrCell: 0x14,
  modeRadii: {
    whisper: 800,
    say: 2000,
    yell: 3000,
  },
  remoteActors: [
    {
      identity: "same-world",
      position: [100, 0, 0],
      voiceMode: "say",
      worldOrCell: 0x14,
    },
    {
      identity: "other-world",
      position: [100, 0, 0],
      voiceMode: "say",
      worldOrCell: 0x15,
    },
  ],
});

assert.deepEqual(policy.audibleParticipantIds, ["same-world"]);
assert.equal(policy.participantCountInRange, 1);

const sameWorldParticipant = policy.participants.find(
  (participant: { id: string }) => participant.id === "same-world",
);
const otherWorldParticipant = policy.participants.find(
  (participant: { id: string }) => participant.id === "other-world",
);

assert.equal(sameWorldParticipant?.audible, true);
assert.equal(sameWorldParticipant?.sameWorldOrCell, true);
assert.ok((sameWorldParticipant?.gain || 0) > 0);
assert.ok((sameWorldParticipant?.gain || 0) <= protocol.DEFAULT_MAX_VOIP_GAIN);

assert.equal(otherWorldParticipant?.audible, false);
assert.equal(otherWorldParticipant?.sameWorldOrCell, false);
assert.equal(otherWorldParticipant?.gain, 0);
assert.deepEqual(otherWorldParticipant?.position, { x: 0, y: 0, z: 0 });

console.log("voipProximityEngine.test.ts passed");
