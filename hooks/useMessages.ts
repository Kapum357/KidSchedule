/**
 * Hook for managing message state with real-time updates
 *
 * Handles fetching messages, marking as read, and updating state
 * when new messages arrive or read receipts are received.
 */

import { useState, useCallback } from "react";
import type { Message } from " @/lib";

interface UseMessagesProps {
  familyId: string;
  initialMessages?: Message[];
}

export function useMessages({ familyId, initialMessages = [] }: UseMessagesProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markedAsRead, setMarkedAsRead] = useState<Set<string>>(new Set());

  // Mark a message as read and notify server
  const markMessageAsRead = useCallback(
    async (messageId: string, currentUserId: string) => {
      // Prevent marking already-marked messages
      if (markedAsRead.has(messageId)) {
        return;
      }

      // Prevent marking own messages as read
      const message = messages.find((m) => m.id === messageId);
      if (!message || message.senderId === currentUserId) {
        return;
      }

      // Already marked as read
      if (message.readAt) {
        return;
      }

      try {
        setMarkedAsRead((prev) => new Set([...prev, messageId]));

        const response = await fetch(`/api/messages/${messageId}/read`, {
          method: "POST",
        });

        if (!response.ok) {
          console.error("[Messages] Failed to mark message as read:", response.statusText);
          // Remove from marked set on failure so it can be retried
          setMarkedAsRead((prev) => {
            const next = new Set(prev);
            next.delete(messageId);
            return next;
          });
        }
      } catch (err) {
        console.error("[Messages] Error marking message as read:", err);
        // Remove from marked set on error
        setMarkedAsRead((prev) => {
          const next = new Set(prev);
          next.delete(messageId);
          return next;
        });
      }
    },
    [messages, markedAsRead]
  );

  // Handle new message from socket
  const handleNewMessage = useCallback((newMessage: Message) => {
    setMessages((prev) => [newMessage, ...prev]);
  }, []);

  // Handle read receipt from socket
  const handleMessageRead = useCallback(
    (event: { messageId: string; readAt: string }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === event.messageId
            ? { ...msg, readAt: event.readAt }
            : msg
        )
      );
    },
    []
  );

  return {
    messages,
    isLoading,
    error,
    markMessageAsRead,
    handleNewMessage,
    handleMessageRead,
  };
}
