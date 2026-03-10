/**
 * MessageItem Component
 *
 * Displays a single message with sender info, timestamp, and read receipt indicator.
 */

import type { Message } from " @/lib";

interface MessageItemProps {
  message: Message;
  senderName: string;
  isOwnMessage: boolean;
}

function formatWhen(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

    // Fallback to readable format
    return date.toLocaleDateString();
  } catch {
    return dateStr;
  }
}

export function MessageItem({ message, senderName, isOwnMessage }: MessageItemProps) {
  return (
    <div
      className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50"
      data-testid={`message-item-${message.id}`}
    >
      <div className="flex justify-between items-start">
        <div>
          <p className="font-semibold text-gray-900">{senderName}</p>
          <p className="text-gray-700 mt-1 text-sm leading-relaxed">{message.body}</p>
        </div>

        {/* Read receipt indicator - only show for sender's own messages */}
        {isOwnMessage && message.readAt && (
          <div
            className="ml-2 flex-shrink-0"
            title={`Read ${formatWhen(message.readAt)}`}
          >
            <span className="text-sm text-emerald-600 font-semibold">✓✓</span>
          </div>
        )}
      </div>

      <div className="flex justify-between items-center mt-2">
        <time className="text-xs text-gray-500">
          {formatWhen(message.sentAt)}
        </time>

        {/* Show read status for messages from others */}
        {!isOwnMessage && message.readAt && (
          <span className="text-xs text-emerald-600">Read</span>
        )}
      </div>
    </div>
  );
}
