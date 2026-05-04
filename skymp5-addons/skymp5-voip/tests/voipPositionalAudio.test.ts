const assert = require("node:assert/strict");

const positionalAudio = require("../ui/src/positionalAudio.ts");

export {};

assert.equal(
  positionalAudio.computeStereoPan({ x: 0, y: 10, z: 0 }, 10),
  0,
);
assert.equal(
  positionalAudio.computeStereoPan({ x: 10, y: 0, z: 0 }, 10),
  1,
);
assert.equal(
  positionalAudio.computeStereoPan({ x: -10, y: 0, z: 0 }, 10),
  -1,
);
assert.equal(
  positionalAudio.computeStereoPan({ x: 40, y: 0, z: 0 }, 10),
  1,
);
assert.equal(
  positionalAudio.computeStereoPan({ x: 0, y: 0, z: 0 }, 0),
  0,
);

assert.deepEqual(
  positionalAudio.getStereoGraphSupport(null),
  {
    hasAudioContext: false,
    hasCreateGain: false,
    hasCreateMediaElementSource: false,
    hasCreateStereoPanner: false,
  },
);

const fullSupport = positionalAudio.getStereoGraphSupport({
  createGain: (): undefined => undefined,
  createMediaElementSource: (): undefined => undefined,
  createStereoPanner: (): undefined => undefined,
});

assert.deepEqual(
  positionalAudio.selectRemoteAudioGraphMode({
    requestedMode: "stereo",
    support: fullSupport,
  }),
  {
    fallbackReason: null,
    graphMode: "stereo",
  },
);

assert.deepEqual(
  positionalAudio.selectRemoteAudioGraphMode({
    requestedMode: "stereo",
    support: positionalAudio.getStereoGraphSupport({
      createGain: (): undefined => undefined,
      createMediaElementSource: (): undefined => undefined,
    }),
  }),
  {
    fallbackReason: "AudioContext.createStereoPanner unavailable",
    graphMode: "html-volume",
  },
);

assert.deepEqual(
  positionalAudio.selectRemoteAudioGraphMode({
    requestedMode: "off",
    support: fullSupport,
  }),
  {
    fallbackReason: null,
    graphMode: "html-volume",
  },
);

console.log("voipPositionalAudio.test.ts passed");
