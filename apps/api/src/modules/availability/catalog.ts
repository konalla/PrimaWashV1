import type { AvailabilitySlot, ServiceOffering } from "@prima-wash/contracts";

export const serviceCatalog: readonly ServiceOffering[] = [
  {
    code: "wash_basic",
    name: "Basic Wash",
    durationMinutes: 30,
    price: { amountMinor: 2500, currency: "USD" },
  },
  {
    code: "wash_premium",
    name: "Premium Wash",
    durationMinutes: 45,
    price: { amountMinor: 4500, currency: "USD" },
  },
  {
    code: "detail_interior",
    name: "Interior Detail",
    durationMinutes: 90,
    price: { amountMinor: 9500, currency: "USD" },
  },
];

export const availabilitySlots: readonly AvailabilitySlot[] = [
  {
    id: "slot_demo_0900",
    partnerLocationId: "loc_demo_001",
    startsAt: "2026-07-01T09:00:00.000Z",
    endsAt: "2026-07-01T10:30:00.000Z",
    capacity: 50,
    serviceCodes: ["wash_basic", "wash_premium"],
  },
  {
    id: "slot_demo_1100",
    partnerLocationId: "loc_demo_001",
    startsAt: "2026-07-01T11:00:00.000Z",
    endsAt: "2026-07-01T12:30:00.000Z",
    capacity: 50,
    serviceCodes: ["wash_basic", "wash_premium", "detail_interior"],
  },
  {
    id: "slot_harbour_0900",
    partnerLocationId: "loc_harbour_001",
    startsAt: "2026-07-02T09:00:00.000Z",
    endsAt: "2026-07-02T10:30:00.000Z",
    capacity: 8,
    serviceCodes: ["wash_basic", "detail_interior"],
  },
  {
    id: "slot_harbour_1300",
    partnerLocationId: "loc_harbour_001",
    startsAt: "2026-07-02T13:00:00.000Z",
    endsAt: "2026-07-02T14:30:00.000Z",
    capacity: 8,
    serviceCodes: ["wash_basic", "wash_premium"],
  },
  {
    id: "slot_orchard_1000",
    partnerLocationId: "loc_orchard_001",
    startsAt: "2026-07-03T10:00:00.000Z",
    endsAt: "2026-07-03T11:30:00.000Z",
    capacity: 5,
    serviceCodes: ["wash_premium", "detail_interior"],
  },
  {
    id: "slot_orchard_1500",
    partnerLocationId: "loc_orchard_001",
    startsAt: "2026-07-03T15:00:00.000Z",
    endsAt: "2026-07-03T16:30:00.000Z",
    capacity: 5,
    serviceCodes: ["wash_premium", "detail_interior"],
  },
];

export function findServiceOffering(code: string): ServiceOffering | undefined {
  return serviceCatalog.find((service) => service.code === code);
}

export function findAvailabilitySlot(slotId: string): AvailabilitySlot | undefined {
  return availabilitySlots.find((slot) => slot.id === slotId);
}
