/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Tests for Stripe out-of-order event detection
 * Verifies that stale events (older than the DB record) are skipped
 *
 * Implementation: Both upsertSubscriptionFromStripe and upsertInvoiceFromStripe
 * compare the incoming event timestamp with the existing record's updated_at.
 * If event.timestamp < db_record.updated_at, the update is skipped.
 */

jest.mock('stripe');
jest.mock('@/lib/observability/logger');
jest.mock('@/lib/observability/api-observability');
jest.mock('@/lib/observability/metrics');

// Mock the postgres client before importing stripe-billing
const mockOoeSql = jest.fn();

jest.mock('@/lib/persistence/postgres', () => {
  return {
    sql: mockOoeSql,
    withTransaction: jest.fn((fn) => fn(jest.fn())),
    createPostgresUnitOfWork: jest.fn(),
    setCurrentFamilyId: jest.fn(),
    resetCurrentFamilyId: jest.fn(),
    checkDatabaseConnection: jest.fn().mockResolvedValue(true),
    closeDatabaseConnection: jest.fn(),
  };
});

describe('Stripe Out-of-Order Event Detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSql.mockResolvedValue([]);
    process.env.STRIPE_WEBHOOK_SECRET = 'test_secret_key';
    process.env.STRIPE_SECRET_KEY = 'sk_test_key';
  });

  describe('Subscription Out-of-Order Detection', () => {
    it('should skip subscription update if event timestamp is older than DB record', async () => {
      const stripeModule = require('@/lib/stripe-billing');

      // Track SQL calls
      let findUserCalled = false;
      let findExistingCalled = false;
      let insertCalledCount = 0;

      mockSql.mockImplementation((query: any) => {
        const queryStr = query.toString();

        // find user by customer
        if (queryStr.includes('SELECT user_id') && queryStr.includes('stripe_customers')) {
          findUserCalled = true;
          return Promise.resolve([{ userId: 'user-123' }]);
        }

        // find existing subscription
        if (queryStr.includes('SELECT') && queryStr.includes('subscriptions') && queryStr.includes('stripe_subscription_id')) {
          findExistingCalled = true;
          const existingUpdateTime = new Date('2026-03-12T12:00:00Z');
          return Promise.resolve([{ updated_at: existingUpdateTime }]);
        }

        // INSERT into webhook_events (reserve)
        if (queryStr.includes('INSERT INTO webhook_events')) {
          return Promise.resolve([{ stripeEventId: 'evt_123' }]);
        }

        // INSERT/UPDATE for subscription
        if (queryStr.includes('INSERT INTO subscriptions')) {
          insertCalledCount++;
          return Promise.resolve([{ id: 'sub-id' }]);
        }

        // mark processed
        if (queryStr.includes('UPDATE webhook_events') && queryStr.includes('processed')) {
          return Promise.resolve([]);
        }

        return Promise.resolve([]);
      });

      const oldEventTime = Math.floor(new Date('2026-03-12T11:00:00Z').getTime() / 1000);
      const subscription: any = {
        id: 'sub_123',
        customer: 'cus_123',
        created: oldEventTime,
        status: 'active',
        items: { data: [{ price: { id: 'price_123' } }] },
        cancel_at_period_end: false,
        current_period_start: oldEventTime,
        current_period_end: oldEventTime + 2592000,
        metadata: {},
      };

      const { processStripeWebhookEvent } = stripeModule;

      const event: any = {
        id: 'evt_123',
        type: 'customer.subscription.updated',
        data: { object: subscription },
      };

      await processStripeWebhookEvent(event);

      expect(findUserCalled).toBe(true);
      expect(findExistingCalled).toBe(true);
      expect(insertCalledCount).toBe(0); // Should NOT insert because event is stale
    });

    it('should update subscription if event timestamp is newer than DB record', async () => {
      const stripeModule = require('@/lib/stripe-billing');

      let findUserCalled = false;
      let findExistingCalled = false;
      let insertCalledCount = 0;

      mockSql.mockImplementation((query: any) => {
        const queryStr = query.toString();

        if (queryStr.includes('SELECT user_id') && queryStr.includes('stripe_customers')) {
          findUserCalled = true;
          return Promise.resolve([{ userId: 'user-123' }]);
        }

        if (queryStr.includes('SELECT') && queryStr.includes('subscriptions') && queryStr.includes('stripe_subscription_id')) {
          findExistingCalled = true;
          const existingUpdateTime = new Date('2026-03-12T11:00:00Z');
          return Promise.resolve([{ updated_at: existingUpdateTime }]);
        }

        if (queryStr.includes('INSERT INTO webhook_events')) {
          return Promise.resolve([{ stripeEventId: 'evt_new' }]);
        }

        if (queryStr.includes('INSERT INTO subscriptions')) {
          insertCalledCount++;
          return Promise.resolve([{ id: 'sub-id' }]);
        }

        if (queryStr.includes('UPDATE webhook_events') && queryStr.includes('processed')) {
          return Promise.resolve([]);
        }

        return Promise.resolve([]);
      });

      const newEventTime = Math.floor(new Date('2026-03-12T12:00:00Z').getTime() / 1000);
      const subscription: any = {
        id: 'sub_456',
        customer: 'cus_123',
        created: newEventTime,
        status: 'active',
        items: { data: [{ price: { id: 'price_123' } }] },
        cancel_at_period_end: false,
        current_period_start: newEventTime,
        current_period_end: newEventTime + 2592000,
        metadata: {},
      };

      const { processStripeWebhookEvent } = stripeModule;

      const event: any = {
        id: 'evt_new',
        type: 'customer.subscription.updated',
        data: { object: subscription },
      };

      await processStripeWebhookEvent(event);

      expect(findUserCalled).toBe(true);
      expect(findExistingCalled).toBe(true);
      expect(insertCalledCount).toBe(1); // Should INSERT because event is newer
    });

    it('should insert subscription if no existing record and event is received', async () => {
      const stripeModule = require('@/lib/stripe-billing');

      let findUserCalled = false;
      let findExistingCalled = false;
      let insertCalledCount = 0;

      mockSql.mockImplementation((query: any) => {
        const queryStr = query.toString();

        if (queryStr.includes('SELECT user_id') && queryStr.includes('stripe_customers')) {
          findUserCalled = true;
          return Promise.resolve([{ userId: 'user-123' }]);
        }

        if (queryStr.includes('SELECT') && queryStr.includes('subscriptions') && queryStr.includes('stripe_subscription_id')) {
          findExistingCalled = true;
          return Promise.resolve([]); // No existing record
        }

        if (queryStr.includes('INSERT INTO webhook_events')) {
          return Promise.resolve([{ stripeEventId: 'evt_fresh' }]);
        }

        if (queryStr.includes('INSERT INTO subscriptions')) {
          insertCalledCount++;
          return Promise.resolve([{ id: 'sub-id' }]);
        }

        if (queryStr.includes('UPDATE webhook_events') && queryStr.includes('processed')) {
          return Promise.resolve([]);
        }

        return Promise.resolve([]);
      });

      const eventTime = Math.floor(new Date('2026-03-12T12:00:00Z').getTime() / 1000);
      const subscription: any = {
        id: 'sub_fresh',
        customer: 'cus_123',
        created: eventTime,
        status: 'active',
        items: { data: [{ price: { id: 'price_123' } }] },
        cancel_at_period_end: false,
        current_period_start: eventTime,
        current_period_end: eventTime + 2592000,
        metadata: {},
      };

      const { processStripeWebhookEvent } = stripeModule;

      const event: any = {
        id: 'evt_fresh',
        type: 'customer.subscription.updated',
        data: { object: subscription },
      };

      await processStripeWebhookEvent(event);

      expect(findUserCalled).toBe(true);
      expect(findExistingCalled).toBe(true);
      expect(insertCalledCount).toBe(1); // Should INSERT for new subscription
    });
  });

  describe('Invoice Out-of-Order Detection', () => {
    it('should skip invoice update if event timestamp is older than DB record', async () => {
      const stripeModule = require('@/lib/stripe-billing');

      let findUserCalls = 0;
      let findInvoiceCalls = 0;
      let insertCalledCount = 0;

      mockSql.mockImplementation((query: any) => {
        const queryStr = query.toString();

        if (queryStr.includes('SELECT user_id') && queryStr.includes('stripe_customers')) {
          findUserCalls++;
          return Promise.resolve([{ userId: 'user-123' }]);
        }

        if (queryStr.includes('SELECT') && queryStr.includes('invoices') && queryStr.includes('stripe_invoice_id')) {
          findInvoiceCalls++;
          const existingUpdateTime = new Date('2026-03-12T12:00:00Z');
          return Promise.resolve([{ updated_at: existingUpdateTime }]);
        }

        if (queryStr.includes('INSERT INTO webhook_events')) {
          return Promise.resolve([{ stripeEventId: 'evt_inv_old' }]);
        }

        if (queryStr.includes('INSERT INTO invoices')) {
          insertCalledCount++;
          return Promise.resolve([{ id: 'inv-id' }]);
        }

        if (queryStr.includes('UPDATE webhook_events') && queryStr.includes('processed')) {
          return Promise.resolve([]);
        }

        return Promise.resolve([]);
      });

      const oldEventTime = Math.floor(new Date('2026-03-12T11:00:00Z').getTime() / 1000);
      const invoice: any = {
        id: 'inv_old',
        customer: 'cus_123',
        created: oldEventTime,
        status: 'paid',
        amount_due: 999,
        amount_paid: 999,
        invoice_pdf: 'https://example.com/invoice.pdf',
        status_transitions: { paid_at: oldEventTime },
        metadata: {},
      };

      const { processStripeWebhookEvent } = require('@/lib/stripe-billing');

      const event: any = {
        id: 'evt_inv_old',
        type: 'invoice.paid',
        data: { object: invoice },
      };

      await processStripeWebhookEvent(event);

      expect(findUserCalls).toBeGreaterThanOrEqual(1);
      expect(findInvoiceCalls).toBeGreaterThanOrEqual(1);
      expect(insertCalledCount).toBe(0); // Should NOT insert because event is stale
    });

    it('should update invoice if event timestamp is newer than DB record', async () => {
      const stripeModule = require('@/lib/stripe-billing');

      let findUserCalls = 0;
      let findInvoiceCalls = 0;
      let insertCalledCount = 0;

      mockSql.mockImplementation((query: any) => {
        const queryStr = query.toString();

        if (queryStr.includes('SELECT user_id') && queryStr.includes('stripe_customers')) {
          findUserCalls++;
          return Promise.resolve([{ userId: 'user-123' }]);
        }

        if (queryStr.includes('SELECT') && queryStr.includes('invoices') && queryStr.includes('stripe_invoice_id')) {
          findInvoiceCalls++;
          const existingUpdateTime = new Date('2026-03-12T11:00:00Z');
          return Promise.resolve([{ updated_at: existingUpdateTime }]);
        }

        if (queryStr.includes('INSERT INTO webhook_events')) {
          return Promise.resolve([{ stripeEventId: 'evt_inv_new' }]);
        }

        if (queryStr.includes('INSERT INTO invoices')) {
          insertCalledCount++;
          return Promise.resolve([{ id: 'inv-id' }]);
        }

        if (queryStr.includes('UPDATE webhook_events') && queryStr.includes('processed')) {
          return Promise.resolve([]);
        }

        return Promise.resolve([]);
      });

      const newEventTime = Math.floor(new Date('2026-03-12T12:00:00Z').getTime() / 1000);
      const invoice: any = {
        id: 'inv_new',
        customer: 'cus_123',
        created: newEventTime,
        status: 'paid',
        amount_due: 999,
        amount_paid: 999,
        invoice_pdf: 'https://example.com/invoice.pdf',
        status_transitions: { paid_at: newEventTime },
        metadata: {},
      };

      const { processStripeWebhookEvent } = require('@/lib/stripe-billing');

      const event: any = {
        id: 'evt_inv_new',
        type: 'invoice.paid',
        data: { object: invoice },
      };

      await processStripeWebhookEvent(event);

      expect(findUserCalls).toBeGreaterThanOrEqual(1);
      expect(findInvoiceCalls).toBeGreaterThanOrEqual(1);
      expect(insertCalledCount).toBe(1); // Should INSERT because event is newer
    });
  });
});
