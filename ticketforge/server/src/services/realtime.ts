import { Server } from "socket.io";
import type { Server as HTTPServer } from "http";

export function initRealtime(httpServer: HTTPServer) {
  const io = new Server(httpServer, { cors: { origin: "http://localhost:3000", credentials: true } });
  io.on("connection", (socket) => {
    socket.on("subscribe", (room: string) => socket.join(room));
  });
  return io;
}
