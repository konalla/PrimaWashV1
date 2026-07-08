# Prima Wash Brand Kit

Last updated: 2026-07-08

This is the launch brand direction for Prima Wash across the customer mobile app, internal admin, partner workspace, and management workspace.

## Brand Position

Prima Wash is a premium vehicle-care coordination platform. The product should feel trusted, operationally sharp, and easy for a broad audience to use. It is not positioned as a garage, repair shop, or generic car-wash booking page.

The product promise is:

- Quality-checked vehicle care.
- Clear pricing before booking.
- Verified partners and property-approved operations.
- Prima Wash support around every booking.
- A polished, reliable experience for customers, partners, condo offices, and internal operators.

## Logo Direction

The explored orange wordmark has usable energy, but the gear/wrench/car symbols lean too heavily toward repair-shop mechanics. That is not the strongest signal for a premium car-care concierge.

For launch, do not place the experimental gear/wrench logo into production UI yet. Use the simple Prima Wash wordmark treatment and the `P` monogram mark until the final identity is refined.

Recommended future logo direction:

- Wordmark first, icon second.
- Near-black primary wordmark.
- Optional copper-orange accent on "Wash" or a small service cue.
- Avoid dominant gear, wrench, hard-mechanic, or workshop symbols.
- If using a mark, make it abstract and premium: shine, shield, waterline, route/check, or concierge signal.

## Palette

Prima Wash is light-first. Text should be black or near-black on warm white. Dark green is no longer the dominant background.

Core colors:

- Ink: `#111315`
- Canvas: `#F6F3EC`
- Raised canvas: `#FFFCF7`
- Surface: `#FFFFFF`
- Mist surface: `#EAF2F0`
- Border: `#DDD5C9`
- Muted text: `#5D6463`
- Subtle text: `#7F8784`

Brand and action colors:

- Petrol teal: `#0E4A55`
- Deep petrol: `#07363F`
- Copper action: `#D7652A`
- Deep copper: `#B84E1F`
- Warning ochre: `#B7772B`
- Danger red: `#B54843`

Usage rules:

- Use petrol teal for brand marks, active navigation, verified states, links, operational trust, and selected state backgrounds.
- Use copper for primary calls to action, referral/reward moments, and marketing energy.
- Use copper sparingly. It should guide action, not dominate the interface.
- Use black/near-black for primary text.
- Use white text on petrol backgrounds.
- Use black/near-black text on copper action buttons.
- Keep panels white or warm off-white. Avoid returning to dark green full-page UI.

## Typography

Primary typeface: Manrope.

Manrope remains the launch font because it is legible, modern, friendly, and production-safe across web and mobile. It supports both a premium consumer app and a serious operations dashboard without looking too corporate or too decorative.

Usage rules:

- Headings: 800-900 weight.
- Body: 400-600 weight.
- Buttons and labels: 800-900 weight.
- Eyebrows: uppercase, 0.12em to 0.16em letter spacing.
- Do not use negative letter spacing.
- Do not scale font size with viewport width in application surfaces.

## Interface Principles

- Light, clean, operationally calm.
- Mobile app should feel like a real app with clear sections, not one long anchor page.
- Admin and partner tools should feel dense but readable, with clear queue state and safe actions.
- Cards are for concrete objects: bookings, vehicles, finance cases, evidence packs, messages, and property records.
- Do not nest decorative cards inside cards.
- Use restrained shadows and thin borders; avoid glowing or dramatic effects.
- Use icons only where they clarify repeated controls.
- Keep all critical flows readable on mobile width.

## Current Implementation

The current production tokens live in:

- `apps/web/public/index.html`
- `apps/mobile/src/constants/design.ts`

The web and mobile surfaces now share the same brand direction:

- Petrol teal for trust and active state.
- Copper for primary action.
- Warm canvas and white surfaces.
- Black text.
- Manrope typography.

