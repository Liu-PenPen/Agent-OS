import type { Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { ChatEvent } from "./services/chat-service.js";

export type WsEvent = ChatEvent;

export function attachWebSocket(server: Server): {
  broadcast: (event: WsEvent) => void;
} {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  function broadcast(event: WsEvent): void {
    const payload = JSON.stringify(event);
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  }

  wss.on("connection", (ws: WebSocket) => {
    ws.on("error", () => {
      ws.close();
    });
  });

  return { broadcast };
}
