declare global {
  // eslint-disable-next-line no-var
  var __skympVoipDebugUiVisible: boolean | undefined;
}

export const isVoipDebugUiVisible = (): boolean => {
  return globalThis.__skympVoipDebugUiVisible === true;
};

export const setVoipDebugUiVisible = (visible: boolean): boolean => {
  globalThis.__skympVoipDebugUiVisible = visible;
  return visible;
};

export const toggleVoipDebugUiVisible = (): boolean => {
  return setVoipDebugUiVisible(!isVoipDebugUiVisible());
};
