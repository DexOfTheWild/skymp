import {
  ClientAddonConsoleCommandHandler,
  ClientAddonUnsubscribe,
} from "../../../../skymp5-addons-api/clientAddonHost";

export type ClientAddonConsoleCommandRegistration = {
  addonId: string;
  commandName: string;
  handler: ClientAddonConsoleCommandHandler;
};

type RegisterClientAddonConsoleCommandResult =
  | {
    ok: true;
    normalizedCommandName: string;
    unregister: ClientAddonUnsubscribe;
  }
  | {
    error: string;
    ok: false;
  };

export const normalizeClientAddonConsoleCommandName = (
  commandName: string,
): string => commandName.trim().toLowerCase();

export const registerClientAddonConsoleCommand = ({
  addonId,
  commandName,
  handler,
}: ClientAddonConsoleCommandRegistration): RegisterClientAddonConsoleCommandResult => {
  const normalizedCommandName = normalizeClientAddonConsoleCommandName(commandName);
  if (!normalizedCommandName) {
    return {
      error: "commandName must not be empty",
      ok: false,
    };
  }

  if (clientAddonConsoleCommands.has(normalizedCommandName)) {
    const existing = clientAddonConsoleCommands.get(normalizedCommandName);
    return {
      error: `command '${normalizedCommandName}' is already registered by addon '${existing?.addonId}'`,
      ok: false,
    };
  }

  clientAddonConsoleCommands.set(normalizedCommandName, {
    addonId,
    commandName: normalizedCommandName,
    handler,
  });

  return {
    normalizedCommandName,
    ok: true,
    unregister: () => {
      const current = clientAddonConsoleCommands.get(normalizedCommandName);
      if (!current || current.handler !== handler || current.addonId !== addonId) {
        return;
      }

      clientAddonConsoleCommands.delete(normalizedCommandName);
    },
  };
};

export const getClientAddonConsoleCommand = (
  commandName: string,
): ClientAddonConsoleCommandRegistration | undefined => {
  return clientAddonConsoleCommands.get(
    normalizeClientAddonConsoleCommandName(commandName),
  );
};

const clientAddonConsoleCommands =
  new Map<string, ClientAddonConsoleCommandRegistration>();
