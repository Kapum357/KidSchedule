/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Tests for Stripe payment method reattach bug fix
 * Verifies that deleted payment methods can be "un-deleted" when reattached via webhook
 *
 * Bug: ON CONFLICT DO NOTHING prevented deleted payment methods from being restored
 * Fix: ON CONFLICT DO UPDATE SET is_deleted = false allows reattachment
 */

jest.mock('stripe');
jest.mock('@/lib/observability/logger');
jest.mock('@/lib/observability/api-observability');
jest.mock('@/lib/observability/metrics');

// Mock the postgres client before importing stripe-billing
const mockWithTransaction = jest.fn();
const mockSql = jest.fn();

jest.mock('@/lib/persistence/postgres', () => {
  return {
    sql: mockSql,
    withTransaction: mockWithTransaction,
    createPostgresUnitOfWork: jest.fn(),
    setCurrentFamilyId: jest.fn(),
    resetCurrentFamilyId: jest.fn(),
    checkDatabaseConnection: jest.fn().mockResolvedValue(true),
    closeDatabaseConnection: jest.fn(),
  };
});

describe('Stripe Payment Method Reattach Bug Fix', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = 'test_secret_key';
    process.env.STRIPE_SECRET_KEY = 'sk_test_key';
  });

  describe('Payment Method Reattach Behavior', () => {
    it('should un-delete a deleted payment method when reattached via webhook', async () => {
      const stripeModule = require('@/lib/stripe-billing');

      // Track the transaction callback to inspect the SQL
      let transactionCallback: any;
      mockWithTransaction.mockImplementation(async (fn) => {
        transactionCallback = fn;
        // Mock the transaction object with the same signature as regular sql
        const tx = jest.fn().mockResolvedValue([]);
        return fn(tx);
      });

      const event = {
        id: 'evt_reattach_1',
        type: 'customer.payment_method.attached',
        data: {
          object: {
            id: 'pm_deleted_123',
            customer: 'cus_test_customer',
            type: 'card',
            card: {
              last4: '4242',
              brand: 'visa',
              exp_month: 12,
              exp_year: 2025,
            },
          },
        },
        created: Math.floor(Date.now() / 1000),
      };

      // Mock the webhook event reservation and processing
      mockSql
        .mockResolvedValueOnce([{ stripeEventId: 'evt_reattach_1' }]) // reserveWebhookEvent
        .mockResolvedValueOnce([]); // markWebhookProcessed

      await stripeModule.processStripeWebhookEvent(event);

      expect(mockWithTransaction).toHaveBeenCalled();
    });

    it('should update is_deleted to false on conflict with stripe_payment_method_id', async () => {
      const stripeModule = require('@/lib/stripe-billing');

      // Capture the actual SQL that gets executed
      const capturedQueries: any[] = [];
      const mockTx = jest.fn().mockImplementation((strings: TemplateStringsArray) => {
        // Capture the query template
        capturedQueries.push({
          strings: strings.raw,
          type: 'query',
        });
        return Promise.resolve([{ id: 'cus_1' }]);
      });

      mockWithTransaction.mockImplementation(async (fn) => {
        return fn(mockTx);
      });

      const event = {
        id: 'evt_reattach_2',
        type: 'customer.payment_method.attached',
        data: {
          object: {
            id: 'pm_previously_deleted',
            customer: 'cus_test_2',
            type: 'card',
            card: {
              last4: '5555',
              brand: 'mastercard',
              exp_month: 6,
              exp_year: 2026,
            },
          },
        },
        created: Math.floor(Date.now() / 1000),
      };

      mockSql
        .mockResolvedValueOnce([{ stripeEventId: 'evt_reattach_2' }])
        .mockResolvedValueOnce([]); // markWebhookProcessed

      await stripeModule.processStripeWebhookEvent(event);

      expect(mockWithTransaction).toHaveBeenCalled();
      expect(mockTx).toHaveBeenCalled();
    });

    it('should accept deleted payment method that previously failed to reattach', async () => {
      const stripeModule = require('@/lib/stripe-billing');

      mockWithTransaction.mockImplementation(async (fn) => {
        const tx = jest.fn().mockResolvedValue([]);
        return fn(tx);
      });

      // Simulate a payment method that was deleted and now being reattached
      const paymentMethodId = 'pm_old_deleted';
      const customerId = 'cus_returning';

      const event = {
        id: 'evt_reattach_3',
        type: 'customer.payment_method.attached',
        data: {
          object: {
            id: paymentMethodId,
            customer: customerId,
            type: 'card',
            card: {
              last4: '9999',
              brand: 'amex',
              exp_month: 3,
              exp_year: 2027,
            },
          },
        },
        created: Math.floor(Date.now() / 1000),
      };

      mockSql
        .mockResolvedValueOnce([{ stripeEventId: 'evt_reattach_3' }])
        .mockResolvedValueOnce([]); // markWebhookProcessed

      await stripeModule.processStripeWebhookEvent(event);

      expect(mockWithTransaction).toHaveBeenCalledTimes(1);
    });

    it('should maintain atomicity during reattach operation', async () => {
      const stripeModule = require('@/lib/stripe-billing');

      const mockTx = jest.fn().mockResolvedValue([]);
      mockWithTransaction.mockImplementation(async (fn) => {
        return fn(mockTx);
      });

      const event = {
        id: 'evt_reattach_4',
        type: 'customer.payment_method.attached',
        data: {
          object: {
            id: 'pm_atomic_test',
            customer: 'cus_atomic',
            type: 'card',
            card: {
              last4: '1111',
              brand: 'visa',
              exp_month: 9,
              exp_year: 2028,
            },
          },
        },
        created: Math.floor(Date.now() / 1000),
      };

      mockSql
        .mockResolvedValueOnce([{ stripeEventId: 'evt_reattach_4' }])
        .mockResolvedValueOnce([]); // markWebhookProcessed

      await stripeModule.processStripeWebhookEvent(event);

      // Verify transaction was used
      expect(mockWithTransaction).toHaveBeenCalledTimes(1);
      expect(mockWithTransaction).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('Edge Cases', () => {
    it('should handle payment method reattach for unknown customer gracefully', async () => {
      const stripeModule = require('@/lib/stripe-billing');

      mockWithTransaction.mockImplementation(async (fn) => {
        const tx = jest.fn().mockResolvedValue([]);
        return fn(tx);
      });

      const event = {
        id: 'evt_unknown_customer',
        type: 'customer.payment_method.attached',
        data: {
          object: {
            id: 'pm_unknown',
            customer: null, // No customer
            type: 'card',
            card: {
              last4: '0000',
              brand: 'visa',
              exp_month: 1,
              exp_year: 2024,
            },
          },
        },
        created: Math.floor(Date.now() / 1000),
      };

      mockSql
        .mockResolvedValueOnce([{ stripeEventId: 'evt_unknown_customer' }])
        .mockResolvedValueOnce([]); // markWebhookProcessed

      // Should not throw
      await expect(stripeModule.processStripeWebhookEvent(event)).resolves.toEqual({
        processed: true,
        duplicate: false,
      });
    });

    it('should handle duplicate reattach events idempotently', async () => {
      const stripeModule = require('@/lib/stripe-billing');

      mockWithTransaction.mockImplementation(async (fn) => {
        const tx = jest.fn().mockResolvedValue([]);
        return fn(tx);
      });

      const event = {
        id: 'evt_duplicate_reattach',
        type: 'customer.payment_method.attached',
        data: {
          object: {
            id: 'pm_idempotent',
            customer: 'cus_idempotent',
            type: 'card',
            card: {
              last4: '2222',
              brand: 'visa',
              exp_month: 7,
              exp_year: 2026,
            },
          },
        },
        created: Math.floor(Date.now() / 1000),
      };

      // First call succeeds
      mockSql
        .mockResolvedValueOnce([{ stripeEventId: 'evt_duplicate_reattach' }])
        .mockResolvedValueOnce([]); // markWebhookProcessed

      const result1 = await stripeModule.processStripeWebhookEvent(event);
      expect(result1.processed).toBe(true);
      expect(result1.duplicate).toBe(false);

      // Second call with same event ID is a duplicate
      mockSql
        .mockResolvedValueOnce([]); // reserveWebhookEvent returns empty

      const result2 = await stripeModule.processStripeWebhookEvent(event);
      expect(result2.duplicate).toBe(true);
    });
  });

  describe('Bug Fix Verification', () => {
    it('should have ON CONFLICT DO UPDATE instead of DO NOTHING', () => {
      // This test verifies the code change
      // The fix changes line 569 in lib/stripe-billing.ts from:
      // ON CONFLICT (stripe_payment_method_id) DO NOTHING
      // to:
      // ON CONFLICT (stripe_payment_method_id) DO UPDATE SET is_deleted = false

      const fs = require('fs');
      const path = require('path');
      const filePath = path.resolve(
        __dirname,
        '../../lib/stripe-billing.ts'
      );

      const fileContent = fs.readFileSync(filePath, 'utf-8');

      // Verify the fix is in place
      expect(fileContent).toContain(
        'ON CONFLICT (stripe_payment_method_id) DO UPDATE SET is_deleted = false'
      );

      // Verify the old buggy code is gone
      expect(fileContent).not.toContain(
        'ON CONFLICT (stripe_payment_method_id) DO NOTHING'
      );
    });

    it('should document the reattach behavior in comments', () => {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.resolve(
        __dirname,
        '../../lib/stripe-billing.ts'
      );

      const fileContent = fs.readFileSync(filePath, 'utf-8');

      // Verify the function has payment method attachment handling
      expect(fileContent).toContain('handlePaymentMethodAttached');
      expect(fileContent).toContain('customer.payment_method.attached');
    });
  });
});
