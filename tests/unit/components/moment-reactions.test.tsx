/**
 * Moment Reactions Component Tests
 *
 * Tests for MomentReactionPicker and MomentReactionSummary components
 * covering:
 * - Emoji grid rendering
 * - API calls on reaction add/remove
 * - Loading states
 * - Error handling
 * - Grouped reaction display
 * - Highlight for current user reactions
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MomentReactionPicker } from '@/components/moments/moment-reaction-picker';
import { MomentReactionSummary } from '@/components/moments/moment-reaction-summary';
import { ALLOWED_EMOJIS } from '@/lib/constants/emoji';

// Mock fetch globally
global.fetch = jest.fn();

describe('MomentReactionPicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Test 1: Renders emoji grid ─────────────────────────────────────────────

  it('should render all 20 emoji buttons in grid', () => {
    render(<MomentReactionPicker momentId="moment-123" />);

    // Check that all emojis are rendered
    ALLOWED_EMOJIS.forEach((emoji) => {
      const button = screen.getByRole('button', { name: new RegExp(emoji) });
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent(emoji);
    });

    // Should have exactly 20 buttons
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(ALLOWED_EMOJIS.length);
  });

  // ─── Test 2: Click emoji calls POST API ─────────────────────────────────────

  it('should call POST API when emoji button is clicked', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: 'reaction-123', emoji: '❤️' }),
    });

    const onReactionAdded = jest.fn();
    render(
      <MomentReactionPicker
        momentId="moment-123"
        onReactionAdded={onReactionAdded}
      />
    );

    const heartButton = screen.getByRole('button', { name: /❤️/ });

    await act(async () => {
      fireEvent.click(heartButton);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/moments/moment-123/reactions',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emoji: '❤️' }),
        })
      );
    });

    expect(onReactionAdded).toHaveBeenCalledWith('❤️');
  });

  // ─── Test 3: Loading state during API call ──────────────────────────────────

  it('should show loading state while API call is in progress', async () => {
    let resolvePromise: () => void;
    const promise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    (global.fetch as jest.Mock).mockReturnValueOnce(
      promise.then(() => ({
        ok: true,
        status: 201,
        json: async () => ({ id: 'reaction-123', emoji: '👍' }),
      }))
    );

    render(<MomentReactionPicker momentId="moment-123" />);

    const thumbsUpButton = screen.getByRole('button', { name: /👍/ });

    // Click the button
    await act(async () => {
      fireEvent.click(thumbsUpButton);
    });

    // Button should be disabled while loading
    await waitFor(() => {
      expect(thumbsUpButton).toBeDisabled();
    });

    // Resolve the promise
    await act(async () => {
      resolvePromise!();
      await promise;
    });

    // Button should be enabled again
    await waitFor(() => {
      expect(thumbsUpButton).not.toBeDisabled();
    });
  });

  // ─── Test 4: Error handling shows error callback ─────────────────────────────

  it('should call onError when API call fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ message: 'Invalid emoji' }),
    });

    const onError = jest.fn();
    render(
      <MomentReactionPicker momentId="moment-123" onError={onError} />
    );

    const fireButton = screen.getByRole('button', { name: /🔥/ });

    await act(async () => {
      fireEvent.click(fireButton);
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('Invalid emoji');
    });
  });

  // ─── Test 5: Disabled prop disables all buttons ──────────────────────────────

  it('should disable all buttons when disabled prop is true', () => {
    render(<MomentReactionPicker momentId="moment-123" disabled={true} />);

    const buttons = screen.getAllByRole('button');
    buttons.forEach((button) => {
      expect(button).toBeDisabled();
    });
  });

  // ─── Test 6: Error callback not required ────────────────────────────────────

  it('should handle missing callbacks gracefully', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: 'reaction-123', emoji: '😂' }),
    });

    // Should not throw when onReactionAdded and onError are undefined
    render(<MomentReactionPicker momentId="moment-123" />);

    const laughButton = screen.getByRole('button', { name: /😂/ });

    await act(async () => {
      fireEvent.click(laughButton);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
  });
});

describe('MomentReactionSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Test 7: Display grouped reactions ──────────────────────────────────────

  it('should display grouped reactions with emoji and count', () => {
    const reactions = [
      {
        emoji: '❤️',
        count: 3,
        byCurrentUser: false,
        userIds: ['user1', 'user2', 'user3'],
      },
      {
        emoji: '👍',
        count: 2,
        byCurrentUser: true,
        userIds: ['user1', 'current-user'],
      },
    ];

    render(
      <MomentReactionSummary
        momentId="moment-123"
        reactions={reactions}
        currentUserId="current-user"
      />
    );

    // Check heart emoji and count
    expect(screen.getByText('❤️')).toBeInTheDocument();
    const heartCount = screen.getByText('3');
    expect(heartCount).toBeInTheDocument();

    // Check thumbs up emoji and count
    expect(screen.getByText('👍')).toBeInTheDocument();
    const thumbsUpCount = screen.getByText('2');
    expect(thumbsUpCount).toBeInTheDocument();
  });

  // ─── Test 8: Highlight reactions by current user ──────────────────────────────

  it('should highlight reactions added by current user', () => {
    const reactions = [
      {
        emoji: '❤️',
        count: 1,
        byCurrentUser: true,
        userIds: ['current-user'],
      },
      {
        emoji: '👍',
        count: 1,
        byCurrentUser: false,
        userIds: ['other-user'],
      },
    ];

    render(
      <MomentReactionSummary
        momentId="moment-123"
        reactions={reactions}
        currentUserId="current-user"
      />
    );

    const buttons = screen.getAllByRole('button');
    // First button (by current user) should have blue background
    expect(buttons[0]).toHaveClass('bg-blue-100');
    // Second button (by other user) should have slate background
    expect(buttons[1]).toHaveClass('bg-slate-100');
  });

  // ─── Test 9: Click to remove own reaction ──────────────────────────────────

  it('should call DELETE API when clicking own reaction', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 204,
    });

    const onReactionRemoved = jest.fn();
    const reactions = [
      {
        emoji: '❤️',
        count: 1,
        byCurrentUser: true,
        userIds: ['reaction-id-123'],
      },
    ];

    render(
      <MomentReactionSummary
        momentId="moment-123"
        reactions={reactions}
        currentUserId="current-user"
        onReactionRemoved={onReactionRemoved}
      />
    );

    const heartButton = screen.getByRole('button', { name: /❤️/ });

    await act(async () => {
      fireEvent.click(heartButton);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/moments/moment-123/reactions/reaction-id-123',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    expect(onReactionRemoved).toHaveBeenCalledWith('❤️');
  });

  // ─── Test 10: Cannot remove reactions by other users ────────────────────────

  it('should not allow removing reactions by other users', async () => {
    const onReactionRemoved = jest.fn();
    const reactions = [
      {
        emoji: '👍',
        count: 1,
        byCurrentUser: false,
        userIds: ['other-user'],
      },
    ];

    render(
      <MomentReactionSummary
        momentId="moment-123"
        reactions={reactions}
        currentUserId="current-user"
        onReactionRemoved={onReactionRemoved}
      />
    );

    const thumbsUpButton = screen.getByRole('button', { name: /👍/ });

    // Button should be disabled (not interactive)
    expect(thumbsUpButton).toBeDisabled();

    await act(async () => {
      fireEvent.click(thumbsUpButton);
    });

    // API should not be called
    expect(global.fetch).not.toHaveBeenCalled();
    expect(onReactionRemoved).not.toHaveBeenCalled();
  });

  // ─── Test 11: Show loading state during removal ──────────────────────────────

  it('should show loading state while removing reaction', async () => {
    let resolvePromise: () => void;
    const promise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    (global.fetch as jest.Mock).mockReturnValueOnce(
      promise.then(() => ({
        ok: true,
        status: 204,
      }))
    );

    const reactions = [
      {
        emoji: '🔥',
        count: 1,
        byCurrentUser: true,
        userIds: ['reaction-id-456'],
      },
    ];

    render(
      <MomentReactionSummary
        momentId="moment-123"
        reactions={reactions}
        currentUserId="current-user"
      />
    );

    const fireButton = screen.getByRole('button', { name: /🔥/ });

    await act(async () => {
      fireEvent.click(fireButton);
    });

    // Should be disabled while loading
    await waitFor(() => {
      expect(fireButton).toBeDisabled();
    });

    // Resolve the promise
    await act(async () => {
      resolvePromise!();
      await promise;
    });

    // Should be enabled again
    await waitFor(() => {
      expect(fireButton).not.toBeDisabled();
    });
  });

  // ─── Test 12: Empty reactions returns nothing ────────────────────────────────

  it('should render nothing when reactions array is empty', () => {
    const { container } = render(
      <MomentReactionSummary
        momentId="moment-123"
        reactions={[]}
        currentUserId="current-user"
      />
    );

    // Should have no buttons or content
    expect(container.firstChild).toBeNull();
  });

  // ─── Test 13: Hover tooltip shows userIds ──────────────────────────────────

  it('should show tooltip with user list on hover', () => {
    const reactions = [
      {
        emoji: '😂',
        count: 3,
        byCurrentUser: false,
        userIds: ['alice', 'bob', 'charlie'],
      },
    ];

    render(
      <MomentReactionSummary
        momentId="moment-123"
        reactions={reactions}
        currentUserId="current-user"
      />
    );

    const laughButton = screen.getByRole('button', { name: /😂/ });
    expect(laughButton).toHaveAttribute('title', 'alice, bob, charlie reacted with 😂');
  });

  // ─── Test 14: Error handling on removal failure ──────────────────────────────

  it('should call onError when removal fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ message: 'Cannot delete reaction by another user' }),
    });

    const onError = jest.fn();
    const reactions = [
      {
        emoji: '✨',
        count: 1,
        byCurrentUser: true,
        userIds: ['reaction-id-789'],
      },
    ];

    render(
      <MomentReactionSummary
        momentId="moment-123"
        reactions={reactions}
        currentUserId="current-user"
        onError={onError}
      />
    );

    const sparklesButton = screen.getByRole('button', { name: /✨/ });

    await act(async () => {
      fireEvent.click(sparklesButton);
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(
        'Cannot delete reaction by another user'
      );
    });
  });

  // ─── Test 15: Handles network errors gracefully ──────────────────────────────

  it('should handle network errors gracefully', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(
      new Error('Network error')
    );

    const onError = jest.fn();
    const reactions = [
      {
        emoji: '💯',
        count: 1,
        byCurrentUser: true,
        userIds: ['reaction-id-999'],
      },
    ];

    render(
      <MomentReactionSummary
        momentId="moment-123"
        reactions={reactions}
        currentUserId="current-user"
        onError={onError}
      />
    );

    const hundredButton = screen.getByRole('button', { name: /💯/ });

    await act(async () => {
      fireEvent.click(hundredButton);
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('Network error');
    });
  });
});
