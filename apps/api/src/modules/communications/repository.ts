import crypto from "node:crypto";
import type {
  Actor,
  CommunicationMessage,
  CommunicationResourceType,
  CommunicationThread,
  CommunicationThreadType,
} from "@prima-wash/contracts";
import type { DatabasePool } from "../../db/pool.js";

export interface CreateThreadInput {
  readonly type: CommunicationThreadType;
  readonly resourceType: CommunicationResourceType;
  readonly resourceId: string;
  readonly subject: string;
  readonly actor: Actor;
  readonly initialMessage?: string;
}

export interface AddMessageInput {
  readonly threadId: string;
  readonly actor: Actor;
  readonly body: string;
}

export interface CommunicationRepository {
  list(input?: { readonly resourceType?: CommunicationResourceType; readonly resourceId?: string }): Promise<readonly CommunicationThread[]>;
  get(threadId: string): Promise<CommunicationThread | undefined>;
  getMessages(threadId: string): Promise<readonly CommunicationMessage[]>;
  create(input: CreateThreadInput): Promise<CommunicationThread>;
  addMessage(input: AddMessageInput): Promise<CommunicationMessage>;
}

export class InMemoryCommunicationRepository implements CommunicationRepository {
  readonly #threads = new Map<string, CommunicationThread>();
  readonly #messages = new Map<string, CommunicationMessage[]>();

  async list(input: { readonly resourceType?: CommunicationResourceType; readonly resourceId?: string } = {}): Promise<readonly CommunicationThread[]> {
    return [...this.#threads.values()]
      .filter((thread) => !input.resourceType || thread.resourceType === input.resourceType)
      .filter((thread) => !input.resourceId || thread.resourceId === input.resourceId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(threadId: string): Promise<CommunicationThread | undefined> {
    return this.#threads.get(threadId);
  }

  async getMessages(threadId: string): Promise<readonly CommunicationMessage[]> {
    return this.#messages.get(threadId) ?? [];
  }

  async create(input: CreateThreadInput): Promise<CommunicationThread> {
    const existing = [...this.#threads.values()].find(
      (thread) => thread.type === input.type && thread.resourceType === input.resourceType && thread.resourceId === input.resourceId,
    );

    if (existing) {
      if (input.initialMessage?.trim()) {
        await this.addMessage({ threadId: existing.id, actor: input.actor, body: input.initialMessage });
      }
      return this.#threads.get(existing.id) ?? existing;
    }

    const now = new Date().toISOString();
    const thread: CommunicationThread = {
      id: `comm_${crypto.randomUUID()}`,
      type: input.type,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      subject: input.subject.trim(),
      createdByRole: input.actor.role,
      createdAt: now,
      updatedAt: now,
    };
    this.#threads.set(thread.id, thread);

    if (input.initialMessage?.trim()) {
      await this.addMessage({ threadId: thread.id, actor: input.actor, body: input.initialMessage });
    }

    return this.#threads.get(thread.id) ?? thread;
  }

  async addMessage(input: AddMessageInput): Promise<CommunicationMessage> {
    const thread = this.#threads.get(input.threadId);

    if (!thread) {
      throw new Error("communication_thread_not_found");
    }

    const now = new Date().toISOString();
    const message: CommunicationMessage = {
      id: `cmsg_${crypto.randomUUID()}`,
      threadId: input.threadId,
      senderUserId: input.actor.userId,
      senderRole: input.actor.role,
      body: input.body.trim(),
      createdAt: now,
    };
    this.#messages.set(input.threadId, [...(this.#messages.get(input.threadId) ?? []), message]);
    this.#threads.set(input.threadId, { ...thread, updatedAt: now });
    return message;
  }
}

export class PostgresCommunicationRepository implements CommunicationRepository {
  constructor(private readonly pool: DatabasePool) {}

  async list(input: { readonly resourceType?: CommunicationResourceType; readonly resourceId?: string } = {}): Promise<readonly CommunicationThread[]> {
    const params: unknown[] = [];
    const where: string[] = [];

    if (input.resourceType) {
      params.push(input.resourceType);
      where.push(`resource_type = $${params.length}`);
    }

    if (input.resourceId) {
      params.push(input.resourceId);
      where.push(`resource_id = $${params.length}`);
    }

    const result = await this.pool.query<ThreadRow>(
      `${threadSelect}
       ${where.length > 0 ? `where ${where.join(" and ")}` : ""}
       order by updated_at desc`,
      params,
    );
    return result.rows.map(mapThreadRow);
  }

  async get(threadId: string): Promise<CommunicationThread | undefined> {
    const result = await this.pool.query<ThreadRow>(`${threadSelect} where id = $1`, [threadId]);
    return result.rows[0] ? mapThreadRow(result.rows[0]) : undefined;
  }

  async getMessages(threadId: string): Promise<readonly CommunicationMessage[]> {
    const result = await this.pool.query<MessageRow>(
      `${messageSelect} where thread_id = $1 order by created_at asc`,
      [threadId],
    );
    return result.rows.map(mapMessageRow);
  }

  async create(input: CreateThreadInput): Promise<CommunicationThread> {
    const now = new Date().toISOString();
    const threadId = `comm_${crypto.randomUUID()}`;
    const result = await this.pool.query<ThreadRow>(
      `insert into communication_threads (
         id, thread_type, resource_type, resource_id, subject, created_by_role, created_at, updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $7)
       on conflict (thread_type, resource_type, resource_id) do update set
         subject = excluded.subject,
         updated_at = communication_threads.updated_at
       returning id, thread_type, resource_type, resource_id, subject, created_by_role, created_at, updated_at`,
      [threadId, input.type, input.resourceType, input.resourceId, input.subject.trim(), input.actor.role, now],
    );
    const thread = mapRequiredThreadRow(result.rows[0]);

    if (input.initialMessage?.trim()) {
      await this.addMessage({ threadId: thread.id, actor: input.actor, body: input.initialMessage });
      return (await this.get(thread.id)) ?? thread;
    }

    return thread;
  }

  async addMessage(input: AddMessageInput): Promise<CommunicationMessage> {
    const thread = await this.get(input.threadId);

    if (!thread) {
      throw new Error("communication_thread_not_found");
    }

    const now = new Date().toISOString();
    const result = await this.pool.query<MessageRow>(
      `insert into communication_messages (id, thread_id, sender_user_id, sender_role, body, created_at)
       values ($1, $2, $3, $4, $5, $6)
       returning id, thread_id, sender_user_id, sender_role, body, created_at`,
      [`cmsg_${crypto.randomUUID()}`, input.threadId, input.actor.userId, input.actor.role, input.body.trim(), now],
    );
    await this.pool.query(`update communication_threads set updated_at = $2 where id = $1`, [input.threadId, now]);
    return mapRequiredMessageRow(result.rows[0]);
  }
}

export function validateCreateCommunicationThread(input: Partial<CreateThreadInput>): string[] {
  const errors: string[] = [];

  if (!input.type || !["prima_to_property", "prima_to_owner", "prima_to_partner", "partner_to_owner"].includes(input.type)) {
    errors.push("type is required");
  }

  if (!input.resourceType || !["property", "booking", "partner_location", "owner"].includes(input.resourceType)) {
    errors.push("resourceType is required");
  }

  if (!input.resourceId || input.resourceId.trim().length < 3) {
    errors.push("resourceId is required");
  }

  if (!input.subject || input.subject.trim().length < 2) {
    errors.push("subject is required");
  }

  if (input.initialMessage !== undefined && input.initialMessage.trim().length === 0) {
    errors.push("initialMessage cannot be blank");
  }

  return errors;
}

export function validateCreateCommunicationMessage(input: { readonly body?: string }): string[] {
  return !input.body || input.body.trim().length === 0 ? ["body is required"] : [];
}

interface ThreadRow {
  readonly id: string;
  readonly thread_type: CommunicationThreadType;
  readonly resource_type: CommunicationResourceType;
  readonly resource_id: string;
  readonly subject: string;
  readonly created_by_role: CommunicationThread["createdByRole"];
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

interface MessageRow {
  readonly id: string;
  readonly thread_id: string;
  readonly sender_user_id: string;
  readonly sender_role: CommunicationMessage["senderRole"];
  readonly body: string;
  readonly created_at: Date | string;
}

const threadSelect = `
  select id, thread_type, resource_type, resource_id, subject, created_by_role, created_at, updated_at
  from communication_threads`;

const messageSelect = `
  select id, thread_id, sender_user_id, sender_role, body, created_at
  from communication_messages`;

function mapThreadRow(row: ThreadRow): CommunicationThread {
  return {
    id: row.id,
    type: row.thread_type,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    subject: row.subject,
    createdByRole: row.created_by_role,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapRequiredThreadRow(row: ThreadRow | undefined): CommunicationThread {
  if (!row) {
    throw new Error("communication_thread_not_found");
  }

  return mapThreadRow(row);
}

function mapMessageRow(row: MessageRow): CommunicationMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    senderUserId: row.sender_user_id,
    senderRole: row.sender_role,
    body: row.body,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function mapRequiredMessageRow(row: MessageRow | undefined): CommunicationMessage {
  if (!row) {
    throw new Error("communication_message_create_failed");
  }

  return mapMessageRow(row);
}
