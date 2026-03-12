import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/persistence";
import { PaymentMethodsList } from "./payment-methods-list";

export async function PaymentMethodsSection() {
  const user = await requireAuth();
  const stripeCustomer = await db.stripeCustomers.findByUserId(user.userId);
  const methods = stripeCustomer
    ? await db.paymentMethods.findByCustomer(stripeCustomer.id)
    : [];

  async function handleSetDefault(id: string) {
    'use server';
    const response = await fetch('/api/billing/payment-methods/' + id + '/set-default', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error('Failed to set default payment method');
    }
  }

  async function handleDelete(id: string) {
    'use server';
    const response = await fetch('/api/billing/payment-methods/' + id, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error('Failed to delete payment method');
    }
  }

  return (
    <section>
      <h2 className="mb-4 text-xl font-bold text-slate-900 dark:text-white">Payment Methods</h2>
      <PaymentMethodsList
        methods={methods.map(m => ({
          id: m.id,
          brand: m.brand || 'Unknown',
          last4: m.last4 || '****',
          expiry: `${String(m.expMonth).padStart(2, '0')}/${m.expYear}`,
          isDefault: m.isDefault,
          expMonth: m.expMonth,
          expYear: m.expYear,
        }))}
        onSetDefault={handleSetDefault}
        onDelete={handleDelete}
      />
    </section>
  );
}
