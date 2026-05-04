type ClientAddonBrowserVisibilityState = {
  suppressedOwners: Record<string, true>;
};

declare global {
  // eslint-disable-next-line no-var
  var __skympClientAddonBrowserVisibilityState:
    | ClientAddonBrowserVisibilityState
    | undefined;
}

const ensureClientAddonBrowserVisibilityState =
(): ClientAddonBrowserVisibilityState => {
  if (!globalThis.__skympClientAddonBrowserVisibilityState) {
    globalThis.__skympClientAddonBrowserVisibilityState = {
      suppressedOwners: {},
    };
  }

  return globalThis.__skympClientAddonBrowserVisibilityState;
};

const normalizeOwnerId = (ownerId: string): string => ownerId.trim().toLowerCase();

export const isClientAddonBrowserVisibilitySuppressed = (): boolean => {
  const state = ensureClientAddonBrowserVisibilityState();
  return Object.keys(state.suppressedOwners).length > 0;
};

export const setClientAddonBrowserVisibilitySuppressed = (
  ownerId: string,
  suppressed: boolean,
): boolean => {
  const normalizedOwnerId = normalizeOwnerId(ownerId);
  if (!normalizedOwnerId) {
    return isClientAddonBrowserVisibilitySuppressed();
  }

  const state = ensureClientAddonBrowserVisibilityState();
  if (suppressed) {
    state.suppressedOwners[normalizedOwnerId] = true;
  } else {
    delete state.suppressedOwners[normalizedOwnerId];
  }

  return isClientAddonBrowserVisibilitySuppressed();
};
