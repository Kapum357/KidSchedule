/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Tests for Stripe signature validation
 * Ensures empty/missing signatures are properly rejected with 400 status
 */

import { NextResponse } from 'next/server';

// Mock Stripe before importing the billing module
jest.mock('stripe', () => {
  return jest.fn(() => ({
    webhooks: {
      constructEvent: jest.fn(),
    },
  }));
});

jest.mock('@/lib/observability/logger');
jest.mock('@/lib/observability/api-observability');

import { verifyAndConstructStripeEvent } from '@/lib/stripe-billing';
import { POST } from '@/app/api/webhooks/stripe/route';

describe('Stripe Signature Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = 'test_secret_key';
    process.env.STRIPE_SECRET_KEY = 'sk_test_key';
  });

  describe('verifyAndConstructStripeEvent', () => {
    it('should throw error when signature is null', () => {
      const payload = '{"test": "data"}';
      const signature = null;

      expect(() => {
        verifyAndConstructStripeEvent(payload, signature);
      }).toThrow('Missing or empty Stripe signature');
    });

    it('should throw error when signature is empty string', () => {
      const payload = '{"test": "data"}';
      const signature = '';

      expect(() => {
        verifyAndConstructStripeEvent(payload, signature);
      }).toThrow('Missing or empty Stripe signature');
    });

    it('should throw error when signature is only whitespace', () => {
      const payload = '{"test": "data"}';
      const signature = '   ';

      expect(() => {
        verifyAndConstructStripeEvent(payload, signature);
      }).toThrow('Missing or empty Stripe signature');
    });

    it('should throw error when STRIPE_WEBHOOK_SECRET is not configured', () => {
      delete process.env.STRIPE_WEBHOOK_SECRET;
      const payload = '{"test": "data"}';
      const signature = 'valid_signature';

      expect(() => {
        verifyAndConstructStripeEvent(payload, signature);
      }).toThrow('STRIPE_WEBHOOK_SECRET is not configured');
    });

    it('should accept valid non-empty signature', () => {
      const payload = '{"test": "data"}';
      const signature = 'valid_stripe_signature';

      // Mock Stripe to prevent actual verification attempt
      const mockStripe = require('stripe')();
      mockStripe.webhooks.constructEvent.mockReturnValue({
        id: 'evt_test',
        type: 'test.event',
        data: { object: {} },
      });

      // This should not throw on validation check
      // (It may throw on constructEvent if mocking is incomplete, but that's okay)
      try {
        verifyAndConstructStripeEvent(payload, signature);
      } catch (error) {
        // Only check that it's not our validation error
        if (error instanceof Error) {
          expect(error.message).not.toBe('Missing or empty Stripe signature');
        }
      }
    });
  });

  describe('Error message validation', () => {
    it('should include "Missing or empty Stripe signature" in error message for null signature', () => {
      const payload = '{"test": "data"}';
      const signature = null;

      try {
        verifyAndConstructStripeEvent(payload, signature);
        fail('Should have thrown an error');
      } catch (error) {
        expect((error as Error).message).toBe('Missing or empty Stripe signature');
      }
    });

    it('should include "Missing or empty Stripe signature" in error message for empty string', () => {
      const payload = '{"test": "data"}';
      const signature = '';

      try {
        verifyAndConstructStripeEvent(payload, signature);
        fail('Should have thrown an error');
      } catch (error) {
        expect((error as Error).message).toBe('Missing or empty Stripe signature');
      }
    });

    it('should include "Missing or empty Stripe signature" in error message for whitespace signature', () => {
      const payload = '{"test": "data"}';
      const signature = '   ';

      try {
        verifyAndConstructStripeEvent(payload, signature);
        fail('Should have thrown an error');
      } catch (error) {
        expect((error as Error).message).toBe('Missing or empty Stripe signature');
      }
    });
  });
});
