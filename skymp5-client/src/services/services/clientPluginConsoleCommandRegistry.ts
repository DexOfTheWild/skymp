import {
  ClientPluginConsoleCommandHandler,
  ClientPluginUnsubscribe,
} from "../../../../skymp5-plugin-api/clientPluginHost";

export type ClientPluginConsoleCommandRegistration = {
  commandName: string;
  handler: ClientPluginConsoleCommandHandler;
  pluginId: string;
};

type RegisterClientPluginConsoleCommandResult =
  | {
    ok: true;
    normalizedCommandName: string;
    unregister: ClientPluginUnsubscribe;
  }
  | {
    error: string;
    ok: false;
  };

export const normalizeClientPluginConsoleCommandName = (
  commandName: string,
): string => commandName.trim().toLowerCase();

export const registerClientPluginConsoleCommand = ({
  commandName,
  handler,
  pluginId,
}: ClientPluginConsoleCommandRegistration): RegisterClientPluginConsoleCommandResult => {
  const normalizedCommandName = normalizeClientPluginConsoleCommandName(commandName);
  if (!normalizedCommandName) {
    return {
      error: "commandName must not be empty",
      ok: false,
    };
  }

  if (clientPluginConsoleCommands.has(normalizedCommandName)) {
    const existing = clientPluginConsoleCommands.get(normalizedCommandName);
    return {
      error: `command '${normalizedCommandName}' is already registered by plugin '${existing?.pluginId}'`,
      ok: false,
    };
  }

  clientPluginConsoleCommands.set(normalizedCommandName, {
    commandName: normalizedCommandName,
    handler,
    pluginId,
  });

  return {
    normalizedCommandName,
    ok: true,
    unregister: () => {
      const current = clientPluginConsoleCommands.get(normalizedCommandName);
      if (!current || current.handler !== handler || current.pluginId !== pluginId) {
        return;
      }

      clientPluginConsoleCommands.delete(normalizedCommandName);
    },
  };
};

export const getClientPluginConsoleCommand = (
  commandName: string,
): ClientPluginConsoleCommandRegistration | undefined => {
  return clientPluginConsoleCommands.get(
    normalizeClientPluginConsoleCommandName(commandName),
  );
};

const clientPluginConsoleCommands =
  new Map<string, ClientPluginConsoleCommandRegistration>();
