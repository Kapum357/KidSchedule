/**
 * Socket hook for real-time message updates
 *
 * Manages socket.io connection, listens for message and read receipt events,
 * and provides callbacks for UI updates.
 */

import { useEffect, useState, useRef } from "react";
import { io, type Socket } from "socket.io-client";

export interface MessageReadEvent {
  messageId: string;
  readAt: string;
  readBy: string;
}

export interface NewMessageEvent {
  id: string;
  familyId: string;
  senderId: string;
  body: string;
  sentAt: string;
  readAt?: string;
  attachmentIds?: string[];
}

interface UseMessagesSocketProps {
  familyId: string;
  onMessageRead?: (event: MessageReadEvent) => void;
  onNewMessage?: (event: NewMessageEvent) => void;
  onConnectionChange?: (connected: boolean) => void;
}

export function useMessagesSocket({
  familyId,
  onMessageRead,
  onNewMessage,
  onConnectionChange,
}: UseMessagesSocketProps) {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Create socket connection with auth token
    const socket = io(process.env.NEXT_PUBLIC_API_URL ?? "", {
      path: "/api/socket.io",
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    // Connection events
    socket.on("connect", () => {
      setIsConnected(true);
      onConnectionChange?.(true);
      console.log("[Socket] Connected");

      // Join family room for real-time updates
      socket.emit("join:family", { familyId });
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
      onConnectionChange?.(false);
      console.log("[Socket] Disconnected");
    });

    socket.on("connect_error", (error) => {
      console.error("[Socket] Connection error:", error);
    });

    // Message events
    socket.on("message:new", (event: NewMessageEvent) => {
      console.log("[Socket] New message:", event.id);
      onNewMessage?.(event);
    });

    // Read receipt event - Step 10: Listen for read events
    socket.on("message:read", (event: MessageReadEvent) => {
      console.log("[Socket] Message read:", event.messageId);
      onMessageRead?.(event);
    });

    // Cleanup on unmount
    return () => {
      socket.emit("leave:family", { familyId });
      socket.disconnect();
    };
  }, [familyId, onMessageRead, onNewMessage, onConnectionChange]);

  // Return socket getter to avoid accessing ref during render
  return {
    isConnected,
    get socket() {
      return socketRef.current;
    },
  };
}
