import { createServer, type IncomingMessage, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { createHmac, timingSafeEqual } from "node:crypto";
import path from "node:path";
import type {
  AvailabilitySearchResponse,
  AvailabilitySearchSlot,
  Actor,
  AccessInvitation,
  AccessMembership,
  AcceptAccessInvitationRequest,
  AcceptAccessInvitationResponse,
  BillingSession,
  Booking,
  BookingHold,
  RequestAuthCodeRequest,
  RefreshAuthSessionRequest,
  VerifyAuthCodeRequest,
  CancelBookingRequest,
  CapacityTemplate,
  CreateBookingConsentRequest,
  CreateBookingEvidenceRequest,
  CreateBookingHandoverRequest,
  CreateAvailabilitySlotRequest,
  CreateAccessInvitationRequest,
  CreateBookingHoldRequest,
  CreateCapacityTemplateRequest,
  CreateCommunicationMessageRequest,
  CreateCommunicationThreadRequest,
  CommunicationResourceType,
  CommunicationThread,
  CommunicationThreadType,
  CustomerProfile,
  CreateBookingRequest,
  ListAccessInvitationsResponse,
  ListAccessMembershipsResponse,
  PartnerBookingDecisionRequest,
  CreatePaymentIntentRequest,
  CreatePaymentReconciliationCaseRequest,
  CreatePropertyInterestRequest,
  CreatePrimaWashDayRequest,
  CreateVehicleRequest,
  GenerateCapacityTemplateSlotsRequest,
  UpdateVehicleRequest,
  UpdateCustomerProfileRequest,
  HealthResponse,
  InternalPermission,
  ProductEventName,
  PartnerDashboardResponse,
  BookingEvidenceSummary,
  BookingHandoverSummary,
  PartnerAvailabilitySlot,
  PaymentHistoryItem,
  PaymentIntent,
  PaymentMethodSummary,
  PaymentOperationName,
  PaymentOperationStatus,
  PaymentOperation,
  PaymentStatus,
  PaymentReconciliationCaseType,
  PaymentReconciliationCaseStatus,
  PartnerLocation,
  PrimaWashDayBookingItem,
  PropertyManagementDashboardResponse,
  ResendAccessInvitationResponse,
  ResidenceType,
  SchedulingConfig,
  ServiceRecord,
  ServiceCapacityRule,
  UpdatePropertyActivationRequest,
  UpdateBookingExecutionRequest,
  UpdateBookingOperationalExceptionRequest,
  UpdateBookingStatusRequest,
  UpdateCondoOperationalProfileRequest,
  UpdatePrimaWashDayRequest,
  UpdatePaymentReconciliationCaseRequest,
  UpdateAvailabilitySlotRequest,
  UpdateAccessMembershipRequest,
  UpdateCapacityTemplateRequest,
  UpdateSchedulingConfigRequest,
  Vehicle,
} from "@prima-wash/contracts";
import {
  assertInternal,
  assertInternalPermission,
  assertOwnerAccess,
  assertPartnerOrInternal,
  assertPropertyManagerAccess,
  hasInternalPermission,
  requireActor,
} from "./http/auth.js";
import { readJsonBody, readRawBody } from "./http/body.js";
import { attachRequestLogging, type RequestContext } from "./http/request-log.js";
import { applyCorsHeaders, defaultLocalCorsAllowedOrigins, sendCorsPreflight, sendError, sendJson } from "./http/respond.js";
import { findServiceOffering, serviceCatalog } from "./modules/availability/catalog.js";
import { AuthService } from "./modules/auth/service.js";
import {
  createAuthCodeDeliveryProvider,
  type AuthCodeDeliveryProvider,
} from "./modules/auth/delivery.js";
import {
  validateCreateAvailabilitySlot,
  validateUpdateAvailabilitySlot,
  type CreateAvailabilitySlotInput,
} from "./modules/availability/repository.js";
import {
  validateCreateCapacityTemplate,
  validateGenerateCapacitySlots,
  validateUpdateCapacityTemplate,
} from "./modules/capacity-templates/repository.js";
import { validateCreateBookingHold } from "./modules/booking-holds/repository.js";
import { validateCreateBookingConsent } from "./modules/booking-consents/repository.js";
import { emptyHandoverSummary, validateCreateBookingHandover } from "./modules/booking-handovers/repository.js";
import { emptyEvidenceSummary, validateCreateBookingEvidence } from "./modules/booking-evidence/repository.js";
import {
  InMemoryEvidenceStorageProvider,
  maxEvidenceUploadBytes,
  validateEvidenceUploadInput,
  type EvidenceStorageProvider,
} from "./modules/booking-evidence/storage.js";
import { validateSchedulingConfig } from "./modules/scheduling/repository.js";
import {
  canTransitionBookingStatus,
  validateCreateBooking,
  validatePartnerBookingDecision,
  validateUpdateBookingExecution,
  validateUpdateBookingOperationalException,
  validateUpdateBookingStatus,
} from "./modules/bookings/repository.js";
import type { Repositories } from "./modules/repositories.js";
import { assertPaymentTransition, validateCreatePaymentIntent } from "./modules/payments/repository.js";
import {
  validateCreatePaymentReconciliationCase,
  validateUpdatePaymentReconciliationCase,
} from "./modules/payment-reconciliation-cases/repository.js";
import {
  createPaymentProvider,
  type PaymentCustomer,
  type PaymentProvider,
  type PaymentProviderResult,
} from "./modules/payments/provider.js";
import { runPaymentProviderReconciliation } from "./modules/payment-reconciliation-runs/service.js";
import { validateCreateVehicle } from "./modules/vehicles/repository.js";
import { validateUpdateVehicle } from "./modules/vehicles/repository.js";
import { validateProfileUpdate } from "./modules/profiles/repository.js";
import { validateCreatePropertyInterest, validateUpdatePropertyActivation } from "./modules/properties/repository.js";
import {
  validateCreatePrimaWashDay,
  validateOperationalProfile,
  validateUpdatePrimaWashDay,
} from "./modules/condo-operations/repository.js";
import {
  validateCreateCommunicationMessage,
  validateCreateCommunicationThread,
} from "./modules/communications/repository.js";
import { publicAccessInvitation } from "./modules/invitations/repository.js";

export interface CreateApiServerOptions {
  readonly repositories: Repositories;
  readonly paymentProvider?: PaymentProvider;
  readonly publicDirectory?: string;
  readonly enableRequestLogging?: boolean;
  readonly authSessionSecret?: string;
  readonly authCodeDeliveryProvider?: AuthCodeDeliveryProvider;
  readonly stripeWebhookSecret?: string;
  readonly evidenceStorageProvider?: EvidenceStorageProvider;
  readonly corsAllowedOrigins?: readonly string[];
}

export function createApiServer(options: CreateApiServerOptions): Server {
  const publicDirectory = options.publicDirectory ?? path.resolve("apps/api/public");
  const enableRequestLogging = options.enableRequestLogging ?? true;
  const paymentProvider = options.paymentProvider ?? createPaymentProvider();
  const authCodeDeliveryProvider =
    options.authCodeDeliveryProvider ??
    createAuthCodeDeliveryProvider("local", { exposeDevelopmentCode: process.env.SHOW_DEV_AUTH_CODE === "true" });
  const authSessionSecret =
    options.authSessionSecret ?? process.env.AUTH_SESSION_SECRET ?? "prima-wash-development-secret-change-before-production";
  const evidenceStorageProvider = options.evidenceStorageProvider ?? new InMemoryEvidenceStorageProvider();
  const corsAllowedOrigins = options.corsAllowedOrigins ?? defaultLocalCorsAllowedOrigins;
  const authService = new AuthService(
    authSessionSecret,
    authCodeDeliveryProvider,
    options.repositories.auth,
  );

  return createServer(async (request, response) => {
    applyCorsHeaders(request, response, corsAllowedOrigins);

    if (request.method === "OPTIONS") {
      sendCorsPreflight(request, response, corsAllowedOrigins);
      return;
    }

    const requestContext = enableRequestLogging
      ? attachRequestLogging(request, response)
      : createSilentRequestContext(request, response);
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (request.method === "GET" && requestUrl.pathname === "/") {
      const html = await readFile(path.join(publicDirectory, "index.html"), "utf8");
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(html);
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/health") {
      const payload: HealthResponse = {
        service: "prima-wash-api",
        status: "ok",
        httpStatus: 200,
        timestamp: new Date().toISOString(),
      };
      sendJson(response, 200, payload);
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/v1/webhooks/stripe") {
      try {
        if (!options.stripeWebhookSecret) {
          sendError(response, 503, "stripe_webhook_not_configured", "Stripe webhook secret is not configured");
          return;
        }

        const rawBody = await readRawBody(request);
        const event = verifyStripeWebhookEvent(
          rawBody,
          getHeaderValue(request.headers["stripe-signature"]),
          options.stripeWebhookSecret,
        );
        const result = await reconcileStripeWebhookEvent(options.repositories, event, requestContext.requestId);
        sendJson(response, 200, { data: result });
      } catch (error) {
        const message = error instanceof Error ? error.message : "stripe_webhook_failed";

        if (message === "stripe_signature_missing" || message === "stripe_signature_invalid") {
          sendError(response, 400, message, "Stripe webhook signature is invalid");
          return;
        }

        sendError(response, 400, "stripe_webhook_failed", "Stripe webhook could not be processed", message);
      }

      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/v1/auth/code/request") {
      try {
        const input = await readJsonBody<RequestAuthCodeRequest>(request);
        sendJson(response, 201, { data: await authService.requestCode(input.identifier, requestSource(request)) });
      } catch (error) {
        const message = error instanceof Error ? error.message : "invalid_request";

        if (message === "invalid_auth_identifier") {
          sendError(response, 400, message, "Enter a valid email address or international phone number");
          return;
        }

        if (message === "auth_rate_limited") {
          sendError(response, 429, message, "Too many verification code requests. Please wait and try again");
          return;
        }

        if (message === "auth_code_delivery_failed") {
          sendError(response, 503, message, "Verification code delivery is temporarily unavailable");
          return;
        }

        sendError(response, 400, "invalid_request", "Verification code could not be requested");
      }

      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/v1/auth/code/verify") {
      try {
        const input = await readJsonBody<VerifyAuthCodeRequest>(request);
        const session = await authService.verifyCode(input.challengeId, input.code, async (identifier) => {
          const loginIdentity = await options.repositories.accessControl.resolveLogin(identifier);
          return loginIdentity?.user;
        });

        if (session.user.role === "customer") {
          await options.repositories.profiles.upsertIdentity(
            session.user.id,
            session.user.identifier,
            session.user.displayName ?? "Vehicle owner",
          );
        }
        sendJson(response, 200, { data: session });
      } catch (error) {
        sendAuthVerificationError(response, error);
      }

      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/internal/access-invitations") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertAccessInvitationListPermission(actor);
        const limit = Number.parseInt(requestUrl.searchParams.get("limit") ?? "50", 10);
        const invitations = await options.repositories.invitations.list({
          limit: Math.min(Math.max(Number.isFinite(limit) ? limit : 50, 1), 100),
        });
        const payload: ListAccessInvitationsResponse = {
          invitations: invitations
            .filter((invitation) => canManageAccessInvitationRecord(actor, invitation))
            .map(publicAccessInvitation),
        };

        sendJson(response, 200, { data: payload });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          sendError(response, 400, "access_invitation_list_failed", "Access invitations could not be loaded", String(error));
        }
      }

      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/internal/access-memberships") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertAccessInvitationListPermission(actor);
        const limit = Number.parseInt(requestUrl.searchParams.get("limit") ?? "100", 10);
        const memberships = await options.repositories.accessControl.listMemberships({
          limit: Math.min(Math.max(Number.isFinite(limit) ? limit : 100, 1), 200),
        });
        const payload: ListAccessMembershipsResponse = {
          memberships: memberships.filter((membership) => canManageAccessMembershipRecord(actor, membership)),
        };

        sendJson(response, 200, { data: payload });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          sendError(response, 400, "access_membership_list_failed", "Access memberships could not be loaded", String(error));
        }
      }

      return;
    }

    const membershipUpdateMatch = requestUrl.pathname.match(/^\/v1\/internal\/access-memberships\/([^/]+)$/);
    if (request.method === "PATCH" && membershipUpdateMatch?.[1]) {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        const membership = await options.repositories.accessControl.getMembership(decodeURIComponent(membershipUpdateMatch[1]));

        if (!membership) {
          sendError(response, 404, "access_membership_not_found", "Access membership does not exist");
          return;
        }

        assertAccessMembershipRecordPermission(actor, membership);

        const input = await readJsonBody<UpdateAccessMembershipRequest>(request);
        const errors = validateUpdateAccessMembership(input, membership);

        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Access membership payload is invalid", errors);
          return;
        }

        if (membership.userId === actor.userId && input.active === false) {
          sendError(response, 409, "access_membership_self_deactivation_blocked", "You cannot deactivate your own active access");
          return;
        }

        if (
          membership.userId === actor.userId &&
          input.permissions !== undefined &&
          membership.permissions.includes("super_admin") &&
          !input.permissions.includes("super_admin")
        ) {
          sendError(
            response,
            409,
            "access_membership_self_super_admin_removal_blocked",
            "You cannot remove your own super admin permission",
          );
          return;
        }

        const update = {
          ...(membership.role === "internal" && input.permissions ? { permissions: filterInternalPermissions(input.permissions) } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        };
        const updated = await options.repositories.accessControl.updateMembership(membership.id, update);
        const now = new Date().toISOString();

        if (input.active === false && membership.active) {
          await options.repositories.auth.revokeSessionsForUser(membership.userId, now);
          await options.repositories.auth.revokeRefreshTokensForUser(membership.userId, now);
        }

        await options.repositories.audit.record({
          actor,
          action:
            input.active === false
              ? "access_membership.deactivated"
              : input.active === true && !membership.active
                ? "access_membership.reactivated"
                : "access_membership.updated",
          resourceType: "access_membership",
          resourceId: membership.id,
          requestId: requestContext.requestId,
          metadata: {
            userId: membership.userId,
            identifier: membership.identifier,
            role: membership.role,
            active: updated?.active ?? membership.active,
            permissions: updated?.permissions ?? membership.permissions,
          },
        });

        sendJson(response, 200, { data: updated ?? membership });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          sendError(response, 400, "access_membership_update_failed", "Access membership could not be updated", String(error));
        }
      }

      return;
    }

    const invitationRevokeMatch = requestUrl.pathname.match(/^\/v1\/internal\/access-invitations\/([^/]+)\/revoke$/);
    if (request.method === "POST" && invitationRevokeMatch?.[1]) {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        const invitation = await options.repositories.invitations.get(decodeURIComponent(invitationRevokeMatch[1]));

        if (!invitation) {
          sendError(response, 404, "access_invitation_not_found", "Access invitation does not exist");
          return;
        }

        assertAccessInvitationRecordPermission(actor, invitation);

        if (invitation.acceptedAt) {
          sendError(response, 409, "access_invitation_already_accepted", "Accepted invitations cannot be revoked");
          return;
        }

        const revoked = await options.repositories.invitations.revoke(invitation.id, new Date().toISOString());

        await options.repositories.audit.record({
          actor,
          action: "access_invitation.revoked",
          resourceType: "access_invitation",
          resourceId: invitation.id,
          requestId: requestContext.requestId,
          metadata: {
            identifier: invitation.identifier,
            role: invitation.role,
          },
        });

        sendJson(response, 200, { data: publicAccessInvitation(revoked ?? invitation) });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          sendError(response, 400, "access_invitation_revoke_failed", "Access invitation could not be revoked", String(error));
        }
      }

      return;
    }

    const invitationResendMatch = requestUrl.pathname.match(/^\/v1\/internal\/access-invitations\/([^/]+)\/resend$/);
    if (request.method === "POST" && invitationResendMatch?.[1]) {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        const invitation = await options.repositories.invitations.get(decodeURIComponent(invitationResendMatch[1]));

        if (!invitation) {
          sendError(response, 404, "access_invitation_not_found", "Access invitation does not exist");
          return;
        }

        assertAccessInvitationRecordPermission(actor, invitation);

        if (invitation.acceptedAt) {
          sendError(response, 409, "access_invitation_already_accepted", "Accepted invitations cannot be resent");
          return;
        }

        if (invitation.revokedAt) {
          sendError(response, 410, "access_invitation_revoked", "Revoked invitations cannot be resent");
          return;
        }

        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const delivery = await authCodeDeliveryProvider.deliver({
          identifier: invitation.identifier,
          deliveryHint: maskInvitationIdentifier(invitation.identifier),
          expiresAt,
          purpose: "access_invitation",
        });
        const updated = await options.repositories.invitations.updateCode(invitation.id, {
          codeHash: accessInvitationCodeHash(delivery.code, authSessionSecret),
          expiresAt,
        });
        const payload: ResendAccessInvitationResponse = {
          invitation: {
            ...publicAccessInvitation(updated ?? invitation),
            ...(delivery.devCode ? { devCode: delivery.devCode } : {}),
          },
        };

        await options.repositories.audit.record({
          actor,
          action: "access_invitation.resent",
          resourceType: "access_invitation",
          resourceId: invitation.id,
          requestId: requestContext.requestId,
          metadata: {
            identifier: invitation.identifier,
            role: invitation.role,
            expiresAt,
          },
        });

        sendJson(response, 200, { data: payload });
      } catch (error) {
        const message = error instanceof Error ? error.message : "access_invitation_resend_failed";

        if (message === "auth_code_delivery_failed") {
          sendError(response, 503, message, "Access invitation delivery is temporarily unavailable");
          return;
        }

        if (!sendAuthError(response, error)) {
          sendError(response, 400, "access_invitation_resend_failed", "Access invitation could not be resent", message);
        }
      }

      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/v1/internal/access-invitations") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        const input = await readJsonBody<CreateAccessInvitationRequest>(request);
        const errors = validateCreateAccessInvitation(input);

        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Access invitation payload is invalid", errors);
          return;
        }

        assertAccessInvitationPermission(actor, input);

        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const normalizedIdentifier = normalizeInvitationIdentifier(input.identifier);
        const delivery = await authCodeDeliveryProvider.deliver({
          identifier: normalizedIdentifier,
          deliveryHint: maskInvitationIdentifier(normalizedIdentifier),
          expiresAt,
          purpose: "access_invitation",
        });
        const invitation = await options.repositories.invitations.create({
          identifier: normalizedIdentifier,
          displayName: input.displayName,
          role: input.role,
          ...(input.organizationId ? { organizationId: input.organizationId } : {}),
          ...(input.partnerLocationId ? { partnerLocationId: input.partnerLocationId } : {}),
          ...(input.propertyId ? { propertyId: input.propertyId } : {}),
          permissions: input.role === "internal" ? filterInternalPermissions(input.permissions ?? []) : [],
          codeHash: accessInvitationCodeHash(delivery.code, authSessionSecret),
          expiresAt,
          invitedByUserId: actor.userId,
        });
        const payload: AccessInvitation = {
          ...publicAccessInvitation(invitation),
          ...(delivery.devCode ? { devCode: delivery.devCode } : {}),
        };

        await options.repositories.audit.record({
          actor,
          action: "access_invitation.created",
          resourceType: "access_invitation",
          resourceId: invitation.id,
          requestId: requestContext.requestId,
          metadata: {
            identifier: invitation.identifier,
            role: invitation.role,
            organizationId: invitation.organizationId,
            partnerLocationId: invitation.partnerLocationId,
            propertyId: invitation.propertyId,
            expiresAt: invitation.expiresAt,
          },
        });

        sendJson(response, 201, { data: payload });
      } catch (error) {
        const message = error instanceof Error ? error.message : "access_invitation_failed";

        if (message === "auth_code_delivery_failed") {
          sendError(response, 503, message, "Access invitation delivery is temporarily unavailable");
          return;
        }

        if (!sendAuthError(response, error)) {
          sendError(response, 400, "access_invitation_failed", "Access invitation could not be created", message);
        }
      }

      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/v1/access-invitations/accept") {
      try {
        const input = await readJsonBody<AcceptAccessInvitationRequest>(request);
        const invitation = await options.repositories.invitations.get(input.invitationId);

        if (!invitation) {
          sendError(response, 404, "access_invitation_not_found", "Access invitation does not exist");
          return;
        }

        if (invitation.revokedAt) {
          sendError(response, 410, "access_invitation_revoked", "Access invitation has been revoked");
          return;
        }

        if (invitation.acceptedAt) {
          sendError(response, 409, "access_invitation_already_accepted", "Access invitation has already been accepted");
          return;
        }

        if (new Date(invitation.expiresAt).getTime() <= Date.now()) {
          sendError(response, 410, "access_invitation_expired", "Access invitation has expired");
          return;
        }

        if (!safeCompareString(invitation.codeHash, accessInvitationCodeHash(input.code.trim(), authSessionSecret))) {
          sendError(response, 401, "invalid_access_invitation_code", "Access invitation code is invalid");
          return;
        }

        const identity = await options.repositories.accessControl.createUserMembership({
          identifier: invitation.identifier,
          displayName: invitation.displayName,
          role: invitation.role,
          ...(invitation.organizationId ? { organizationId: invitation.organizationId } : {}),
          ...(invitation.partnerLocationId ? { partnerLocationId: invitation.partnerLocationId } : {}),
          ...(invitation.propertyId ? { propertyId: invitation.propertyId } : {}),
          permissions: invitation.permissions,
        });
        const accepted = await options.repositories.invitations.markAccepted(invitation.id, new Date().toISOString());
        const session = await authService.createSession(identity.user);
        const payload: AcceptAccessInvitationResponse = {
          invitation: publicAccessInvitation(accepted ?? invitation),
          session,
        };

        await options.repositories.audit.record({
          actor: identity.actor,
          action: "access_invitation.accepted",
          resourceType: "access_invitation",
          resourceId: invitation.id,
          requestId: requestContext.requestId,
          metadata: {
            identifier: invitation.identifier,
            role: invitation.role,
            organizationId: invitation.organizationId,
            partnerLocationId: invitation.partnerLocationId,
            propertyId: invitation.propertyId,
          },
        });

        sendJson(response, 200, { data: payload });
      } catch (error) {
        sendError(response, 400, "access_invitation_accept_failed", "Access invitation could not be accepted", String(error));
      }

      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/profile") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        const profile = await options.repositories.profiles.get(actor.userId);
        if (!profile) {
          sendError(response, 404, "profile_not_found", "Customer profile does not exist");
          return;
        }
        sendJson(response, 200, { data: profile });
      } catch (error) {
        sendAuthError(response, error);
      }
      return;
    }

    if (request.method === "PATCH" && requestUrl.pathname === "/v1/profile") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        const input = await readJsonBody<UpdateCustomerProfileRequest>(request);
        const errors = validateProfileUpdate(input);
        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Profile payload is invalid", errors);
          return;
        }
        sendJson(response, 200, { data: await options.repositories.profiles.update(actor.userId, input) });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          sendError(response, 404, "profile_not_found", "Customer profile does not exist");
        }
      }
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/v1/billing/session") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertOwnerAccess(actor, actor.userId);
        const profile = await options.repositories.profiles.get(actor.userId);

        if (!profile) {
          sendError(response, 404, "profile_not_found", "Customer profile does not exist");
          return;
        }

        const { customer, profile: updatedProfile } = await ensureBillingCustomer(
          options.repositories,
          paymentProvider,
          profile,
        );
        const [ephemeralKey, setupIntent] = await Promise.all([
          paymentProvider.createEphemeralKey(customer),
          paymentProvider.createSetupIntent(customer),
        ]);
        const session: BillingSession = {
          provider: customer.provider,
          providerCustomerId: customer.providerCustomerId,
          ephemeralKeySecret: ephemeralKey.ephemeralKeySecret,
          setupIntentClientSecret: setupIntent.clientSecret,
        };

        await options.repositories.audit.record({
          actor,
          action: "billing.session_created",
          resourceType: "customer_profile",
          resourceId: actor.userId,
          requestId: requestContext.requestId,
          metadata: {
            paymentProvider: customer.provider,
            providerCustomerId: customer.providerCustomerId,
            billingProfileCreated: !profile.billingProfile,
            updatedAt: updatedProfile.updatedAt,
          },
        });

        sendJson(response, 200, { data: session });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          sendError(response, 400, "billing_session_failed", "Billing session could not be created", String(error));
        }
      }

      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/billing/payment-methods") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertOwnerAccess(actor, actor.userId);
        const profile = await options.repositories.profiles.get(actor.userId);

        if (!profile) {
          sendError(response, 404, "profile_not_found", "Customer profile does not exist");
          return;
        }

        const { customer } = await ensureBillingCustomer(options.repositories, paymentProvider, profile);
        const paymentMethods: readonly PaymentMethodSummary[] = await paymentProvider.listPaymentMethods(customer);
        sendJson(response, 200, { data: paymentMethods });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          sendError(response, 400, "payment_methods_failed", "Payment methods could not be loaded", String(error));
        }
      }

      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/properties") {
      const marketId = requestUrl.searchParams.get("marketId") ?? "sg";
      const query = requestUrl.searchParams.get("query") ?? undefined;
      const residenceType = normalizeResidenceType(requestUrl.searchParams.get("residenceType"));
      const listInput: Parameters<typeof options.repositories.properties.list>[0] = {
        marketId,
        residenceType,
        ...(query ? { query } : {}),
      };
      sendJson(response, 200, {
        data: await options.repositories.properties.list(listInput),
      });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/v1/property-interests") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        const input = await readJsonBody<CreatePropertyInterestRequest>(request);
        const errors = validateCreatePropertyInterest(input);

        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Property interest payload is invalid", errors);
          return;
        }

        const propertyInterestInput = {
          ownerId: actor.userId,
          ...(input.propertyId ? { propertyId: input.propertyId } : {}),
          ...(input.residenceType ? { residenceType: input.residenceType } : {}),
          ...(input.propertyName ? { propertyName: input.propertyName } : {}),
          ...(input.propertyAddress ? { propertyAddress: input.propertyAddress } : {}),
          ...(input.requestedServiceCodes ? { requestedServiceCodes: input.requestedServiceCodes } : {}),
          ...(input.preferredTimeWindows ? { preferredTimeWindows: input.preferredTimeWindows } : {}),
          ...(input.parkingNotes ? { parkingNotes: input.parkingNotes } : {}),
        };
        const { property, interest } = await options.repositories.properties.registerInterest(propertyInterestInput);
        const residentialProfile = {
          residenceType: property.residenceType,
          localResidenceLabel: localResidenceLabelForProperty(property.residenceType),
          marketMode: propertyMarketMode(property.residenceType),
          propertyId: property.id,
          propertyName: property.name,
          propertyActivationStatus: property.activationStatus,
          propertyInterestCount: property.interestCount,
          ...(property.addressLine1 ? { propertyAddress: property.addressLine1 } : {}),
          ...(interest.parkingNotes ? { parkingNotes: interest.parkingNotes } : {}),
        };
        const profile = await options.repositories.profiles.update(actor.userId, {
          residentialProfile,
        });

        await options.repositories.audit.record({
          actor,
          action: "property_interest.registered",
          resourceType: "property",
          resourceId: property.id,
          requestId: requestContext.requestId,
          metadata: {
            propertyName: property.name,
            activationStatus: property.activationStatus,
            interestCount: property.interestCount,
          },
        });

        sendJson(response, 201, { data: { property, interest, profile } });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          const message = error instanceof Error ? error.message : "unknown_error";

          if (message === "profile_not_found") {
            sendError(response, 404, message, "Customer profile does not exist");
            return;
          }

          if (message === "property_not_found") {
            sendError(response, 404, message, "Property does not exist");
            return;
          }

          sendError(response, 400, "invalid_request", "Property interest request could not be processed", message);
        }
      }
      return;
    }

    const propertyPrimaWashDaysMatch = requestUrl.pathname.match(/^\/v1\/properties\/([^/]+)\/prima-wash-days$/);

    if (request.method === "GET" && propertyPrimaWashDaysMatch) {
      try {
        await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        const propertyId = propertyPrimaWashDaysMatch[1];

        if (!propertyId) {
          sendError(response, 404, "property_not_found", "Property does not exist");
          return;
        }

        const visibleStatuses = new Set(["planned", "approved", "active"]);
        const now = Date.now();
        const days = await options.repositories.condoOperations.listPrimaWashDays({ propertyId });

        sendJson(response, 200, {
          data: days.filter((day) => visibleStatuses.has(day.status) && new Date(day.endsAt).getTime() >= now),
        });
      } catch (error) {
        sendAuthError(response, error);
      }
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/management/property-dashboard") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        const propertyId = requestUrl.searchParams.get("propertyId") ?? actor.propertyId;

        if (!propertyId) {
          sendError(response, 400, "validation_failed", "propertyId is required");
          return;
        }

        assertPropertyManagerAccess(actor, propertyId);
        const dashboard = await buildPropertyManagementDashboard(options.repositories, propertyId);

        if (!dashboard) {
          sendError(response, 404, "property_not_found", "Property does not exist");
          return;
        }

        sendJson(response, 200, { data: dashboard });
      } catch (error) {
        sendAuthError(response, error);
      }
      return;
    }

    const managementOperationalProfileMatch = requestUrl.pathname.match(/^\/v1\/management\/properties\/([^/]+)\/operational-profile$/);

    if (request.method === "PATCH" && managementOperationalProfileMatch) {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        const propertyId = managementOperationalProfileMatch[1];

        if (!propertyId) {
          sendError(response, 404, "property_not_found", "Property does not exist");
          return;
        }

        assertPropertyManagerAccess(actor, propertyId);
        const input = await readJsonBody<UpdateCondoOperationalProfileRequest>(request);
        const errors = validateOperationalProfile(input);

        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Operational profile payload is invalid", errors);
          return;
        }

        const profile = await options.repositories.condoOperations.upsertOperationalProfile(propertyId, input);
        await options.repositories.audit.record({
          actor,
          action: "property.operational_profile_manager_updated",
          resourceType: "property",
          resourceId: propertyId,
          requestId: requestContext.requestId,
          metadata: {
            approvedServiceAreaCount: profile.approvedServiceAreas.length,
            simultaneousVehicleCapacity: profile.simultaneousVehicleCapacity,
            onsiteServiceAllowed: profile.onsiteServiceAllowed,
            pickupReturnAllowed: profile.pickupReturnAllowed,
          },
        });
        sendJson(response, 200, { data: profile });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          sendError(response, 400, "invalid_request", "Operational profile request could not be processed", String(error));
        }
      }
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/internal/property-leads") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertInternalPermission(actor, "property_manage");
        const marketId = requestUrl.searchParams.get("marketId") ?? "sg";
        sendJson(response, 200, { data: await options.repositories.properties.listLeads({ marketId }) });
      } catch (error) {
        sendAuthError(response, error);
      }
      return;
    }

    const operationalProfileMatch = requestUrl.pathname.match(/^\/v1\/internal\/properties\/([^/]+)\/operational-profile$/);

    if (request.method === "GET" && operationalProfileMatch) {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertInternalPermission(actor, "property_manage");
        const propertyId = operationalProfileMatch[1];

        if (!propertyId) {
          sendError(response, 404, "property_not_found", "Property does not exist");
          return;
        }

        const profile = await options.repositories.condoOperations.getOperationalProfile(propertyId);

        if (!profile) {
          sendError(response, 404, "operational_profile_not_found", "Condo operational profile does not exist");
          return;
        }

        sendJson(response, 200, { data: profile });
      } catch (error) {
        sendAuthError(response, error);
      }
      return;
    }

    if (request.method === "PATCH" && operationalProfileMatch) {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertInternalPermission(actor, "property_manage");
        const propertyId = operationalProfileMatch[1];

        if (!propertyId) {
          sendError(response, 404, "property_not_found", "Property does not exist");
          return;
        }

        const input = await readJsonBody<UpdateCondoOperationalProfileRequest>(request);
        const errors = validateOperationalProfile(input);

        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Operational profile payload is invalid", errors);
          return;
        }

        const profile = await options.repositories.condoOperations.upsertOperationalProfile(propertyId, input);
        await options.repositories.audit.record({
          actor,
          action: "property.operational_profile_updated",
          resourceType: "property",
          resourceId: propertyId,
          requestId: requestContext.requestId,
          metadata: {
            approvedServiceAreaCount: profile.approvedServiceAreas.length,
            simultaneousVehicleCapacity: profile.simultaneousVehicleCapacity,
            onsiteServiceAllowed: profile.onsiteServiceAllowed,
            pickupReturnAllowed: profile.pickupReturnAllowed,
          },
        });
        sendJson(response, 200, { data: profile });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          sendError(response, 400, "invalid_request", "Operational profile request could not be processed", String(error));
        }
      }
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/internal/prima-wash-days") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertInternalPermission(actor, "operations_read");
        const propertyId = requestUrl.searchParams.get("propertyId") ?? undefined;
        sendJson(response, 200, {
          data: await options.repositories.condoOperations.listPrimaWashDays(propertyId ? { propertyId } : {}),
        });
      } catch (error) {
        sendAuthError(response, error);
      }
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/internal/prima-wash-day-bookings") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertInternalPermission(actor, "operations_read");
        const primaWashDayId = requestUrl.searchParams.get("primaWashDayId") ?? undefined;
        const bookings = (await options.repositories.bookings.list())
          .filter((booking) => booking.primaWashDayId)
          .filter((booking) => !primaWashDayId || booking.primaWashDayId === primaWashDayId);
        const paymentByBookingId = await buildPaymentLookup(options.repositories, bookings);
        const vehicleById = await buildVehicleLookup(options.repositories, bookings);
        const partnerById = await buildPartnerLocationLookup(options.repositories, bookings);
        const evidenceByBookingId = await options.repositories.bookingEvidence.countByBookingIds(
          bookings.map((booking) => booking.id),
        );
        const handoverByBookingId = await options.repositories.bookingHandovers.countByBookingIds(
          bookings.map((booking) => booking.id),
        );
        sendJson(response, 200, {
          data: buildPrimaWashDayBookingItems(
            bookings,
            paymentByBookingId,
            vehicleById,
            partnerById,
            evidenceByBookingId,
            handoverByBookingId,
          ),
        });
      } catch (error) {
        sendAuthError(response, error);
      }
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/v1/internal/prima-wash-days") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertInternalPermission(actor, "operations_write");
        const input = await readJsonBody<CreatePrimaWashDayRequest>(request);
        const errors = validateCreatePrimaWashDay(input);

        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Prima Wash Day payload is invalid", errors);
          return;
        }

        const day = await options.repositories.condoOperations.createPrimaWashDay(input);
        await options.repositories.audit.record({
          actor,
          action: "prima_wash_day.created",
          resourceType: "prima_wash_day",
          resourceId: day.id,
          requestId: requestContext.requestId,
          metadata: {
            propertyId: day.propertyId,
            startsAt: day.startsAt,
            endsAt: day.endsAt,
            capacity: day.capacity,
            status: day.status,
          },
        });
        sendJson(response, 201, { data: day });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          sendError(response, 400, "invalid_request", "Prima Wash Day request could not be processed", String(error));
        }
      }
      return;
    }

    const primaWashDayMatch = requestUrl.pathname.match(/^\/v1\/internal\/prima-wash-days\/([^/]+)$/);

    if (request.method === "PATCH" && primaWashDayMatch) {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertInternalPermission(actor, "operations_write");
        const dayId = primaWashDayMatch[1];

        if (!dayId) {
          sendError(response, 404, "prima_wash_day_not_found", "Prima Wash Day does not exist");
          return;
        }

        const input = await readJsonBody<UpdatePrimaWashDayRequest>(request);
        const errors = validateUpdatePrimaWashDay(input);

        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Prima Wash Day payload is invalid", errors);
          return;
        }

        const day = await options.repositories.condoOperations.updatePrimaWashDay(dayId, input);
        await options.repositories.audit.record({
          actor,
          action: "prima_wash_day.updated",
          resourceType: "prima_wash_day",
          resourceId: day.id,
          requestId: requestContext.requestId,
          metadata: {
            propertyId: day.propertyId,
            startsAt: day.startsAt,
            endsAt: day.endsAt,
            capacity: day.capacity,
            status: day.status,
          },
        });
        sendJson(response, 200, { data: day });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          const message = error instanceof Error ? error.message : "unknown_error";

          if (message === "prima_wash_day_not_found") {
            sendError(response, 404, message, "Prima Wash Day does not exist");
            return;
          }

          sendError(response, 400, "invalid_request", "Prima Wash Day request could not be processed", message);
        }
      }
      return;
    }

    const propertyActivationMatch = requestUrl.pathname.match(/^\/v1\/internal\/properties\/([^/]+)\/activation$/);

    if (request.method === "PATCH" && propertyActivationMatch) {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertInternalPermission(actor, "property_manage");
        const propertyId = propertyActivationMatch[1];

        if (!propertyId) {
          sendError(response, 404, "property_not_found", "Property does not exist");
          return;
        }

        const input = await readJsonBody<UpdatePropertyActivationRequest>(request);
        const errors = validateUpdatePropertyActivation(input);

        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Property activation payload is invalid", errors);
          return;
        }

        const property = await options.repositories.properties.updateActivation(propertyId, input);
        await options.repositories.audit.record({
          actor,
          action: "property.activation_updated",
          resourceType: "property",
          resourceId: property.id,
          requestId: requestContext.requestId,
          metadata: {
            activationStatus: property.activationStatus,
            nextFollowUpAt: property.nextFollowUpAt,
            internalOwner: property.internalOwner,
          },
        });

        sendJson(response, 200, { data: property });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          const message = error instanceof Error ? error.message : "unknown_error";

          if (message === "property_not_found") {
            sendError(response, 404, message, "Property does not exist");
            return;
          }

          sendError(response, 400, "invalid_request", "Property activation request could not be processed", message);
        }
      }
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/auth/session") {
      try {
        const token = getBearerToken(request);
        sendJson(response, 200, { data: await authService.readSession(token) });
      } catch (error) {
        sendAuthVerificationError(response, error);
      }

      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/v1/auth/session/refresh") {
      try {
        const input = await readJsonBody<RefreshAuthSessionRequest>(request);
        sendJson(response, 200, { data: await authService.refreshSession(input.refreshToken) });
      } catch (error) {
        const message = error instanceof Error ? error.message : "invalid_refresh_token";

        if (message === "refresh_token_reuse_detected") {
          sendError(response, 401, message, "Refresh token reuse was detected. Sign in again");
          return;
        }

        sendError(response, 401, "invalid_refresh_token", "The refresh session is invalid or expired");
      }

      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/v1/auth/logout") {
      try {
        const token = getBearerToken(request);
        await authService.revokeToken(token);
        sendJson(response, 200, { data: { loggedOut: true } });
      } catch (error) {
        sendAuthVerificationError(response, error);
      }
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/services") {
      sendJson(response, 200, { data: serviceCatalog });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/partners") {
      const serviceCode = requestUrl.searchParams.get("serviceCode") as Parameters<
        typeof options.repositories.partners.list
      >[0];
      sendJson(response, 200, { data: await options.repositories.partners.list(serviceCode) });
      return;
    }

    const partnerDetailMatch = requestUrl.pathname.match(/^\/v1\/partners\/([^/]+)$/);

    if (request.method === "GET" && partnerDetailMatch) {
      const partnerId = partnerDetailMatch[1];
      const partner = partnerId ? await options.repositories.partners.get(partnerId) : undefined;
      if (!partner) {
        sendError(response, 404, "partner_not_found", "Partner location does not exist");
        return;
      }
      sendJson(response, 200, { data: partner });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/availability") {
      const partnerLocationId = requestUrl.searchParams.get("partnerLocationId") ?? undefined;
      sendJson(response, 200, { data: await options.repositories.availability.listPublic(partnerLocationId) });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/availability/search") {
      const partnerLocationId = requestUrl.searchParams.get("partnerLocationId") ?? "loc_demo_001";
      const serviceCode = requestUrl.searchParams.get("serviceCode");
      const date = requestUrl.searchParams.get("date");

      if (!serviceCode || !findServiceOffering(serviceCode)) {
        sendError(response, 400, "validation_failed", "serviceCode query parameter is required");
        return;
      }

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        sendError(response, 400, "validation_failed", "date query parameter must use YYYY-MM-DD format");
        return;
      }

      const partner = await options.repositories.partners.get(partnerLocationId);

      if (!partner) {
        sendError(response, 404, "partner_not_found", "Partner location does not exist");
        return;
      }

      const config = await options.repositories.scheduling.get(partnerLocationId);
      const bookings = await options.repositories.bookings.list();
      const holds = await options.repositories.bookingHolds.listActive({
        partnerLocationId,
        serviceCode,
        date,
      });
      const search = buildDynamicAvailabilitySearch({
        partnerLocationId,
        serviceCode,
        date,
        timezone: partner.timezone,
        config,
        bookings,
        holds,
      });

      sendJson(response, 200, { data: search });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/partner/availability") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertPartnerOrInternal(actor);
        const partnerLocationId = requestUrl.searchParams.get("partnerLocationId") ?? "loc_demo_001";
        await assertPartnerLocationAccess(options.repositories, actor, partnerLocationId, "operations_read");
        sendJson(response, 200, { data: await options.repositories.availability.listPartner(partnerLocationId) });
      } catch (error) {
        sendAuthError(response, error);
      }

      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/v1/booking-holds") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        const input = await readJsonBody<CreateBookingHoldRequest>(request);
        const errors = validateCreateBookingHold(input);

        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Booking hold payload is invalid", errors);
          return;
        }

        const vehicle = await options.repositories.vehicles.get(input.vehicleId);

        if (!vehicle) {
          sendError(response, 404, "vehicle_not_found", "Vehicle does not exist");
          return;
        }

        assertOwnerAccess(actor, vehicle.ownerId);

        const partner = await options.repositories.partners.get(input.partnerLocationId);

        if (!partner) {
          sendError(response, 404, "partner_not_found", "Partner location does not exist");
          return;
        }

        const date = getDateInTimeZone(input.startsAt, partner.timezone);
        const config = await options.repositories.scheduling.get(input.partnerLocationId);
        const bookings = await options.repositories.bookings.list();
        const holds = await options.repositories.bookingHolds.listActive({
          partnerLocationId: input.partnerLocationId,
          serviceCode: input.serviceCode,
          date,
        });
        const search = buildDynamicAvailabilitySearch({
          partnerLocationId: input.partnerLocationId,
          serviceCode: input.serviceCode,
          date,
          timezone: partner.timezone,
          config,
          bookings,
          holds,
        });
        const selectedSlot = search.slots.find((slot) => sameInstant(slot.startsAt, input.startsAt));

        if (!selectedSlot) {
          sendError(response, 409, "slot_unavailable", "Selected appointment time is no longer available");
          return;
        }

        const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
        const hold = await options.repositories.bookingHolds.create({
          ownerId: vehicle.ownerId,
          vehicleId: input.vehicleId,
          partnerLocationId: input.partnerLocationId,
          serviceCode: input.serviceCode,
          startsAt: selectedSlot.startsAt,
          endsAt: selectedSlot.endsAt,
          expiresAt,
        });

        await options.repositories.audit.record({
          actor,
          action: "booking_hold.created",
          resourceType: "booking_hold",
          resourceId: hold.id,
          requestId: requestContext.requestId,
          metadata: {
            partnerLocationId: hold.partnerLocationId,
            serviceCode: hold.serviceCode,
            startsAt: hold.startsAt,
            expiresAt: hold.expiresAt,
          },
        });

        sendJson(response, 201, {
          data: {
            hold,
            expiresInSeconds: Math.max(0, Math.floor((new Date(hold.expiresAt).getTime() - Date.now()) / 1000)),
          },
        });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          sendError(response, 400, "invalid_request", "Booking hold request could not be processed", String(error));
        }
      }

      return;
    }

    const bookingHoldMatch = requestUrl.pathname.match(/^\/v1\/booking-holds\/([^/]+)$/);

    if (request.method === "DELETE" && bookingHoldMatch) {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        const holdId = bookingHoldMatch[1];

        if (!holdId) {
          sendError(response, 404, "booking_hold_not_found", "Booking hold does not exist");
          return;
        }

        const hold = await options.repositories.bookingHolds.get(holdId);

        if (!hold) {
          sendError(response, 404, "booking_hold_not_found", "Booking hold does not exist");
          return;
        }

        assertOwnerAccess(actor, hold.ownerId);
        const released = await options.repositories.bookingHolds.updateStatus(hold.id, "released");
        sendJson(response, 200, { data: released });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          sendError(response, 400, "invalid_request", "Booking hold release request could not be processed", String(error));
        }
      }

      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/v1/partner/availability") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertPartnerOrInternal(actor);
        const input = await readJsonBody<CreateAvailabilitySlotRequest>(request);
        const errors = validateCreateAvailabilitySlot(input);

        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Availability payload is invalid", errors);
          return;
        }

        const partnerLocationId = input.partnerLocationId ?? "loc_demo_001";
        await assertPartnerLocationAccess(options.repositories, actor, partnerLocationId, "operations_write");
        const slot = await options.repositories.availability.create({
          ...input,
          partnerLocationId,
        });

        await options.repositories.audit.record({
          actor,
          action: "availability_slot.created",
          resourceType: "availability_slot",
          resourceId: slot.id,
          requestId: requestContext.requestId,
          metadata: {
            partnerLocationId: slot.partnerLocationId,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            capacity: slot.capacity,
            serviceCodes: slot.serviceCodes,
          },
        });

        sendJson(response, 201, { data: slot });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          sendError(response, 400, "invalid_request", "Availability request could not be processed", String(error));
        }
      }

      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/partner/scheduling/config") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertPartnerOrInternal(actor);
        const partnerLocationId = requestUrl.searchParams.get("partnerLocationId") ?? "loc_demo_001";
        await assertPartnerLocationAccess(options.repositories, actor, partnerLocationId, "operations_read");
        sendJson(response, 200, { data: await options.repositories.scheduling.get(partnerLocationId) });
      } catch (error) {
        sendAuthError(response, error);
      }

      return;
    }

    if (request.method === "PATCH" && requestUrl.pathname === "/v1/partner/scheduling/config") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertPartnerOrInternal(actor);
        const partnerLocationId = requestUrl.searchParams.get("partnerLocationId") ?? "loc_demo_001";
        await assertPartnerLocationAccess(options.repositories, actor, partnerLocationId, "operations_write");
        const input = await readJsonBody<UpdateSchedulingConfigRequest>(request);
        const errors = validateSchedulingConfig(input);

        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Scheduling config payload is invalid", errors);
          return;
        }

        const config = await options.repositories.scheduling.replace(partnerLocationId, input);

        await options.repositories.audit.record({
          actor,
          action: "scheduling_config.updated",
          resourceType: "partner_location",
          resourceId: partnerLocationId,
          requestId: requestContext.requestId,
          metadata: {
            scheduleRuleCount: config.operatingScheduleRules.length,
            exceptionCount: config.calendarExceptions.length,
            resourcePoolCount: config.resourcePools.length,
            serviceRuleCount: config.serviceCapacityRules.length,
          },
        });

        sendJson(response, 200, { data: config });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          sendError(response, 400, "invalid_request", "Scheduling config request could not be processed", String(error));
        }
      }

      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/partner/capacity-templates") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertPartnerOrInternal(actor);
        const partnerLocationId = requestUrl.searchParams.get("partnerLocationId") ?? "loc_demo_001";
        await assertPartnerLocationAccess(options.repositories, actor, partnerLocationId, "operations_read");
        sendJson(response, 200, { data: await options.repositories.capacityTemplates.list(partnerLocationId) });
      } catch (error) {
        sendAuthError(response, error);
      }

      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/v1/partner/capacity-templates") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertPartnerOrInternal(actor);
        const input = await readJsonBody<CreateCapacityTemplateRequest>(request);
        const errors = validateCreateCapacityTemplate(input);

        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Capacity template payload is invalid", errors);
          return;
        }

        const partnerLocationId = input.partnerLocationId ?? "loc_demo_001";
        await assertPartnerLocationAccess(options.repositories, actor, partnerLocationId, "operations_write");
        const template = await options.repositories.capacityTemplates.create({
          ...input,
          partnerLocationId,
        });

        await options.repositories.audit.record({
          actor,
          action: "capacity_template.created",
          resourceType: "capacity_template",
          resourceId: template.id,
          requestId: requestContext.requestId,
          metadata: {
            partnerLocationId: template.partnerLocationId,
            name: template.name,
            openTime: template.openTime,
            closeTime: template.closeTime,
            staffCount: template.staffCount,
            bayCount: template.bayCount,
            serviceCodes: template.serviceCodes,
          },
        });

        sendJson(response, 201, { data: template });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          sendError(response, 400, "invalid_request", "Capacity template request could not be processed", String(error));
        }
      }

      return;
    }

    const capacityTemplateGenerateMatch = requestUrl.pathname.match(
      /^\/v1\/partner\/capacity-templates\/([^/]+)\/generate$/,
    );
    const capacityTemplateMatch = requestUrl.pathname.match(/^\/v1\/partner\/capacity-templates\/([^/]+)$/);

    if (request.method === "POST" && capacityTemplateGenerateMatch) {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertPartnerOrInternal(actor);
        const templateId = capacityTemplateGenerateMatch[1];

        if (!templateId) {
          sendError(response, 404, "capacity_template_not_found", "Capacity template does not exist");
          return;
        }

        const input = await readJsonBody<GenerateCapacityTemplateSlotsRequest>(request);
        const errors = validateGenerateCapacitySlots(input);

        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Capacity generation payload is invalid", errors);
          return;
        }

        const template = await options.repositories.capacityTemplates.get(templateId);

        if (!template) {
          sendError(response, 404, "capacity_template_not_found", "Capacity template does not exist");
          return;
        }

        await assertPartnerLocationAccess(options.repositories, actor, template.partnerLocationId, "operations_write");
        const slotsToCreate = generateAvailabilitySlotsFromTemplate(template, input.date);
        const slots: PartnerAvailabilitySlot[] = [];

        for (const slotInput of slotsToCreate) {
          slots.push(await options.repositories.availability.create(slotInput));
        }

        await options.repositories.audit.record({
          actor,
          action: "capacity_template.generated",
          resourceType: "capacity_template",
          resourceId: template.id,
          requestId: requestContext.requestId,
          metadata: {
            partnerLocationId: template.partnerLocationId,
            date: input.date,
            slotCount: slots.length,
            capacityPerSlot: Math.min(template.staffCount, template.bayCount),
          },
        });

        sendJson(response, 201, { data: { template, slots } });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          sendError(response, 400, "invalid_request", "Capacity generation request could not be processed", String(error));
        }
      }

      return;
    }

    if (request.method === "PATCH" && capacityTemplateMatch) {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertPartnerOrInternal(actor);
        const templateId = capacityTemplateMatch[1];

        if (!templateId) {
          sendError(response, 404, "capacity_template_not_found", "Capacity template does not exist");
          return;
        }

        const input = await readJsonBody<UpdateCapacityTemplateRequest>(request);
        const errors = validateUpdateCapacityTemplate(input);

        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Capacity template payload is invalid", errors);
          return;
        }

        const existingTemplate = await options.repositories.capacityTemplates.get(templateId);

        if (!existingTemplate) {
          sendError(response, 404, "capacity_template_not_found", "Capacity template does not exist");
          return;
        }

        await assertPartnerLocationAccess(options.repositories, actor, existingTemplate.partnerLocationId, "operations_write");
        const template = await options.repositories.capacityTemplates.update(templateId, input);

        await options.repositories.audit.record({
          actor,
          action: "capacity_template.updated",
          resourceType: "capacity_template",
          resourceId: template.id,
          requestId: requestContext.requestId,
          metadata: {
            partnerLocationId: template.partnerLocationId,
            name: template.name,
          },
        });

        sendJson(response, 200, { data: template });
      } catch (error) {
        if (sendAuthError(response, error)) {
          return;
        }

        if (error instanceof Error && error.message === "capacity_template_not_found") {
          sendError(response, 404, "capacity_template_not_found", "Capacity template does not exist");
          return;
        }

        sendError(response, 400, "invalid_request", "Capacity template update request could not be processed", String(error));
      }

      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/audit-events") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertInternalPermission(actor, "operations_read");
        const limit = Number.parseInt(requestUrl.searchParams.get("limit") ?? "50", 10);
        sendJson(response, 200, { data: await options.repositories.audit.list(Math.min(Math.max(limit, 1), 100)) });
      } catch (error) {
        sendAuthError(response, error);
      }

      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/partner/dashboard") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertPartnerOrInternal(actor);
        const partnerLocationId = requestUrl.searchParams.get("partnerLocationId") ?? "loc_demo_001";
        await assertPartnerLocationAccess(options.repositories, actor, partnerLocationId, "operations_read");
        const bookings = await options.repositories.bookings.list();
        const auditEvents = await options.repositories.audit.list(8);
        const paymentByBookingId = await buildPaymentLookup(options.repositories, bookings);
        const vehicleById = await buildVehicleLookup(options.repositories, bookings);
        const partnerById = await buildPartnerLocationLookup(options.repositories, bookings);
        const evidenceByBookingId = await options.repositories.bookingEvidence.countByBookingIds(
          bookings.map((booking) => booking.id),
        );
        const handoverByBookingId = await options.repositories.bookingHandovers.countByBookingIds(
          bookings.map((booking) => booking.id),
        );
        sendJson(response, 200, {
          data: buildPartnerDashboard(
            partnerLocationId,
            bookings,
            auditEvents,
            paymentByBookingId,
            vehicleById,
            partnerById,
            evidenceByBookingId,
            handoverByBookingId,
          ),
        });
      } catch (error) {
        sendAuthError(response, error);
      }

      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/internal/operations-dashboard") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertInternalPermission(actor, "operations_read");
        const bookings = await options.repositories.bookings.list();
        const auditEvents = await options.repositories.audit.list(8);
        const paymentByBookingId = await buildPaymentLookup(options.repositories, bookings);
        const vehicleById = await buildVehicleLookup(options.repositories, bookings);
        const partnerById = await buildPartnerLocationLookup(options.repositories, bookings);
        const evidenceByBookingId = await options.repositories.bookingEvidence.countByBookingIds(
          bookings.map((booking) => booking.id),
        );
        const handoverByBookingId = await options.repositories.bookingHandovers.countByBookingIds(
          bookings.map((booking) => booking.id),
        );
        sendJson(response, 200, {
          data: buildPartnerDashboard(
            undefined,
            bookings,
            auditEvents,
            paymentByBookingId,
            vehicleById,
            partnerById,
            evidenceByBookingId,
            handoverByBookingId,
          ),
        });
      } catch (error) {
        sendAuthError(response, error);
      }

      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/analytics/mavo") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertInternalPermission(actor, "finance_read");
        const month = requestUrl.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);

        if (!/^\d{4}-\d{2}$/.test(month)) {
          sendError(response, 400, "validation_failed", "month must use YYYY-MM format");
          return;
        }

        sendJson(response, 200, { data: await options.repositories.productEvents.calculateMavo(month) });
      } catch (error) {
        sendAuthError(response, error);
      }

      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/communication/threads") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        const resourceType = normalizeCommunicationResourceType(requestUrl.searchParams.get("resourceType"));
        const resourceId = requestUrl.searchParams.get("resourceId") ?? undefined;

        if (resourceType && resourceId) {
          await assertCommunicationResourceAccess(options.repositories, actor, resourceType, resourceId);
        }

        const threads = await options.repositories.communications.list({
          ...(resourceType ? { resourceType } : {}),
          ...(resourceId ? { resourceId } : {}),
        });
        const visibleThreads = [];

        for (const thread of threads) {
          if (await canAccessCommunicationThread(options.repositories, actor, thread)) {
            visibleThreads.push(thread);
          }
        }

        sendJson(response, 200, { data: visibleThreads });
      } catch (error) {
        sendAuthError(response, error);
      }
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/v1/communication/threads") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        const input = await readJsonBody<CreateCommunicationThreadRequest>(request);
        const errors = validateCreateCommunicationThread({ ...input, actor });

        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Communication thread payload is invalid", errors);
          return;
        }

        await assertCommunicationResourceAccess(options.repositories, actor, input.resourceType, input.resourceId);
        assertCommunicationTypeAccess(actor, input.type);
        const thread = await options.repositories.communications.create({ ...input, actor });
        const messages = await options.repositories.communications.getMessages(thread.id);

        await options.repositories.audit.record({
          actor,
          action: "communication.thread_created",
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          requestId: requestContext.requestId,
          metadata: {
            threadId: thread.id,
            type: thread.type,
            subject: thread.subject,
            createdByRole: actor.role,
          },
        });

        sendJson(response, 201, { data: { thread, messages } });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          sendError(response, 400, "invalid_request", "Communication thread request could not be processed", String(error));
        }
      }
      return;
    }

    const communicationThreadMatch = requestUrl.pathname.match(/^\/v1\/communication\/threads\/([^/]+)$/);
    const communicationMessagesMatch = requestUrl.pathname.match(/^\/v1\/communication\/threads\/([^/]+)\/messages$/);

    if (request.method === "GET" && communicationThreadMatch) {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        const threadId = communicationThreadMatch[1];

        if (!threadId) {
          sendError(response, 404, "communication_thread_not_found", "Communication thread does not exist");
          return;
        }

        const thread = await options.repositories.communications.get(threadId);

        if (!thread) {
          sendError(response, 404, "communication_thread_not_found", "Communication thread does not exist");
          return;
        }

        if (!(await canAccessCommunicationThread(options.repositories, actor, thread))) {
          sendError(response, 403, "communication_thread_forbidden", "Actor is not allowed to access this thread");
          return;
        }

        sendJson(response, 200, { data: { thread, messages: await options.repositories.communications.getMessages(thread.id) } });
      } catch (error) {
        sendAuthError(response, error);
      }
      return;
    }

    if (request.method === "POST" && communicationMessagesMatch) {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        const threadId = communicationMessagesMatch[1];

        if (!threadId) {
          sendError(response, 404, "communication_thread_not_found", "Communication thread does not exist");
          return;
        }

        const thread = await options.repositories.communications.get(threadId);

        if (!thread) {
          sendError(response, 404, "communication_thread_not_found", "Communication thread does not exist");
          return;
        }

        if (!(await canAccessCommunicationThread(options.repositories, actor, thread))) {
          sendError(response, 403, "communication_thread_forbidden", "Actor is not allowed to access this thread");
          return;
        }

        const input = await readJsonBody<CreateCommunicationMessageRequest>(request);
        const errors = validateCreateCommunicationMessage(input);

        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Communication message payload is invalid", errors);
          return;
        }

        const message = await options.repositories.communications.addMessage({ threadId: thread.id, actor, body: input.body });
        await options.repositories.audit.record({
          actor,
          action: "communication.message_created",
          resourceType: thread.resourceType,
          resourceId: thread.resourceId,
          requestId: requestContext.requestId,
          metadata: {
            threadId: thread.id,
            messageId: message.id,
            type: thread.type,
            subject: thread.subject,
            senderRole: actor.role,
          },
        });

        sendJson(response, 201, { data: message });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          sendError(response, 400, "invalid_request", "Communication message request could not be processed", String(error));
        }
      }
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/vehicles") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        const ownerId = requestUrl.searchParams.get("ownerId") ?? actor.userId;
        assertOwnerAccess(actor, ownerId);
        sendJson(response, 200, { data: await options.repositories.vehicles.list(ownerId) });
      } catch (error) {
        sendAuthError(response, error);
      }

      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/v1/vehicles") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        const input = await readJsonBody<CreateVehicleRequest>(request);
        const errors = validateCreateVehicle(input);

        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Vehicle payload is invalid", errors);
          return;
        }

        if (input.ownerId) {
          assertOwnerAccess(actor, input.ownerId);
        }

        const ownerId = input.ownerId ?? actor.userId;
        const normalizedPlateNumber = input.plateNumber.trim().toUpperCase();
        const existingVehicles = await options.repositories.vehicles.list(ownerId);
        const duplicateVehicle = existingVehicles.find((vehicle) => vehicle.plateNumber === normalizedPlateNumber);

        if (duplicateVehicle) {
          sendError(response, 409, "vehicle_already_exists", "This plate is already saved in your Garage");
          return;
        }

        const vehicle = await options.repositories.vehicles.create({ ...input, ownerId });

        await options.repositories.audit.record({
          actor,
          action: "vehicle.created",
          resourceType: "vehicle",
          resourceId: vehicle.id,
          requestId: requestContext.requestId,
          metadata: {
            ownerId: vehicle.ownerId,
            plateNumber: vehicle.plateNumber,
          },
        });

        await recordProductEvent(options.repositories, {
          ownerId: vehicle.ownerId,
          name: "vehicle_created",
          resourceType: "vehicle",
          resourceId: vehicle.id,
          metadata: {
            plateNumber: vehicle.plateNumber,
          },
        });

        sendJson(response, 201, { data: vehicle });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          sendError(response, 400, "invalid_request", "Vehicle request could not be processed", String(error));
        }
      }

      return;
    }

    const vehicleMatch = requestUrl.pathname.match(/^\/v1\/vehicles\/([^/]+)$/);

    if (request.method === "PATCH" && vehicleMatch) {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        const vehicleId = vehicleMatch[1];
        if (!vehicleId) throw new Error("vehicle_not_found");
        const existing = await options.repositories.vehicles.get(vehicleId);
        if (!existing) {
          sendError(response, 404, "vehicle_not_found", "Vehicle does not exist");
          return;
        }
        assertOwnerAccess(actor, existing.ownerId);
        const input = await readJsonBody<UpdateVehicleRequest>(request);
        const errors = validateUpdateVehicle(input);
        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Vehicle update payload is invalid", errors);
          return;
        }

        if (input.plateNumber !== undefined) {
          const normalizedPlateNumber = input.plateNumber.trim().toUpperCase();
          const existingVehicles = await options.repositories.vehicles.list(existing.ownerId);
          const duplicateVehicle = existingVehicles.find(
            (vehicle) => vehicle.id !== vehicleId && vehicle.plateNumber === normalizedPlateNumber,
          );

          if (duplicateVehicle) {
            sendError(response, 409, "vehicle_already_exists", "This plate is already saved in your Garage");
            return;
          }
        }

        sendJson(response, 200, { data: await options.repositories.vehicles.update(vehicleId, input) });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          sendError(response, 400, "invalid_request", "Vehicle update could not be processed");
        }
      }
      return;
    }

    if (request.method === "DELETE" && vehicleMatch) {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        const vehicleId = vehicleMatch[1];
        if (!vehicleId) throw new Error("vehicle_not_found");
        const existing = await options.repositories.vehicles.get(vehicleId);
        if (!existing) {
          sendError(response, 404, "vehicle_not_found", "Vehicle does not exist");
          return;
        }
        assertOwnerAccess(actor, existing.ownerId);
        await options.repositories.vehicles.delete(vehicleId);
        sendJson(response, 200, { data: { deleted: true } });
      } catch (error) {
        if (sendAuthError(response, error)) return;
        const message = error instanceof Error ? error.message : "invalid_request";
        if (message === "vehicle_has_history") {
          sendError(response, 409, message, "Vehicles with booking history cannot be deleted");
          return;
        }
        sendError(response, 400, "invalid_request", "Vehicle could not be deleted");
      }
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/bookings") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        const ownerId = requestUrl.searchParams.get("ownerId") ?? actor.userId;
        assertOwnerAccess(actor, ownerId);
        sendJson(response, 200, { data: await options.repositories.bookings.list(ownerId) });
      } catch (error) {
        sendAuthError(response, error);
      }

      return;
    }

    const bookingDetailMatch = requestUrl.pathname.match(/^\/v1\/bookings\/([^/]+)$/);

    if (request.method === "GET" && bookingDetailMatch) {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        const bookingId = bookingDetailMatch[1];

        if (!bookingId) {
          sendError(response, 404, "booking_not_found", "Booking does not exist");
          return;
        }

        const booking = await options.repositories.bookings.get(bookingId);

        if (!booking) {
          sendError(response, 404, "booking_not_found", "Booking does not exist");
          return;
        }

        if (actor.role === "customer") {
          assertOwnerAccess(actor, booking.ownerId);
        } else {
          assertPartnerOrInternal(actor);
          await assertPartnerBookingAccess(options.repositories, actor, booking, "operations_read");
        }

        sendJson(response, 200, { data: booking });
      } catch (error) {
        sendAuthError(response, error);
      }

      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/service-records") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        const ownerId = requestUrl.searchParams.get("ownerId") ?? actor.userId;
        assertOwnerAccess(actor, ownerId);
        sendJson(response, 200, { data: await options.repositories.serviceRecords.list(ownerId) });
      } catch (error) {
        sendAuthError(response, error);
      }

      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/payments/history") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        const ownerId = requestUrl.searchParams.get("ownerId") ?? actor.userId;
        assertOwnerAccess(actor, ownerId);
        sendJson(response, 200, { data: await buildPaymentHistory(options.repositories, ownerId) });
      } catch (error) {
        sendAuthError(response, error);
      }

      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/payments") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        const bookingId = requestUrl.searchParams.get("bookingId");

        if (!bookingId) {
          sendError(response, 400, "validation_failed", "bookingId query parameter is required");
          return;
        }

        const booking = await options.repositories.bookings.get(bookingId);

        if (!booking) {
          sendError(response, 404, "booking_not_found", "Booking does not exist");
          return;
        }

        if (actor.role === "customer") {
          assertOwnerAccess(actor, booking.ownerId);
        } else {
          assertPartnerOrInternal(actor);
        }

        const payment = await options.repositories.payments.getByBookingId(bookingId);
        sendJson(response, 200, { data: payment ?? null });
      } catch (error) {
        sendAuthError(response, error);
      }

      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/internal/payment-operations") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertInternalPermission(actor, "finance_read");
        const limit = Number.parseInt(requestUrl.searchParams.get("limit") ?? "100", 10);
        const operations = await options.repositories.paymentOperations.list({
          bookingId: requestUrl.searchParams.get("bookingId") ?? undefined,
          paymentIntentId: requestUrl.searchParams.get("paymentIntentId") ?? undefined,
          limit,
        });

        sendJson(response, 200, { data: operations });
      } catch (error) {
        sendAuthError(response, error);
      }

      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/v1/internal/payment-provider-reconciliation-runs") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertInternalPermission(actor, "finance_write");
        const input = await readOptionalJsonBody<{
          readonly provider?: string;
          readonly limit?: number;
        }>(request);
        const result = await runPaymentProviderReconciliation(options.repositories, paymentProvider, {
          actor,
          requestId: requestContext.requestId,
          provider: input.provider?.trim() || "stripe",
          limit: typeof input.limit === "number" ? input.limit : Number.parseInt(String(input.limit ?? "100"), 10),
        });

        sendJson(response, 201, { data: result });
      } catch (error) {
        if (sendAuthError(response, error)) {
          return;
        }

        if (error instanceof Error && error.message === "payment_provider_reconciliation_run_already_running") {
          sendError(response, 409, error.message, "A provider reconciliation run is already in progress for this provider");
          return;
        }

        sendError(response, 500, "payment_provider_reconciliation_run_failed", "Provider reconciliation could not be started");
      }

      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/internal/payment-provider-reconciliation-runs") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertInternalPermission(actor, "finance_read");
        const limit = Number.parseInt(requestUrl.searchParams.get("limit") ?? "20", 10);
        const runs = await options.repositories.paymentProviderReconciliationRuns.list({
          provider: requestUrl.searchParams.get("provider") ?? undefined,
          limit,
        });

        sendJson(response, 200, { data: runs });
      } catch (error) {
        sendAuthError(response, error);
      }

      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/v1/internal/payment-reconciliation-cases") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertInternalPermission(actor, "finance_read");
        const limit = Number.parseInt(requestUrl.searchParams.get("limit") ?? "100", 10);
        const status = requestUrl.searchParams.get("status") ?? undefined;
        const cases = await options.repositories.paymentReconciliationCases.list({
          bookingId: requestUrl.searchParams.get("bookingId") ?? undefined,
          status: isPaymentReconciliationCaseStatus(status) || status === "all" ? status : undefined,
          limit,
        });

        sendJson(response, 200, { data: cases });
      } catch (error) {
        sendAuthError(response, error);
      }

      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/v1/internal/payment-reconciliation-cases") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertInternalPermission(actor, "finance_write");
        const input = await readJsonBody<CreatePaymentReconciliationCaseRequest>(request);
        const errors = validateCreatePaymentReconciliationCase(input);

        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Payment reconciliation case payload is invalid", errors);
          return;
        }

        const operation = await options.repositories.paymentOperations.get(input.paymentOperationId);

        if (!operation) {
          sendError(response, 404, "payment_operation_not_found", "Payment operation does not exist");
          return;
        }

        const detail = await options.repositories.paymentReconciliationCases.create({
          ...input,
          operation,
          actor,
        });

        await options.repositories.audit.record({
          actor,
          action: "payment_reconciliation_case.created",
          resourceType: "booking",
          resourceId: operation.bookingId,
          metadata: {
            caseId: detail.case.id,
            caseType: detail.case.caseType,
            paymentOperationId: operation.id,
            providerReference: operation.providerReference,
          },
        });

        sendJson(response, 201, { data: detail });
      } catch (error) {
        sendAuthError(response, error);
      }

      return;
    }

    const reconciliationCaseMatch = requestUrl.pathname.match(/^\/v1\/internal\/payment-reconciliation-cases\/([^/]+)$/);

    if (reconciliationCaseMatch && request.method === "GET") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertInternalPermission(actor, "finance_read");
        const caseId = decodeURIComponent(reconciliationCaseMatch[1] ?? "");
        const detail = await options.repositories.paymentReconciliationCases.get(caseId);

        if (!detail) {
          sendError(response, 404, "payment_reconciliation_case_not_found", "Payment reconciliation case does not exist");
          return;
        }

        sendJson(response, 200, { data: detail });
      } catch (error) {
        sendAuthError(response, error);
      }

      return;
    }

    if (reconciliationCaseMatch && request.method === "PATCH") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertInternalPermission(actor, "finance_write");
        const input = await readJsonBody<UpdatePaymentReconciliationCaseRequest>(request);
        const errors = validateUpdatePaymentReconciliationCase(input);

        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Payment reconciliation case update is invalid", errors);
          return;
        }

        const detail = await options.repositories.paymentReconciliationCases.update(
          decodeURIComponent(reconciliationCaseMatch[1] ?? ""),
          { ...input, actor },
        );

        if (!detail) {
          sendError(response, 404, "payment_reconciliation_case_not_found", "Payment reconciliation case does not exist");
          return;
        }

        await options.repositories.audit.record({
          actor,
          action: "payment_reconciliation_case.updated",
          resourceType: "booking",
          resourceId: detail.case.bookingId,
          metadata: {
            caseId: detail.case.id,
            status: detail.case.status,
            assignedToUserId: detail.case.assignedToUserId,
          },
        });

        sendJson(response, 200, { data: detail });
      } catch (error) {
        sendAuthError(response, error);
      }

      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/v1/payments/intents") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        const input = await readJsonBody<CreatePaymentIntentRequest>(request);
        const errors = validateCreatePaymentIntent(input);

        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Payment intent payload is invalid", errors);
          return;
        }

        const booking = await options.repositories.bookings.get(input.bookingId);

        if (!booking) {
          sendError(response, 404, "booking_not_found", "Booking does not exist");
          return;
        }

        if (actor.role === "customer") {
          assertOwnerAccess(actor, booking.ownerId);
        } else {
          assertPartnerOrInternal(actor);
        }

        const consentSummary = await options.repositories.bookingConsents.summary(booking.id);

        if (booking.onsiteServiceMode === "pickup_return" && !consentSummary.pickupReturnTermsAccepted) {
          sendError(
            response,
            409,
            "booking_consent_required",
            "Pickup and return consent is required before payment authorization",
          );
          return;
        }

        if (
          ["customer_property", "onsite"].includes(booking.onsiteServiceMode ?? "") &&
          !consentSummary.propertyServiceTermsAccepted
        ) {
          sendError(
            response,
            409,
            "booking_consent_required",
            "On-property service consent is required before payment authorization",
          );
          return;
        }

        const idempotencyKey = getPaymentIdempotencyKey(request);

        if (idempotencyKey) {
          const existingOperation = await options.repositories.paymentOperations.findSucceededByIdempotencyKey({
            operation: "create",
            bookingId: booking.id,
            idempotencyKey,
          });

          if (existingOperation?.paymentIntentId) {
            const idempotentPayment = await options.repositories.payments.get(existingOperation.paymentIntentId);

            if (idempotentPayment) {
              sendJson(response, 200, { data: idempotentPayment });
              return;
            }
          }
        }

        const existingPayment = await options.repositories.payments.getByBookingId(booking.id);
        const ownerProfile = existingPayment ? undefined : await options.repositories.profiles.get(booking.ownerId);
        const billingCustomer = ownerProfile
          ? (await ensureBillingCustomer(options.repositories, paymentProvider, ownerProfile)).customer
          : undefined;
        const providerResult = existingPayment ? undefined : await paymentProvider.createIntent(booking, billingCustomer);
        const payment = existingPayment ?? await options.repositories.payments.createForBooking(booking, providerResult);

        await options.repositories.audit.record({
          actor,
          action: "payment.intent_created",
          resourceType: "payment_intent",
          resourceId: payment.id,
          requestId: requestContext.requestId,
          metadata: {
            bookingId: payment.bookingId,
            ownerId: payment.ownerId,
            amount: payment.amount,
            status: payment.status,
            ...(providerResult
              ? {
                  paymentProvider: providerResult.provider,
                  providerOperation: providerResult.operation,
                  providerReference: providerResult.providerReference,
                  providerStatus: providerResult.status,
                  providerProcessedAt: providerResult.processedAt,
                }
              : {}),
          },
        });

        if (!existingPayment) {
          await recordPaymentOperation(options.repositories, {
            actor,
            requestId: requestContext.requestId,
            operation: "create",
            payment,
            providerResult,
            idempotencyKey,
            metadata: {
              source: "payment_intent_request",
            },
          });
        }

        sendJson(response, 201, { data: payment });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          sendError(response, 400, "invalid_request", "Payment intent request could not be processed", String(error));
        }
      }

      return;
    }

    const paymentAuthorizeMatch = requestUrl.pathname.match(/^\/v1\/payments\/([^/]+)\/authorize$/);
    const paymentCaptureMatch = requestUrl.pathname.match(/^\/v1\/payments\/([^/]+)\/capture$/);
    const paymentRefundMatch = requestUrl.pathname.match(/^\/v1\/payments\/([^/]+)\/refund$/);

    if (request.method === "POST" && paymentAuthorizeMatch) {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        const paymentIntentId = paymentAuthorizeMatch[1];

        if (!paymentIntentId) {
          sendError(response, 404, "payment_intent_not_found", "Payment intent does not exist");
          return;
        }

        const payment = await options.repositories.payments.get(paymentIntentId);

        if (!payment) {
          sendError(response, 404, "payment_intent_not_found", "Payment intent does not exist");
          return;
        }

        assertOwnerAccess(actor, payment.ownerId);

        const idempotencyKey = getPaymentIdempotencyKey(request);
        const idempotentPayment = await getIdempotentPaymentForOperation(options.repositories, {
          operation: "authorize",
          bookingId: payment.bookingId,
          idempotencyKey,
        });

        if (idempotentPayment) {
          sendJson(response, 200, { data: idempotentPayment });
          return;
        }

        let providerResult: PaymentProviderResult | undefined;
        let authorizedPayment: PaymentIntent;

        try {
          assertPaymentTransition(payment.status, "authorized");
          providerResult = await paymentProvider.authorize(payment);
          authorizedPayment = await options.repositories.payments.authorize(payment.id);
        } catch (error) {
          await recordPaymentOperationFailure(options.repositories, {
            actor,
            requestId: requestContext.requestId,
            operation: "authorize",
            payment,
            providerResult,
            idempotencyKey,
            error,
            metadata: {
              source: "payment_authorize_request",
            },
          });
          throw error;
        }

        await recordPaymentAudit(
          options.repositories,
          actor,
          requestContext.requestId,
          "payment.authorized",
          authorizedPayment,
          providerResult,
        );
        await recordPaymentOperation(options.repositories, {
          actor,
          requestId: requestContext.requestId,
          operation: "authorize",
          payment: authorizedPayment,
          providerResult,
          idempotencyKey,
          metadata: {
            source: "payment_authorize_request",
          },
        });

        const booking = await options.repositories.bookings.get(authorizedPayment.bookingId);

        if (booking && canTransitionBookingStatus(booking.status, "confirmed")) {
          const updatedBooking = await options.repositories.bookings.updateStatus(booking.id, "confirmed");

          await options.repositories.audit.record({
            actor,
            action: "booking.status_changed",
            resourceType: "booking",
            resourceId: booking.id,
            requestId: requestContext.requestId,
            metadata: {
              fromStatus: booking.status,
              toStatus: updatedBooking.status,
              partnerLocationId: updatedBooking.partnerLocationId,
              source: "payment_authorization",
            },
          });
        }

        sendJson(response, 200, { data: authorizedPayment });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          sendPaymentError(response, error, "Payment authorization request could not be processed");
        }
      }

      return;
    }

    if (request.method === "POST" && paymentCaptureMatch) {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertPartnerOrInternal(actor);
        const paymentIntentId = paymentCaptureMatch[1];

        if (!paymentIntentId) {
          sendError(response, 404, "payment_intent_not_found", "Payment intent does not exist");
          return;
        }

        const payment = await options.repositories.payments.get(paymentIntentId);

        if (!payment) {
          sendError(response, 404, "payment_intent_not_found", "Payment intent does not exist");
          return;
        }

        const booking = await options.repositories.bookings.get(payment.bookingId);

        if (!booking) {
          sendError(response, 404, "booking_not_found", "Booking does not exist");
          return;
        }

        await assertPartnerBookingAccess(options.repositories, actor, booking);

        if (booking.status !== "completed") {
          sendError(
            response,
            409,
            "booking_completion_required",
            "Payment capture requires a completed booking",
          );
          return;
        }

        const idempotencyKey = getPaymentIdempotencyKey(request);
        const idempotentPayment = await getIdempotentPaymentForOperation(options.repositories, {
          operation: "capture",
          bookingId: payment.bookingId,
          idempotencyKey,
        });

        if (idempotentPayment) {
          sendJson(response, 200, { data: idempotentPayment });
          return;
        }

        let providerResult: PaymentProviderResult | undefined;
        let capturedPayment: PaymentIntent;

        try {
          assertPaymentTransition(payment.status, "captured");
          providerResult = await paymentProvider.capture(payment);
          capturedPayment = await options.repositories.payments.captureByBookingId(payment.bookingId);
        } catch (error) {
          await recordPaymentOperationFailure(options.repositories, {
            actor,
            requestId: requestContext.requestId,
            operation: "capture",
            payment,
            providerResult,
            idempotencyKey,
            error,
            metadata: {
              source: "payment_capture_request",
              bookingStatus: booking.status,
            },
          });
          throw error;
        }

        await recordPaymentAudit(
          options.repositories,
          actor,
          requestContext.requestId,
          "payment.captured",
          capturedPayment,
          providerResult,
        );
        await recordPaymentOperation(options.repositories, {
          actor,
          requestId: requestContext.requestId,
          operation: "capture",
          payment: capturedPayment,
          providerResult,
          idempotencyKey,
          metadata: {
            source: "payment_capture_request",
          },
        });

        sendJson(response, 200, { data: capturedPayment });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          sendPaymentError(response, error, "Payment capture request could not be processed");
        }
      }

      return;
    }

    if (request.method === "POST" && paymentRefundMatch) {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertInternalPermission(actor, "finance_write");
        const paymentIntentId = paymentRefundMatch[1];

        if (!paymentIntentId) {
          sendError(response, 404, "payment_intent_not_found", "Payment intent does not exist");
          return;
        }

        const payment = await options.repositories.payments.get(paymentIntentId);

        if (!payment) {
          sendError(response, 404, "payment_intent_not_found", "Payment intent does not exist");
          return;
        }

        const idempotencyKey = getPaymentIdempotencyKey(request);
        const idempotentPayment = await getIdempotentPaymentForOperation(options.repositories, {
          operation: "refund",
          bookingId: payment.bookingId,
          idempotencyKey,
        });

        if (idempotentPayment) {
          sendJson(response, 200, { data: idempotentPayment });
          return;
        }

        let providerResult: PaymentProviderResult | undefined;
        let refundedPayment: PaymentIntent;

        try {
          assertPaymentTransition(payment.status, "refunded");
          providerResult = await paymentProvider.refund(payment);
          refundedPayment = await options.repositories.payments.refund(paymentIntentId);
        } catch (error) {
          await recordPaymentOperationFailure(options.repositories, {
            actor,
            requestId: requestContext.requestId,
            operation: "refund",
            payment,
            providerResult,
            idempotencyKey,
            error,
            metadata: {
              source: "payment_refund_request",
            },
          });
          throw error;
        }

        await recordPaymentAudit(
          options.repositories,
          actor,
          requestContext.requestId,
          "payment.refunded",
          refundedPayment,
          providerResult,
        );
        await recordPaymentOperation(options.repositories, {
          actor,
          requestId: requestContext.requestId,
          operation: "refund",
          payment: refundedPayment,
          providerResult,
          idempotencyKey,
          metadata: {
            source: "payment_refund_request",
          },
        });

        sendJson(response, 200, { data: refundedPayment });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          sendPaymentError(response, error, "Payment refund request could not be processed");
        }
      }

      return;
    }

    const bookingStatusMatch = requestUrl.pathname.match(/^\/v1\/bookings\/([^/]+)\/status$/);
    const bookingExecutionMatch = requestUrl.pathname.match(/^\/v1\/bookings\/([^/]+)\/execution$/);
    const bookingConsentMatch = requestUrl.pathname.match(/^\/v1\/bookings\/([^/]+)\/consents$/);
    const bookingHandoverMatch = requestUrl.pathname.match(/^\/v1\/bookings\/([^/]+)\/handovers$/);
    const bookingEvidenceMatch = requestUrl.pathname.match(/^\/v1\/bookings\/([^/]+)\/evidence$/);
    const bookingEvidenceFileMatch = requestUrl.pathname.match(/^\/v1\/bookings\/([^/]+)\/evidence-file$/);
    const bookingExceptionMatch = requestUrl.pathname.match(/^\/v1\/bookings\/([^/]+)\/exception$/);
    const bookingCancelMatch = requestUrl.pathname.match(/^\/v1\/bookings\/([^/]+)\/cancel$/);
    const bookingPartnerDecisionMatch = requestUrl.pathname.match(/^\/v1\/bookings\/([^/]+)\/partner-decision$/);
    const availabilityUpdateMatch = requestUrl.pathname.match(/^\/v1\/partner\/availability\/([^/]+)$/);

    if (request.method === "PATCH" && availabilityUpdateMatch) {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertPartnerOrInternal(actor);
        const slotId = availabilityUpdateMatch[1];

        if (!slotId) {
          sendError(response, 404, "availability_slot_not_found", "Availability slot does not exist");
          return;
        }

        const input = await readJsonBody<UpdateAvailabilitySlotRequest>(request);
        const errors = validateUpdateAvailabilitySlot(input);

        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Availability update payload is invalid", errors);
          return;
        }

        const existingSlot = await options.repositories.availability.get(slotId);

        if (!existingSlot) {
          sendError(response, 404, "availability_slot_not_found", "Availability slot does not exist");
          return;
        }

        await assertPartnerLocationAccess(options.repositories, actor, existingSlot.partnerLocationId, "operations_write");
        const slot = await options.repositories.availability.update(slotId, input);

        await options.repositories.audit.record({
          actor,
          action: "availability_slot.updated",
          resourceType: "availability_slot",
          resourceId: slot.id,
          requestId: requestContext.requestId,
          metadata: {
            partnerLocationId: slot.partnerLocationId,
            capacity: slot.capacity,
            serviceCodes: slot.serviceCodes,
            closedAt: slot.closedAt ?? null,
          },
        });

        sendJson(response, 200, { data: slot });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          const message = error instanceof Error ? error.message : "unknown_error";

          if (message === "availability_slot_not_found") {
            sendError(response, 404, message, "Availability slot does not exist");
            return;
          }

          sendError(response, 400, "invalid_request", "Availability update request could not be processed", message);
        }
      }

      return;
    }

    if ((request.method === "GET" || request.method === "POST") && bookingConsentMatch) {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        const bookingId = bookingConsentMatch[1];

        if (!bookingId) {
          sendError(response, 404, "booking_not_found", "Booking does not exist");
          return;
        }

        const booking = await options.repositories.bookings.get(bookingId);

        if (!booking) {
          sendError(response, 404, "booking_not_found", "Booking does not exist");
          return;
        }

        assertOwnerAccess(actor, booking.ownerId);

        if (request.method === "GET") {
          sendJson(response, 200, { data: await options.repositories.bookingConsents.list(booking.id) });
          return;
        }

        const input = await readJsonBody<CreateBookingConsentRequest>(request);
        const errors = validateCreateBookingConsent(input);

        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Booking consent payload is invalid", errors);
          return;
        }

        const consent = await options.repositories.bookingConsents.create({
          bookingId: booking.id,
          ownerId: booking.ownerId,
          acceptedByUserId: actor.userId,
          consentType: input.consentType,
          termsVersion: input.termsVersion,
          ...(input.acceptedText ? { acceptedText: input.acceptedText } : {}),
        });

        await options.repositories.audit.record({
          actor,
          action: "booking.consent_recorded",
          resourceType: "booking_consent",
          resourceId: consent.id,
          requestId: requestContext.requestId,
          metadata: {
            bookingId: booking.id,
            ownerId: booking.ownerId,
            consentType: consent.consentType,
            termsVersion: consent.termsVersion,
            onsiteServiceMode: booking.onsiteServiceMode,
          },
        });

        sendJson(response, 201, { data: consent });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          sendError(response, 400, "invalid_request", "Booking consent request could not be processed", String(error));
        }
      }

      return;
    }

    if ((request.method === "GET" || request.method === "POST") && bookingHandoverMatch) {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        const bookingId = bookingHandoverMatch[1];

        if (!bookingId) {
          sendError(response, 404, "booking_not_found", "Booking does not exist");
          return;
        }

        const booking = await options.repositories.bookings.get(bookingId);

        if (!booking) {
          sendError(response, 404, "booking_not_found", "Booking does not exist");
          return;
        }

        if (request.method === "GET" && actor.role === "customer") {
          assertOwnerAccess(actor, booking.ownerId);
          sendJson(response, 200, { data: await options.repositories.bookingHandovers.list(booking.id) });
          return;
        }

        assertPartnerOrInternal(actor);
        await assertPartnerBookingAccess(
          options.repositories,
          actor,
          booking,
          request.method === "GET" ? "operations_read" : "operations_write",
        );

        if (request.method === "GET") {
          sendJson(response, 200, { data: await options.repositories.bookingHandovers.list(booking.id) });
          return;
        }

        const input = await readJsonBody<CreateBookingHandoverRequest>(request);
        const errors = validateCreateBookingHandover(input);

        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Booking handover payload is invalid", errors);
          return;
        }

        const handover = await options.repositories.bookingHandovers.create({
          bookingId: booking.id,
          actor,
          handoverType: input.handoverType,
          contactName: input.contactName,
          locationNotes: input.locationNotes,
          ...(input.keyHandoverMethod ? { keyHandoverMethod: input.keyHandoverMethod } : {}),
          ...(input.odometerReading ? { odometerReading: input.odometerReading } : {}),
          ...(input.fuelOrChargeLevel ? { fuelOrChargeLevel: input.fuelOrChargeLevel } : {}),
          ...(input.conditionNotes ? { conditionNotes: input.conditionNotes } : {}),
          ...(input.acknowledgedBy ? { acknowledgedBy: input.acknowledgedBy } : {}),
        });

        await options.repositories.audit.record({
          actor,
          action: "booking.handover_recorded",
          resourceType: "booking_handover",
          resourceId: handover.id,
          requestId: requestContext.requestId,
          metadata: {
            bookingId: booking.id,
            handoverType: handover.handoverType,
            partnerLocationId: booking.partnerLocationId,
            onsiteServiceMode: booking.onsiteServiceMode,
          },
        });

        sendJson(response, 201, { data: handover });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          const message = error instanceof Error ? error.message : "unknown_error";

          if (message === "partner_booking_forbidden") {
            sendError(response, 403, message, "Partner cannot access this booking");
            return;
          }

          sendError(response, 400, "invalid_request", "Booking handover request could not be processed", message);
        }
      }

      return;
    }

    if (request.method === "POST" && bookingEvidenceFileMatch) {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertPartnerOrInternal(actor);
        const bookingId = bookingEvidenceFileMatch[1];

        if (!bookingId) {
          sendError(response, 404, "booking_not_found", "Booking does not exist");
          return;
        }

        const booking = await options.repositories.bookings.get(bookingId);

        if (!booking) {
          sendError(response, 404, "booking_not_found", "Booking does not exist");
          return;
        }

        await assertPartnerBookingAccess(options.repositories, actor, booking);

        const evidenceType = requestUrl.searchParams.get("evidenceType") ?? undefined;
        const notes = requestUrl.searchParams.get("notes")?.trim() || undefined;
        const fileName = requestUrl.searchParams.get("fileName")?.trim() || undefined;
        const contentType = getHeaderValue(request.headers["content-type"])?.split(";")[0]?.trim().toLowerCase();
        const body = await readRawBody(request, maxEvidenceUploadBytes);
        const errors = validateEvidenceUploadInput({
          byteLength: body.byteLength,
          ...(evidenceType ? { evidenceType } : {}),
          ...(contentType ? { contentType } : {}),
        });

        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Booking evidence file upload is invalid", errors);
          return;
        }

        const stored = await evidenceStorageProvider.store({
          bookingId: booking.id,
          ...(fileName ? { fileName } : {}),
          contentType: contentType ?? "application/octet-stream",
          body,
        });
        const evidence = await options.repositories.bookingEvidence.create({
          bookingId: booking.id,
          actor,
          evidenceType: evidenceType as NonNullable<CreateBookingEvidenceRequest["evidenceType"]>,
          storageKey: stored.storageKey,
          ...(stored.url ? { url: stored.url } : {}),
          ...(notes ? { notes } : {}),
        });

        await options.repositories.audit.record({
          actor,
          action: "booking.evidence_file_uploaded",
          resourceType: "booking_evidence",
          resourceId: evidence.id,
          requestId: requestContext.requestId,
          metadata: {
            bookingId: booking.id,
            evidenceType: evidence.evidenceType,
            partnerLocationId: booking.partnerLocationId,
            contentType,
            byteLength: body.byteLength,
            storageKey: stored.storageKey,
          },
        });

        sendJson(response, 201, { data: evidence });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          const message = error instanceof Error ? error.message : "unknown_error";

          if (message === "request_body_too_large") {
            sendError(response, 413, message, "Evidence file is too large");
            return;
          }

          if (message === "partner_booking_forbidden") {
            sendError(response, 403, message, "Partner cannot access this booking");
            return;
          }

          sendError(response, 400, "invalid_request", "Booking evidence file upload could not be processed", message);
        }
      }

      return;
    }

    if ((request.method === "GET" || request.method === "POST") && bookingEvidenceMatch) {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertPartnerOrInternal(actor);
        const bookingId = bookingEvidenceMatch[1];

        if (!bookingId) {
          sendError(response, 404, "booking_not_found", "Booking does not exist");
          return;
        }

        const booking = await options.repositories.bookings.get(bookingId);

        if (!booking) {
          sendError(response, 404, "booking_not_found", "Booking does not exist");
          return;
        }

        await assertPartnerBookingAccess(
          options.repositories,
          actor,
          booking,
          request.method === "GET" ? "operations_read" : "operations_write",
        );

        if (request.method === "GET") {
          sendJson(response, 200, { data: await options.repositories.bookingEvidence.list(booking.id) });
          return;
        }

        const input = await readJsonBody<CreateBookingEvidenceRequest>(request);
        const errors = validateCreateBookingEvidence(input);

        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Booking evidence payload is invalid", errors);
          return;
        }

        const evidence = await options.repositories.bookingEvidence.create({
          bookingId: booking.id,
          actor,
          evidenceType: input.evidenceType,
          ...(input.storageKey ? { storageKey: input.storageKey } : {}),
          ...(input.url ? { url: input.url } : {}),
          ...(input.notes ? { notes: input.notes } : {}),
        });

        await options.repositories.audit.record({
          actor,
          action: "booking.evidence_added",
          resourceType: "booking_evidence",
          resourceId: evidence.id,
          requestId: requestContext.requestId,
          metadata: {
            bookingId: booking.id,
            evidenceType: evidence.evidenceType,
            partnerLocationId: booking.partnerLocationId,
            hasStorageKey: Boolean(evidence.storageKey),
            hasUrl: Boolean(evidence.url),
          },
        });

        sendJson(response, 201, { data: evidence });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          const message = error instanceof Error ? error.message : "unknown_error";

          if (message === "partner_booking_forbidden") {
            sendError(response, 403, message, "Partner cannot access this booking");
            return;
          }

          sendError(response, 400, "invalid_request", "Booking evidence request could not be processed", message);
        }
      }

      return;
    }

    if (request.method === "POST" && bookingCancelMatch) {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        const bookingId = bookingCancelMatch[1];

        if (!bookingId) {
          sendError(response, 404, "booking_not_found", "Booking does not exist");
          return;
        }

        const input = await readOptionalJsonBody<CancelBookingRequest>(request);
        const booking = await options.repositories.bookings.get(bookingId);

        if (!booking) {
          sendError(response, 404, "booking_not_found", "Booking does not exist");
          return;
        }

        if (actor.role === "customer") {
          assertOwnerAccess(actor, booking.ownerId);
        } else {
          assertPartnerOrInternal(actor);
        }

        const idempotencyKey = getPaymentIdempotencyKey(request);

        if (!canTransitionBookingStatus(booking.status, "cancelled")) {
          const idempotentVoidPayment = await getIdempotentPaymentForOperation(options.repositories, {
            operation: "void",
            bookingId: booking.id,
            idempotencyKey,
          });

          if (booking.status === "cancelled" && idempotentVoidPayment?.status === "voided") {
            sendJson(response, 200, { data: booking });
            return;
          }

          sendError(
            response,
            409,
            "booking_cannot_be_cancelled",
            `Cannot cancel booking from ${booking.status}`,
          );
          return;
        }

        const updatedBooking = await options.repositories.bookings.updateStatus(booking.id, "cancelled");
        const voidedPayment = await voidAuthorizedPaymentByBooking(
          options.repositories,
          paymentProvider,
          updatedBooking.id,
          {
            actor,
            requestId: requestContext.requestId,
            idempotencyKey,
            metadata: {
              source: "booking_cancel_request",
              bookingStatus: updatedBooking.status,
            },
          },
        );

        await options.repositories.audit.record({
          actor,
          action: "booking.cancelled",
          resourceType: "booking",
          resourceId: booking.id,
          requestId: requestContext.requestId,
          metadata: {
            fromStatus: booking.status,
            toStatus: updatedBooking.status,
            cancelledBy: actor.role,
            reason: input.reason ?? "not_provided",
            partnerLocationId: updatedBooking.partnerLocationId,
          },
        });

        if (voidedPayment) {
          await recordPaymentAudit(
            options.repositories,
            actor,
            requestContext.requestId,
            "payment.voided",
            voidedPayment.payment,
            voidedPayment.providerResult,
          );
        }

        await recordProductEvent(options.repositories, {
          ownerId: updatedBooking.ownerId,
          name: "booking_cancelled",
          resourceType: "booking",
          resourceId: updatedBooking.id,
          metadata: {
            cancelledBy: actor.role,
            reason: input.reason ?? "not_provided",
          },
        });

        sendJson(response, 200, { data: updatedBooking });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          sendError(response, 400, "invalid_request", "Booking cancellation request could not be processed", String(error));
        }
      }

      return;
    }

    if (request.method === "PATCH" && bookingExecutionMatch) {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertPartnerOrInternal(actor);
        const bookingId = bookingExecutionMatch[1];

        if (!bookingId) {
          sendError(response, 404, "booking_not_found", "Booking does not exist");
          return;
        }

        const input = await readJsonBody<UpdateBookingExecutionRequest>(request);
        const errors = validateUpdateBookingExecution(input);

        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Booking execution payload is invalid", errors);
          return;
        }

        const booking = await options.repositories.bookings.get(bookingId);

        if (!booking) {
          sendError(response, 404, "booking_not_found", "Booking does not exist");
          return;
        }

        await assertPartnerBookingAccess(options.repositories, actor, booking);
        const now = new Date().toISOString();
        const updatedBooking = await options.repositories.bookings.updateExecution(booking.id, {
          ...(input.onsiteServiceMode !== undefined ? { onsiteServiceMode: input.onsiteServiceMode } : {}),
          ...(input.valetRequested !== undefined ? { valetRequested: input.valetRequested } : {}),
          ...(input.executionNotes !== undefined ? { executionNotes: input.executionNotes.trim() } : {}),
          ...(input.assignedTechnicianName !== undefined
            ? { assignedTechnicianName: input.assignedTechnicianName.trim() }
            : {}),
          ...(input.completionNotes !== undefined ? { completionNotes: input.completionNotes.trim() } : {}),
          ...(input.beforeServicePhotoUrls !== undefined
            ? { beforeServicePhotoUrls: input.beforeServicePhotoUrls.map((url) => url.trim()) }
            : {}),
          ...(input.afterServicePhotoUrls !== undefined
            ? { afterServicePhotoUrls: input.afterServicePhotoUrls.map((url) => url.trim()) }
            : {}),
          ...(input.technicianCheckedIn ? { technicianCheckedInAt: booking.technicianCheckedInAt ?? now } : {}),
          ...(input.technicianCheckedOut ? { technicianCheckedOutAt: booking.technicianCheckedOutAt ?? now } : {}),
        });

        await options.repositories.audit.record({
          actor,
          action: "booking.execution_updated",
          resourceType: "booking",
          resourceId: booking.id,
          requestId: requestContext.requestId,
          metadata: {
            partnerLocationId: updatedBooking.partnerLocationId,
            onsiteServiceMode: updatedBooking.onsiteServiceMode ?? null,
            valetRequested: updatedBooking.valetRequested,
            assignedTechnicianName: updatedBooking.assignedTechnicianName ?? null,
            completionNotesPresent: Boolean(updatedBooking.completionNotes),
            beforeEvidenceCount: updatedBooking.beforeServicePhotoUrls?.length ?? 0,
            afterEvidenceCount: updatedBooking.afterServicePhotoUrls?.length ?? 0,
            technicianCheckedInAt: updatedBooking.technicianCheckedInAt ?? null,
            technicianCheckedOutAt: updatedBooking.technicianCheckedOutAt ?? null,
          },
        });

        sendJson(response, 200, { data: updatedBooking });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          sendError(response, 400, "invalid_request", "Booking execution request could not be processed", String(error));
        }
      }

      return;
    }

    if (request.method === "PATCH" && bookingExceptionMatch) {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertPartnerOrInternal(actor);
        const bookingId = bookingExceptionMatch[1];

        if (!bookingId) {
          sendError(response, 404, "booking_not_found", "Booking does not exist");
          return;
        }

        const input = await readJsonBody<UpdateBookingOperationalExceptionRequest>(request);
        const errors = validateUpdateBookingOperationalException(input);

        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Booking exception payload is invalid", errors);
          return;
        }

        const booking = await options.repositories.bookings.get(bookingId);

        if (!booking) {
          sendError(response, 404, "booking_not_found", "Booking does not exist");
          return;
        }

        await assertPartnerBookingAccess(options.repositories, actor, booking);
        const now = new Date().toISOString();
        const updatedBooking = await options.repositories.bookings.updateOperationalException(booking.id, {
          resolved: input.resolved === true,
          ...(input.resolved === true ? { resolvedAt: now } : {}),
          ...(input.code ? { code: input.code } : {}),
          ...(input.notes ? { notes: input.notes.trim() } : {}),
          ...(input.resolved === true ? {} : { reportedAt: booking.operationalExceptionReportedAt ?? now }),
        });
        let thread: CommunicationThread | undefined;

        if (input.resolved !== true) {
          thread = await options.repositories.communications.create({
            type: "partner_to_owner",
            resourceType: "booking",
            resourceId: booking.id,
            subject: `Booking ${booking.id.slice(-8).toUpperCase()} operational exception`,
            actor,
            initialMessage: `Operational exception: ${input.code}. ${input.notes?.trim() ?? ""}`,
          });
        }

        await options.repositories.audit.record({
          actor,
          action: input.resolved === true ? "booking.exception_resolved" : "booking.exception_reported",
          resourceType: "booking",
          resourceId: booking.id,
          requestId: requestContext.requestId,
          metadata: {
            partnerLocationId: updatedBooking.partnerLocationId,
            exceptionCode: input.resolved === true ? booking.operationalExceptionCode ?? null : updatedBooking.operationalExceptionCode ?? null,
            threadId: thread?.id,
          },
        });

        sendJson(response, 200, { data: { booking: updatedBooking, ...(thread ? { thread } : {}) } });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          const message = error instanceof Error ? error.message : "unknown_error";

          if (message === "partner_booking_forbidden") {
            sendError(response, 403, message, "Partner is not allowed to manage this booking");
            return;
          }

          sendError(response, 400, "invalid_request", "Booking exception request could not be processed", message);
        }
      }

      return;
    }

    if (request.method === "POST" && bookingPartnerDecisionMatch) {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertPartnerOrInternal(actor);
        const bookingId = bookingPartnerDecisionMatch[1];

        if (!bookingId) {
          sendError(response, 404, "booking_not_found", "Booking does not exist");
          return;
        }

        const input = await readJsonBody<PartnerBookingDecisionRequest>(request);
        const errors = validatePartnerBookingDecision(input);

        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Partner decision payload is invalid", errors);
          return;
        }

        const booking = await options.repositories.bookings.get(bookingId);

        if (!booking) {
          sendError(response, 404, "booking_not_found", "Booking does not exist");
          return;
        }

        await assertPartnerBookingAccess(options.repositories, actor, booking);

        if (input.decision === "accept") {
          if (booking.operationalExceptionCode) {
            sendError(
              response,
              409,
              "booking_operational_exception_active",
              "Resolve the active operational exception before accepting this booking",
            );
            return;
          }

          if (!canTransitionBookingStatus(booking.status, "confirmed")) {
            sendError(response, 409, "invalid_booking_status_transition", `Cannot accept booking from ${booking.status}`);
            return;
          }

          const payment = await options.repositories.payments.getByBookingId(booking.id);

          if (!payment || payment.status !== "authorized") {
            sendError(
              response,
              409,
              "payment_authorization_required",
              "Booking requires an authorized payment before partner acceptance",
            );
            return;
          }

          const updatedBooking = await options.repositories.bookings.updateStatus(booking.id, "confirmed");
          await options.repositories.audit.record({
            actor,
            action: "booking.partner_decision",
            resourceType: "booking",
            resourceId: booking.id,
            requestId: requestContext.requestId,
            metadata: {
              decision: input.decision,
              fromStatus: booking.status,
              toStatus: updatedBooking.status,
              partnerLocationId: updatedBooking.partnerLocationId,
              onsiteServiceMode: updatedBooking.onsiteServiceMode,
            },
          });

          sendJson(response, 200, { data: { booking: updatedBooking } });
          return;
        }

        if (input.decision === "request_clarification") {
          const message = input.message?.trim();
          const thread = await options.repositories.communications.create({
            type: "partner_to_owner",
            resourceType: "booking",
            resourceId: booking.id,
            subject: `Booking ${booking.id.slice(-8).toUpperCase()} clarification`,
            actor,
            ...(message ? { initialMessage: message } : {}),
          });
          await options.repositories.audit.record({
            actor,
            action: "booking.partner_decision",
            resourceType: "booking",
            resourceId: booking.id,
            requestId: requestContext.requestId,
            metadata: {
              decision: input.decision,
              threadId: thread.id,
              partnerLocationId: booking.partnerLocationId,
              onsiteServiceMode: booking.onsiteServiceMode,
            },
          });

          sendJson(response, 200, { data: { booking, thread } });
          return;
        }

        if (!canTransitionBookingStatus(booking.status, "cancelled")) {
          sendError(response, 409, "booking_cannot_be_cancelled", `Cannot reject booking from ${booking.status}`);
          return;
        }

        const message = input.message?.trim();
        const thread = await options.repositories.communications.create({
          type: "partner_to_owner",
          resourceType: "booking",
          resourceId: booking.id,
          subject: `Booking ${booking.id.slice(-8).toUpperCase()} mode unavailable`,
          actor,
          ...(message ? { initialMessage: message } : {}),
        });
        const updatedBooking = await options.repositories.bookings.updateStatus(booking.id, "cancelled");
        const voidedPayment = await voidAuthorizedPaymentByBooking(options.repositories, paymentProvider, updatedBooking.id, {
          actor,
          requestId: requestContext.requestId,
          idempotencyKey: getPaymentIdempotencyKey(request),
          metadata: {
            source: "booking_status_cancelled",
            bookingStatus: updatedBooking.status,
          },
        });

        await options.repositories.audit.record({
          actor,
          action: "booking.partner_decision",
          resourceType: "booking",
          resourceId: booking.id,
          requestId: requestContext.requestId,
          metadata: {
            decision: input.decision,
            fromStatus: booking.status,
            toStatus: updatedBooking.status,
            threadId: thread.id,
            partnerLocationId: updatedBooking.partnerLocationId,
            onsiteServiceMode: updatedBooking.onsiteServiceMode,
          },
        });

        if (voidedPayment) {
          await recordPaymentAudit(
            options.repositories,
            actor,
            requestContext.requestId,
            "payment.voided",
            voidedPayment.payment,
            voidedPayment.providerResult,
          );
        }

        await recordProductEvent(options.repositories, {
          ownerId: updatedBooking.ownerId,
          name: "booking_cancelled",
          resourceType: "booking",
          resourceId: updatedBooking.id,
          metadata: {
            cancelledBy: actor.role,
            reason: "partner_rejected_service_mode",
            onsiteServiceMode: updatedBooking.onsiteServiceMode,
          },
        });

        sendJson(response, 200, { data: { booking: updatedBooking, thread } });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          const message = error instanceof Error ? error.message : "unknown_error";

          if (message === "partner_booking_forbidden") {
            sendError(response, 403, message, "Partner is not allowed to manage this booking");
            return;
          }

          sendError(response, 400, "invalid_request", "Partner decision request could not be processed", message);
        }
      }

      return;
    }

    if (request.method === "PATCH" && bookingStatusMatch) {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        assertPartnerOrInternal(actor);
        const bookingId = bookingStatusMatch[1];

        if (!bookingId) {
          sendError(response, 404, "booking_not_found", "Booking does not exist");
          return;
        }

        const input = await readJsonBody<UpdateBookingStatusRequest>(request);
        const errors = validateUpdateBookingStatus(input);

        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Booking status payload is invalid", errors);
          return;
        }

        let booking = await options.repositories.bookings.get(bookingId);

        if (!booking) {
          sendError(response, 404, "booking_not_found", "Booking does not exist");
          return;
        }

        await assertPartnerBookingAccess(options.repositories, actor, booking);
        if (!canTransitionBookingStatus(booking.status, input.status)) {
          sendError(
            response,
            409,
            "invalid_booking_status_transition",
            `Cannot transition booking from ${booking.status} to ${input.status}`,
          );
          return;
        }

        if (input.status !== "cancelled" && booking.operationalExceptionCode) {
          sendError(
            response,
            409,
            "booking_operational_exception_active",
            "Resolve the active operational exception before moving this booking forward",
          );
          return;
        }

        if (input.status === "confirmed") {
          const payment = await options.repositories.payments.getByBookingId(booking.id);

          if (!payment || payment.status !== "authorized") {
            sendError(
              response,
              409,
              "payment_authorization_required",
              "Booking requires an authorized payment before partner confirmation",
            );
            return;
          }
        }

        if (input.status === "checked_in" && !booking.technicianCheckedInAt) {
          const checkedInAt = new Date().toISOString();
          booking = await options.repositories.bookings.updateExecution(booking.id, {
            technicianCheckedInAt: checkedInAt,
          });

          await options.repositories.audit.record({
            actor,
            action: "booking.execution_updated",
            resourceType: "booking",
            resourceId: booking.id,
            requestId: requestContext.requestId,
            metadata: {
              partnerLocationId: booking.partnerLocationId,
              technicianCheckedInAt: checkedInAt,
              autoRecordedByStatusTransition: true,
            },
          });
        }

        let capturedPayment: { readonly payment: PaymentIntent; readonly providerResult: PaymentProviderResult } | undefined;

        if (input.status === "completed") {
          if (!booking.technicianCheckedInAt) {
            sendError(
              response,
              409,
              "technician_checkin_required",
              "Technician check-in is required before completing and capturing payment",
            );
            return;
          }

          if (!booking.technicianCheckedOutAt) {
            sendError(
              response,
              409,
              "technician_checkout_required",
              "Technician check-out is required before completing and capturing payment",
            );
            return;
          }

          if (!booking.assignedTechnicianName) {
            sendError(
              response,
              409,
              "technician_assignment_required",
              "Assign a technician before completing this booking",
            );
            return;
          }

          if (!booking.completionNotes?.trim()) {
            sendError(
              response,
              409,
              "completion_notes_required",
              "Completion notes are required before completing and capturing payment",
            );
            return;
          }

          const evidence = await options.repositories.bookingEvidence.list(booking.id);
          const hasBeforeEvidence = evidence.some((item) => item.evidenceType === "before");
          const hasAfterEvidence = evidence.some((item) => item.evidenceType === "after");

          if (!hasBeforeEvidence || !hasAfterEvidence) {
            sendError(
              response,
              409,
              "service_evidence_required",
              "Before and after service evidence is required before completing and capturing payment",
            );
            return;
          }

          const handovers = await options.repositories.bookingHandovers.list(booking.id);
          const hasPickupHandover = handovers.some((item) => item.handoverType === "pickup");
          const hasReturnHandover = handovers.some((item) => item.handoverType === "return");
          const hasOnsiteReceipt = handovers.some((item) => item.handoverType === "onsite_receipt");
          const hasOnsiteRelease = handovers.some((item) => item.handoverType === "onsite_release");

          if (booking.onsiteServiceMode === "pickup_return" && (!hasPickupHandover || !hasReturnHandover)) {
            sendError(
              response,
              409,
              "handover_required",
              "Pickup and return handover records are required before completing a pickup-and-return booking",
            );
            return;
          }

          if (
            ["customer_property", "onsite"].includes(booking.onsiteServiceMode ?? "") &&
            (!hasOnsiteReceipt || !hasOnsiteRelease)
          ) {
            sendError(
              response,
              409,
              "handover_required",
              "Onsite receipt and release handover records are required before completing this booking",
            );
            return;
          }

          const payment = await options.repositories.payments.getByBookingId(booking.id);

          if (!payment || payment.status !== "authorized") {
            sendError(
              response,
              409,
              "payment_capture_required",
              "Booking requires an authorized payment before completion",
            );
            return;
          }

          assertPaymentTransition(payment.status, "captured");
          const providerResult = await paymentProvider.capture(payment);
          capturedPayment = {
            payment: await options.repositories.payments.captureByBookingId(booking.id),
            providerResult,
          };
        }

        const updatedBooking = await options.repositories.bookings.updateStatus(booking.id, input.status);

        await options.repositories.audit.record({
          actor,
          action: "booking.status_changed",
          resourceType: "booking",
          resourceId: booking.id,
          requestId: requestContext.requestId,
          metadata: {
            fromStatus: booking.status,
            toStatus: updatedBooking.status,
            partnerLocationId: updatedBooking.partnerLocationId,
          },
        });

        if (capturedPayment) {
          await recordPaymentAudit(
            options.repositories,
            actor,
            requestContext.requestId,
            "payment.captured",
            capturedPayment.payment,
            capturedPayment.providerResult,
          );
          await recordPaymentOperation(options.repositories, {
            actor,
            requestId: requestContext.requestId,
            operation: "capture",
            payment: capturedPayment.payment,
            providerResult: capturedPayment.providerResult,
            metadata: {
              source: "booking_completion",
              bookingStatus: updatedBooking.status,
            },
          });
        }

        const serviceRecord = await createServiceRecordIfCompleted(options.repositories, updatedBooking);

        if (serviceRecord) {
          await options.repositories.audit.record({
            actor,
            action: "service_record.created",
            resourceType: "service_record",
            resourceId: serviceRecord.id,
            requestId: requestContext.requestId,
            metadata: {
              bookingId: serviceRecord.bookingId,
              ownerId: serviceRecord.ownerId,
              vehicleId: serviceRecord.vehicleId,
              serviceCode: serviceRecord.serviceCode,
            },
          });

          await recordProductEvent(options.repositories, {
            ownerId: serviceRecord.ownerId,
            name: "service_completed",
            resourceType: "service_record",
            resourceId: serviceRecord.id,
            metadata: {
              bookingId: serviceRecord.bookingId,
              vehicleId: serviceRecord.vehicleId,
              serviceCode: serviceRecord.serviceCode,
            },
          });
        }

        sendJson(response, 200, { data: updatedBooking });
      } catch (error) {
        if (!sendAuthError(response, error)) {
          sendError(response, 400, "invalid_request", "Booking status request could not be processed", String(error));
        }
      }

      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/v1/bookings") {
      try {
        const actor = await requireActor(request, options.repositories.accessControl, options.repositories.auth);
        const input = await readJsonBody<CreateBookingRequest>(request);
        const errors = validateCreateBooking(input);

        if (errors.length > 0) {
          sendError(response, 400, "validation_failed", "Booking payload is invalid", errors);
          return;
        }

        if (input.ownerId) {
          assertOwnerAccess(actor, input.ownerId);
        }

        const ownerId = input.ownerId ?? actor.userId;
        const vehicle = await options.repositories.vehicles.get(input.vehicleId);

        if (!vehicle) {
          sendError(response, 404, "vehicle_not_found", "Vehicle does not exist");
          return;
        }

        assertOwnerAccess(actor, vehicle.ownerId);

        if (vehicle.ownerId !== ownerId) {
          sendError(response, 409, "vehicle_owner_mismatch", "Vehicle does not belong to the requested owner");
          return;
        }

        let availabilitySlotId = input.availabilitySlotId;
        let consumedHold: BookingHold | undefined;

        if (input.holdId) {
          const hold = await options.repositories.bookingHolds.get(input.holdId);

          if (!hold) {
            sendError(response, 404, "booking_hold_not_found", "Booking hold does not exist");
            return;
          }

          assertOwnerAccess(actor, hold.ownerId);

          if (hold.status !== "active" || new Date(hold.expiresAt).getTime() <= Date.now()) {
            sendError(response, 409, "booking_hold_expired", "Booking hold is no longer active");
            return;
          }

          if (hold.vehicleId !== input.vehicleId || hold.serviceCode !== input.serviceCode || hold.ownerId !== ownerId) {
            sendError(response, 409, "booking_hold_mismatch", "Booking hold does not match this booking request");
            return;
          }

          const partner = await options.repositories.partners.get(hold.partnerLocationId);

          if (!partner) {
            sendError(response, 404, "partner_not_found", "Partner location does not exist");
            return;
          }

          const date = getDateInTimeZone(hold.startsAt, partner.timezone);
          const config = await options.repositories.scheduling.get(hold.partnerLocationId);
          const bookings = await options.repositories.bookings.list();
          const holds = await options.repositories.bookingHolds.listActive({
            partnerLocationId: hold.partnerLocationId,
            serviceCode: hold.serviceCode,
            date,
            excludeHoldId: hold.id,
          });
          const search = buildDynamicAvailabilitySearch({
            partnerLocationId: hold.partnerLocationId,
            serviceCode: hold.serviceCode,
            date,
            timezone: partner.timezone,
            config,
            bookings,
            holds,
          });
          const matchedSlot = search.slots.find((slot) => sameInstant(slot.startsAt, hold.startsAt));

          if (!matchedSlot) {
            await options.repositories.bookingHolds.updateStatus(hold.id, "expired");
            sendError(response, 409, "slot_unavailable", "Held appointment time is no longer available");
            return;
          }

          const slot = await options.repositories.availability.create({
            partnerLocationId: hold.partnerLocationId,
            startsAt: hold.startsAt,
            endsAt: hold.endsAt,
            capacity: matchedSlot.capacity,
            serviceCodes: [hold.serviceCode],
          });
          availabilitySlotId = slot.id;
          consumedHold = hold;
        }

        if (!availabilitySlotId && !input.primaWashDayId) {
          sendError(response, 400, "validation_failed", "availabilitySlotId, holdId, or primaWashDayId is required");
          return;
        }

        const booking = await options.repositories.bookings.create({
          ownerId,
          vehicleId: input.vehicleId,
          serviceCode: input.serviceCode,
          ...(availabilitySlotId ? { availabilitySlotId } : {}),
          ...(input.primaWashDayId ? { primaWashDayId: input.primaWashDayId } : {}),
          ...(input.holdId ? { holdId: input.holdId } : {}),
          ...(input.onsiteServiceMode ? { onsiteServiceMode: input.onsiteServiceMode } : {}),
          ...(input.executionNotes ? { executionNotes: input.executionNotes.trim() } : {}),
        });

        if (consumedHold) {
          await options.repositories.bookingHolds.updateStatus(consumedHold.id, "consumed");
        }

        await options.repositories.audit.record({
          actor,
          action: "booking.created",
          resourceType: "booking",
          resourceId: booking.id,
          requestId: requestContext.requestId,
          metadata: {
            ownerId: booking.ownerId,
            vehicleId: booking.vehicleId,
            partnerLocationId: booking.partnerLocationId,
            primaWashDayId: booking.primaWashDayId,
            serviceCode: booking.serviceCode,
            onsiteServiceMode: booking.onsiteServiceMode,
            valetRequested: booking.valetRequested,
            executionNotes: booking.executionNotes,
            acceptedPrice: booking.acceptedPrice,
          },
        });

        await recordProductEvent(options.repositories, {
          ownerId: booking.ownerId,
          name: "booking_created",
          resourceType: "booking",
          resourceId: booking.id,
          metadata: {
            vehicleId: booking.vehicleId,
            primaWashDayId: booking.primaWashDayId,
            serviceCode: booking.serviceCode,
            onsiteServiceMode: booking.onsiteServiceMode,
            valetRequested: booking.valetRequested,
            executionNotes: booking.executionNotes,
            acceptedPrice: booking.acceptedPrice,
          },
        });

        sendJson(response, 201, { data: booking });
      } catch (error) {
        if (sendAuthError(response, error)) {
          return;
        }

        const message = error instanceof Error ? error.message : "unknown_error";

        if (message === "availability_slot_not_found") {
          sendError(response, 404, message, "Availability slot does not exist");
          return;
        }

        if (message === "service_not_available_for_slot") {
          sendError(response, 409, message, "Requested service is not available for the selected slot");
          return;
        }

        if (message === "availability_slot_closed") {
          sendError(response, 409, message, "Selected availability slot is closed");
          return;
        }

        if (message === "availability_slot_full") {
          sendError(response, 409, message, "Selected availability slot is at capacity");
          return;
        }

        if (message === "prima_wash_day_not_found") {
          sendError(response, 404, message, "Prima Wash Day does not exist");
          return;
        }

        if (message === "service_not_available_for_prima_wash_day") {
          sendError(response, 409, message, "Requested service is not available for the selected Prima Wash Day");
          return;
        }

        if (message === "prima_wash_day_unavailable") {
          sendError(response, 409, message, "Selected Prima Wash Day is no longer available");
          return;
        }

        if (message === "prima_wash_day_partner_required") {
          sendError(response, 409, message, "Selected Prima Wash Day needs an assigned partner before booking");
          return;
        }

        if (message === "prima_wash_day_full") {
          sendError(response, 409, message, "Selected Prima Wash Day is at capacity");
          return;
        }

        sendError(response, 400, "invalid_request", "Booking request could not be processed", message);
      }

      return;
    }

    sendError(response, 404, "not_found", "Route not found");
  });
}

function localResidenceLabelForProperty(residenceType: ResidenceType): string {
  if (residenceType === "public_housing") {
    return "HDB / public housing";
  }

  if (residenceType === "landed") {
    return "Landed property";
  }

  if (residenceType === "commercial") {
    return "Commercial property";
  }

  return "Condominium";
}

function propertyMarketMode(residenceType: ResidenceType): "residence_partnership" | "open_marketplace" | "mobile_dispatch" | "fleet_or_corporate" {
  if (residenceType === "landed") {
    return "mobile_dispatch";
  }

  if (residenceType === "commercial") {
    return "fleet_or_corporate";
  }

  if (residenceType === "multi_unit_private" || residenceType === "public_housing") {
    return "residence_partnership";
  }

  return "open_marketplace";
}

function sendAuthError(response: Parameters<typeof sendError>[0], error: unknown): boolean {
  const message = error instanceof Error ? error.message : "unknown_error";

  if (message === "authentication_required") {
    sendError(response, 401, message, "Authentication is required");
    return true;
  }

  if (message === "forbidden_owner_scope") {
    sendError(response, 403, message, "Actor is not allowed to access this owner scope");
    return true;
  }

  if (message === "internal_role_required") {
    sendError(response, 403, message, "Internal role is required");
    return true;
  }

  if (message === "internal_permission_required") {
    sendError(response, 403, message, "The internal account is missing the required permission");
    return true;
  }

  if (message === "partner_role_required") {
    sendError(response, 403, message, "Partner or internal role is required");
    return true;
  }

  if (message === "property_manager_role_required") {
    sendError(response, 403, message, "Property manager role is required");
    return true;
  }

  if (message === "partner_location_forbidden") {
    sendError(response, 403, message, "Partner is not allowed to access this location");
    return true;
  }

  if (message === "partner_booking_forbidden") {
    sendError(response, 403, message, "Partner is not allowed to manage this booking");
    return true;
  }

  if (message === "partner_location_not_found") {
    sendError(response, 404, message, "Partner location does not exist");
    return true;
  }

  if (message === "forbidden_property_scope") {
    sendError(response, 403, message, "Actor is not allowed to access this property");
    return true;
  }

  if (message === "communication_thread_forbidden") {
    sendError(response, 403, message, "Actor is not allowed to access this communication thread");
    return true;
  }

  return false;
}

function normalizeResidenceType(value: string | null): ResidenceType {
  if (
    value === "multi_unit_private" ||
    value === "public_housing" ||
    value === "landed" ||
    value === "commercial" ||
    value === "other"
  ) {
    return value;
  }

  return "multi_unit_private";
}

function normalizeCommunicationResourceType(value: string | null): CommunicationResourceType | undefined {
  if (value === "property" || value === "booking" || value === "partner_location" || value === "owner") {
    return value;
  }

  return undefined;
}

function assertCommunicationTypeAccess(actor: Actor, type: CommunicationThreadType): void {
  if (actor.role === "internal") {
    return;
  }

  if (actor.role === "property_manager" && type === "prima_to_property") {
    return;
  }

  if (actor.role === "partner" && (type === "prima_to_partner" || type === "partner_to_owner")) {
    return;
  }

  if (actor.role === "customer" && (type === "prima_to_owner" || type === "partner_to_owner")) {
    return;
  }

  throw new Error("communication_thread_forbidden");
}

async function assertCommunicationResourceAccess(
  repositories: Repositories,
  actor: Actor,
  resourceType: CommunicationResourceType,
  resourceId: string,
): Promise<void> {
  if (actor.role === "internal") {
    return;
  }

  if (resourceType === "property") {
    assertPropertyManagerAccess(actor, resourceId);
    return;
  }

  if (resourceType === "owner") {
    assertOwnerAccess(actor, resourceId);
    return;
  }

  if (resourceType === "partner_location") {
    if (actor.role !== "partner") {
      throw new Error("communication_thread_forbidden");
    }

    const partner = await repositories.partners.get(resourceId);

    if (!partner || partner.organizationId !== actor.organizationId) {
      throw new Error("communication_thread_forbidden");
    }

    return;
  }

  if (resourceType === "booking") {
    const booking = await repositories.bookings.get(resourceId);

    if (!booking) {
      throw new Error("booking_not_found");
    }

    if (actor.role === "customer") {
      assertOwnerAccess(actor, booking.ownerId);
      return;
    }

    if (actor.role === "partner") {
      const partner = await repositories.partners.get(booking.partnerLocationId);

      if (partner?.organizationId === actor.organizationId) {
        return;
      }
    }

    throw new Error("communication_thread_forbidden");
  }
}

async function canAccessCommunicationThread(
  repositories: Repositories,
  actor: Actor,
  thread: CommunicationThread,
): Promise<boolean> {
  try {
    assertCommunicationTypeAccess(actor, thread.type);
    await assertCommunicationResourceAccess(repositories, actor, thread.resourceType, thread.resourceId);
    return true;
  } catch {
    return false;
  }
}

async function assertPartnerBookingAccess(
  repositories: Repositories,
  actor: Actor,
  booking: Booking,
  internalPermission: Parameters<typeof assertInternalPermission>[1] = "operations_write",
): Promise<void> {
  if (actor.role === "internal") {
    assertInternalPermission(actor, internalPermission);
    return;
  }

  if (actor.role !== "partner") {
    throw new Error("partner_booking_forbidden");
  }

  const partner = await repositories.partners.get(booking.partnerLocationId);

  if (!partner || partner.organizationId !== actor.organizationId) {
    throw new Error("partner_booking_forbidden");
  }
}

async function assertPartnerLocationAccess(
  repositories: Repositories,
  actor: Actor,
  partnerLocationId: string,
  internalPermission: Parameters<typeof assertInternalPermission>[1],
): Promise<void> {
  const partner = await repositories.partners.get(partnerLocationId);

  if (!partner) {
    throw new Error("partner_location_not_found");
  }

  if (actor.role === "internal") {
    assertInternalPermission(actor, internalPermission);
    return;
  }

  if (actor.role !== "partner" || partner.organizationId !== actor.organizationId) {
    throw new Error("partner_location_forbidden");
  }
}

function sendAuthVerificationError(response: Parameters<typeof sendError>[0], error: unknown): void {
  const message = error instanceof Error ? error.message : "invalid_access_token";

  if (message === "invalid_auth_code") {
    sendError(response, 401, message, "The verification code is incorrect");
    return;
  }

  if (message === "auth_challenge_expired") {
    sendError(response, 410, message, "The verification code has expired");
    return;
  }

  if (message === "auth_challenge_locked") {
    sendError(response, 429, message, "Too many attempts. Request a new verification code");
    return;
  }

  sendError(response, 401, "invalid_access_token", "The session is invalid or expired");
}

function getBearerToken(request: Parameters<typeof requireActor>[0]): string {
  const authorization = request.headers.authorization;

  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
    throw new Error("invalid_access_token");
  }

  return authorization.slice("Bearer ".length);
}

function requestSource(request: Parameters<typeof requireActor>[0]): string {
  const forwardedFor = request.headers["x-forwarded-for"];
  const forwardedSource = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;

  if (forwardedSource) {
    return forwardedSource.split(",")[0]?.trim() || "unknown";
  }

  return request.socket.remoteAddress ?? "unknown";
}

function buildPartnerDashboard(
  partnerLocationId: string | undefined,
  bookings: readonly Booking[],
  auditEvents: PartnerDashboardResponse["auditEvents"],
  paymentByBookingId: ReadonlyMap<string, PaymentIntent>,
  vehicleById: ReadonlyMap<string, Vehicle>,
  partnerById: ReadonlyMap<string, PartnerLocation>,
  evidenceByBookingId: ReadonlyMap<string, BookingEvidenceSummary>,
  handoverByBookingId: ReadonlyMap<string, BookingHandoverSummary>,
): PartnerDashboardResponse {
  const locationBookings = partnerLocationId
    ? bookings.filter((booking) => booking.partnerLocationId === partnerLocationId)
    : bookings;
  const pendingPayment = locationBookings.filter((booking) => {
    const payment = paymentByBookingId.get(booking.id);
    return booking.status === "pending_payment" && payment?.status !== "authorized";
  }).length;
  const readyToConfirm = locationBookings.filter((booking) => {
    const payment = paymentByBookingId.get(booking.id);
    return booking.status === "pending_payment" && payment?.status === "authorized";
  }).length;
  const expectedRevenueMinor = locationBookings.reduce(
    (total, booking) => total + booking.acceptedPrice.amountMinor,
    0,
  );
  const authorizedRevenueMinor = locationBookings.reduce((total, booking) => {
    const payment = paymentByBookingId.get(booking.id);
    return payment?.status === "authorized" ? total + payment.amount.amountMinor : total;
  }, 0);
  const capturedRevenueMinor = locationBookings.reduce((total, booking) => {
    const payment = paymentByBookingId.get(booking.id);
    return payment?.status === "captured" ? total + payment.amount.amountMinor : total;
  }, 0);
  const atRiskRevenueMinor = locationBookings.reduce((total, booking) => {
    const payment = paymentByBookingId.get(booking.id);

    if (booking.status !== "pending_payment") {
      return total;
    }

    return payment?.status === "authorized" ? total : total + booking.acceptedPrice.amountMinor;
  }, 0);
  const uniqueOwners = new Set(locationBookings.map((booking) => booking.ownerId)).size;
  const queue = locationBookings
    .slice()
    .sort((a, b) => a.scheduledStartAt.localeCompare(b.scheduledStartAt))
    .slice(0, 8)
    .map((booking) => {
      const payment = paymentByBookingId.get(booking.id);
      const vehicle = vehicleById.get(booking.vehicleId);
      const partner = partnerById.get(booking.partnerLocationId);
      const evidenceSummary = evidenceByBookingId.get(booking.id) ?? emptyEvidenceSummary();
      const handoverSummary = handoverByBookingId.get(booking.id) ?? emptyHandoverSummary();

      return {
        bookingId: booking.id,
        ...(booking.primaWashDayId ? { primaWashDayId: booking.primaWashDayId } : {}),
        vehicleId: booking.vehicleId,
        ...(vehicle ? { vehicle: toPartnerQueueVehicleSummary(vehicle) } : {}),
        ownerId: booking.ownerId,
        ...(partner ? { partnerLocation: toPartnerQueueLocationSummary(partner) } : {}),
        serviceCode: booking.serviceCode,
        status: booking.status,
        ...(booking.onsiteServiceMode ? { onsiteServiceMode: booking.onsiteServiceMode } : {}),
        valetRequested: booking.valetRequested,
        ...(booking.executionNotes ? { executionNotes: booking.executionNotes } : {}),
        ...(booking.assignedTechnicianName ? { assignedTechnicianName: booking.assignedTechnicianName } : {}),
        ...(booking.completionNotes ? { completionNotes: booking.completionNotes } : {}),
        ...(booking.beforeServicePhotoUrls?.length ? { beforeServicePhotoUrls: booking.beforeServicePhotoUrls } : {}),
        ...(booking.afterServicePhotoUrls?.length ? { afterServicePhotoUrls: booking.afterServicePhotoUrls } : {}),
        evidenceSummary,
        handoverSummary,
        ...(booking.technicianCheckedInAt ? { technicianCheckedInAt: booking.technicianCheckedInAt } : {}),
        ...(booking.technicianCheckedOutAt ? { technicianCheckedOutAt: booking.technicianCheckedOutAt } : {}),
        ...(booking.operationalExceptionCode ? { operationalExceptionCode: booking.operationalExceptionCode } : {}),
        ...(booking.operationalExceptionNotes ? { operationalExceptionNotes: booking.operationalExceptionNotes } : {}),
        ...(booking.operationalExceptionReportedAt ? { operationalExceptionReportedAt: booking.operationalExceptionReportedAt } : {}),
        ...(booking.operationalExceptionResolvedAt ? { operationalExceptionResolvedAt: booking.operationalExceptionResolvedAt } : {}),
        ...(payment ? { paymentIntentId: payment.id, paymentStatus: payment.status, paymentAmount: payment.amount } : {}),
        actionHint: getPartnerActionHint(booking, payment),
        scheduledStartAt: booking.scheduledStartAt,
      };
    });

  return {
    partnerLocationId: partnerLocationId ?? "all_locations",
    generatedAt: new Date().toISOString(),
    metrics: [
      {
        label: "Bookings",
        value: String(locationBookings.length),
        delta: readyToConfirm > 0 ? `${readyToConfirm} ready to confirm` : `${pendingPayment} awaiting payment`,
      },
      {
        label: "Expected revenue",
        value: formatMoney(expectedRevenueMinor, "USD"),
        delta: "Accepted price basis",
      },
      {
        label: "Authorized revenue",
        value: formatMoney(authorizedRevenueMinor, "USD"),
        delta: "Ready for service",
      },
      {
        label: "Captured revenue",
        value: formatMoney(capturedRevenueMinor, "USD"),
        delta: "Completed work",
      },
      {
        label: "Payment risk",
        value: formatMoney(atRiskRevenueMinor, "USD"),
        delta: pendingPayment > 0 ? `${pendingPayment} needs owner action` : "No payment blockers",
      },
      {
        label: "Active owners",
        value: String(uniqueOwners),
        delta: "MAVO contribution",
      },
      {
        label: "Audit events",
        value: String(auditEvents.length),
        delta: "Latest operational trail",
      },
    ],
    queue,
    auditEvents,
  };
}

async function buildPaymentLookup(
  repositories: Repositories,
  bookings: readonly Booking[],
): Promise<ReadonlyMap<string, PaymentIntent>> {
  const entries = await Promise.all(
    bookings.map(async (booking) => {
      const payment = await repositories.payments.getByBookingId(booking.id);
      return payment ? ([booking.id, payment] as const) : undefined;
    }),
  );

  return new Map(entries.filter((entry): entry is readonly [string, PaymentIntent] => Boolean(entry)));
}

async function buildVehicleLookup(
  repositories: Repositories,
  bookings: readonly Booking[],
): Promise<ReadonlyMap<string, Vehicle>> {
  const vehicleIds = Array.from(new Set(bookings.map((booking) => booking.vehicleId)));
  const entries = await Promise.all(
    vehicleIds.map(async (vehicleId) => {
      const vehicle = await repositories.vehicles.get(vehicleId);
      return vehicle ? ([vehicleId, vehicle] as const) : undefined;
    }),
  );

  return new Map(entries.filter((entry): entry is readonly [string, Vehicle] => Boolean(entry)));
}

async function buildPartnerLocationLookup(
  repositories: Repositories,
  bookings: readonly Booking[],
): Promise<ReadonlyMap<string, PartnerLocation>> {
  const partnerLocationIds = Array.from(new Set(bookings.map((booking) => booking.partnerLocationId)));
  const entries = await Promise.all(
    partnerLocationIds.map(async (partnerLocationId) => {
      const partner = await repositories.partners.get(partnerLocationId);
      return partner ? ([partnerLocationId, partner] as const) : undefined;
    }),
  );

  return new Map(entries.filter((entry): entry is readonly [string, PartnerLocation] => Boolean(entry)));
}

async function buildPaymentHistory(
  repositories: Repositories,
  ownerId: string,
): Promise<readonly PaymentHistoryItem[]> {
  const bookings = await repositories.bookings.list(ownerId);
  const paymentByBookingId = await buildPaymentLookup(repositories, bookings);

  return bookings
    .map((booking) => {
      const payment = paymentByBookingId.get(booking.id);

      if (!payment) {
        return undefined;
      }

      return {
        paymentIntentId: payment.id,
        bookingId: booking.id,
        serviceCode: booking.serviceCode,
        scheduledStartAt: booking.scheduledStartAt,
        amount: payment.amount,
        status: payment.status,
        ...(payment.provider ? { provider: payment.provider } : {}),
        ...(payment.providerReference ? { providerReference: payment.providerReference } : {}),
        ...(payment.authorizedAt ? { authorizedAt: payment.authorizedAt } : {}),
        ...(payment.capturedAt ? { capturedAt: payment.capturedAt } : {}),
        ...(payment.refundedAt ? { refundedAt: payment.refundedAt } : {}),
        ...(payment.voidedAt ? { voidedAt: payment.voidedAt } : {}),
        createdAt: payment.createdAt,
      };
    })
    .filter((item): item is PaymentHistoryItem => Boolean(item))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function buildPrimaWashDayBookingItems(
  bookings: readonly Booking[],
  paymentByBookingId: ReadonlyMap<string, PaymentIntent>,
  vehicleById: ReadonlyMap<string, Vehicle>,
  partnerById: ReadonlyMap<string, PartnerLocation>,
  evidenceByBookingId: ReadonlyMap<string, BookingEvidenceSummary>,
  handoverByBookingId: ReadonlyMap<string, BookingHandoverSummary>,
): readonly PrimaWashDayBookingItem[] {
  return bookings
    .filter((booking): booking is Booking & { readonly primaWashDayId: string } => Boolean(booking.primaWashDayId))
    .slice()
    .sort((a, b) => a.scheduledStartAt.localeCompare(b.scheduledStartAt) || a.createdAt.localeCompare(b.createdAt))
    .map((booking) => {
      const payment = paymentByBookingId.get(booking.id);
      const vehicle = vehicleById.get(booking.vehicleId);
      const partner = partnerById.get(booking.partnerLocationId);
      const evidenceSummary = evidenceByBookingId.get(booking.id) ?? emptyEvidenceSummary();
      const handoverSummary = handoverByBookingId.get(booking.id) ?? emptyHandoverSummary();

      return {
        bookingId: booking.id,
        primaWashDayId: booking.primaWashDayId,
        vehicleId: booking.vehicleId,
        ...(vehicle ? { vehicle: toPartnerQueueVehicleSummary(vehicle) } : {}),
        ownerId: booking.ownerId,
        ...(partner ? { partnerLocation: toPartnerQueueLocationSummary(partner) } : {}),
        serviceCode: booking.serviceCode,
        status: booking.status,
        ...(booking.onsiteServiceMode ? { onsiteServiceMode: booking.onsiteServiceMode } : {}),
        valetRequested: booking.valetRequested,
        ...(booking.executionNotes ? { executionNotes: booking.executionNotes } : {}),
        ...(booking.assignedTechnicianName ? { assignedTechnicianName: booking.assignedTechnicianName } : {}),
        ...(booking.completionNotes ? { completionNotes: booking.completionNotes } : {}),
        ...(booking.beforeServicePhotoUrls?.length ? { beforeServicePhotoUrls: booking.beforeServicePhotoUrls } : {}),
        ...(booking.afterServicePhotoUrls?.length ? { afterServicePhotoUrls: booking.afterServicePhotoUrls } : {}),
        evidenceSummary,
        handoverSummary,
        ...(booking.technicianCheckedInAt ? { technicianCheckedInAt: booking.technicianCheckedInAt } : {}),
        ...(booking.technicianCheckedOutAt ? { technicianCheckedOutAt: booking.technicianCheckedOutAt } : {}),
        ...(booking.operationalExceptionCode ? { operationalExceptionCode: booking.operationalExceptionCode } : {}),
        ...(booking.operationalExceptionNotes ? { operationalExceptionNotes: booking.operationalExceptionNotes } : {}),
        ...(booking.operationalExceptionReportedAt ? { operationalExceptionReportedAt: booking.operationalExceptionReportedAt } : {}),
        ...(booking.operationalExceptionResolvedAt ? { operationalExceptionResolvedAt: booking.operationalExceptionResolvedAt } : {}),
        ...(payment ? { paymentIntentId: payment.id, paymentStatus: payment.status, paymentAmount: payment.amount } : {}),
        actionHint: getPartnerActionHint(booking, payment),
        scheduledStartAt: booking.scheduledStartAt,
        scheduledEndAt: booking.scheduledEndAt,
      };
    });
}

function toPartnerQueueVehicleSummary(vehicle: Vehicle): NonNullable<PartnerDashboardResponse["queue"][number]["vehicle"]> {
  return {
    plateNumber: vehicle.plateNumber,
    ...(vehicle.make ? { make: vehicle.make } : {}),
    ...(vehicle.model ? { model: vehicle.model } : {}),
    ...(vehicle.nickname ? { nickname: vehicle.nickname } : {}),
  };
}

function toPartnerQueueLocationSummary(partner: PartnerLocation): NonNullable<PartnerDashboardResponse["queue"][number]["partnerLocation"]> {
  return {
    name: partner.name,
    addressLine1: partner.addressLine1,
    city: partner.city,
    region: partner.region,
    countryCode: partner.countryCode,
    openingHours: partner.openingHours,
  };
}

async function buildPropertyManagementDashboard(
  repositories: Repositories,
  propertyId: string,
): Promise<PropertyManagementDashboardResponse | undefined> {
  const property = await repositories.properties.get(propertyId);

  if (!property) {
    return undefined;
  }

  const operationalProfile = await repositories.condoOperations.getOperationalProfile(propertyId);
  const days = await repositories.condoOperations.listPrimaWashDays({ propertyId });
  const bookings = (await repositories.bookings.list()).filter((booking) => booking.primaWashDayId);
  const paymentByBookingId = await buildPaymentLookup(repositories, bookings);
  const visibleStatuses = new Set(["planned", "approved", "active"]);
  const now = Date.now();

  return {
    property: {
      id: property.id,
      name: property.name,
      ...(property.addressLine1 ? { addressLine1: property.addressLine1 } : {}),
      city: property.city,
      region: property.region,
      countryCode: property.countryCode,
      activationStatus: property.activationStatus,
      interestCount: property.interestCount,
    },
    ...(operationalProfile ? { operationalProfile } : {}),
    upcomingPrimaWashDays: days
      .filter((day) => visibleStatuses.has(day.status) && new Date(day.endsAt).getTime() >= now)
      .map((day) => {
        const dayBookings = bookings.filter((booking) => booking.primaWashDayId === day.id);
        const bookedCount = dayBookings.filter((booking) => booking.status !== "cancelled").length;
        const confirmedCount = dayBookings.filter((booking) =>
          ["confirmed", "checked_in", "in_service", "completed"].includes(booking.status),
        ).length;
        const paymentBlockedCount = dayBookings.filter((booking) => {
          const payment = paymentByBookingId.get(booking.id);
          return booking.status === "pending_payment" && payment?.status !== "authorized";
        }).length;

        return {
          ...day,
          bookedCount,
          openCount: Math.max(0, day.capacity - bookedCount),
          confirmedCount,
          paymentBlockedCount,
        };
      })
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    generatedAt: new Date().toISOString(),
  };
}

function getPartnerActionHint(booking: Booking, payment?: PaymentIntent): string {
  if (booking.status === "pending_payment") {
    if (!payment) {
      return "Customer has not created a payment hold yet";
    }

    if (payment.status === "requires_authorization") {
      return "Waiting for customer payment authorization";
    }

    if (payment.status === "authorized") {
      return "Payment authorized; ready to confirm";
    }

    return `Payment is ${payment.status.replaceAll("_", " ")}`;
  }

  if (booking.status === "confirmed") {
    if (booking.onsiteServiceMode === "pickup_return") {
      return "Pickup and return requested; coordinate vehicle handover";
    }

    if (booking.onsiteServiceMode === "customer_property") {
      return "Property service requested; confirm access and service area";
    }

    return "Customer expected; check in when vehicle arrives";
  }

  if (booking.status === "checked_in") {
    return "Vehicle received; start service when bay is ready";
  }

  if (booking.status === "in_service") {
    return "Service underway; completion will capture payment";
  }

  if (booking.status === "completed") {
    return "Completed and payment captured";
  }

  return "Cancelled; no further action";
}

function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}

async function createServiceRecordIfCompleted(
  repositories: Repositories,
  booking: Booking,
): Promise<ServiceRecord | undefined> {
  if (booking.status !== "completed") {
    return undefined;
  }

  return repositories.serviceRecords.createFromBooking(booking);
}

async function recordProductEvent(
  repositories: Repositories,
  input: {
    readonly ownerId: string;
    readonly name: ProductEventName;
    readonly resourceType: string;
    readonly resourceId: string;
    readonly metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await repositories.productEvents.record(input);
}

async function ensureBillingCustomer(
  repositories: Repositories,
  paymentProvider: PaymentProvider,
  profile: CustomerProfile,
): Promise<{ readonly customer: PaymentCustomer; readonly profile: CustomerProfile }> {
  if (profile.billingProfile) {
    return {
      customer: {
        provider: profile.billingProfile.provider,
        providerCustomerId: profile.billingProfile.providerCustomerId,
      },
      profile,
    };
  }

  const customer = await paymentProvider.ensureCustomer(profile);
  const updatedProfile = await repositories.profiles.setBillingProfile(profile.userId, {
    provider: customer.provider,
    providerCustomerId: customer.providerCustomerId,
    updatedAt: new Date().toISOString(),
  });

  return {
    customer,
    profile: updatedProfile,
  };
}

async function recordPaymentAudit(
  repositories: Repositories,
  actor: Parameters<typeof assertOwnerAccess>[0],
  requestId: string,
  action: string,
  payment: PaymentIntent,
  providerResult?: PaymentProviderResult,
): Promise<void> {
  await repositories.audit.record({
    actor,
    action,
    resourceType: "payment_intent",
    resourceId: payment.id,
    requestId,
    metadata: {
      bookingId: payment.bookingId,
      ownerId: payment.ownerId,
      amount: payment.amount,
      status: payment.status,
      ...(providerResult
        ? {
            paymentProvider: providerResult.provider,
            providerOperation: providerResult.operation,
            providerReference: providerResult.providerReference,
            providerStatus: providerResult.status,
            providerProcessedAt: providerResult.processedAt,
          }
        : {}),
    },
  });
}

async function recordPaymentOperation(
  repositories: Repositories,
  input: {
    readonly actor?: Parameters<typeof assertOwnerAccess>[0] | undefined;
    readonly requestId?: string | undefined;
    readonly operation: PaymentOperationName;
    readonly payment: PaymentIntent;
    readonly providerResult?: PaymentProviderResult | undefined;
    readonly idempotencyKey?: string | undefined;
    readonly status?: PaymentOperationStatus | undefined;
    readonly errorMessage?: string | undefined;
    readonly metadata?: Record<string, unknown> | undefined;
  },
): Promise<PaymentOperation> {
  return repositories.paymentOperations.create({
    paymentIntentId: input.payment.id,
    bookingId: input.payment.bookingId,
    ownerId: input.payment.ownerId,
    operation: input.operation,
    status: input.status ?? "succeeded",
    providerResult: input.providerResult,
    idempotencyKey: input.idempotencyKey,
    actor: input.actor,
    requestId: input.requestId,
    errorMessage: input.errorMessage,
    metadata: {
      paymentStatus: input.payment.status,
      amount: input.payment.amount,
      ...(input.metadata ?? {}),
    },
  });
}

async function recordPaymentOperationFailure(
  repositories: Repositories,
  input: {
    readonly actor?: Parameters<typeof assertOwnerAccess>[0] | undefined;
    readonly requestId?: string | undefined;
    readonly operation: PaymentOperationName;
    readonly payment: PaymentIntent;
    readonly providerResult?: PaymentProviderResult | undefined;
    readonly idempotencyKey?: string | undefined;
    readonly error: unknown;
    readonly metadata?: Record<string, unknown> | undefined;
  },
): Promise<void> {
  await recordPaymentOperation(repositories, {
    actor: input.actor,
    requestId: input.requestId,
    operation: input.operation,
    payment: input.payment,
    providerResult: input.providerResult,
    idempotencyKey: input.idempotencyKey,
    status: "failed",
    errorMessage: errorMessageForLedger(input.error),
    metadata: input.metadata,
  });
}

async function getIdempotentPaymentForOperation(
  repositories: Repositories,
  input: {
    readonly operation: PaymentOperationName;
    readonly bookingId: string;
    readonly idempotencyKey?: string | undefined;
  },
): Promise<PaymentIntent | undefined> {
  if (!input.idempotencyKey) {
    return undefined;
  }

  const operation = await repositories.paymentOperations.findSucceededByIdempotencyKey({
    operation: input.operation,
    bookingId: input.bookingId,
    idempotencyKey: input.idempotencyKey,
  });

  if (!operation?.paymentIntentId) {
    return undefined;
  }

  return repositories.payments.get(operation.paymentIntentId);
}

async function voidAuthorizedPaymentByBooking(
  repositories: Repositories,
  paymentProvider: PaymentProvider,
  bookingId: string,
  options: {
    readonly actor?: Parameters<typeof assertOwnerAccess>[0] | undefined;
    readonly requestId?: string | undefined;
    readonly idempotencyKey?: string | undefined;
    readonly metadata?: Record<string, unknown> | undefined;
  } = {},
): Promise<{ readonly payment: PaymentIntent; readonly providerResult: PaymentProviderResult } | undefined> {
  const payment = await repositories.payments.getByBookingId(bookingId);

  const idempotentPayment = await getIdempotentPaymentForOperation(repositories, {
    operation: "void",
    bookingId,
    idempotencyKey: options.idempotencyKey,
  });

  if (idempotentPayment?.status === "voided") {
    return undefined;
  }

  if (!payment || payment.status !== "authorized") {
    return undefined;
  }

  let providerResult: PaymentProviderResult | undefined;
  let voidedPayment: PaymentIntent | undefined;

  try {
    providerResult = await paymentProvider.void(payment);
    voidedPayment = await repositories.payments.voidByBookingId(bookingId);
  } catch (error) {
    await recordPaymentOperationFailure(repositories, {
      actor: options.actor,
      requestId: options.requestId,
      operation: "void",
      payment,
      providerResult,
      idempotencyKey: options.idempotencyKey,
      error,
      metadata: options.metadata,
    });
    throw error;
  }

  if (!voidedPayment) {
    await recordPaymentOperationFailure(repositories, {
      actor: options.actor,
      requestId: options.requestId,
      operation: "void",
      payment,
      providerResult,
      idempotencyKey: options.idempotencyKey,
      error: new Error("payment_intent_not_found"),
      metadata: options.metadata,
    });
    throw new Error("payment_intent_not_found");
  }

  await recordPaymentOperation(repositories, {
    actor: options.actor,
    requestId: options.requestId,
    operation: "void",
    payment: voidedPayment,
    providerResult,
    idempotencyKey: options.idempotencyKey,
    metadata: options.metadata,
  });

  return {
    payment: voidedPayment,
    providerResult,
  };
}

function getPaymentIdempotencyKey(request: IncomingMessage): string | undefined {
  const raw = request.headers["idempotency-key"] ?? request.headers["x-idempotency-key"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 160) : undefined;
}

function errorMessageForLedger(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

function sendPaymentError(
  response: Parameters<typeof sendError>[0],
  error: unknown,
  fallbackMessage: string,
): void {
  const message = error instanceof Error ? error.message : "unknown_error";

  if (message === "payment_intent_not_found") {
    sendError(response, 404, message, "Payment intent does not exist");
    return;
  }

  if (message === "invalid_payment_status_transition") {
    sendError(response, 409, message, "Payment status transition is not allowed");
    return;
  }

  sendError(response, 400, "invalid_request", fallbackMessage, message);
}

function generateAvailabilitySlotsFromTemplate(
  template: CapacityTemplate,
  date: string,
): readonly CreateAvailabilitySlotInput[] {
  const capacity = Math.max(1, Math.min(template.staffCount, template.bayCount));
  const cadenceMinutes = template.slotDurationMinutes + template.bufferMinutes;
  const opensAt = new Date(`${date}T${template.openTime}:00`);
  const closesAt = new Date(`${date}T${template.closeTime}:00`);
  const slots: CreateAvailabilitySlotInput[] = [];

  if (!Number.isFinite(opensAt.getTime()) || !Number.isFinite(closesAt.getTime()) || closesAt <= opensAt) {
    return slots;
  }

  for (
    let cursor = new Date(opensAt);
    cursor.getTime() + template.slotDurationMinutes * 60_000 <= closesAt.getTime();
    cursor = new Date(cursor.getTime() + cadenceMinutes * 60_000)
  ) {
    slots.push({
      partnerLocationId: template.partnerLocationId,
      startsAt: cursor.toISOString(),
      endsAt: new Date(cursor.getTime() + template.slotDurationMinutes * 60_000).toISOString(),
      capacity,
      serviceCodes: template.serviceCodes,
    });
  }

  return slots;
}

function buildDynamicAvailabilitySearch(input: {
  readonly partnerLocationId: string;
  readonly serviceCode: string;
  readonly date: string;
  readonly timezone: string;
  readonly config: SchedulingConfig;
  readonly bookings: readonly Booking[];
  readonly holds: readonly BookingHold[];
}): AvailabilitySearchResponse {
  const serviceRule = input.config.serviceCapacityRules.find(
    (rule) => rule.serviceCode === input.serviceCode && rule.enabled,
  );

  if (!serviceRule) {
    return {
      partnerLocationId: input.partnerLocationId,
      serviceCode: input.serviceCode as AvailabilitySearchResponse["serviceCode"],
      date: input.date,
      timezone: input.timezone,
      slots: [],
      closedReason: "Service is not configured for dynamic availability",
    };
  }

  const exception = input.config.calendarExceptions.find((item) => item.date === input.date);

  if (exception?.type === "closed") {
    return {
      partnerLocationId: input.partnerLocationId,
      serviceCode: serviceRule.serviceCode,
      date: input.date,
      timezone: input.timezone,
      slots: [],
      closedReason: exception.reason,
    };
  }

  const weekday = getWeekdayInTimeZone(input.date, input.timezone);
  const scheduleRule = input.config.operatingScheduleRules.find((rule) => rule.weekday === weekday && rule.enabled);
  const openTime = exception?.type === "special_hours" ? exception.openTime : scheduleRule?.openTime;
  const closeTime = exception?.type === "special_hours" ? exception.closeTime : scheduleRule?.closeTime;

  if (!openTime || !closeTime) {
    return {
      partnerLocationId: input.partnerLocationId,
      serviceCode: serviceRule.serviceCode,
      date: input.date,
      timezone: input.timezone,
      slots: [],
      closedReason: "Location is closed on this date",
    };
  }

  const capacity = calculateServiceCapacity(input.config, serviceRule);

  if (capacity < 1) {
    return {
      partnerLocationId: input.partnerLocationId,
      serviceCode: serviceRule.serviceCode,
      date: input.date,
      timezone: input.timezone,
      slots: [],
      closedReason: "No enabled resources can support this service",
    };
  }

  const openAt = zonedTimeToUtc(input.date, openTime, input.timezone);
  const closeAt = zonedTimeToUtc(input.date, closeTime, input.timezone);
  const cadenceMinutes = Math.max(15, serviceRule.durationMinutes);
  const serviceBlockMinutes =
    serviceRule.preBufferMinutes + serviceRule.durationMinutes + serviceRule.postBufferMinutes;
  const dailyBookings = input.bookings.filter(
    (booking) =>
      booking.partnerLocationId === input.partnerLocationId &&
      booking.serviceCode === serviceRule.serviceCode &&
      booking.status !== "cancelled" &&
      getDateInTimeZone(booking.scheduledStartAt, input.timezone) === input.date,
  );
  const slots: AvailabilitySearchSlot[] = [];

  if (dailyBookings.length >= serviceRule.maxDailyBookings) {
    return {
      partnerLocationId: input.partnerLocationId,
      serviceCode: serviceRule.serviceCode,
      date: input.date,
      timezone: input.timezone,
      slots,
      closedReason: "Daily booking limit reached",
    };
  }

  for (
    let cursor = new Date(openAt);
    cursor.getTime() + serviceBlockMinutes * 60_000 <= closeAt.getTime();
    cursor = new Date(cursor.getTime() + cadenceMinutes * 60_000)
  ) {
    const startsAt = new Date(cursor.getTime() + serviceRule.preBufferMinutes * 60_000);
    const endsAt = new Date(startsAt.getTime() + serviceRule.durationMinutes * 60_000);
    const blockStart = cursor;
    const blockEnd = new Date(cursor.getTime() + serviceBlockMinutes * 60_000);
    const overlappingBookings = dailyBookings.filter((booking) =>
      rangesOverlap(
        new Date(booking.scheduledStartAt),
        new Date(booking.scheduledEndAt),
        blockStart,
        blockEnd,
      ),
    ).length;
    const overlappingHolds = input.holds.filter((hold) =>
      rangesOverlap(new Date(hold.startsAt), new Date(hold.endsAt), blockStart, blockEnd),
    ).length;
    const availableCount = Math.max(0, capacity - overlappingBookings - overlappingHolds);

    if (availableCount > 0) {
      slots.push({
        partnerLocationId: input.partnerLocationId,
        serviceCode: serviceRule.serviceCode,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        capacity,
        availableCount,
        source: "dynamic_rules",
      });
    }
  }

  return {
    partnerLocationId: input.partnerLocationId,
    serviceCode: serviceRule.serviceCode,
    date: input.date,
    timezone: input.timezone,
    slots,
  };
}

function calculateServiceCapacity(config: SchedulingConfig, rule: ServiceCapacityRule): number {
  const staff = config.resourcePools
    .filter((resource) => resource.enabled && resource.resourceType === "staff")
    .reduce((sum, resource) => sum + resource.quantity, 0);
  const requiredResource = config.resourcePools
    .filter((resource) => resource.enabled && resource.resourceType === rule.requiredResourceType)
    .reduce((sum, resource) => sum + resource.quantity, 0);

  return Math.min(
    Math.floor(staff / rule.requiredStaff),
    Math.floor(requiredResource / rule.requiredResourceQuantity),
    rule.maxConcurrent,
  );
}

function rangesOverlap(leftStart: Date, leftEnd: Date, rightStart: Date, rightEnd: Date): boolean {
  return leftStart < rightEnd && rightStart < leftEnd;
}

function sameInstant(left: string, right: string): boolean {
  return new Date(left).getTime() === new Date(right).getTime();
}

function getWeekdayInTimeZone(date: string, timezone: string): number {
  const day = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(
    zonedTimeToUtc(date, "12:00", timezone),
  );
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(day);
}

function getDateInTimeZone(instant: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function zonedTimeToUtc(date: string, time: string, timezone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const utcGuess = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0, 0));
  const offset = getTimeZoneOffsetMs(utcGuess, timezone);
  const firstPass = new Date(utcGuess.getTime() - offset);
  const correctedOffset = getTimeZoneOffsetMs(firstPass, timezone);
  return new Date(utcGuess.getTime() - correctedOffset);
}

function getTimeZoneOffsetMs(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return asUtc - date.getTime();
}

function createSilentRequestContext(
  request: Parameters<typeof attachRequestLogging>[0],
  response: Parameters<typeof attachRequestLogging>[1],
): RequestContext {
  const requestId = getRequestId(request);
  response.setHeader("x-request-id", requestId);
  return { requestId, startedAt: process.hrtime.bigint() };
}

function getRequestId(request: Parameters<typeof attachRequestLogging>[0]): string {
  const header = request.headers["x-request-id"];

  if (typeof header === "string" && header.trim().length > 0) {
    return header.trim();
  }

  if (Array.isArray(header) && header[0]?.trim()) {
    return header[0].trim();
  }

  return crypto.randomUUID();
}

interface StripeWebhookEvent {
  readonly id: string;
  readonly type: string;
  readonly data: {
    readonly object: StripeWebhookObject;
  };
}

type StripeWebhookObject =
  | StripeWebhookPaymentIntent
  | StripeWebhookRefund
  | StripeWebhookCharge
  | StripeWebhookDispute;

interface StripeWebhookPaymentIntent {
  readonly object: "payment_intent";
  readonly id: string;
  readonly status?: string;
  readonly last_payment_error?: {
    readonly code?: string;
    readonly message?: string;
  };
}

interface StripeWebhookRefund {
  readonly object: "refund";
  readonly id: string;
  readonly payment_intent?: string;
}

interface StripeWebhookCharge {
  readonly object: "charge";
  readonly id: string;
  readonly payment_intent?: string;
  readonly refunded?: boolean;
}

interface StripeWebhookDispute {
  readonly object: "dispute";
  readonly id: string;
  readonly charge?: string;
  readonly payment_intent?: string;
  readonly status?: string;
  readonly reason?: string;
}

interface StripeWebhookAction {
  readonly providerReference: string;
  readonly targetStatus?: PaymentStatus;
  readonly reason: string;
  readonly reviewCode?: string;
}

interface StripeWebhookReconciliationResult {
  readonly received: true;
  readonly eventId: string;
  readonly eventType: string;
  readonly outcome: "reconciled" | "duplicate" | "ignored" | "review_required";
  readonly paymentIntentId?: string;
  readonly paymentStatus?: PaymentStatus;
  readonly reason?: string;
}

function verifyStripeWebhookEvent(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  webhookSecret: string,
): StripeWebhookEvent {
  if (!signatureHeader) {
    throw new Error("stripe_signature_missing");
  }

  const signatureParts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, ...valueParts] = part.split("=");
      return [key, valueParts.join("=")];
    }),
  );
  const timestamp = signatureParts.t;
  const signature = signatureParts.v1;

  if (!timestamp || !signature) {
    throw new Error("stripe_signature_invalid");
  }

  const timestampSeconds = Number.parseInt(timestamp, 10);
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (!Number.isFinite(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > 300) {
    throw new Error("stripe_signature_invalid");
  }

  const expectedSignature = createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${rawBody.toString("utf8")}`)
    .digest("hex");

  if (!safeCompareHex(signature, expectedSignature)) {
    throw new Error("stripe_signature_invalid");
  }

  return JSON.parse(rawBody.toString("utf8")) as StripeWebhookEvent;
}

function safeCompareHex(left: string, right: string): boolean {
  try {
    const leftBuffer = Buffer.from(left, "hex");
    const rightBuffer = Buffer.from(right, "hex");
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  } catch {
    return false;
  }
}

function safeCompareString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function accessInvitationCodeHash(code: string, secret: string): string {
  return createHmac("sha256", secret).update(code).digest("base64url");
}

function validateCreateAccessInvitation(input: CreateAccessInvitationRequest): string[] {
  const errors: string[] = [];
  const role = input.role;

  if (!isValidAccessInvitationEmail(input.identifier)) {
    errors.push("identifier must be a valid email address");
  }

  if (!input.displayName || input.displayName.trim().length < 2) {
    errors.push("displayName must be at least 2 characters");
  }

  if (role !== "internal" && role !== "partner" && role !== "property_manager") {
    errors.push("role must be internal, partner, or property_manager");
  }

  if (role === "partner") {
    if (!input.organizationId) {
      errors.push("organizationId is required for partner invitations");
    }

    if (!input.partnerLocationId) {
      errors.push("partnerLocationId is required for partner invitations");
    }
  }

  if (role === "property_manager" && !input.propertyId) {
    errors.push("propertyId is required for property manager invitations");
  }

  if (role === "internal" && (input.permissions ?? []).some((permission) => !isInternalPermission(permission))) {
    errors.push("permissions contains an unsupported internal permission");
  }

  return errors;
}

function assertAccessInvitationPermission(actor: Actor, input: CreateAccessInvitationRequest): void {
  if (input.role === "internal") {
    assertInternalPermission(actor, "super_admin");
    return;
  }

  if (input.role === "partner") {
    assertInternalPermission(actor, "partner_manage");
    return;
  }

  assertInternalPermission(actor, "property_manage");
}

function assertAccessInvitationListPermission(actor: Actor): void {
  assertInternal(actor);

  if (
    !hasInternalPermission(actor, "super_admin") &&
    !hasInternalPermission(actor, "partner_manage") &&
    !hasInternalPermission(actor, "property_manage")
  ) {
    throw new Error("internal_permission_required");
  }
}

function assertAccessInvitationRecordPermission(
  actor: Actor,
  invitation: { readonly role: AccessInvitation["role"] },
): void {
  assertAccessInvitationPermission(actor, {
    identifier: "permission-check@example.com",
    displayName: "Permission Check",
    role: invitation.role,
  });
}

function canManageAccessInvitationRecord(
  actor: Actor,
  invitation: { readonly role: AccessInvitation["role"] },
): boolean {
  if (actor.role !== "internal") {
    return false;
  }

  if (invitation.role === "internal") {
    return hasInternalPermission(actor, "super_admin");
  }

  if (invitation.role === "partner") {
    return hasInternalPermission(actor, "partner_manage");
  }

  return hasInternalPermission(actor, "property_manage");
}

function assertAccessMembershipRecordPermission(actor: Actor, membership: AccessMembership): void {
  if (!canManageAccessMembershipRecord(actor, membership)) {
    throw new Error("internal_permission_required");
  }
}

function canManageAccessMembershipRecord(actor: Actor, membership: AccessMembership): boolean {
  if (actor.role !== "internal") {
    return false;
  }

  if (membership.role === "internal") {
    return hasInternalPermission(actor, "super_admin");
  }

  if (membership.role === "partner") {
    return hasInternalPermission(actor, "partner_manage");
  }

  return hasInternalPermission(actor, "property_manage");
}

function validateUpdateAccessMembership(input: UpdateAccessMembershipRequest, membership: AccessMembership): string[] {
  const errors: string[] = [];

  if (input.active !== undefined && typeof input.active !== "boolean") {
    errors.push("active must be a boolean");
  }

  if (input.permissions !== undefined) {
    if (membership.role !== "internal") {
      errors.push("permissions can only be changed for internal memberships");
    } else if (input.permissions.length === 0) {
      errors.push("internal memberships must keep at least one permission");
    } else if (input.permissions.some((permission) => !isInternalPermission(permission))) {
      errors.push("permissions contains an unsupported internal permission");
    }
  }

  if (input.active === undefined && input.permissions === undefined) {
    errors.push("active or permissions is required");
  }

  return errors;
}

function normalizeInvitationIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase();
}

function maskInvitationIdentifier(identifier: string): string {
  const [name = "", domain = ""] = identifier.split("@");
  return `${name.slice(0, 2)}***@${domain}`;
}

function isValidAccessInvitationEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
}

function filterInternalPermissions(values: readonly string[]): readonly InternalPermission[] {
  return values.filter(isInternalPermission);
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

function isPaymentReconciliationCaseStatus(value: string | undefined): value is PaymentReconciliationCaseStatus {
  return (
    value === "open" ||
    value === "waiting_customer" ||
    value === "waiting_partner" ||
    value === "resolved" ||
    value === "written_off"
  );
}

async function reconcileStripeWebhookEvent(
  repositories: Repositories,
  event: StripeWebhookEvent,
  requestId: string,
): Promise<StripeWebhookReconciliationResult> {
  const action = getStripeWebhookAction(event);

  if (!action) {
    await recordIgnoredStripeWebhook(repositories, event, requestId, "event_not_actionable");
    return {
      received: true,
      eventId: event.id,
      eventType: event.type,
      outcome: "ignored",
      reason: "event_not_actionable",
    };
  }

  const payment = await repositories.payments.getByProviderReference("stripe", action.providerReference);

  if (!payment) {
    await recordIgnoredStripeWebhook(repositories, event, requestId, "payment_intent_not_found", action);
    return {
      received: true,
      eventId: event.id,
      eventType: event.type,
      outcome: "ignored",
      reason: "payment_intent_not_found",
    };
  }

  if (!action.targetStatus) {
    await recordStripeWebhookAudit(repositories, event, requestId, payment, action, "review_required", action.reviewCode);
    const operation = await recordPaymentOperation(repositories, {
      requestId,
      operation: "reconcile",
      payment,
      status: "skipped",
      metadata: {
        source: "stripe_webhook",
        stripeEventId: event.id,
        stripeEventType: event.type,
        providerReference: action.providerReference,
        outcome: "review_required",
        reason: action.reason,
        reviewCode: action.reviewCode ?? null,
      },
    });
    await openAutomatedPaymentReconciliationCase(repositories, operation, {
      caseType: caseTypeForStripeReview(action.reviewCode ?? event.type),
      summary: summaryForStripeReview(event.type, action.reason),
      note: `Stripe ${event.type} requires finance review: ${action.reason}`,
    });
    return {
      received: true,
      eventId: event.id,
      eventType: event.type,
      outcome: "review_required",
      paymentIntentId: payment.id,
      paymentStatus: payment.status,
      reason: action.reviewCode ?? action.reason,
    };
  }

  if (payment.status === action.targetStatus) {
    await recordStripeWebhookAudit(repositories, event, requestId, payment, action, "duplicate");
    const operation = await recordPaymentOperation(repositories, {
      requestId,
      operation: "reconcile",
      payment,
      status: "skipped",
      metadata: {
        source: "stripe_webhook",
        stripeEventId: event.id,
        stripeEventType: event.type,
        providerReference: action.providerReference,
        targetStatus: action.targetStatus,
        outcome: "duplicate",
        reason: action.reason,
      },
    });
    await openAutomatedPaymentReconciliationCase(repositories, operation, {
      caseType: "duplicate_event",
      summary: `Duplicate Stripe webhook received for ${action.providerReference}.`,
      note: `Stripe ${event.type} arrived after the payment was already ${payment.status}.`,
    });
    return {
      received: true,
      eventId: event.id,
      eventType: event.type,
      outcome: "duplicate",
      paymentIntentId: payment.id,
      paymentStatus: payment.status,
    };
  }

  try {
    assertPaymentTransition(payment.status, action.targetStatus);
  } catch {
    await recordStripeWebhookAudit(repositories, event, requestId, payment, action, "ignored", "invalid_payment_status_transition");
    const operation = await recordPaymentOperation(repositories, {
      requestId,
      operation: "reconcile",
      payment,
      status: "skipped",
      metadata: {
        source: "stripe_webhook",
        stripeEventId: event.id,
        stripeEventType: event.type,
        providerReference: action.providerReference,
        targetStatus: action.targetStatus,
        outcome: "ignored",
        reason: "invalid_payment_status_transition",
      },
    });
    await openAutomatedPaymentReconciliationCase(repositories, operation, {
      caseType: "invalid_transition",
      summary: `Stripe webhook could not move payment from ${payment.status} to ${action.targetStatus}.`,
      note: `Stripe ${event.type} was ignored because the requested transition is not allowed.`,
    });
    return {
      received: true,
      eventId: event.id,
      eventType: event.type,
      outcome: "ignored",
      paymentIntentId: payment.id,
      paymentStatus: payment.status,
      reason: "invalid_payment_status_transition",
    };
  }

  const reconciledPayment = await repositories.payments.reconcileStatus(payment.id, action.targetStatus);

  await recordStripeWebhookAudit(repositories, event, requestId, reconciledPayment, action, "reconciled");
  await recordPaymentOperation(repositories, {
    requestId,
    operation: "reconcile",
    payment: reconciledPayment,
    metadata: {
      source: "stripe_webhook",
      stripeEventId: event.id,
      stripeEventType: event.type,
      providerReference: action.providerReference,
      targetStatus: action.targetStatus,
      reason: action.reason,
    },
  });

  if (action.targetStatus === "authorized") {
    const booking = await repositories.bookings.get(reconciledPayment.bookingId);

    if (booking && canTransitionBookingStatus(booking.status, "confirmed")) {
      const updatedBooking = await repositories.bookings.updateStatus(booking.id, "confirmed");
      await repositories.audit.record({
        action: "booking.status_changed",
        resourceType: "booking",
        resourceId: booking.id,
        requestId,
        metadata: {
          fromStatus: booking.status,
          toStatus: updatedBooking.status,
          partnerLocationId: updatedBooking.partnerLocationId,
          source: "stripe_webhook",
          stripeEventId: event.id,
        },
      });
    }
  }

  return {
    received: true,
    eventId: event.id,
    eventType: event.type,
    outcome: "reconciled",
    paymentIntentId: reconciledPayment.id,
    paymentStatus: reconciledPayment.status,
  };
}

function getStripeWebhookAction(event: StripeWebhookEvent): StripeWebhookAction | undefined {
  const object = event.data.object;

  if (event.type === "payment_intent.amount_capturable_updated" && object.object === "payment_intent") {
    return {
      providerReference: object.id,
      targetStatus: "authorized",
      reason: object.status ?? "amount_capturable_updated",
    };
  }

  if (event.type === "payment_intent.succeeded" && object.object === "payment_intent") {
    return {
      providerReference: object.id,
      targetStatus: "captured",
      reason: object.status ?? "payment_intent_succeeded",
    };
  }

  if (event.type === "payment_intent.payment_failed" && object.object === "payment_intent") {
    return {
      providerReference: object.id,
      reason: object.last_payment_error?.message ?? object.status ?? "payment_intent_payment_failed",
      reviewCode: object.last_payment_error?.code ?? "payment_failed",
    };
  }

  if (event.type === "payment_intent.canceled" && object.object === "payment_intent") {
    return {
      providerReference: object.id,
      targetStatus: "voided",
      reason: object.status ?? "payment_intent_canceled",
    };
  }

  if ((event.type === "refund.created" || event.type === "refund.updated") && object.object === "refund" && object.payment_intent) {
    return {
      providerReference: object.payment_intent,
      targetStatus: "refunded",
      reason: event.type === "refund.created" ? "refund_created" : "refund_updated",
    };
  }

  if (event.type === "charge.refunded" && object.object === "charge" && object.payment_intent && object.refunded) {
    return {
      providerReference: object.payment_intent,
      targetStatus: "refunded",
      reason: "charge_refunded",
    };
  }

  if (event.type.startsWith("charge.dispute.") && object.object === "dispute" && object.payment_intent) {
    return {
      providerReference: object.payment_intent,
      reason: object.reason ?? object.status ?? event.type,
      reviewCode: event.type,
    };
  }

  return undefined;
}

async function recordStripeWebhookAudit(
  repositories: Repositories,
  event: StripeWebhookEvent,
  requestId: string,
  payment: PaymentIntent,
  action: StripeWebhookAction,
  outcome: StripeWebhookReconciliationResult["outcome"],
  reason?: string,
): Promise<void> {
  await repositories.audit.record({
    action: "payment.stripe_webhook_reconciled",
    resourceType: "payment_intent",
    resourceId: payment.id,
    requestId,
    metadata: {
      stripeEventId: event.id,
      stripeEventType: event.type,
      providerReference: action.providerReference,
      targetStatus: action.targetStatus,
      status: payment.status,
      outcome,
      reason: reason ?? action.reason,
    },
  });
}

async function recordIgnoredStripeWebhook(
  repositories: Repositories,
  event: StripeWebhookEvent,
  requestId: string,
  reason: string,
  action?: StripeWebhookAction,
): Promise<void> {
  await repositories.audit.record({
    action: "payment.stripe_webhook_ignored",
    resourceType: "stripe_event",
    resourceId: event.id,
    requestId,
    metadata: {
      stripeEventType: event.type,
      reason,
      ...(action
        ? {
            providerReference: action.providerReference,
            targetStatus: action.targetStatus,
          }
        : {}),
    },
  });
}

async function openAutomatedPaymentReconciliationCase(
  repositories: Repositories,
  operation: PaymentOperation,
  input: {
    readonly caseType: PaymentReconciliationCaseType;
    readonly summary: string;
    readonly note: string;
  },
): Promise<void> {
  const providerReference = operation.providerReference ?? stringMetadataValue(operation.metadata["providerReference"]);
  const providerEventType = stringMetadataValue(operation.metadata["providerEventType"]) ?? stringMetadataValue(operation.metadata["stripeEventType"]);

  if (!providerReference || !providerEventType) {
    return;
  }

  const existing = await repositories.paymentReconciliationCases.findOpenByProviderEvent({
    caseType: input.caseType,
    providerReference,
    providerEventType,
  });

  if (existing) {
    await repositories.paymentReconciliationCases.update(existing.case.id, {
      actor: systemFinanceActor,
      note: `Repeated Stripe event received for payment operation ${operation.id}.`,
    });
    return;
  }

  await repositories.paymentReconciliationCases.create({
    actor: systemFinanceActor,
    paymentOperationId: operation.id,
    operation,
    caseType: input.caseType,
    summary: input.summary,
    note: input.note,
  });
}

function caseTypeForStripeReview(reviewCode: string): PaymentReconciliationCaseType {
  if (reviewCode.startsWith("charge.dispute.")) {
    return "stripe_dispute";
  }

  return "payment_failed";
}

function summaryForStripeReview(eventType: string, reason: string): string {
  if (eventType.startsWith("charge.dispute.")) {
    return `Stripe dispute requires review: ${reason}`;
  }

  return `Stripe payment failed: ${reason}`;
}

function stringMetadataValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

const systemFinanceActor: Actor = {
  userId: "usr_internal_finance_001",
  role: "internal",
  permissions: ["finance_read", "finance_write"],
};

function getHeaderValue(header: string | readonly string[] | undefined): string | undefined {
  if (typeof header === "string") {
    return header;
  }

  return header?.[0];
}

async function readOptionalJsonBody<T>(request: Parameters<typeof readJsonBody>[0]): Promise<Partial<T>> {
  try {
    return await readJsonBody<Partial<T>>(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";

    if (message === "request_body_required") {
      return {};
    }

    throw error;
  }
}
