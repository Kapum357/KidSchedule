import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HolidayForm } from '@/app/holidays/components/holiday-form';
import { createHoliday, updateHoliday } from '@/app/actions/holidays';
import type { DbScheduleOverride } from '@/lib/persistence/types';

// Mock the server actions
jest.mock('@/app/actions/holidays');
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
  }),
}));

// Test helpers
function createMockHoliday(overrides?: Partial<DbScheduleOverride>): DbScheduleOverride {
  return {
    id: 'holiday-1',
    title: 'Spring Break',
    description: 'School spring break',
    effectiveStart: '2024-03-15T00:00:00Z',
    effectiveEnd: '2024-03-22T23:59:59Z',
    type: 'holiday',
    familyId: 'family-1',
    custodianParentId: 'parent-1',
    priority: 10,
    status: 'active',
    createdBy: 'parent-1',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  } as any;
}

function getTodayIsoDate(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

describe('HolidayForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders create mode with empty form fields', () => {
      render(
        <HolidayForm
          mode="create"
          familyId="family-1"
          custodianParentId="parent-1"
        />
      );

      expect(screen.getByLabelText(/^Title/)).toHaveValue('');
      expect(screen.getByLabelText(/^Description/)).toHaveValue('');
      expect(screen.getByLabelText(/^Start Date/)).toHaveValue(getTodayIsoDate());
      expect(screen.getByLabelText(/^End Date/)).toHaveValue(getTodayIsoDate());
      expect(screen.getByLabelText(/^Holiday Type/)).toHaveValue('holiday');
    });

    it('renders edit mode with initial data', () => {
      const initialData = {
        id: 'holiday-1',
        title: 'Christmas Holiday',
        description: 'Winter break',
        startDate: '2024-12-20',
        endDate: '2024-12-27',
        type: 'holiday' as const,
      };

      render(
        <HolidayForm
          mode="edit"
          familyId="family-1"
          custodianParentId="parent-1"
          initialData={initialData}
        />
      );

      expect(screen.getByLabelText(/^Title/)).toHaveValue('Christmas Holiday');
      expect(screen.getByLabelText(/^Description/)).toHaveValue('Winter break');
      expect(screen.getByLabelText(/^Start Date/)).toHaveValue('2024-12-20');
      expect(screen.getByLabelText(/^End Date/)).toHaveValue('2024-12-27');
      expect(screen.getByLabelText(/^Holiday Type/)).toHaveValue('holiday');
    });

    it('renders all form fields', () => {
      render(
        <HolidayForm
          mode="create"
          familyId="family-1"
          custodianParentId="parent-1"
        />
      );

      expect(screen.getByLabelText(/^Title/)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Description/)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Start Date/)).toBeInTheDocument();
      expect(screen.getByLabelText(/^End Date/)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Holiday Type/)).toBeInTheDocument();
    });

    it('renders submit button with create text in create mode', () => {
      render(
        <HolidayForm
          mode="create"
          familyId="family-1"
          custodianParentId="parent-1"
        />
      );

      expect(screen.getByRole('button', { name: /Create Holiday/ })).toBeInTheDocument();
    });

    it('renders submit button with update text in edit mode', () => {
      render(
        <HolidayForm
          mode="edit"
          familyId="family-1"
          custodianParentId="parent-1"
          initialData={{ id: 'holiday-1', title: 'Test' }}
        />
      );

      expect(screen.getByRole('button', { name: /Update Holiday/ })).toBeInTheDocument();
    });

    it('renders cancel button', () => {
      render(
        <HolidayForm
          mode="create"
          familyId="family-1"
          custodianParentId="parent-1"
        />
      );

      expect(screen.getByRole('button', { name: /Cancel/ })).toBeInTheDocument();
    });
  });

  describe('form validation', () => {
    it('shows error for empty title on submit', async () => {
      render(
        <HolidayForm
          mode="create"
          familyId="family-1"
          custodianParentId="parent-1"
        />
      );

      const titleInput = screen.getByLabelText(/^Title/);
      fireEvent.change(titleInput, { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: /Create Holiday/ }));

      expect(screen.getByText('Title is required')).toBeInTheDocument();
    });

    it('shows error for title exceeding 200 characters', async () => {
      render(
        <HolidayForm
          mode="create"
          familyId="family-1"
          custodianParentId="parent-1"
        />
      );

      const longTitle = 'a'.repeat(201);
      const titleInput = screen.getByLabelText(/^Title/);
      fireEvent.change(titleInput, { target: { value: longTitle } });
      fireEvent.click(screen.getByRole('button', { name: /Create Holiday/ }));

      expect(screen.getByText('Title must be 200 characters or less')).toBeInTheDocument();
    });

    it('shows error for description exceeding 1000 characters', async () => {
      render(
        <HolidayForm
          mode="create"
          familyId="family-1"
          custodianParentId="parent-1"
        />
      );

      const longDescription = 'a'.repeat(1001);
      const descriptionInput = screen.getByLabelText(/^Description/);
      fireEvent.change(descriptionInput, { target: { value: longDescription } });
      fireEvent.click(screen.getByRole('button', { name: /Create Holiday/ }));

      expect(screen.getByText('Description must be 1000 characters or less')).toBeInTheDocument();
    });

    it('shows error when end date is before start date', async () => {
      render(
        <HolidayForm
          mode="create"
          familyId="family-1"
          custodianParentId="parent-1"
        />
      );

      fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Test Holiday' } });
      fireEvent.change(screen.getByLabelText(/^Start Date/), { target: { value: '2024-03-20' } });
      fireEvent.change(screen.getByLabelText(/^End Date/), { target: { value: '2024-03-15' } });
      fireEvent.click(screen.getByRole('button', { name: /Create Holiday/ }));

      expect(screen.getByText('End date must be on or after the start date')).toBeInTheDocument();
    });

    it('allows end date equal to start date', async () => {
      const mockCreateHoliday = jest.fn().mockResolvedValue({
        success: true,
        data: createMockHoliday(),
      });
      (createHoliday as jest.Mock).mockImplementation(mockCreateHoliday);

      render(
        <HolidayForm
          mode="create"
          familyId="family-1"
          custodianParentId="parent-1"
        />
      );

      fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Test Holiday' } });
      fireEvent.change(screen.getByLabelText(/^Start Date/), { target: { value: '2024-03-20' } });
      fireEvent.change(screen.getByLabelText(/^End Date/), { target: { value: '2024-03-20' } });
      fireEvent.click(screen.getByRole('button', { name: /Create Holiday/ }));

      await waitFor(() => {
        expect(mockCreateHoliday).toHaveBeenCalled();
      });
    });

    it('clears validation error when user types in field', async () => {
      render(
        <HolidayForm
          mode="create"
          familyId="family-1"
          custodianParentId="parent-1"
        />
      );

      // Submit empty form to trigger validation error
      fireEvent.click(screen.getByRole('button', { name: /Create Holiday/ }));
      expect(screen.getByText('Title is required')).toBeInTheDocument();

      // Type in field to clear error
      fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Test' } });
      expect(screen.queryByText('Title is required')).not.toBeInTheDocument();
    });
  });

  describe('server action integration - create mode', () => {
    it('calls createHoliday with correct data on submit', async () => {
      const mockCreateHoliday = jest.fn().mockResolvedValue({
        success: true,
        data: createMockHoliday(),
      });
      (createHoliday as jest.Mock).mockImplementation(mockCreateHoliday);

      render(
        <HolidayForm
          mode="create"
          familyId="family-1"
          custodianParentId="parent-1"
        />
      );

      fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Spring Break' } });
      fireEvent.change(screen.getByLabelText(/^Description/), { target: { value: 'School break' } });
      fireEvent.change(screen.getByLabelText(/^Start Date/), { target: { value: '2024-03-15' } });
      fireEvent.change(screen.getByLabelText(/^End Date/), { target: { value: '2024-03-22' } });
      fireEvent.change(screen.getByLabelText(/^Holiday Type/), { target: { value: 'holiday' } });

      fireEvent.click(screen.getByRole('button', { name: /Create Holiday/ }));

      await waitFor(() => {
        expect(mockCreateHoliday).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Spring Break',
            description: 'School break',
            effectiveStart: '2024-03-15T00:00:00Z',
            effectiveEnd: '2024-03-22T23:59:59Z',
            type: 'holiday',
            familyId: 'family-1',
            custodianParentId: 'parent-1',
            priority: 10,
            status: 'active',
          })
        );
      });
    });

    it('shows success message on successful create', async () => {
      const mockCreateHoliday = jest.fn().mockResolvedValue({
        success: true,
        data: createMockHoliday(),
      });
      (createHoliday as jest.Mock).mockImplementation(mockCreateHoliday);

      render(
        <HolidayForm
          mode="create"
          familyId="family-1"
          custodianParentId="parent-1"
        />
      );

      fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Spring Break' } });
      fireEvent.change(screen.getByLabelText(/^Start Date/), { target: { value: '2024-03-15' } });
      fireEvent.change(screen.getByLabelText(/^End Date/), { target: { value: '2024-03-22' } });
      fireEvent.click(screen.getByRole('button', { name: /Create Holiday/ }));

      await waitFor(() => {
        expect(screen.getByText('Holiday created successfully!')).toBeInTheDocument();
      });
    });

    it('shows server error on failed create', async () => {
      const mockCreateHoliday = jest.fn().mockResolvedValue({
        success: false,
        error: 'Failed to create holiday',
      });
      (createHoliday as jest.Mock).mockImplementation(mockCreateHoliday);

      render(
        <HolidayForm
          mode="create"
          familyId="family-1"
          custodianParentId="parent-1"
        />
      );

      fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Spring Break' } });
      fireEvent.change(screen.getByLabelText(/^Start Date/), { target: { value: '2024-03-15' } });
      fireEvent.change(screen.getByLabelText(/^End Date/), { target: { value: '2024-03-22' } });
      fireEvent.click(screen.getByRole('button', { name: /Create Holiday/ }));

      await waitFor(() => {
        expect(screen.getByText('Failed to create holiday')).toBeInTheDocument();
      });
    });

    it('trims title and description before sending', async () => {
      const mockCreateHoliday = jest.fn().mockResolvedValue({
        success: true,
        data: createMockHoliday(),
      });
      (createHoliday as jest.Mock).mockImplementation(mockCreateHoliday);

      render(
        <HolidayForm
          mode="create"
          familyId="family-1"
          custodianParentId="parent-1"
        />
      );

      fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: '  Spring Break  ' } });
      fireEvent.change(screen.getByLabelText(/^Description/), { target: { value: '  School break  ' } });
      fireEvent.change(screen.getByLabelText(/^Start Date/), { target: { value: '2024-03-15' } });
      fireEvent.change(screen.getByLabelText(/^End Date/), { target: { value: '2024-03-22' } });

      fireEvent.click(screen.getByRole('button', { name: /Create Holiday/ }));

      await waitFor(() => {
        expect(mockCreateHoliday).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Spring Break',
            description: 'School break',
          })
        );
      });
    });

    it('calls onSuccess callback when provided', async () => {
      const mockHoliday = createMockHoliday();
      const mockCreateHoliday = jest.fn().mockResolvedValue({
        success: true,
        data: mockHoliday,
      });
      (createHoliday as jest.Mock).mockImplementation(mockCreateHoliday);

      const onSuccess = jest.fn();

      render(
        <HolidayForm
          mode="create"
          familyId="family-1"
          custodianParentId="parent-1"
          onSuccess={onSuccess}
        />
      );

      fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Spring Break' } });
      fireEvent.change(screen.getByLabelText(/^Start Date/), { target: { value: '2024-03-15' } });
      fireEvent.change(screen.getByLabelText(/^End Date/), { target: { value: '2024-03-22' } });
      fireEvent.click(screen.getByRole('button', { name: /Create Holiday/ }));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith(mockHoliday);
      });
    });
  });

  describe('server action integration - edit mode', () => {
    it('calls updateHoliday with correct data on submit', async () => {
      const mockUpdateHoliday = jest.fn().mockResolvedValue({
        success: true,
        data: createMockHoliday(),
      });
      (updateHoliday as jest.Mock).mockImplementation(mockUpdateHoliday);

      const initialData = {
        id: 'holiday-1',
        title: 'Spring Break',
        description: 'School break',
        startDate: '2024-03-15',
        endDate: '2024-03-22',
        type: 'holiday' as const,
      };

      render(
        <HolidayForm
          mode="edit"
          familyId="family-1"
          custodianParentId="parent-1"
          initialData={initialData}
        />
      );

      fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: '' } });
      fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Updated Spring Break' } });
      fireEvent.click(screen.getByRole('button', { name: /Update Holiday/ }));

      await waitFor(() => {
        expect(mockUpdateHoliday).toHaveBeenCalledWith(
          'family-1',
          'holiday-1',
          expect.objectContaining({
            title: 'Updated Spring Break',
            description: 'School break',
            effectiveStart: '2024-03-15T00:00:00Z',
            effectiveEnd: '2024-03-22T23:59:59Z',
          })
        );
      });
    });

    it('shows success message on successful update', async () => {
      const mockUpdateHoliday = jest.fn().mockResolvedValue({
        success: true,
        data: createMockHoliday(),
      });
      (updateHoliday as jest.Mock).mockImplementation(mockUpdateHoliday);

      const initialData = {
        id: 'holiday-1',
        title: 'Spring Break',
        startDate: '2024-03-15',
        endDate: '2024-03-22',
        type: 'holiday' as const,
      };

      render(
        <HolidayForm
          mode="edit"
          familyId="family-1"
          custodianParentId="parent-1"
          initialData={initialData}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /Update Holiday/ }));

      await waitFor(() => {
        expect(screen.getByText('Holiday updated successfully!')).toBeInTheDocument();
      });
    });

    it('shows error if holiday ID missing in edit mode', async () => {
      render(
        <HolidayForm
          mode="edit"
          familyId="family-1"
          custodianParentId="parent-1"
          initialData={{
            title: 'Spring Break',
            startDate: '2024-03-15',
            endDate: '2024-03-22',
            type: 'holiday' as const,
          }}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /Update Holiday/ }));

      await waitFor(() => {
        expect(screen.getByText('Holiday ID is required for edit mode')).toBeInTheDocument();
      });
    });
  });

  describe('loading state', () => {
    it('disables form elements while loading', async () => {
      const mockCreateHoliday = jest.fn(() => new Promise(resolve => setTimeout(resolve, 1000)));
      (createHoliday as jest.Mock).mockImplementation(mockCreateHoliday);

      render(
        <HolidayForm
          mode="create"
          familyId="family-1"
          custodianParentId="parent-1"
        />
      );

      fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Spring Break' } });
      fireEvent.change(screen.getByLabelText(/^Start Date/), { target: { value: '2024-03-15' } });
      fireEvent.change(screen.getByLabelText(/^End Date/), { target: { value: '2024-03-22' } });

      const submitButton = screen.getByRole('button', { name: /Create Holiday/ });
      fireEvent.click(submitButton);

      expect(submitButton).toBeDisabled();
      expect(screen.getByLabelText(/^Title/)).toBeDisabled();
    });

    it('shows loading text on submit button while submitting', async () => {
      const mockCreateHoliday = jest.fn(() => new Promise(resolve => setTimeout(resolve, 1000)));
      (createHoliday as jest.Mock).mockImplementation(mockCreateHoliday);

      render(
        <HolidayForm
          mode="create"
          familyId="family-1"
          custodianParentId="parent-1"
        />
      );

      fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Spring Break' } });
      fireEvent.change(screen.getByLabelText(/^Start Date/), { target: { value: '2024-03-15' } });
      fireEvent.change(screen.getByLabelText(/^End Date/), { target: { value: '2024-03-22' } });

      const submitButton = screen.getByRole('button', { name: /Create Holiday/ });
      fireEvent.click(submitButton);

      expect(screen.getByText('Creating...')).toBeInTheDocument();
    });
  });

  describe('cancel behavior', () => {
    it('calls onCancel callback when provided', async () => {
      const onCancel = jest.fn();

      render(
        <HolidayForm
          mode="create"
          familyId="family-1"
          custodianParentId="parent-1"
          onCancel={onCancel}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));

      expect(onCancel).toHaveBeenCalled();
    });

    it('disables cancel button while loading', async () => {
      const mockCreateHoliday = jest.fn(() => new Promise(resolve => setTimeout(resolve, 1000)));
      (createHoliday as jest.Mock).mockImplementation(mockCreateHoliday);

      render(
        <HolidayForm
          mode="create"
          familyId="family-1"
          custodianParentId="parent-1"
        />
      );

      fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Spring Break' } });
      fireEvent.change(screen.getByLabelText(/^Start Date/), { target: { value: '2024-03-15' } });
      fireEvent.change(screen.getByLabelText(/^End Date/), { target: { value: '2024-03-22' } });

      const submitButton = screen.getByRole('button', { name: /Create Holiday/ });
      fireEvent.click(submitButton);

      const cancelButton = screen.getByRole('button', { name: /Cancel/ });
      expect(cancelButton).toBeDisabled();
    });
  });

  describe('character counting', () => {
    it('displays character count for description', async () => {
      render(
        <HolidayForm
          mode="create"
          familyId="family-1"
          custodianParentId="parent-1"
        />
      );

      const descriptionInput = screen.getByLabelText(/^Description/);
      fireEvent.change(descriptionInput, { target: { value: 'Test' } });

      expect(screen.getByText('4/1000 characters')).toBeInTheDocument();
    });

    it('updates character count as user types', async () => {
      render(
        <HolidayForm
          mode="create"
          familyId="family-1"
          custodianParentId="parent-1"
        />
      );

      const descriptionInput = screen.getByLabelText(/^Description/);

      expect(screen.getByText('0/1000 characters')).toBeInTheDocument();

      fireEvent.change(descriptionInput, { target: { value: 'Test description' } });

      expect(screen.getByText('16/1000 characters')).toBeInTheDocument();
    });
  });

  describe('holiday type descriptions', () => {
    it('displays description for holiday type', async () => {
      render(
        <HolidayForm
          mode="create"
          familyId="family-1"
          custodianParentId="parent-1"
        />
      );

      fireEvent.change(screen.getByLabelText(/^Holiday Type/), { target: { value: 'holiday' } });

      expect(screen.getByText('Statutory or special holiday with schedule override')).toBeInTheDocument();
    });

    it('displays description for swap type', async () => {
      render(
        <HolidayForm
          mode="create"
          familyId="family-1"
          custodianParentId="parent-1"
        />
      );

      fireEvent.change(screen.getByLabelText(/^Holiday Type/), { target: { value: 'swap' } });

      expect(screen.getByText('Time exchange between parents')).toBeInTheDocument();
    });

    it('displays description for mediation type', async () => {
      render(
        <HolidayForm
          mode="create"
          familyId="family-1"
          custodianParentId="parent-1"
        />
      );

      fireEvent.change(screen.getByLabelText(/^Holiday Type/), { target: { value: 'mediation' } });

      expect(screen.getByText('Mediation session or special arrangement')).toBeInTheDocument();
    });
  });

  describe('date conversion', () => {
    it('converts ISO date to ISO datetime with Z notation for start date', async () => {
      const mockCreateHoliday = jest.fn().mockResolvedValue({
        success: true,
        data: createMockHoliday(),
      });
      (createHoliday as jest.Mock).mockImplementation(mockCreateHoliday);

      render(
        <HolidayForm
          mode="create"
          familyId="family-1"
          custodianParentId="parent-1"
        />
      );

      fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Test' } });
      fireEvent.change(screen.getByLabelText(/^Start Date/), { target: { value: '2024-03-15' } });
      fireEvent.change(screen.getByLabelText(/^End Date/), { target: { value: '2024-03-22' } });
      fireEvent.click(screen.getByRole('button', { name: /Create Holiday/ }));

      await waitFor(() => {
        expect(mockCreateHoliday).toHaveBeenCalledWith(
          expect.objectContaining({
            effectiveStart: '2024-03-15T00:00:00Z',
          })
        );
      });
    });

    it('converts ISO date to ISO datetime with Z notation for end date', async () => {
      const mockCreateHoliday = jest.fn().mockResolvedValue({
        success: true,
        data: createMockHoliday(),
      });
      (createHoliday as jest.Mock).mockImplementation(mockCreateHoliday);

      render(
        <HolidayForm
          mode="create"
          familyId="family-1"
          custodianParentId="parent-1"
        />
      );

      fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: 'Test' } });
      fireEvent.change(screen.getByLabelText(/^Start Date/), { target: { value: '2024-03-15' } });
      fireEvent.change(screen.getByLabelText(/^End Date/), { target: { value: '2024-03-22' } });
      fireEvent.click(screen.getByRole('button', { name: /Create Holiday/ }));

      await waitFor(() => {
        expect(mockCreateHoliday).toHaveBeenCalledWith(
          expect.objectContaining({
            effectiveEnd: '2024-03-22T23:59:59Z',
          })
        );
      });
    });
  });
});
