type ClientPluginBrowserVisibilityState = {
  suppressedOwners: Record<string, true>;
};

declare global {
  // eslint-disable-next-line no-var
  var __skympClientPluginBrowserVisibilityState:
    | ClientPluginBrowserVisibilityState
    | undefined;
}

const ensureClientPluginBrowserVisibilityState =
(): ClientPluginBrowserVisibilityState => {
  if (!globalThis.__skympClientPluginBrowserVisibilityState) {
    globalThis.__skympClientPluginBrowserVisibilityState = {
      suppressedOwners: {},
    };
  }

  return globalThis.__skympClientPluginBrowserVisibilityState;
};

const normalizeOwnerId = (ownerId: string): string => ownerId.trim().toLowerCase();

export const isClientPluginBrowserVisibilitySuppressed = (): boolean => {
  const state = ensureClientPluginBrowserVisibilityState();
  return Object.keys(state.suppressedOwners).length > 0;
};

export const setClientPluginBrowserVisibilitySuppressed = (
  ownerId: string,
  suppressed: boolean,
): boolean => {
  const normalizedOwnerId = normalizeOwnerId(ownerId);
  if (!normalizedOwnerId) {
    return isClientPluginBrowserVisibilitySuppressed();
  }

  const state = ensureClientPluginBrowserVisibilityState();
  if (suppressed) {
    state.suppressedOwners[normalizedOwnerId] = true;
  } else {
    delete state.suppressedOwners[normalizedOwnerId];
  }

  return isClientPluginBrowserVisibilitySuppressed();
};
