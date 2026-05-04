const assert = require("node:assert/strict");

const settings = require("../client/voipClientSettings.ts");

export {};

const createApi = (scopes: Record<string, unknown>) => {
  return {
    getSettingsScope: (scope: string) => scopes[scope],
  };
};

assert.equal(
  settings.readVoipClientSettings(createApi({})).positionalAudioMode,
  "off",
);

assert.equal(
  settings.readVoipClientSettings(createApi({
    "skymp5-voip": {
      positionalAudioMode: "off",
    },
  })).positionalAudioMode,
  "off",
);

assert.equal(
  settings.readVoipClientSettings(createApi({
    "skymp5-voip": {
      positionalAudioMode: "stereo",
    },
  })).positionalAudioMode,
  "stereo",
);

assert.equal(
  settings.readVoipClientSettings(createApi({
    "skymp5-client": {
      enabled: true,
      pttKey: "B",
      rawUiUrl: "https://legacy.example/raw",
      uiUrl: "https://legacy.example/ui",
      positionalAudioMode: "stereo",
    },
  })).enabled,
  false,
);

const defaultSettings = settings.readVoipClientSettings(createApi({}));
assert.equal(defaultSettings.positionalAudioMode, "off");
assert.equal(defaultSettings.pttKey, "V");
assert.equal(defaultSettings.rawUiUrl, "");
assert.equal(defaultSettings.uiUrl, "");

const pluginSettings = settings.readVoipClientSettings(createApi({
  "skymp5-voip": {
    enabled: true,
    positionalAudioMode: "stereo",
    pttKey: "B",
    rawUiUrl: "https://voice.example.com/raw",
    uiUrl: "https://voice.example.com/test",
  },
  "skymp5-client": {
    enabled: false,
    positionalAudioMode: "off",
    pttKey: "V",
    rawUiUrl: "https://legacy.example/raw",
    uiUrl: "https://legacy.example/ui",
  },
}));
assert.equal(pluginSettings.enabled, true);
assert.equal(pluginSettings.positionalAudioMode, "stereo");
assert.equal(pluginSettings.pttKey, "B");
assert.equal(pluginSettings.rawUiUrl, "https://voice.example.com/raw");
assert.equal(pluginSettings.uiUrl, "https://voice.example.com/test");

console.log("voipClientSettings.test.ts passed");
