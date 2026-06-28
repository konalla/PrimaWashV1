import type { Booking, CreatePaymentIntentRequest, PaymentIntent, PaymentStatus } from "@prima-wash/contracts";
import type { DatabasePool } from "../../db/pool.js";

export interface PaymentRepository {
  get(paymentIntentId: string): Promise<PaymentIntent | undefined>;
  getByBookingId(bookingId: string): Promise<PaymentIntent | undefined>;
  createForBooking(booking: Booking): Promise<PaymentIntent>;
  authorize(paymentIntentId: string): Promise<PaymentIntent>;
  captureByBookingId(bookingId: string): Promise<PaymentIntent>;
  refund(paymentIntentId: string): Promise<PaymentIntent>;
  voidByBookingId(bookingId: string): Promise<PaymentIntent | undefined>;
}

export class InMemoryPaymentRepository implements PaymentRepository {
  readonly #payments = new Map<string, PaymentIntent>();

  async get(paymentIntentId: string): Promise<PaymentIntent | undefined> {
    return this.#payments.get(paymentIntentId);
  }

  async getByBookingId(bookingId: string): Promise<PaymentIntent | undefined> {
    return Array.from(this.#payments.values()).find((payment) => payment.bookingId === bookingId);
  }

  async createForBooking(booking: Booking): Promise<PaymentIntent> {
    const existing = await this.getByBookingId(booking.id);

    if (existing) {
      return existing;
    }

    const payment = buildPaymentIntent(booking);
    this.#payments.set(payment.id, payment);
    return payment;
  }

  async authorize(paymentIntentId: string): Promise<PaymentIntent> {
    const payment = this.#payments.get(paymentIntentId);

    if (!payment) {
      throw new Error("payment_intent_not_found");
    }

    const authorized = transitionPayment(payment, "authorized");
    this.#payments.set(paymentIntentId, authorized);
    return authorized;
  }

  async captureByBookingId(bookingId: string): Promise<PaymentIntent> {
    const payment = await this.getByBookingId(bookingId);

    if (!payment) {
      throw new Error("payment_intent_not_found");
    }

    const captured = transitionPayment(payment, "captured");
    this.#payments.set(payment.id, captured);
    return captured;
  }

  async refund(paymentIntentId: string): Promise<PaymentIntent> {
    const payment = this.#payments.get(paymentIntentId);

    if (!payment) {
      throw new Error("payment_intent_not_found");
    }

    const refunded = transitionPayment(payment, "refunded");
    this.#payments.set(paymentIntentId, refunded);
    return refunded;
  }

  async voidByBookingId(bookingId: string): Promise<PaymentIntent | undefined> {
    const payment = await this.getByBookingId(bookingId);

    if (!payment || payment.status !== "authorized") {
      return undefined;
    }

    const voided = transitionPayment(payment, "voided");
    this.#payments.set(payment.id, voided);
    return voided;
  }
}

export class PostgresPaymentRepository implements PaymentRepository {
  constructor(private readonly pool: DatabasePool) {}

  async get(paymentIntentId: string): Promise<PaymentIntent | undefined> {
    const result = await this.pool.query<PaymentIntentRow>(
      `select id, booking_id, owner_id, amount_minor, currency, status,
              authorized_at, captured_at, refunded_at, voided_at, created_at
       from payment_intents
       where id = $1`,
      [paymentIntentId],
    );

    return result.rows[0] ? mapPaymentIntentRow(result.rows[0]) : undefined;
  }

  async getByBookingId(bookingId: string): Promise<PaymentIntent | undefined> {
    const result = await this.pool.query<PaymentIntentRow>(
      `select id, booking_id, owner_id, amount_minor, currency, status,
              authorized_at, captured_at, refunded_at, voided_at, created_at
       from payment_intents
       where booking_id = $1`,
      [bookingId],
    );

    return result.rows[0] ? mapPaymentIntentRow(result.rows[0]) : undefined;
  }

  async createForBooking(booking: Booking): Promise<PaymentIntent> {
    const payment = buildPaymentIntent(booking);
    const result = await this.pool.query<PaymentIntentRow>(
      `insert into payment_intents (
        id, booking_id, owner_id, amount_minor, currency, status, created_at
      )
      values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (booking_id) do update set booking_id = excluded.booking_id
      returning id, booking_id, owner_id, amount_minor, currency, status,
                authorized_at, captured_at, refunded_at, voided_at, created_at`,
      [
        payment.id,
        payment.bookingId,
        payment.ownerId,
        payment.amount.amountMinor,
        payment.amount.currency,
        payment.status,
        payment.createdAt,
      ],
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error("payment_intent_create_failed");
    }

    return mapPaymentIntentRow(row);
  }

  async authorize(paymentIntentId: string): Promise<PaymentIntent> {
    return this.transition(paymentIntentId, "authorized");
  }

  async captureByBookingId(bookingId: string): Promise<PaymentIntent> {
    const payment = await this.getByBookingId(bookingId);

    if (!payment) {
      throw new Error("payment_intent_not_found");
    }

    return this.transition(payment.id, "captured");
  }

  async refund(paymentIntentId: string): Promise<PaymentIntent> {
    return this.transition(paymentIntentId, "refunded");
  }

  async voidByBookingId(bookingId: string): Promise<PaymentIntent | undefined> {
    const payment = await this.getByBookingId(bookingId);

    if (!payment || payment.status !== "authorized") {
      return undefined;
    }

    return this.transition(payment.id, "voided");
  }

  private async transition(paymentIntentId: string, status: PaymentStatus): Promise<PaymentIntent> {
    const payment = await this.get(paymentIntentId);

    if (!payment) {
      throw new Error("payment_intent_not_found");
    }

    assertPaymentTransition(payment.status, status);

    const timestampColumnByStatus: Partial<Record<PaymentStatus, string>> = {
      authorized: "authorized_at",
      captured: "captured_at",
      refunded: "refunded_at",
      voided: "voided_at",
    };
    const timestampColumn = timestampColumnByStatus[status];

    if (!timestampColumn) {
      throw new Error("invalid_payment_status_transition");
    }

    const result = await this.pool.query<PaymentIntentRow>(
      `update payment_intents
       set status = $2, ${timestampColumn} = coalesce(${timestampColumn}, $3)
       where id = $1
       returning id, booking_id, owner_id, amount_minor, currency, status,
                 authorized_at, captured_at, refunded_at, voided_at, created_at`,
      [paymentIntentId, status, new Date().toISOString()],
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error("payment_intent_not_found");
    }

    return mapPaymentIntentRow(row);
  }
}

export function validateCreatePaymentIntent(input: Partial<CreatePaymentIntentRequest>): string[] {
  const errors: string[] = [];

  if (!input.bookingId || input.bookingId.trim().length < 3) {
    errors.push("bookingId is required");
  }

  return errors;
}

export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (from === to) {
    return;
  }

  const allowedTransitions: Record<PaymentStatus, readonly PaymentStatus[]> = {
    requires_authorization: ["authorized", "voided"],
    authorized: ["captured", "voided"],
    captured: ["refunded"],
    refunded: [],
    voided: [],
  };

  if (!allowedTransitions[from].includes(to)) {
    throw new Error("invalid_payment_status_transition");
  }
}

interface PaymentIntentRow {
  readonly id: string;
  readonly booking_id: string;
  readonly owner_id: string;
  readonly amount_minor: number;
  readonly currency: string;
  readonly status: PaymentStatus;
  readonly authorized_at: Date | string | null;
  readonly captured_at: Date | string | null;
  readonly refunded_at: Date | string | null;
  readonly voided_at: Date | string | null;
  readonly created_at: Date | string;
}

function buildPaymentIntent(booking: Booking): PaymentIntent {
  return {
    id: `pay_${crypto.randomUUID()}`,
    bookingId: booking.id,
    ownerId: booking.ownerId,
    amount: booking.acceptedPrice,
    status: "requires_authorization",
    createdAt: new Date().toISOString(),
  };
}

function transitionPayment(payment: PaymentIntent, status: PaymentStatus): PaymentIntent {
  assertPaymentTransition(payment.status, status);
  const timestamp = new Date().toISOString();

  return {
    ...payment,
    status,
    ...(status === "authorized" ? { authorizedAt: payment.authorizedAt ?? timestamp } : {}),
    ...(status === "captured" ? { capturedAt: payment.capturedAt ?? timestamp } : {}),
    ...(status === "refunded" ? { refundedAt: payment.refundedAt ?? timestamp } : {}),
    ...(status === "voided" ? { voidedAt: payment.voidedAt ?? timestamp } : {}),
  };
}

function mapPaymentIntentRow(row: PaymentIntentRow): PaymentIntent {
  return {
    id: row.id,
    bookingId: row.booking_id,
    ownerId: row.owner_id,
    amount: {
      amountMinor: row.amount_minor,
      currency: row.currency,
    },
    status: row.status,
    ...(row.authorized_at ? { authorizedAt: new Date(row.authorized_at).toISOString() } : {}),
    ...(row.captured_at ? { capturedAt: new Date(row.captured_at).toISOString() } : {}),
    ...(row.refunded_at ? { refundedAt: new Date(row.refunded_at).toISOString() } : {}),
    ...(row.voided_at ? { voidedAt: new Date(row.voided_at).toISOString() } : {}),
    createdAt: new Date(row.created_at).toISOString(),
  };
}
