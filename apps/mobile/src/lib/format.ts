import type { Money, ServiceCode } from '@prima-wash/contracts';

export function formatMoney(value: Money): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: value.currency,
  }).format(value.amountMinor / 100);
}

export function formatService(code: ServiceCode): string {
  const labels: Record<ServiceCode, string> = {
    wash_basic: 'Essential Wash',
    wash_premium: 'Premium Detail',
    detail_interior: 'Interior Reset',
  };

  return labels[code];
}

export function formatAppointment(value: string): string {
  return new Date(value).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
