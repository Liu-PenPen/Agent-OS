const WS_URL = "ws://127.0.0.1:17890/ws";

export type WsHandler = (event: unknown) => void;

/**
 * Minimal WebSocket client for runtime events.
 * Connection is optional for shell/theme; reconnects are left to callers.
 */
export function connectWs(onEvent: WsHandler): WebSocket {
  const ws = new WebSocket(WS_URL);
  ws.addEventListener("message", (message) => {
    try {
      onEvent(JSON.parse(String(message.data)));
    } catch {
      onEvent(message.data);
    }
  });
  return ws;
}

export { WS_URL };
