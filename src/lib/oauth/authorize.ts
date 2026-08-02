import { createHash } from 'node:crypto';
import { DEFAULT_SCOPES, normalizeScopes, type Scope } from '@/lib/apiTokens';
import { mcpResourceUrl } from '@/lib/oauth/keys';
import {
  redirectUriAllowed,
  resolveClient,
  type ResolvedClient,
} from '@/lib/oauth/clients';

export const AUTH_CODE_TTL_MS = 60 * 1000;

export type AuthorizeParams = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  scopes: Scope[];
  resource: string;
};

export type AuthorizeValidation =
  | { ok: true; client: ResolvedClient; params: AuthorizeParams }
  /** The redirect target is untrusted, so the error must be rendered, not redirected. */
  | { ok: false; fatal: true; error: string }
  /** Safe to bounce back to the client with an OAuth error. */
  | { ok: false; fatal: false; error: string; redirectUri: string; state?: string };

export function verifyPkceS256(verifier: string, challenge: string) {
  const digest = createHash('sha256').update(verifier).digest('base64url');
  return digest === challenge;
}

export async function validateAuthorizeRequest(
  raw: Record<string, string | undefined>,
): Promise<AuthorizeValidation> {
  const clientId = raw.client_id?.trim();
  const redirectUri = raw.redirect_uri?.trim();
  const state = raw.state?.trim() || undefined;

  if (!clientId) {
    return { ok: false, fatal: true, error: 'client_id is required' };
  }
  if (!redirectUri) {
    return { ok: false, fatal: true, error: 'redirect_uri is required' };
  }

  const client = await resolveClient(clientId);
  if (!client) {
    return {
      ok: false,
      fatal: true,
      error:
        'Unknown client. The client_id must be an HTTPS URL serving a Client ID Metadata Document, or a client registered here.',
    };
  }
  if (!redirectUriAllowed(client, redirectUri)) {
    return {
      ok: false,
      fatal: true,
      error: 'redirect_uri is not registered for this client',
    };
  }

  if (raw.response_type !== 'code') {
    return {
      ok: false,
      fatal: false,
      error: 'unsupported_response_type',
      redirectUri,
      state,
    };
  }
  if (raw.code_challenge_method !== 'S256') {
    return {
      ok: false,
      fatal: false,
      error: 'invalid_request',
      redirectUri,
      state,
    };
  }
  const codeChallenge = raw.code_challenge?.trim();
  if (!codeChallenge || codeChallenge.length < 43) {
    return {
      ok: false,
      fatal: false,
      error: 'invalid_request',
      redirectUri,
      state,
    };
  }

  const resource = raw.resource?.trim() || mcpResourceUrl();
  if (resource !== mcpResourceUrl()) {
    return {
      ok: false,
      fatal: false,
      error: 'invalid_target',
      redirectUri,
      state,
    };
  }

  const requested = normalizeScopes(raw.scope);
  const scopes = requested.length > 0 ? requested : DEFAULT_SCOPES;

  return {
    ok: true,
    client,
    params: { clientId, redirectUri, codeChallenge, state, scopes, resource },
  };
}

export function buildRedirect(
  redirectUri: string,
  params: Record<string, string | undefined>,
) {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.toString();
}
