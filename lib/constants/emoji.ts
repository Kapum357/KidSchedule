/**
 * KidSchedule – Emoji Validation
 *
 * Whitelist of allowed emojis for reactions.
 * Using a whitelist prevents XSS attacks and ensures consistent reactions.
 */

export const ALLOWED_EMOJIS = [
  '❤️',  // Heart
  '👍',  // Thumbs up
  '😂',  // Laughing
  '😍',  // Heart eyes
  '🥳',  // Party
  '🎉',  // Celebration
  '😮',  // Surprised
  '🔥',  // Fire
  '💯',  // 100
  '✨',  // Sparkles
  '😊',  // Smile
  '🙌',  // Raised hands
  '👏',  // Clapping
  '🤔',  // Thinking
  '😅',  // Nervous laugh
  '🎊',  // Confetti ball
  '💪',  // Muscle
  '🌟',  // Star
  '😆',  // Grinning
  '💕',  // Two hearts
] as const;

export type AllowedEmoji = typeof ALLOWED_EMOJIS[number];

/**
 * Type guard to check if a string is a valid emoji
 * @param emoji - The emoji string to validate
 * @returns true if the emoji is in the allowed list
 */
export function isValidEmoji(emoji: string): emoji is AllowedEmoji {
  return ALLOWED_EMOJIS.includes(emoji as AllowedEmoji);
}

/**
 * Validates if an emoji is allowed
 * @param emoji - The emoji string to validate
 * @returns true if the emoji is in the allowed list
 */
export function validateEmoji(emoji: string): boolean {
  return isValidEmoji(emoji);
}
