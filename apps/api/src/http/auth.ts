import type { IncomingMessage } from "node:http";
import type { Actor, ActorRole, InternalPermission } from "@prima-wash/contracts";
import { actorFromAccessToken } from "../modules/auth/service.js";

export function getActor(request: IncomingMessage): Actor | undefined {
  const authorization = getHeaderValue(request, "authorization");

  if (authorization?.startsWith("Bearer ")) {
    return actorFromAccessToken(authorization.slice("Bearer ".length), getAuthSecret());
  }

  if (!isDevelopmentHeaderAuthAllowed()) {
    return undefined;
  }

  const userId = getHeaderValue(request, "x-prima-user-id");

  if (!userId) {
    return undefined;
  }

  const roleHeader = getHeaderValue(request, "x-prima-role");
  const role = isActorRole(roleHeader) ? roleHeader : "customer";
  const organizationId = getHeaderValue(request, "x-prima-organization-id");
  const propertyId = getHeaderValue(request, "x-prima-property-id");
  const permissions = role === "internal" ? parseInternalPermissions(getHeaderValue(request, "x-prima-permissions")) : [];

  return {
    userId,
    role,
    ...(organizationId ? { organizationId } : {}),
    ...(propertyId ? { propertyId } : {}),
    ...(permissions.length > 0 ? { permissions } : {}),
  };
}

function getAuthSecret(): string {
  return process.env.AUTH_SESSION_SECRET ?? "prima-wash-development-secret-change-before-production";
}

function isDevelopmentHeaderAuthAllowed(): boolean {
  if (process.env.ALLOW_DEV_HEADER_AUTH === "true") {
    return true;
  }

  return process.env.NODE_ENV !== "production";
}

export function requireActor(request: IncomingMessage): Actor {
  const actor = getActor(request);

  if (!actor) {
    throw new Error("authentication_required");
  }

  return actor;
}

export function assertOwnerAccess(actor: Actor, ownerId: string): void {
  if (actor.role === "internal") {
    return;
  }

  if (actor.userId !== ownerId) {
    throw new Error("forbidden_owner_scope");
  }
}

export function assertInternal(actor: Actor): void {
  if (actor.role !== "internal") {
    throw new Error("internal_role_required");
  }
}

export function assertInternalPermission(actor: Actor, permission: InternalPermission): void {
  assertInternal(actor);

  if (!hasInternalPermission(actor, permission)) {
    throw new Error("internal_permission_required");
  }
}

export function hasInternalPermission(actor: Actor, permission: InternalPermission): boolean {
  if (actor.role !== "internal") {
    return false;
  }

  const permissions = actor.permissions ?? [];
  return permissions.includes("super_admin") || permissions.includes(permission);
}

export function assertPartnerOrInternal(actor: Actor): void {
  if (actor.role !== "partner" && actor.role !== "internal") {
    throw new Error("partner_role_required");
  }
}

export function assertPropertyManagerAccess(actor: Actor, propertyId: string): void {
  if (actor.role === "internal") {
    return;
  }

  if (actor.role !== "property_manager") {
    throw new Error("property_manager_role_required");
  }

  if (actor.propertyId !== propertyId) {
    throw new Error("forbidden_property_scope");
  }
}

function getHeaderValue(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function isActorRole(value: string | undefined): value is ActorRole {
  return value === "customer" || value === "partner" || value === "fleet" || value === "internal" || value === "property_manager";
}

function parseInternalPermissions(value: string | undefined): readonly InternalPermission[] {
  if (!value) {
    return ["super_admin"];
  }

  const permissions = value
    .split(",")
    .map((permission) => permission.trim())
    .filter(isInternalPermission);

  return permissions.length > 0 ? permissions : ["super_admin"];
}

function isInternalPermission(value: string): value is InternalPermission {
  return (
    value === "operations_read" ||
    value === "operations_write" ||
    value === "finance_read" ||
    value === "finance_write" ||
    value === "partner_manage" ||
    value === "property_manage" ||
    value === "super_admin"
  );
}
