import { ClientPluginApi } from "../../skymp5-plugin-api/clientPluginHost";
import {
  setClientPluginBrowserVisibilitySuppressed,
} from "../../skymp5-plugin-api/clientPluginBrowserVisibility";
import { isVoipDebugUiVisible } from "../../skymp5-plugin-api/voipDebugUiState";
import { VoipClientSettings } from "./voipClientSettings";
import { VoipSetHostStateDetail } from "./voipBrowserHostProtocol";

export const createVoipBrowserHostStateDetail = ({
  foregroundBootstrap,
  hasLocalPlayer,
  identity,
  settings,
}: {
  foregroundBootstrap: boolean;
  hasLocalPlayer: boolean;
  identity: string;
  settings: VoipClientSettings;
}): VoipSetHostStateDetail => {
  return {
    debugUiVisible: isVoipDebugUiVisible(),
    enabled: hasLocalPlayer && settings.enabled && !!identity && !!settings.uiUrl,
    foregroundBootstrap,
    identity,
    rawUiUrl: settings.rawUiUrl,
    uiUrl: settings.uiUrl,
  };
};

export const syncVoipBrowserVisibilitySuppression = (
  hasLocalPlayer: boolean,
  settings: VoipClientSettings,
): void => {
  setClientPluginBrowserVisibilitySuppressed(
    "voip",
    hasLocalPlayer && settings.enabled && !isVoipDebugUiVisible(),
  );
};

export const focusVoipBrowser = (
  api: ClientPluginApi,
  reason: string,
): void => {
  const wasFocused = api.browser.isFocused();
  if (wasFocused) {
    return;
  }

  api.log("VoIP requesting browser focus", {
    reason,
    visible: api.browser.isVisible(),
    wasFocused,
  });
  api.browser.setFocused(true);
};

export const blurVoipBrowser = (
  api: ClientPluginApi,
  reason: string,
): void => {
  const wasFocused = api.browser.isFocused();
  if (!wasFocused) {
    return;
  }

  api.log("VoIP releasing browser focus", {
    reason,
    visible: api.browser.isVisible(),
    wasFocused,
  });
  api.browser.setFocused(false);
};
