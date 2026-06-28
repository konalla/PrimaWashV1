import type {
  AvailabilitySearchSlot,
  AvailabilitySlot,
  Booking,
  BookingHold,
  PartnerLocation,
  PaymentIntent,
  ServiceOffering,
  Vehicle,
} from '@prima-wash/contracts';
import { createContext, type PropsWithChildren, useCallback, useContext, useMemo, useState } from 'react';

export type BookingDraftSlot = AvailabilitySlot | AvailabilitySearchSlot;

interface BookingDraft {
  readonly service?: ServiceOffering;
  readonly slot?: BookingDraftSlot;
  readonly hold?: BookingHold;
  readonly vehicle?: Vehicle;
  readonly partner?: PartnerLocation;
}

interface BookingContextValue {
  readonly draft: BookingDraft;
  readonly latestBooking?: Booking;
  readonly latestPayment?: PaymentIntent;
  setService(service: ServiceOffering): void;
  setSlot(slot: AvailabilitySlot): void;
  setHeldSlot(slot: AvailabilitySearchSlot, hold: BookingHold): void;
  setVehicle(vehicle: Vehicle): void;
  setPartner(partner: PartnerLocation): void;
  complete(booking: Booking, payment: PaymentIntent): void;
  reset(): void;
}

const BookingContext = createContext<BookingContextValue | null>(null);

export function BookingProvider({ children }: PropsWithChildren) {
  const [draft, setDraft] = useState<BookingDraft>({});
  const [latestBooking, setLatestBooking] = useState<Booking>();
  const [latestPayment, setLatestPayment] = useState<PaymentIntent>();
  const setService = useCallback((service: ServiceOffering) => {
    setDraft((current) => ({
      ...current,
      service,
      ...(current.slot && slotSupportsService(current.slot, service.code) ? {} : { slot: undefined, hold: undefined }),
    }));
  }, []);
  const setSlot = useCallback((slot: AvailabilitySlot) => {
    setDraft((current) => ({ ...current, slot, hold: undefined }));
  }, []);
  const setHeldSlot = useCallback((slot: AvailabilitySearchSlot, hold: BookingHold) => {
    setDraft((current) => ({ ...current, slot, hold }));
  }, []);
  const setVehicle = useCallback((vehicle: Vehicle) => {
    setDraft((current) => ({
      ...current,
      vehicle,
      ...(current.hold?.vehicleId === vehicle.id ? {} : { hold: undefined, slot: undefined }),
    }));
  }, []);
  const setPartner = useCallback((partner: PartnerLocation) => {
    setDraft((current) => ({
      ...current,
      partner,
      ...(current.slot?.partnerLocationId === partner.id ? {} : { slot: undefined, hold: undefined }),
      ...(current.service && partner.serviceCodes.includes(current.service.code) ? {} : { service: undefined }),
    }));
  }, []);
  const complete = useCallback((booking: Booking, payment: PaymentIntent) => {
    setLatestBooking(booking);
    setLatestPayment(payment);
  }, []);
  const reset = useCallback(() => setDraft({}), []);

  const value = useMemo<BookingContextValue>(
    () => ({
      draft,
      latestBooking,
      latestPayment,
      setService,
      setSlot,
      setHeldSlot,
      setVehicle,
      setPartner,
      complete,
      reset,
    }),
    [complete, draft, latestBooking, latestPayment, reset, setHeldSlot, setPartner, setService, setSlot, setVehicle],
  );

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBooking() {
  const context = useContext(BookingContext);

  if (!context) {
    throw new Error('useBooking must be used inside BookingProvider');
  }

  return context;
}

function slotSupportsService(slot: BookingDraftSlot, serviceCode: ServiceOffering['code']) {
  return 'serviceCode' in slot ? slot.serviceCode === serviceCode : slot.serviceCodes.includes(serviceCode);
}
