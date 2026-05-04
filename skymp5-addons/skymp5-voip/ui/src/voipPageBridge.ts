import {
  VOIP_BROWSER_COMMAND_EVENT,
  VOIP_COMMAND_PAYLOAD_ATTR,
  VOIP_COMMAND_SEQUENCE_ATTR,
  VOIP_PAGE_ERROR_MESSAGE,
  VOIP_PAGE_LOADED_MESSAGE,
  VOIP_PAGE_LOG_MESSAGE,
  VOIP_PAGE_MEDIA_STATE_MESSAGE,
  VOIP_SET_AUDIO_STATE_EVENT,
  VOIP_SET_AUDIBLE_PARTICIPANTS_EVENT,
  VOIP_SET_DEBUG_STATE_EVENT,
  VOIP_SET_LOCAL_PLAYER_ID_EVENT,
  VOIP_SET_PTT_EVENT,
  VOIP_SET_VOICE_MODE_EVENT,
  VoipBrowserCommandName,
  VoipPageLoadedPayload,
  VoipPageLogLevel,
  VoipPageMediaState,
  VoipSetAudioStateDetail,
  VoipSetAudibleParticipantsDetail,
  VoipSetDebugStateDetail,
  VoipSetLocalPlayerIdDetail,
  VoipSetPttDetail,
  VoipSetVoiceModeDetail,
} from "../../shared/voipProtocol";

declare global {
  interface Window {
    __skympDispatchVoipCommand?: (eventName: string, detail: unknown) => void;
    __skympVoipCommandQueue?: PendingVoipCommand[];
    skyrimPlatform?: {
      addEventListener?: (eventName: string, callback: (data: string) => void) => void;
      sendMessage?: (...args: unknown[]) => void;
    };
  }
}

export type PendingVoipCommand = {
  detail: unknown;
  eventName: VoipBrowserCommandName;
  sequence?: number;
};

type VoipPageBridgeOptions = {
  onCommand: (command: PendingVoipCommand) => void;
  onParseError?: (message: string, details?: unknown) => void;
};

type VoipEmbeddedHostToPageMessage =
  | {
    payload?: Record<string, unknown>;
    source: "skymp5-front-voip-shell" | "skymp5-voip-host";
    type: "init";
  }
  | {
    detail: unknown;
    eventName: VoipBrowserCommandName;
    sequence?: number;
    source: "skymp5-front-voip-shell" | "skymp5-voip-host";
    type: "command";
  };

type VoipPageToHostMessage =
  | {
    details?: unknown;
    level?: VoipPageLogLevel;
    message?: string;
    source: "skymp5-voip-iframe";
    type: "log";
  }
  | {
    payload?: Record<string, unknown>;
    source: "skymp5-voip-iframe";
    type: "error" | "media-state" | "page-loaded";
  };

const VOIP_HOST_BRIDGE_QUERY_PARAM = "skympVoipHostBridge" as const;
const LEGACY_VOIP_HOST_BRIDGE_QUERY_PARAM = "skympShellBridge" as const;
const VOIP_HOST_SOURCE = "skymp5-voip-host" as const;
const LEGACY_VOIP_HOST_SOURCE = "skymp5-front-voip-shell" as const;
const VOIP_PAGE_SOURCE = "skymp5-voip-iframe" as const;

const serializeBridgeDetails = (details: unknown): unknown => {
  if (details === undefined || details === null || typeof details === "string") {
    return details;
  }

  if (details instanceof Error) {
    return {
      message: details.message,
      name: details.name,
      stack: details.stack || details.message,
    };
  }

  if (typeof DOMException !== "undefined" && details instanceof DOMException) {
    return {
      message: details.message,
      name: details.name,
      stack: details.message,
    };
  }

  if (typeof details === "object") {
    const errorLike = details as {
      message?: unknown;
      name?: unknown;
      stack?: unknown;
    };
    if (
      typeof errorLike.message === "string" ||
      typeof errorLike.name === "string" ||
      typeof errorLike.stack === "string"
    ) {
      return {
        message:
          typeof errorLike.message === "string"
            ? errorLike.message
            : typeof errorLike.name === "string"
              ? errorLike.name
              : "unknown error",
        name: typeof errorLike.name === "string" ? errorLike.name : undefined,
        stack:
          typeof errorLike.stack === "string"
            ? errorLike.stack
            : typeof errorLike.message === "string"
              ? errorLike.message
              : undefined,
      };
    }
  }

  return details;
};

const normalizeBridgeDetails = (details: unknown): unknown => {
  const normalized = serializeBridgeDetails(details);
  return normalized === undefined ? null : normalized;
};

const isEmbeddedHostBridgeEnabled = (): boolean => {
  const params = new URLSearchParams(window.location.search);
  return params.get(VOIP_HOST_BRIDGE_QUERY_PARAM) === "1" ||
    params.get(LEGACY_VOIP_HOST_BRIDGE_QUERY_PARAM) === "1";
};

const createHostBridgeMessage = (
  eventName: string,
  args: unknown[],
): VoipPageToHostMessage | null => {
  switch (eventName) {
    case VOIP_PAGE_LOADED_MESSAGE:
      return {
        payload: (args[0] as Record<string, unknown> | undefined) || {},
        source: VOIP_PAGE_SOURCE,
        type: "page-loaded",
      };
    case VOIP_PAGE_LOG_MESSAGE:
      return {
        details: normalizeBridgeDetails(args[2]),
        level: (typeof args[0] === "string" ? args[0] : "info") as VoipPageLogLevel,
        message: typeof args[1] === "string" ? args[1] : "",
        source: VOIP_PAGE_SOURCE,
        type: "log",
      };
    case VOIP_PAGE_ERROR_MESSAGE:
      return {
        payload: {
          details: normalizeBridgeDetails(args[1]),
          message: typeof args[0] === "string" ? args[0] : "unknown error",
        },
        source: VOIP_PAGE_SOURCE,
        type: "error",
      };
    case VOIP_PAGE_MEDIA_STATE_MESSAGE:
      return {
        payload: (args[0] as Record<string, unknown> | undefined) || {},
        source: VOIP_PAGE_SOURCE,
        type: "media-state",
      };
    default:
      return null;
  }
};

const sendBridgeMessage = (eventName: string, ...args: unknown[]): void => {
  try {
    if (isEmbeddedHostBridgeEnabled() && window.parent && window.parent !== window) {
      const message = createHostBridgeMessage(eventName, args);
      if (message) {
        window.parent.postMessage(message, "*");
        return;
      }
    }

    if (typeof window.skyrimPlatform?.sendMessage === "function") {
      window.skyrimPlatform.sendMessage(eventName, ...args);
    }
  } catch (error) {
    console.error("[voip-page bridge error]", error);
  }
};

const parseNativeEventPayload = (
  payloadData: unknown,
  onParseError?: (message: string, details?: unknown) => void,
): PendingVoipCommand | null => {
  const payload = typeof payloadData === "string"
    ? (() => {
      try {
        return JSON.parse(payloadData) as PendingVoipCommand;
      } catch (error) {
        onParseError?.("failed to parse native VoIP event payload", error);
        return null;
      }
    })()
    : payloadData as PendingVoipCommand | null;

  if (!payload || typeof payload.eventName !== "string") {
    onParseError?.("ignored malformed native VoIP event payload", payloadData);
    return null;
  }

  return payload;
};

const createPendingDomCommandReader = (
  onCommand: (command: PendingVoipCommand) => void,
  onParseError?: (message: string, details?: unknown) => void,
): (() => void) => {
  return () => {
    const root = document.documentElement;
    if (!root) {
      return;
    }

    const sequence = Number.parseInt(
      root.getAttribute(VOIP_COMMAND_SEQUENCE_ATTR) || "0",
      10,
    );
    if (!Number.isFinite(sequence) || sequence <= 0) {
      return;
    }

    const payloadJson = root.getAttribute(VOIP_COMMAND_PAYLOAD_ATTR);
    if (!payloadJson) {
      return;
    }

    let payload: PendingVoipCommand;
    try {
      payload = JSON.parse(payloadJson) as PendingVoipCommand;
    } catch (error) {
      onParseError?.("failed to parse pending VoIP DOM command", error);
      return;
    }

    if (typeof payload.eventName !== "string" || payload.sequence !== sequence) {
      onParseError?.("ignored malformed VoIP DOM command", {
        payload,
        sequence,
      });
      return;
    }

    onCommand(payload);
  };
};

export const bridgePageLoaded = (page: string): void => {
  const payload: VoipPageLoadedPayload = {
    hasFocus: document.hasFocus(),
    href: window.location.href,
    isSecureContext: window.isSecureContext,
    mediaDevicesAvailable: typeof navigator.mediaDevices?.getUserMedia === "function",
    page,
    visibilityState: document.visibilityState,
  };
  sendBridgeMessage(VOIP_PAGE_LOADED_MESSAGE, payload);
};

export const bridgeLog = (
  level: VoipPageLogLevel,
  message: string,
  details?: unknown,
): void => {
  sendBridgeMessage(VOIP_PAGE_LOG_MESSAGE, level, message, normalizeBridgeDetails(details));
};

export const bridgeError = (message: string, details?: unknown): void => {
  sendBridgeMessage(VOIP_PAGE_ERROR_MESSAGE, message, normalizeBridgeDetails(details));
};

export const bridgeMediaState = (state: VoipPageMediaState): void => {
  sendBridgeMessage(VOIP_PAGE_MEDIA_STATE_MESSAGE, state);
};

export const readIdentityFromQuery = (): string => {
  return new URLSearchParams(window.location.search).get("identity")?.trim() || "";
};

export const readIceTransportPolicyFromQuery = (): "all" | "relay" => {
  const params = new URLSearchParams(window.location.search);
  const explicitPolicy = params.get("iceTransportPolicy")?.trim().toLowerCase();
  if (explicitPolicy === "relay") {
    return "relay";
  }

  const forceRelay = params.get("forceRelay")?.trim().toLowerCase();
  if (forceRelay === "1" || forceRelay === "true" || forceRelay === "yes") {
    return "relay";
  }

  return "all";
};

export const registerVoipPageCommandBridge = ({
  onCommand,
  onParseError,
}: VoipPageBridgeOptions): (() => void) => {
  const listeners: Array<{
    eventName: string;
    handler: EventListener;
    target: Window & typeof globalThis;
  }> = [];
  const addWindowListener = (eventName: string, handler: EventListener) => {
    window.addEventListener(eventName, handler);
    listeners.push({ eventName, handler, target: window });
  };

  const handleNativeEventPayload = (payloadData: unknown) => {
    const payload = parseNativeEventPayload(payloadData, onParseError);
    if (!payload) {
      return;
    }

    onCommand(payload);
  };

  const applyPendingDomCommand = createPendingDomCommandReader(onCommand, onParseError);

  const handleEmbeddedHostMessage = (event: MessageEvent) => {
    const payload = event.data as VoipEmbeddedHostToPageMessage | undefined;
    if (
      !payload ||
      (payload.source !== VOIP_HOST_SOURCE && payload.source !== LEGACY_VOIP_HOST_SOURCE)
    ) {
      return;
    }

    if (payload.type === "init") {
      const debugUiVisible =
        (payload.payload as { debugUiVisible?: unknown } | undefined)?.debugUiVisible === true;
      onCommand({
        detail: { debugUiVisible } satisfies VoipSetDebugStateDetail,
        eventName: VOIP_SET_DEBUG_STATE_EVENT,
      });
      return;
    }

    if (payload.type === "command") {
      onCommand({
        detail: payload.detail,
        eventName: payload.eventName,
        sequence: payload.sequence,
      });
    }
  };

  const handleBrowserEvent = (event: Event) => {
    const detail = (event as CustomEvent<{ data?: unknown; eventName?: unknown }>).detail;
    if (detail?.eventName !== VOIP_BROWSER_COMMAND_EVENT) {
      return;
    }
    handleNativeEventPayload(detail.data);
  };

  window.__skympDispatchVoipCommand = (eventName: string, detail: unknown) => {
    onCommand({
      detail,
      eventName: eventName as VoipBrowserCommandName,
    });
  };

  if (isEmbeddedHostBridgeEnabled()) {
    addWindowListener("message", handleEmbeddedHostMessage as EventListener);
  }

  if (typeof window.skyrimPlatform?.addEventListener === "function") {
    window.skyrimPlatform.addEventListener(VOIP_BROWSER_COMMAND_EVENT, (payloadData: unknown) => {
      handleNativeEventPayload(payloadData);
    });
  }

  addWindowListener("skymp-browser-event", handleBrowserEvent as EventListener);

  let domCommandObserver: MutationObserver | null = null;
  const root = document.documentElement;
  if (root && typeof MutationObserver !== "undefined") {
    domCommandObserver = new MutationObserver(() => {
      applyPendingDomCommand();
    });
    domCommandObserver.observe(root, {
      attributeFilter: [VOIP_COMMAND_PAYLOAD_ATTR, VOIP_COMMAND_SEQUENCE_ATTR],
      attributes: true,
    });
  }

  const pendingQueue = Array.isArray(window.__skympVoipCommandQueue)
    ? window.__skympVoipCommandQueue.splice(0)
    : [];
  for (const pendingCommand of pendingQueue) {
    onCommand(pendingCommand);
  }

  applyPendingDomCommand();

  addWindowListener(VOIP_SET_PTT_EVENT, ((event: Event) => {
    onCommand({
      detail: (event as CustomEvent<VoipSetPttDetail>).detail,
      eventName: VOIP_SET_PTT_EVENT,
    });
  }) as EventListener);

  addWindowListener(VOIP_SET_AUDIBLE_PARTICIPANTS_EVENT, ((event: Event) => {
    onCommand({
      detail: (event as CustomEvent<VoipSetAudibleParticipantsDetail>).detail,
      eventName: VOIP_SET_AUDIBLE_PARTICIPANTS_EVENT,
    });
  }) as EventListener);

  addWindowListener(VOIP_SET_LOCAL_PLAYER_ID_EVENT, ((event: Event) => {
    onCommand({
      detail: (event as CustomEvent<VoipSetLocalPlayerIdDetail>).detail,
      eventName: VOIP_SET_LOCAL_PLAYER_ID_EVENT,
    });
  }) as EventListener);

  addWindowListener(VOIP_SET_VOICE_MODE_EVENT, ((event: Event) => {
    onCommand({
      detail: (event as CustomEvent<VoipSetVoiceModeDetail>).detail,
      eventName: VOIP_SET_VOICE_MODE_EVENT,
    });
  }) as EventListener);

  addWindowListener(VOIP_SET_AUDIO_STATE_EVENT, ((event: Event) => {
    onCommand({
      detail: (event as CustomEvent<VoipSetAudioStateDetail>).detail,
      eventName: VOIP_SET_AUDIO_STATE_EVENT,
    });
  }) as EventListener);

  addWindowListener(VOIP_SET_DEBUG_STATE_EVENT, ((event: Event) => {
    onCommand({
      detail: (event as CustomEvent<VoipSetDebugStateDetail>).detail,
      eventName: VOIP_SET_DEBUG_STATE_EVENT,
    });
  }) as EventListener);

  return () => {
    if (window.__skympDispatchVoipCommand) {
      delete window.__skympDispatchVoipCommand;
    }
    for (const listener of listeners) {
      listener.target.removeEventListener(listener.eventName, listener.handler);
    }
    if (domCommandObserver) {
      domCommandObserver.disconnect();
    }
  };
};
