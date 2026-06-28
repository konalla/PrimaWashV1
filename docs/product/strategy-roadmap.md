# Prima Wash strategic product scope and roadmap

## Product thesis

Prima Wash is a trusted vehicle care platform that coordinates premium services between vehicle owners, residential properties, partners, and technicians.

The first go-to-market wedge is Singapore condominiums, but the product is not condo-only. HDB and landed-property customers remain supported through trusted nearby care, and the platform must support different global market models without forking the core product.

## Strategic principles

- Launch locally, architect globally.
- Condo-first does not mean condo-only.
- Trust, quality, convenience, automation, data, network effects, and brand are the product moats.
- Membership and repeat usage matter more than one-off transactions.
- CLIQSA is an MVP operational shortcut, not the long-term architecture.
- Prima Wash is coordinating vehicle care operations, not merely booking wash locations.

## Market modes

The platform should support configurable market modes:

- `residence_partnership`: residence-led GTM with property-level operating rules and scheduled service days.
- `open_marketplace`: customers discover verified partners and book available services nearby.
- `mobile_dispatch`: technicians travel to a customer-selected location.
- `fleet_or_corporate`: a business account coordinates multiple vehicles and service rules.

Singapore launches with `residence_partnership` as the primary mode, condo activation as the GTM wedge, and open marketplace fallback for HDB, landed-property, and inactive-condo customers.

## Residence model

Use global residence concepts internally and local labels per market.

Singapore labels:

- Condominium
- HDB / public housing
- Landed property

Global internal concepts:

- `multi_unit_private`
- `public_housing`
- `landed`
- `commercial`
- `other`

## Core scope

### Residential onboarding

After signup, every customer selects where they usually park or receive service. Condo residents select an existing condo or add one if it is missing. HDB and landed-property customers continue into trusted nearby care.

### Condo activation engine

Inactive condos are demand-generation assets, not dead ends. The platform should track interested residents, registered vehicles, requested services, preferred service windows, referrals, property management outreach, and activation status.

### Condo operations layer

Most condos do not have permanent vehicle wash bays. The product must support temporary, management-approved operations inside existing property infrastructure.

Each condo operational profile should support:

- Approved service areas or visitor lots
- Service days and operating hours
- Simultaneous vehicle capacity
- Allowed services
- Water usage policy
- Rinseless or water-efficient service requirements
- Vehicle movement permissions
- Valet-within-property permissions
- Technician check-in/check-out requirements
- Site notes, restrictions, and safety requirements
- Building management contacts for internal use

### Prima Wash Days

A Prima Wash Day is a scheduled property operating event, not a generic partner slot. It belongs to a property, carries operating rules and capacity, and can be assigned to a partner or technician team.

### Fulfilment modes

Bookings should support multiple fulfilment modes:

- `onsite_property_service`: service happens inside a property-approved area.
- `pickup_return_service`: Prima Wash or a partner collects the car, services it off-site, and returns it.
- `customer_dropoff`: the customer brings the car to a partner location.
- `mobile_dispatch`: a technician services the car at a customer-selected location outside the managed-property model.

Pickup and return require explicit customer consent, vehicle condition capture, handover tracking, and liability policy acceptance.

### Trust and service reporting

Trust must be modeled in the product, not only described in copy. Service records should become proof of work through before/after photos, checklists, timestamps, technician notes, customer ratings, issues, and guarantee outcomes.

Certification levels:

- Certified Detailer
- Elite Detailer
- Master Detailer
- Prima Signature Detailer

### Communications

Communications are a core platform module, separate from notifications.

Supported channels:

- Prima Wash and property management
- Prima Wash and car owners
- Prima Wash and partners
- Partners and car owners

Messages, internal notes, and notifications should be separate concepts.

### Memberships

Memberships should be brought forward after the operational foundation. The platform should support one-time bookings, monthly care plans, condo-specific memberships, pause/cancel rules, favorite detailers, and retention analytics.

## Phased roadmap

### Phase 0: Align and stabilize

- Update product and architecture docs to the condo-first, not condo-only strategy.
- Finish staging deployment.
- Preserve existing marketplace booking, payment, vehicle, partner, and service-record flows.
- Document global market modes, residence abstractions, condo operations, fulfilment modes, and communications.

### Phase 1: Residential onboarding

- Add residence type selection after signup.
- Add condo select/add flow.
- Save residential profile.
- Route HDB and landed-property customers into trusted nearby care.
- Show active condo, inactive condo, and non-condo home states.

### Phase 2: Condo activation engine

- Track condo interest, vehicles, requested services, referrals, preferred windows, management contacts, and outreach.
- Add internal condo lead dashboard and activation status pipeline.

### Phase 3: Condo operations MVP

- Add condo operational profiles.
- Add Prima Wash Days.
- Add property-scoped capacity and availability.
- Add site instructions and technician check-in/check-out.
- Group partner day-board jobs by condo.

### Phase 4: Fulfilment modes

- Add onsite, pickup/return, dropoff, and mobile dispatch fulfilment modes.
- Add pickup/return consent, handover, vehicle condition, and return confirmation events.

### Phase 5: Trust and service reporting

- Expand service records.
- Add before/after photos, checklists, technician notes, ratings, issues, and guarantee workflow.
- Add partner and technician trust metrics and certification levels.

### Phase 6: Communications platform

- Add property, customer, partner, and booking conversations.
- Add internal notes, attachments, read state, and notification events.

### Phase 7: Memberships and retention

- Add monthly care plans, condo-specific plans, pause/cancel, recurring preferences, favorite detailers, and retention metrics.

### Phase 8: Condo operations playbook

- Add reusable condo setup templates, readiness scoring, management reporting, and operational templates for no-wash-bay, water-restricted, valet-allowed, luxury, and size-based property types.

### Phase 9: Partner operating system

- Add technician management, assignments, CRM, payouts, marketing, certification tracking, quality dashboards, and financial analytics.

### Phase 10: Global market modes

- Add market configuration, localized residence labels, localized service catalogs, market-specific policies, payment provider boundaries, tax boundaries, and configurable GTM modes.

## Priority rule

Build in this order:

1. Residential identity
2. Condo demand
3. Condo operations
4. Fulfilment flexibility
5. Trust proof
6. Communications
7. Memberships
8. Playbooks
9. Partner OS
10. Global modes
