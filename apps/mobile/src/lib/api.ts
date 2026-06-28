import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type {
  AvailabilitySlot,
  AvailabilitySearchResponse,
  AuthSession,
  BookingHold,
  CustomerProfile,
  Booking,
  CreateBookingHoldRequest,
  CreateBookingHoldResponse,
  CreateBookingRequest,
  CreatePaymentIntentRequest,
  CreatePropertyInterestRequest,
  CreatePropertyInterestResponse,
  CreateVehicleRequest,
  PaymentIntent,
  PartnerLocation,
  PrimaWashDay,
  Property,
  ServiceOffering,
  ServiceRecord,
  Vehicle,
  RequestAuthCodeResponse,
  UpdateCustomerProfileRequest,
  UpdateVehicleRequest,
} from '@prima-wash/contracts';

interface ApiEnvelope<T> {
  readonly data: T;
}

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL;
const debuggerHost = Constants.expoConfig?.hostUri?.split(':')[0];
const fallbackHost =
  Platform.OS === 'android' ? '10.0.2.2' : debuggerHost && debuggerHost !== 'localhost' ? debuggerHost : '127.0.0.1';

export const apiBaseUrl = configuredApiUrl ?? `http://${fallbackHost}:3001`;

let accessToken: string | undefined;

export function setApiAccessToken(token?: string) {
  accessToken = token;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      signal: init?.signal ?? controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...init?.headers,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The request took too long. Check your connection and try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = (await response.json()) as ApiEnvelope<T> & { message?: string };

  if (!response.ok) {
    throw new Error(payload.message ?? 'Prima Wash could not complete this request.');
  }

  return payload.data;
}

export const primaApi = {
  requestAuthCode: (identifier: string) =>
    request<RequestAuthCodeResponse>('/v1/auth/code/request', {
      method: 'POST',
      body: JSON.stringify({ identifier }),
    }),
  verifyAuthCode: (challengeId: string, code: string) =>
    request<AuthSession>('/v1/auth/code/verify', {
      method: 'POST',
      body: JSON.stringify({ challengeId, code }),
    }),
  session: () => request<AuthSession>('/v1/auth/session'),
  logout: () => request<{ readonly loggedOut: boolean }>('/v1/auth/logout', { method: 'POST' }),
  profile: () => request<CustomerProfile>('/v1/profile'),
  updateProfile: (input: UpdateCustomerProfileRequest) =>
    request<CustomerProfile>('/v1/profile', { method: 'PATCH', body: JSON.stringify(input) }),
  properties: (input?: { readonly query?: string; readonly residenceType?: string }) => {
    const params = new URLSearchParams();

    if (input?.query) {
      params.set('query', input.query);
    }

    if (input?.residenceType) {
      params.set('residenceType', input.residenceType);
    }

    const query = params.toString();
    return request<readonly Property[]>(`/v1/properties${query ? `?${query}` : ''}`);
  },
  createPropertyInterest: (input: CreatePropertyInterestRequest) =>
    request<CreatePropertyInterestResponse>('/v1/property-interests', { method: 'POST', body: JSON.stringify(input) }),
  primaWashDays: (propertyId: string) => request<readonly PrimaWashDay[]>(`/v1/properties/${propertyId}/prima-wash-days`),
  services: () => request<readonly ServiceOffering[]>('/v1/services'),
  partners: (serviceCode?: string) =>
    request<readonly PartnerLocation[]>(`/v1/partners${serviceCode ? `?serviceCode=${encodeURIComponent(serviceCode)}` : ''}`),
  partner: (partnerId: string) => request<PartnerLocation>(`/v1/partners/${partnerId}`),
  availability: (partnerLocationId?: string) =>
    request<readonly AvailabilitySlot[]>(
      `/v1/availability${partnerLocationId ? `?partnerLocationId=${encodeURIComponent(partnerLocationId)}` : ''}`,
    ),
  availabilitySearch: (input: { readonly partnerLocationId: string; readonly serviceCode: string; readonly date: string }) =>
    request<AvailabilitySearchResponse>(
      `/v1/availability/search?partnerLocationId=${encodeURIComponent(input.partnerLocationId)}&serviceCode=${encodeURIComponent(
        input.serviceCode,
      )}&date=${encodeURIComponent(input.date)}`,
    ),
  vehicles: () => request<readonly Vehicle[]>('/v1/vehicles'),
  bookings: () => request<readonly Booking[]>('/v1/bookings'),
  booking: (bookingId: string) => request<Booking>(`/v1/bookings/${bookingId}`),
  paymentForBooking: (bookingId: string) =>
    request<PaymentIntent | null>(`/v1/payments?bookingId=${encodeURIComponent(bookingId)}`),
  serviceRecords: () => request<readonly ServiceRecord[]>('/v1/service-records'),
  createVehicle: (input: CreateVehicleRequest) =>
    request<Vehicle>('/v1/vehicles', { method: 'POST', body: JSON.stringify(input) }),
  updateVehicle: (vehicleId: string, input: UpdateVehicleRequest) =>
    request<Vehicle>(`/v1/vehicles/${vehicleId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteVehicle: (vehicleId: string) =>
    request<{ readonly deleted: boolean }>(`/v1/vehicles/${vehicleId}`, { method: 'DELETE' }),
  createBooking: (input: CreateBookingRequest) =>
    request<Booking>('/v1/bookings', { method: 'POST', body: JSON.stringify(input) }),
  createBookingHold: (input: CreateBookingHoldRequest) =>
    request<CreateBookingHoldResponse>('/v1/booking-holds', { method: 'POST', body: JSON.stringify(input) }),
  releaseBookingHold: (holdId: string) =>
    request<BookingHold>(`/v1/booking-holds/${holdId}`, { method: 'DELETE' }),
  createPaymentIntent: (input: CreatePaymentIntentRequest) =>
    request<PaymentIntent>('/v1/payments/intents', { method: 'POST', body: JSON.stringify(input) }),
  authorizePayment: (paymentIntentId: string) =>
    request<PaymentIntent>(`/v1/payments/${paymentIntentId}/authorize`, { method: 'POST' }),
  cancelBooking: (bookingId: string) =>
    request<Booking>(`/v1/bookings/${bookingId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'customer_requested' }),
    }),
};
