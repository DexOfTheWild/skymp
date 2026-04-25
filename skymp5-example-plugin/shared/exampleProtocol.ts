export const EXAMPLE_PLUGIN_ID = "example" as const;
export const EXAMPLE_BROWSER_EVENT = "skymp5-example:state" as const;
export const EXAMPLE_CLIENT_PING_PACKET_TYPE = "example:ping" as const;
export const EXAMPLE_SERVER_WELCOME_PACKET_TYPE = "example:welcome" as const;
export const EXAMPLE_SERVER_PONG_PACKET_TYPE = "example:pong" as const;

export type ExamplePluginServerConfig = {
  greeting?: string;
};

export const createExampleWelcomePacket = (payload: {
  greeting: string;
  profileId: number;
}): Record<string, unknown> => {
  return {
    customPacketType: EXAMPLE_SERVER_WELCOME_PACKET_TYPE,
    ...payload,
  };
};

export const createExamplePongPacket = (payload: {
  greeting: string;
  received: Record<string, unknown>;
}): Record<string, unknown> => {
  return {
    customPacketType: EXAMPLE_SERVER_PONG_PACKET_TYPE,
    ...payload,
  };
};

export const createExamplePingPacket = (payload: {
  source: string;
}): Record<string, unknown> => {
  return {
    customPacketType: EXAMPLE_CLIENT_PING_PACKET_TYPE,
    ...payload,
  };
};
