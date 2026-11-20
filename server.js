// Leve — servidor de sinalização e hospedagem estática
// Requer Node.js 20 ou superior. O áudio/vídeo é transportado diretamente entre navegadores (WebRTC).
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = path.join(__dirname, "public");
const MAX_ROOM_SIZE = 6;
const rooms = new Map();
const clients = new Map();

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 64 * 1024) {
        reject(new Error("Corpo da requisição muito grande"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); } catch { reject(new Error("JSON inválido")); }
    });
    req.on("error", reject);
  });
}
function emit(client, data) {
  if (!client || client.res.destroyed) return;
  client.res.write(`data: ${JSON.stringify(data)}\n\n`);
}
function roomOf(id) {
  const client = clients.get(id);
  return client && rooms.get(client.room);
}
function removeClient(id) {
  const client = clients.get(id);
  if (!client) return;
  const room = rooms.get(client.room);
  if (room) {
    room.members.delete(id);
    for (const otherId of room.members) emit(clients.get(otherId), { type: "left", id });
    if (room.members.size === 0) rooms.delete(client.room);
  }
  if (client.res && !client.res.destroyed) client.res.end();
  clients.delete(id);
}
function safeRoom(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}
function serveStatic(req, res) {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const requested = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const file = path.resolve(PUBLIC, requested);
  if (!file.startsWith(PUBLIC + path.sep) && file !== path.join(PUBLIC, "index.html")) {
    res.writeHead(403); return res.end("Forbidden");
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    const ext = path.extname(file);
    const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream", "X-Content-Type-Options": "nosniff", "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "GET" && url.pathname === "/health") return sendJson(res, 200, { ok: true, service: "Leve" });

  if (req.method === "POST" && url.pathname === "/join") {
    try {
      const data = await readJson(req);
      const roomCode = safeRoom(data.room);
      if (roomCode.length !== 6) return sendJson(res, 400, { error: "Código de sala inválido." });
      let room = rooms.get(roomCode);
      if (!room) { room = { members: new Set() }; rooms.set(roomCode, room); }
      if (room.members.size >= MAX_ROOM_SIZE) return sendJson(res, 200, { full: true });
      const id = crypto.randomBytes(12).toString("hex");
      const peers = [...room.members];
      room.members.add(id);
      clients.set(id, { id, room: roomCode, res: null });
      return sendJson(res, 200, { id, peers });
    } catch (err) { return sendJson(res, 400, { error: err.message }); }
  }

  if (req.method === "GET" && url.pathname === "/events") {
    const id = url.searchParams.get("id");
    const client = clients.get(id);
    if (!client) { res.writeHead(404); return res.end("Sala não encontrada"); }
    if (client.res && !client.res.destroyed) client.res.end();
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    });
    res.write("retry: 2000\n\n");
    client.res = res;
    const room = rooms.get(client.room);
    emit(client, { type: "hello", id, peers: room ? [...room.members].filter(x => x !== id) : [] });
    const heartbeat = setInterval(() => { if (!res.destroyed) res.write(": keepalive\n\n"); }, 20000);
    res.on("close", () => {
      clearInterval(heartbeat);
      // A short reconnect grace period avoids removing a participant on transient SSE reconnects.
      setTimeout(() => {
        if (clients.get(id) === client && client.res === res) removeClient(id);
      }, 8000);
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/send") {
    try {
      const data = await readJson(req);
      const sender = clients.get(data.id);
      if (!sender) return sendJson(res, 404, { error: "Participante não encontrado." });
      const room = roomOf(data.id);
      if (!room) return sendJson(res, 404, { error: "Sala não encontrada." });

      if (data.type === "signal") {
        const target = clients.get(data.to);
        if (target && target.room === sender.room) {
          emit(target, { type: "signal", from: sender.id, data: data.data });
        }
      } else if (data.type === "chat") {
        const name = String(data.name || "Convidado").slice(0, 20);
        const message = String(data.text || "").slice(0, 2000);
        for (const memberId of room.members) {
          if (memberId !== sender.id) emit(clients.get(memberId), { type: "chat", name, text: message });
        }
      }
      return sendJson(res, 200, { ok: true });
    } catch (err) { return sendJson(res, 400, { error: err.message }); }
  }

  if (req.method === "GET") return serveStatic(req, res);
  res.writeHead(405); res.end("Method not allowed");
});

server.listen(PORT, "0.0.0.0", () => console.log(`Leve disponível na porta ${PORT}`));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
