const WS_URL = "ws://127.0.0.1:17890/ws";

export type WsHandler = (event: unknown) => void;

/**
 * Runtime event socket. Reconnects after the runtime process restarts,
 * otherwise the run card stays on the first HTTP snapshot.
 */
export function connectWs(
  onEvent: WsHandler,
  onOpen?: () => void,
): { close: () => void } {
  let stopped = false;
  let socket: WebSocket | undefined;
  let retry: number | undefined;

  const connect = () => {
    if (stopped) return;
    const ws = new WebSocket(WS_URL);
    socket = ws;
    ws.addEventListener("open", () => {
      onOpen?.();
    });
    ws.addEventListener("message", (message) => {
      try {
        onEvent(JSON.parse(String(message.data)));
      } catch {
        onEvent(message.data);
      }
    });
    ws.addEventListener("close", () => {
      if (stopped) return;
      retry = window.setTimeout(connect, 1000);
    });
  };

  connect();
  return {
    close() {
      stopped = true;
      if (retry !== undefined) window.clearTimeout(retry);
      socket?.close();
    },
  };
}

export { WS_URL };
