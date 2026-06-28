import type { PartnerLocation, ServiceCode } from "@prima-wash/contracts";
import type { DatabasePool } from "../../db/pool.js";

const demoPartners: readonly PartnerLocation[] = [
  {
    id: "loc_demo_001",
    organizationId: "org_partner_001",
    name: "Prima Wash Central",
    shortDescription: "Premium hand wash and detailing in the heart of the city",
    timezone: "Asia/Singapore",
    addressLine1: "100 Central Street",
    city: "Singapore",
    region: "Central Region",
    countryCode: "SG",
    latitude: 1.29027,
    longitude: 103.851959,
    rating: 4.9,
    reviewCount: 428,
    distanceKm: 2.4,
    openingHours: "08:00-19:00",
    serviceCodes: ["wash_basic", "wash_premium", "detail_interior"],
    verified: true,
  },
  {
    id: "loc_harbour_001",
    organizationId: "org_partner_002",
    name: "Harbour Auto Spa",
    shortDescription: "Fast, careful exterior and interior care near the waterfront",
    timezone: "Asia/Singapore",
    addressLine1: "12 Harbour Drive",
    city: "Singapore",
    region: "Central Region",
    countryCode: "SG",
    latitude: 1.2655,
    longitude: 103.8201,
    rating: 4.8,
    reviewCount: 316,
    distanceKm: 4.1,
    openingHours: "07:30-20:00",
    serviceCodes: ["wash_basic", "wash_premium", "detail_interior"],
    verified: true,
  },
  {
    id: "loc_orchard_001",
    organizationId: "org_partner_003",
    name: "Orchard Detail Lab",
    shortDescription: "Specialist detailing and finish protection for premium vehicles",
    timezone: "Asia/Singapore",
    addressLine1: "88 Orchard Road",
    city: "Singapore",
    region: "Central Region",
    countryCode: "SG",
    latitude: 1.3048,
    longitude: 103.8318,
    rating: 4.9,
    reviewCount: 207,
    distanceKm: 5.7,
    openingHours: "09:00-18:30",
    serviceCodes: ["wash_premium", "detail_interior"],
    verified: true,
  },
];

export interface PartnerRepository {
  list(serviceCode?: ServiceCode): Promise<readonly PartnerLocation[]>;
  get(locationId: string): Promise<PartnerLocation | undefined>;
}

export class InMemoryPartnerRepository implements PartnerRepository {
  async list(serviceCode?: ServiceCode): Promise<readonly PartnerLocation[]> {
    return demoPartners
      .filter((partner) => !serviceCode || partner.serviceCodes.includes(serviceCode))
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }

  async get(locationId: string): Promise<PartnerLocation | undefined> {
    return demoPartners.find((partner) => partner.id === locationId);
  }
}

export class PostgresPartnerRepository implements PartnerRepository {
  constructor(private readonly pool: DatabasePool) {}

  async list(serviceCode?: ServiceCode): Promise<readonly PartnerLocation[]> {
    const result = await this.pool.query<PartnerRow>(
      `${partnerSelect}
       ${serviceCode ? "where exists (select 1 from availability_slots s join availability_slot_services ass on ass.availability_slot_id = s.id where s.partner_location_id = p.id and ass.service_code = $1)" : ""}
       order by p.rating desc, p.name asc`,
      serviceCode ? [serviceCode] : [],
    );
    return result.rows.map(mapPartnerRow);
  }

  async get(locationId: string): Promise<PartnerLocation | undefined> {
    const result = await this.pool.query<PartnerRow>(`${partnerSelect} where p.id = $1`, [locationId]);
    return result.rows[0] ? mapPartnerRow(result.rows[0]) : undefined;
  }
}

const partnerSelect = `
  select p.id, p.organization_id, p.name, p.short_description, p.timezone, p.address_line_1,
         p.city, p.region, p.country_code, p.latitude, p.longitude, p.rating, p.review_count,
         p.opening_hours, p.verified,
         coalesce(array(
           select distinct ass.service_code
           from availability_slots s
           join availability_slot_services ass on ass.availability_slot_id = s.id
           where s.partner_location_id = p.id
           order by ass.service_code
         ), '{}') as service_codes
  from partner_locations p`;

interface PartnerRow {
  readonly id: string;
  readonly organization_id: string;
  readonly name: string;
  readonly short_description: string;
  readonly timezone: string;
  readonly address_line_1: string;
  readonly city: string;
  readonly region: string;
  readonly country_code: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly rating: string | number;
  readonly review_count: number;
  readonly opening_hours: string;
  readonly verified: boolean;
  readonly service_codes: ServiceCode[];
}

function mapPartnerRow(row: PartnerRow): PartnerLocation {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    shortDescription: row.short_description,
    timezone: row.timezone,
    addressLine1: row.address_line_1,
    city: row.city,
    region: row.region,
    countryCode: row.country_code,
    latitude: row.latitude,
    longitude: row.longitude,
    rating: Number(row.rating),
    reviewCount: row.review_count,
    distanceKm: 0,
    openingHours: row.opening_hours,
    serviceCodes: row.service_codes,
    verified: row.verified,
  };
}
