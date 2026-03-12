import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { PaymentMethodsList } from '@/components/billing/payment-methods-list';

describe('PaymentMethodsList', () => {
  const mockMethods = [
    {
      id: 'pm-1',
      brand: 'Visa',
      last4: '4242',
      expiry: '12/25',
      isDefault: true,
    },
    {
      id: 'pm-2',
      brand: 'Mastercard',
      last4: '5555',
      expiry: '08/26',
      isDefault: false,
    },
  ];

  describe('render', () => {
    it('renders payment methods list with correct information', () => {
      const onSetDefault = jest.fn();
      const onDelete = jest.fn();

      render(
        <PaymentMethodsList
          methods={mockMethods}
          onSetDefault={onSetDefault}
          onDelete={onDelete}
        />
      );

      expect(screen.getByText(/Visa.*4242/)).toBeInTheDocument();
      expect(screen.getByText(/Mastercard.*5555/)).toBeInTheDocument();
      expect(screen.getByText('Expires 12/25')).toBeInTheDocument();
      expect(screen.getByText('Expires 08/26')).toBeInTheDocument();
    });

    it('shows default badge for default payment method', () => {
      const onSetDefault = jest.fn();
      const onDelete = jest.fn();

      render(
        <PaymentMethodsList
          methods={mockMethods}
          onSetDefault={onSetDefault}
          onDelete={onDelete}
        />
      );

      expect(screen.getByText('Default')).toBeInTheDocument();
    });

    it('renders empty state when no methods', () => {
      const onSetDefault = jest.fn();
      const onDelete = jest.fn();

      render(
        <PaymentMethodsList methods={[]} onSetDefault={onSetDefault} onDelete={onDelete} />
      );

      expect(screen.getByText('No payment methods added yet')).toBeInTheDocument();
    });

    it('disables delete button when only one method exists', () => {
      const onSetDefault = jest.fn();
      const onDelete = jest.fn();

      const singleMethod = [mockMethods[0]];

      render(
        <PaymentMethodsList
          methods={singleMethod}
          onSetDefault={onSetDefault}
          onDelete={onDelete}
        />
      );

      const deleteButtons = screen.getAllByText('Delete');
      expect(deleteButtons[0]).toBeDisabled();
    });
  });

  describe('set default', () => {
    it('calls onSetDefault when set default button clicked', async () => {
      const onSetDefault = jest.fn().mockResolvedValue(undefined);
      const onDelete = jest.fn();

      render(
        <PaymentMethodsList
          methods={mockMethods}
          onSetDefault={onSetDefault}
          onDelete={onDelete}
        />
      );

      const setDefaultButton = screen.getByText('Set Default');
      await act(async () => {
        fireEvent.click(setDefaultButton);
      });

      await waitFor(() => {
        expect(onSetDefault).toHaveBeenCalledWith('pm-2');
      });
    });

    it('shows loading state while setting default', async () => {
      const onSetDefault = jest.fn<Promise<void>, [id: string]>(
        () =>
          new Promise(resolve =>
            setTimeout(() => {
              resolve(undefined);
            }, 100)
          )
      );
      const onDelete = jest.fn();

      render(
        <PaymentMethodsList
          methods={mockMethods}
          onSetDefault={onSetDefault}
          onDelete={onDelete}
        />
      );

      const setDefaultButton = screen.getByText('Set Default');
      await act(async () => {
        fireEvent.click(setDefaultButton);
      });

      expect(screen.getByText('Setting...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByText('Setting...')).not.toBeInTheDocument();
      });
    });

    it('displays error message on set default failure', async () => {
      const onSetDefault = jest
        .fn()
        .mockRejectedValue(new Error('Failed to update'));
      const onDelete = jest.fn();

      render(
        <PaymentMethodsList
          methods={mockMethods}
          onSetDefault={onSetDefault}
          onDelete={onDelete}
        />
      );

      const setDefaultButton = screen.getByText('Set Default');
      await act(async () => {
        fireEvent.click(setDefaultButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Failed to update')).toBeInTheDocument();
      });
    });

    it('does not show set default button for default method', () => {
      const onSetDefault = jest.fn();
      const onDelete = jest.fn();

      render(
        <PaymentMethodsList
          methods={mockMethods}
          onSetDefault={onSetDefault}
          onDelete={onDelete}
        />
      );

      const setDefaultButtons = screen.queryAllByText('Set Default');
      expect(setDefaultButtons).toHaveLength(1);
      expect(setDefaultButtons[0]).toBeInTheDocument();
    });
  });

  describe('delete', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      global.confirm = jest.fn(() => true);
    });

    it('shows confirmation dialog before deleting', async () => {
      const onSetDefault = jest.fn();
      const onDelete = jest.fn().mockResolvedValue(undefined);

      render(
        <PaymentMethodsList
          methods={mockMethods}
          onSetDefault={onSetDefault}
          onDelete={onDelete}
        />
      );

      const deleteButtons = screen.getAllByText('Delete');
      await act(async () => {
        fireEvent.click(deleteButtons[1]);
      });

      expect(global.confirm).toHaveBeenCalledWith(
        'Are you sure you want to delete this payment method?'
      );
    });

    it('calls onDelete when confirmed', async () => {
      global.confirm = jest.fn(() => true);
      const onSetDefault = jest.fn();
      const onDelete = jest.fn().mockResolvedValue(undefined);

      render(
        <PaymentMethodsList
          methods={mockMethods}
          onSetDefault={onSetDefault}
          onDelete={onDelete}
        />
      );

      const deleteButtons = screen.getAllByText('Delete');
      await act(async () => {
        fireEvent.click(deleteButtons[1]);
      });

      await waitFor(() => {
        expect(onDelete).toHaveBeenCalledWith('pm-2');
      });
    });

    it('does not call onDelete when confirmation is cancelled', async () => {
      global.confirm = jest.fn(() => false);
      const onSetDefault = jest.fn();
      const onDelete = jest.fn();

      render(
        <PaymentMethodsList
          methods={mockMethods}
          onSetDefault={onSetDefault}
          onDelete={onDelete}
        />
      );

      const deleteButtons = screen.getAllByText('Delete');
      await act(async () => {
        fireEvent.click(deleteButtons[1]);
      });

      expect(onDelete).not.toHaveBeenCalled();
    });

    it('shows loading state while deleting', async () => {
      global.confirm = jest.fn(() => true);
      const onSetDefault = jest.fn();
      const onDelete = jest.fn<Promise<void>, [id: string]>(
        () =>
          new Promise(resolve =>
            setTimeout(() => {
              resolve(undefined);
            }, 100)
          )
      );

      render(
        <PaymentMethodsList
          methods={mockMethods}
          onSetDefault={onSetDefault}
          onDelete={onDelete}
        />
      );

      const deleteButtons = screen.getAllByText('Delete');
      await act(async () => {
        fireEvent.click(deleteButtons[1]);
      });

      expect(screen.getByText('Deleting...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByText('Deleting...')).not.toBeInTheDocument();
      });
    });

    it('displays error message on delete failure', async () => {
      global.confirm = jest.fn(() => true);
      const onSetDefault = jest.fn();
      const onDelete = jest
        .fn()
        .mockRejectedValue(new Error('Failed to delete payment method'));

      render(
        <PaymentMethodsList
          methods={mockMethods}
          onSetDefault={onSetDefault}
          onDelete={onDelete}
        />
      );

      const deleteButtons = screen.getAllByText('Delete');
      await act(async () => {
        fireEvent.click(deleteButtons[1]);
      });

      await waitFor(() => {
        expect(screen.getByText('Failed to delete payment method')).toBeInTheDocument();
      });
    });
  });

  describe('accessibility', () => {
    it('has semantic button elements', () => {
      const onSetDefault = jest.fn();
      const onDelete = jest.fn();

      const { container } = render(
        <PaymentMethodsList
          methods={mockMethods}
          onSetDefault={onSetDefault}
          onDelete={onDelete}
        />
      );

      const buttons = container.querySelectorAll('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('displays expiry date in readable format', () => {
      const onSetDefault = jest.fn();
      const onDelete = jest.fn();

      render(
        <PaymentMethodsList
          methods={mockMethods}
          onSetDefault={onSetDefault}
          onDelete={onDelete}
        />
      );

      expect(screen.getByText('Expires 12/25')).toBeInTheDocument();
      expect(screen.getByText('Expires 08/26')).toBeInTheDocument();
    });
  });
});
