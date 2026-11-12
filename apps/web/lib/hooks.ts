'use client';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { formatDate, formatMoney, formatNumber, type Collections, type CustomerDetail, type CustomersOverview, type Earnings, type Me, type NotificationsList, type OrderDetail, type OrderRow } from '@ananda-agents/shared';
import { api, ApiError } from './api';

export const keys = {
  me: ['me'],
  customers: ['customers'],
  customer: (id: string) => ['customer', id],
  orders: ['orders'],
  order: (id: string) => ['order', id],
  collections: ['collections'],
  earnings: ['earnings'],
  notifications: ['notifications'],
};

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => api<Me>('/me'), staleTime: 60_000 });
export const useCustomers = (enabled = true) => useQuery({ queryKey: keys.customers, queryFn: () => api<CustomersOverview>('/customers'), enabled });
export const useCustomer = (id: string | null) =>
  useQuery({ queryKey: keys.customer(id ?? ''), queryFn: () => api<CustomerDetail>(`/customers/${id}`), enabled: !!id });
export const useOrders = () => useQuery({ queryKey: keys.orders, queryFn: () => api<OrderRow[]>('/orders') });
export const useOrder = (id: string) => useQuery({ queryKey: keys.order(id), queryFn: () => api<OrderDetail>(`/orders/${id}`) });
export const useCollections = (enabled = true) => useQuery({ queryKey: keys.collections, queryFn: () => api<Collections>('/collections'), enabled });
export const useEarnings = () => useQuery({ queryKey: keys.earnings, queryFn: () => api<Earnings>('/earnings') });
export const useNotifications = () =>
  useQuery({ queryKey: keys.notifications, queryFn: () => api<NotificationsList>('/notifications'), refetchInterval: 20_000, refetchOnWindowFocus: true });

/** Locale-aware formatting for the current UI language. */
export function useFmt() {
  const locale = useLocale();
  return {
    locale,
    money: (cents: number, whole = false) => formatMoney(cents, locale, { whole }),
    date: (d: string | Date, year = false) => formatDate(d, locale, { year }),
    num: (n: number) => formatNumber(n, locale),
  };
}

/** API error → translated sentence. */
export function useErrorText() {
  const t = useTranslations();
  return (e: unknown): string => {
    if (e instanceof ApiError) {
      if (e.code === 'offline') return t('common.offline');
      const key = `errors.${e.code}`;
      if (t.has(key)) return t(key);
    }
    return t('common.error');
  };
}
