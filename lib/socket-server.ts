/**
 * Socket.io server helpers
 *
 * Provides utilities for emitting real-time events from server actions
 * and other backend operations to connected clients.
 */

import { Server } from "socket.io";
import type { Message } from "@/types";

/** Global reference to socket server instance (populated by pages/api/socket.ts) */
let globalSocketServer: Server | null = null;

/**
 * Store the socket server instance
 * Called from pages/api/socket.ts during initialization
 */
export function setSocketServer(io: Server): void {
  globalSocketServer = io;
}

/**
 * Get the socket server instance
 */
export function getSocketServer(): Server | null {
  return globalSocketServer;
}

/**
 * Emit a new message to all clients in a family room
 *
 * @param familyId - The family ID to broadcast to
 * @param message - The message object to emit
 */
export function emitNewMessage(familyId: string, message: Message): void {
  const io = getSocketServer();
  if (!io) {
    // Socket server not initialized yet (normal in tests or early stages)
    console.warn("[Socket] Server not initialized, skipping emission");
    return;
  }

  io.to(`family:${familyId}`).emit("message:created", {
    id: message.id,
    senderId: message.senderId,
    familyId: message.familyId,
    body: message.body,
    sentAt: message.sentAt,
    readAt: message.readAt,
    attachmentIds: message.attachmentIds,
  });
}

/**
 * Emit a message read status update
 */
export function emitMessageRead(
  familyId: string,
  messageId: string,
  userId: string
): void {
  const io = getSocketServer();
  if (!io) {
    console.warn("[Socket] Server not initialized, skipping emission");
    return;
  }

  io.to(`family:${familyId}`).emit("message:read", {
    messageId,
    userId,
    readAt: new Date().toISOString(),
  });
}

/**
 * Disconnect a user from all their sockets (logout scenario)
 */
export function disconnectUser(userId: string): void {
  const io = getSocketServer();
  if (!io) {
    return;
  }

  // Find all sockets for this user
  const sockets = io.sockets.sockets;
  for (const [, socket] of sockets) {
    if (socket.data.userId === userId) {
      socket.disconnect(true);
    }
  }
}
