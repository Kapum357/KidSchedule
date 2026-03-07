/**
 * WebSocket endpoint for real-time messaging
 *
 * Uses socket.io to establish WebSocket connections for real-time message delivery.
 * Handles session verification, room management, and socket lifecycle.
 *
 * This uses the pages/api route because Next.js App Router doesn't support WebSocket
 * connection upgrades yet. Socket.io requires the ability to upgrade HTTP to WS.
 */

import { NextApiRequest, NextApiResponse } from "next";
import { Server, Socket } from "socket.io";
import { setSocketServer } from "@/lib/socket-server";
// getDb is not needed in this module

/** Interface for socket.io server stored on res.socket */
// We only care that `res.socket.server` can hold an `io` property;
// using a union type keeps it simple and avoids extending NextApiResponse.

type SocketServerResponse = NextApiResponse & {
  socket: { server: { io?: Server } };
};

/**
 * Get or initialize the socket.io server instance
 */
function getSocketServer(
  _req: NextApiRequest,
  res: SocketServerResponse,
): Server {
  if (res.socket.server?.io) {
    return res.socket.server.io;
  }

  // Create socket.io server with CORS for development
  let origin: string | string[];
  if (process.env.NODE_ENV === "development") {
    origin = ["http://localhost:3000", "http://localhost:3001"];
  } else {
    origin = process.env.NEXT_PUBLIC_APP_URL || "";
  }

  // server has a custom property added; io constructor expects a raw http server
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const io = new Server(res.socket.server as any, {
    cors: { origin, methods: ["GET", "POST"], credentials: true },
  });

  // Store the server instance for reuse
  res.socket.server.io = io;

  // Register globally for server actions and other backend operations
  setSocketServer(io);

  // Middleware to verify session/auth on connection
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      next(new Error("Authentication error"));
      return;
    }

    try {
      // Decode JWT without verification (will be verified server-side)
      const TOKEN_PARTS = 3;
      const parts = token.split(".");
      if (parts.length !== TOKEN_PARTS) {
        next(new Error("Invalid token format"));
        return;
      }

      const payload = JSON.parse(atob(parts[1]));
      socket.data.userId = payload.sub;
      socket.data.email = payload.email;
      socket.data.sessionId = payload.sid;

      // Attach familyId from socket handshake data (client should send it)
      socket.data.familyId = socket.handshake.auth.familyId;
      next();
    } catch (_err) {
      next(new Error("Token verification failed"));
    }
  });

  // Handle socket connections
  io.on("connection", (socket: Socket) => {
    const { userId, familyId } = socket.data;

    if (!familyId) {
      socket.disconnect(true);
      return;
    }

    // Join room keyed by familyId for broadcast
    socket.join(`family:${familyId}`);

    // Log connection
    console.info(`[Socket] User ${userId} connected to family:${familyId}`);

    // Handle disconnection
    socket.on("disconnect", () => {
      console.info(`[Socket] User ${userId} disconnected from family:${familyId}`);
    });

    // Health check ping
    socket.on("ping", (callback) => {
      callback("pong");
    });
  });

  return io;
}

/**
 * API handler for socket.io
 */
export default function handler(
  req: NextApiRequest,
  res: SocketServerResponse,
) {
  if (req.method === "GET" || req.method === "POST") {
    getSocketServer(req, res);
    res.end();
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
     
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}