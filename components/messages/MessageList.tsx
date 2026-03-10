/**
 * MessageList Component
 *
 * Displays messages in a timeline with auto-mark-read on scroll.
 * Uses IntersectionObserver to detect when messages come into view.
 */

import { useEffect, useRef, useCallback } from "react";
import type { Message } from "@/lib";
import { MessageItem } from "./MessageItem";

interface MessageListProps {
  messages: Message[];
  parentNames: Map<string, string>;
  currentUserId: string;
  onMarkMessageRead: (messageId: string) => Promise<void>;
}

export function MessageList({
  messages,
  parentNames,
  currentUserId,
  onMarkMessageRead,
}: MessageListProps) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const messageRefsMap = useRef(new Map<string, HTMLDivElement>());

  // Track which messages we've already attempted to mark as read
  const markedAsReadRef = useRef<Set<string>>(new Set());

  // Callback when a message becomes visible
  const handleMessageVisible = useCallback(
    (messageId: string) => {
      const message = messages.find((m) => m.id === messageId);
      if (!message) return;

      // Only mark as read if:
      // 1. Message not already read
      // 2. We didn't send this message (can't mark own as read)
      // 3. We haven't already attempted to mark this one
      if (!message.readAt && message.senderId !== currentUserId && !markedAsReadRef.current.has(messageId)) {
        markedAsReadRef.current.add(messageId);
        onMarkMessageRead(messageId).catch((error) => {
          // On error, allow retrying later
          markedAsReadRef.current.delete(messageId);
          console.error(`Failed to mark message ${messageId} as read:`, error);
        });
      }
    },
    [messages, currentUserId, onMarkMessageRead]
  );

  // Setup IntersectionObserver
  useEffect(() => {
    // Create observer
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const messageId = entry.target.getAttribute("data-message-id");
            if (messageId) {
              handleMessageVisible(messageId);
            }
          }
        }
      },
      {
        threshold: 0.5, // Trigger when at least 50% visible
        rootMargin: "50px", // Start observing 50px before element enters viewport
      }
    );

    // Observe all message elements
    const messageRefs = messageRefsMap.current;
    messageRefs.forEach((element) => {
      observerRef.current?.observe(element);
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [handleMessageVisible, messages.length]);

  // Clear marked set when messages change (e.g., new messages loaded)
  useEffect(() => {
    markedAsReadRef.current.clear();
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <p>No messages yet. Start the conversation!</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col-reverse border border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* Messages rendered in reverse order (newest last = bottom) */}
      {[...messages].reverse().map((message) => {
        const senderName = parentNames.get(message.senderId) || "Unknown";
        const isOwnMessage = message.senderId === currentUserId;

        return (
          <div
            key={message.id}
            ref={(el) => {
              if (el) {
                messageRefsMap.current.set(message.id, el);
              }
            }}
            data-message-id={message.id}
            data-testid={`message-list-item-${message.id}`}
          >
            <MessageItem
              message={message}
              senderName={senderName}
              isOwnMessage={isOwnMessage}
            />
          </div>
        );
      })}
    </div>
  );
}
