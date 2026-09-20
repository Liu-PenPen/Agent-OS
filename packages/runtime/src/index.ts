import { createServer } from "node:http";

const HOST = "127.0.0.1";
const PORT = 17890;

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, HOST, () => {
  console.log(`Runtime listening on http://${HOST}:${PORT}`);
});
