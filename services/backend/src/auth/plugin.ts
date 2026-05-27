/** Fastify auth: verify the bearer JWT and attach the principal to the request. */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config/env.js';
import { unauthorized } from '../errors.js';
import { verifyJwt, type JwtClaims } from './tokens.js';

declare module 'fastify' {
  interface FastifyRequest {
    principal?: JwtClaims;
  }
}

export async function authenticate(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized('Missing bearer token');
  try {
    req.principal = verifyJwt(header.slice('Bearer '.length), config.jwtSigningSecret);
  } catch {
    throw unauthorized('Invalid or expired token');
  }
}

export function requirePrincipal(req: FastifyRequest): JwtClaims {
  if (!req.principal) throw unauthorized();
  return req.principal;
}
