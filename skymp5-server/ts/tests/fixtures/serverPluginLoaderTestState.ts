type ServerPluginLoaderTestState = {
  events: Array<{
    kind: string;
    payload?: unknown;
  }>;
};

declare global {
  // eslint-disable-next-line no-var
  var __skympServerPluginLoaderTestState: ServerPluginLoaderTestState | undefined;
}

const ensureState = (): ServerPluginLoaderTestState => {
  if (!globalThis.__skympServerPluginLoaderTestState) {
    globalThis.__skympServerPluginLoaderTestState = {
      events: [],
    };
  }

  return globalThis.__skympServerPluginLoaderTestState;
};

export const pushServerPluginLoaderTestEvent = (
  kind: string,
  payload?: unknown,
): void => {
  ensureState().events.push({
    kind,
    payload,
  });
};

export const getServerPluginLoaderTestEvents = (): Array<{
  kind: string;
  payload?: unknown;
}> => {
  return [...ensureState().events];
};

export const resetServerPluginLoaderTestState = (): void => {
  ensureState().events = [];
};
