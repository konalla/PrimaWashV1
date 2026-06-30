import type {
  AvailabilitySearchSlot,
  AvailabilitySlot,
  Booking,
  BookingOnsiteServiceMode,
  BookingHold,
  PartnerLocation,
  PaymentIntent,
  PrimaWashDay,
  ServiceOffering,
  Vehicle,
} from '@prima-wash/contracts';
import { createContext, type PropsWithChildren, useCallback, useContext, useMemo, useState } from 'react';

export interface PrimaWashDayDraftSlot {
  readonly primaWashDayId: string;
  readonly partnerLocationId?: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly capacity: number;
  readonly availableCount: number;
  readonly serviceCodes: PrimaWashDay['serviceCodes'];
  readonly source: 'prima_wash_day';
}

export type BookingDraftSlot = AvailabilitySlot | AvailabilitySearchSlot | PrimaWashDayDraftSlot;

interface BookingDraft {
  readonly service?: ServiceOffering;
  readonly slot?: BookingDraftSlot;
  readonly hold?: BookingHold;
  readonly vehicle?: Vehicle;
  readonly partner?: PartnerLocation;
  readonly primaWashDay?: PrimaWashDay;
  readonly onsiteServiceMode?: BookingOnsiteServiceMode;
}

interface BookingContextValue {
  readonly draft: BookingDraft;
  readonly latestBooking?: Booking;
  readonly latestPayment?: PaymentIntent;
  setService(service: ServiceOffering): void;
  setSlot(slot: AvailabilitySlot): void;
  setHeldSlot(slot: AvailabilitySearchSlot, hold: BookingHold): void;
  setPrimaWashDay(day: PrimaWashDay): void;
  setOnsiteServiceMode(mode: BookingOnsiteServiceMode): void;
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
  const setPrimaWashDay = useCallback((day: PrimaWashDay) => {
    setDraft((current) => ({
      ...current,
      partner: undefined,
      primaWashDay: day,
      hold: undefined,
      onsiteServiceMode: 'onsite',
      slot: {
        primaWashDayId: day.id,
        partnerLocationId: day.partnerLocationId,
        startsAt: day.startsAt,
        endsAt: day.endsAt,
        capacity: day.capacity,
        availableCount: day.capacity,
        serviceCodes: day.serviceCodes,
        source: 'prima_wash_day',
      },
      ...(current.service && day.serviceCodes.includes(current.service.code) ? {} : { service: undefined }),
    }));
  }, []);
  const setOnsiteServiceMode = useCallback((onsiteServiceMode: BookingOnsiteServiceMode) => {
    setDraft((current) => ({ ...current, onsiteServiceMode }));
  }, []);
  const setVehicle = useCallback((vehicle: Vehicle) => {
    setDraft((current) => ({
      ...current,
      vehicle,
      ...(current.hold && current.hold.vehicleId !== vehicle.id ? { hold: undefined, slot: undefined } : {}),
    }));
  }, []);
  const setPartner = useCallback((partner: PartnerLocation) => {
    setDraft((current) => ({
      ...current,
      partner,
      primaWashDay: undefined,
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
      setPrimaWashDay,
      setOnsiteServiceMode,
      setVehicle,
      setPartner,
      complete,
      reset,
    }),
    [complete, draft, latestBooking, latestPayment, reset, setHeldSlot, setOnsiteServiceMode, setPartner, setPrimaWashDay, setService, setSlot, setVehicle],
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
