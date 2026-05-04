export const VOIP_SET_HOST_STATE_EVENT = "skymp5-voip:set-host-state" as const;
export const LEGACY_VOIP_SET_SHELL_STATE_EVENT =
  "skymp5-voip:set-shell-state" as const;

export type VoipSetHostStateDetail = {
  debugUiVisible?: boolean;
  enabled?: boolean;
  foregroundBootstrap?: boolean;
  identity?: string;
  rawUiUrl?: string;
  uiUrl?: string;
};
