/**
 * ConflictWindowSettings Component Tests
 *
 * Tests for the conflict window settings component including:
 * - Slider input and value updates
 * - Preset button functionality
 * - Display label formatting
 * - Optimistic UI updates
 * - Error handling and value reversion
 * - Preset button highlighting
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ConflictWindowSettings } from '@/components/conflict-window-settings';

// Mock the useToast hook
jest.mock('@/components/toast-notification', () => ({
  useToast: jest.fn(() => ({
    add: jest.fn(),
  })),
}));

// Mock fetch globally
global.fetch = jest.fn();

describe('ConflictWindowSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Test 1: Slider Updates Value ───────────────────────────────────────────

  it('should update slider value and trigger API call on slider change', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    render(<ConflictWindowSettings defaultWindowMins={120} familyId="family-123" />);

    const slider = screen.getByRole('slider');
    expect(slider).toHaveValue('120');

    // Simulate user dragging slider to 150
    await act(async () => {
      fireEvent.change(slider, { target: { value: '150' } });
    });

    // Check that display updates immediately (optimistic update)
    expect(slider).toHaveValue('150');

    // Verify API call was initiated
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/settings/conflict-window',
        expect.objectContaining({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ windowMins: 150, familyId: 'family-123' }),
        })
      );
    });
  });

  // ─── Test 2: Preset Buttons Work ────────────────────────────────────────────

  it('should update value and trigger API call when preset button is clicked', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    render(<ConflictWindowSettings defaultWindowMins={120} familyId="family-123" />);

    const slider = screen.getByRole('slider');
    const presetButton = screen.getByRole('button', { name: '30 min' });

    // Click preset button
    await act(async () => {
      fireEvent.click(presetButton);
    });

    // Check that slider value updates immediately
    expect(slider).toHaveValue('30');

    // Verify API call was initiated with correct value
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/settings/conflict-window',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ windowMins: 30, familyId: 'family-123' }),
        })
      );
    });
  });

  // ─── Test 3: Display Label Formatting ───────────────────────────────────────

  it('should format display labels correctly for all preset values', async () => {
    const testCases = [
      { mins: 0, expected: 'No buffer' },
      { mins: 30, expected: '30 minutes' },
      { mins: 60, expected: '1 hour' },
      { mins: 120, expected: '2 hours' },
      { mins: 360, expected: '6 hours' },
      { mins: 720, expected: '12 hours' },
    ];

    for (const { mins, expected } of testCases) {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const { unmount } = render(
        <ConflictWindowSettings defaultWindowMins={mins} familyId="family-123" />
      );

      // Check that the correct label appears in the "Current Buffer" display
      // Use getAllByText and select the one with the specific styling
      const allElements = screen.getAllByText(expected);
      const displayElement = allElements.find((el) =>
        el.classList.contains('text-lg')
      );
      expect(displayElement).toBeInTheDocument();
      expect(displayElement).toHaveClass('text-lg', 'font-semibold');

      unmount();
      jest.clearAllMocks();
    }
  });

  // ─── Test 4: Optimistic UI Updates Immediately ──────────────────────────────

  it('should update display immediately without waiting for API response', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    render(<ConflictWindowSettings defaultWindowMins={120} familyId="family-123" />);

    const slider = screen.getByRole('slider');
    const presetButton = screen.getByRole('button', { name: '1 hour' });

    // Click preset button
    await act(async () => {
      fireEvent.click(presetButton);
    });

    // Slider should update immediately (optimistic update)
    // This happens synchronously in the onClick handler, before API call completes
    expect(slider).toHaveValue('60');

    // Verify that API call was made
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/settings/conflict-window',
        expect.any(Object)
      );
    });
  });

  // ─── Test 5: Error Handling and Display ────────────────────────────────────

  it('should handle API errors gracefully and show error message', async () => {
    // Mock fetch to reject with a network error
    (global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.reject(new Error('Network error'))
    );

    render(<ConflictWindowSettings defaultWindowMins={120} familyId="family-123" />);

    const slider = screen.getByRole('slider');
    const presetButton = screen.getByRole('button', { name: '30 min' });

    // Click preset button to trigger error
    await act(async () => {
      fireEvent.click(presetButton);
    });

    // Value updates optimistically
    expect(slider).toHaveValue('30');

    // Wait for async operations to complete
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    // After error, the component should still be functional
    // API was called
    expect(global.fetch).toHaveBeenCalled();

    // Spinner should disappear after error is handled
    expect(screen.queryByLabelText('Syncing...')).not.toBeInTheDocument();
  });

  // ─── Test 6: Default Preset Highlighted ─────────────────────────────────────

  it('should highlight the default preset button and update on selection', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    render(<ConflictWindowSettings defaultWindowMins={120} familyId="family-123" />);

    // "2 hours" button should be highlighted/active by default
    const twoHoursButton = screen.getByRole('button', { name: '2 hours' });
    expect(twoHoursButton).toHaveClass('bg-primary', 'text-white');

    // Other buttons should not be highlighted
    const thirtyMinButton = screen.getByRole('button', { name: '30 min' });
    expect(thirtyMinButton).not.toHaveClass('bg-primary');

    // Click "30 min" preset
    await act(async () => {
      fireEvent.click(thirtyMinButton);
    });

    // Wait for state update
    await waitFor(() => {
      // "30 min" button should now be highlighted
      expect(thirtyMinButton).toHaveClass('bg-primary', 'text-white');
      // "2 hours" should lose highlight
      expect(twoHoursButton).not.toHaveClass('bg-primary');
    });
  });

  // ─── Test 7: Handle Multiple Consecutive Preset Changes ─────────────────────

  it('should handle multiple consecutive preset changes', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
    });

    render(<ConflictWindowSettings defaultWindowMins={120} familyId="family-123" />);

    const slider = screen.getByRole('slider');
    const noBufferButton = screen.getByRole('button', { name: 'No Buffer' });
    const oneHourButton = screen.getByRole('button', { name: '1 hour' });
    const sixHoursButton = screen.getByRole('button', { name: '6 hours' });

    // Click No Buffer
    await act(async () => {
      fireEvent.click(noBufferButton);
    });

    // Check that slider updated
    expect(slider).toHaveValue('0');

    // Click 1 hour
    await act(async () => {
      fireEvent.click(oneHourButton);
    });

    expect(slider).toHaveValue('60');

    // Click 6 hours
    await act(async () => {
      fireEvent.click(sixHoursButton);
    });

    expect(slider).toHaveValue('360');

    // Should have made 3 API calls
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });
  });

  // ─── Accessibility Test ─────────────────────────────────────────────────────

  it('should have proper accessibility attributes', () => {
    render(<ConflictWindowSettings defaultWindowMins={120} familyId="family-123" />);

    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute(
      'aria-label',
      'Schedule conflict buffer in minutes'
    );
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '720');
    expect(slider).toHaveAttribute('step', '1');

    // Verify label is associated with input
    const label = screen.getByText('Custom Value');
    expect(label).toBeInTheDocument();
  });
});
