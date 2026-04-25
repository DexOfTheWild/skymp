import assert from "assert";
import {
  ClientPluginBrowserApi,
  ClientPluginCapabilities,
  ClientPluginConsoleCommandHandler,
  ClientPluginUnsubscribe,
} from "../../skymp5-plugin-api/clientPluginHost";
import { getClientPluginConsoleCommand } from "../src/services/services/clientPluginConsoleCommandRegistry";
import { ClientPluginHostRuntime } from "../src/services/services/clientPluginHostRuntime";

type RuntimeHarness = {
  browserCalls: Array<{
    kind: string;
    payload?: unknown;
  }>;
  errors: unknown[][];
  runtime: ClientPluginHostRuntime;
};

const createHarness = (
  capabilities: ClientPluginCapabilities,
): RuntimeHarness => {
  const browserCalls: Array<{
    kind: string;
    payload?: unknown;
  }> = [];
  const errors: unknown[][] = [];
  const browser: ClientPluginBrowserApi = {
    emitEvent: (eventName: string, dataJson: string) => {
      browserCalls.push({
        kind: "emitEvent",
        payload: { dataJson, eventName },
      });
    },
    getBackendName: () => "test",
    isFocused: () => false,
    isVisible: () => false,
    loadUrl: (url: string) => {
      browserCalls.push({
        kind: "loadUrl",
        payload: url,
      });
    },
    setFocused: (focused: boolean) => {
      browserCalls.push({
        kind: "setFocused",
        payload: focused,
      });
    },
    setMediaPermissionPolicy: (policy) => {
      browserCalls.push({
        kind: "setMediaPermissionPolicy",
        payload: policy,
      });
    },
    setVisible: (visible: boolean) => {
      browserCalls.push({
        kind: "setVisible",
        payload: visible,
      });
    },
  };

  return {
    browserCalls,
    errors,
    runtime: new ClientPluginHostRuntime({
      browser,
      capabilities,
      getLocalProfileId: () => 101,
      getSettingsScope: () => undefined,
      log: () => undefined,
      logError: (...args: unknown[]) => {
        errors.push(args);
      },
      registerConsoleCommand: (
        pluginId: string,
        commandName: string,
        handler: ClientPluginConsoleCommandHandler,
      ): ClientPluginUnsubscribe => {
        const { registerClientPluginConsoleCommand } = require("../src/services/services/clientPluginConsoleCommandRegistry");
        const registration = registerClientPluginConsoleCommand({
          commandName,
          handler,
          pluginId,
        });
        if (!registration.ok) {
          throw new Error(String(registration.error));
        }

        return registration.unregister;
      },
      resolveScanCode: () => 55,
      sendCustomPacket: () => undefined,
    }),
  };
};

const testDuplicatePluginIdRegistration = () => {
  const harness = createHarness({
    browser: {
      mediaPermissionPolicies: [],
    },
    consoleCommands: true,
  });
  let initCalls = 0;

  harness.runtime.registerPlugin("example", () => {
    initCalls += 1;
  });
  harness.runtime.registerPlugin(" example ", () => {
    initCalls += 1;
  });

  assert.equal(initCalls, 1);
  assert.equal(harness.errors.length, 1);
  assert.match(String(harness.errors[0][1]), /duplicate client plugin registration/i);
};

const testLocalSpawnReplayIsErrorIsolated = () => {
  const harness = createHarness({
    browser: {
      mediaPermissionPolicies: [],
    },
    consoleCommands: true,
  });
  let spawnCalls = 0;

  harness.runtime.dispatchLocalSpawn({ profileId: 9001 });
  harness.runtime.registerPlugin("spawn-safe", (api) => {
    api.onLocalSpawn(() => {
      spawnCalls += 1;
      throw new Error("boom");
    });
  });

  assert.equal(spawnCalls, 1);
  assert.equal(harness.errors.length, 1);
  assert.match(String(harness.errors[0][1]), /local spawn handler failed/i);
};

const testConsoleCommandRegistrationAndUnregistration = () => {
  const harness = createHarness({
    browser: {
      mediaPermissionPolicies: [],
    },
    consoleCommands: true,
  });
  let unregister: ClientPluginUnsubscribe = () => {
    throw new Error("Expected unregister handler");
  };
  const commandName = "pluginhosttest";

  harness.runtime.registerPlugin("console", (api) => {
    unregister = api.registerConsoleCommand(commandName, () => true);
  });

  assert.ok(getClientPluginConsoleCommand(commandName));
  unregister();
  assert.equal(getClientPluginConsoleCommand(commandName), undefined);
};

const testCapabilitiesReflectMediaPermissionPolicySupport = () => {
  const harness = createHarness({
    browser: {
      mediaPermissionPolicies: ["default", "secureOriginAudioCapture"],
    },
    consoleCommands: true,
  });
  let seenCapabilities: ClientPluginCapabilities | null = null;

  harness.runtime.registerPlugin("capabilities", (api) => {
    seenCapabilities = api.capabilities;
  });

  assert.deepEqual(seenCapabilities, {
    browser: {
      mediaPermissionPolicies: ["default", "secureOriginAudioCapture"],
    },
    consoleCommands: true,
  });
};

testDuplicatePluginIdRegistration();
testLocalSpawnReplayIsErrorIsolated();
testConsoleCommandRegistrationAndUnregistration();
testCapabilitiesReflectMediaPermissionPolicySupport();

console.log("clientPluginHostRuntime.test.ts passed");
