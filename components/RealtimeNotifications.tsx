/**
 * RealtimeNotifications — mounts once in App.tsx.
 *
 * Customers: toasts when their own order status changes.
 * Admins:    toasts on every new order + low-stock product alerts.
 *
 * Uses Supabase Realtime (postgres_changes) — requires the
 * `supabase_realtime` publication to include `checkouts` and `products`
 * (done in 20260612_inventory.sql migration).
 */

import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending:         'Order received',
  completed:       'Order completed',
  payment_failed:  'Payment failed',
  refunded:        'Order refunded',
  cancelled:       'Order cancelled',
  shipped:         'Order shipped',
  processing:      'Order is being processed',
};

const RealtimeNotifications: React.FC = () => {
  const { user, profile } = useAuth();
  const { addToast } = useStore();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    // Clean up any existing channel before setting up a new one
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    if (!user) return;

    const isAdmin = profile?.role === 'admin';
    const channel = supabase.channel(`realtime-notifications-${user.id}`);

    // ── Customer: watch their own orders for status changes ──
    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'checkouts',
        filter: `user_id=eq.${user.id}`,
      },
      (payload) => {
        const newStatus = payload.new?.status as string | undefined;
        const oldStatus = payload.old?.status as string | undefined;
        if (!newStatus || newStatus === oldStatus) return;

        const label = ORDER_STATUS_LABELS[newStatus] ?? `Order ${newStatus}`;
        const type = newStatus === 'completed' || newStatus === 'shipped' ? 'success'
          : newStatus === 'payment_failed' || newStatus === 'cancelled' ? 'error'
          : 'info';
        addToast(`${label} — #${String(payload.new?.id).slice(0, 8)}`, type);
      }
    );

    if (isAdmin) {
      // ── Admin: new order placed anywhere ──
      channel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'checkouts' },
        (payload) => {
          const amount = parseFloat(payload.new?.total_amount ?? '0').toFixed(2);
          addToast(`New order — $${amount}`, 'success');
        }
      );

      // ── Admin: product goes low-stock or out-of-stock ──
      channel.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'products' },
        (payload) => {
          const newQty = payload.new?.stock_quantity as number | undefined;
          const oldQty = payload.old?.stock_quantity as number | undefined;
          const threshold = payload.new?.low_stock_threshold as number ?? 10;
          const name = payload.new?.name as string ?? 'Product';

          if (newQty === undefined || oldQty === undefined) return;

          if (newQty === 0 && oldQty > 0) {
            addToast(`Out of stock: ${name}`, 'error');
          } else if (newQty <= threshold && oldQty > threshold) {
            addToast(`Low stock: ${name} — ${newQty} remaining`, 'info');
          }
        }
      );
    }

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [user?.id, profile?.role]);

  return null;
};

export default RealtimeNotifications;
