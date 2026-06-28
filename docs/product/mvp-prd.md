# MVP product requirements

## Objective

Allow a vehicle owner to establish a residential service context, book and pay for trusted vehicle care, receive the service through the correct fulfilment model, and retain a trustworthy service record. Allow partners and Prima Wash operators to configure supply, fulfil bookings, and coordinate property-specific operations without relying on ad hoc manual tracking.

## Primary journeys

Customers register, select where they usually park or receive service, add a vehicle, choose an eligible service path, review the final price and policy, pay, receive status updates, then retain a receipt and service record.

Condo residents select an existing condo or add one if it is missing. If the condo is active, they can book a Prima Wash Day or another approved fulfilment mode. If the condo is inactive, they can register interest, invite neighbours, and still use trusted nearby care where available.

HDB and landed-property customers continue into the current trusted nearby care flow: find verified partners, choose service and time, pay, track status, and retain service history.

Partners onboard locations and staff, configure services/prices/hours/capacity, fulfil bookings through explicit states, handle permitted exceptions, and reconcile settlements. For condo operations, partners and technicians also need property-specific instructions, capacity rules, approved service areas, and check-in/check-out workflows.

Current preview behavior: customers can create a vehicle and booking, view booking status progression in the customer preview, cancel before service starts, and see service records after completion. Partners can advance or cancel active bookings through the business dashboard.

## MVP capabilities

- Identity and role-based access
- Market and residence-aware customer profile foundation
- Condo select/add and inactive-condo interest capture
- Partner, location, service, price, and capacity configuration
- Vehicle profiles
- Availability search
- Booking, rescheduling, cancellation, and status history
- Fulfilment mode foundation for onsite property service, pickup/return, customer dropoff, and mobile dispatch
- Payment authorization, capture, refund, and reconciliation
- Email, SMS, and push notification orchestration
- Conversation and internal-note foundation for customer, property, partner, and booking communication
- Operations support and immutable audit events
- Event-based product analytics

## Explicitly deferred

- Open multi-category marketplace
- Fleet management
- AI execution of financial or destructive actions
- Multi-country taxation and localization
- Dynamic pricing and loyalty gamification
- Full global market rollout
- Fully automated dispatch optimization
- Advanced condo operations playbook templates

## North-star metric

Monthly Active Vehicle Owners: unique owners who complete a qualifying ownership action during a calendar month. App opens do not qualify.

Current qualifying ownership actions: vehicle creation, booking creation, and completed service record creation.

Launch-specific supporting metrics:

- Condo interest registrations
- Vehicles registered per condo
- Prima Wash Day booking utilization
- Repeat booking rate
- Membership attach rate
- On-time arrival rate
- Service record completion rate
- Complaint and dispute rate
- HDB/landed search-to-book conversion

## Release gates

- End-to-end booking and refund paths reconcile financially.
- Tenant-isolation and authorization tests pass.
- No unresolved critical security or accessibility defects.
- Backup restoration has been exercised.
- Support, incident, cancellation, and dispute runbooks are approved.
- Condo operational rules are explicit for any active condo booking flow.
- Pickup/return bookings require explicit consent, handover tracking, and captured policy versions before production launch.
