import type { Env } from './types';
import { compare } from 'bcryptjs';

const encoder = new TextEncoder();
const SESSION_COOKIE = 'maum_session';
const SESSION_SECONDS = 60 * 60 * 8;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function hmac(value: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return compare(password, passwordHash);
}

export async function createSession(secret: string): Promise<string> {
  const payload = toBase64Url(encoder.encode(JSON.stringify({ subject: 'admin', expiresAt: Math.floor(Date.now() / 1000) + SESSION_SECONDS })));
  const signature = toBase64Url(await hmac(payload, secret));
  return `${payload}.${signature}`;
}

export async function hasValidSession(request: Request, env: Env): Promise<boolean> {
  if (!env.SESSION_SECRET) return false;
  const cookie = request.headers.get('Cookie') ?? '';
  const token = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (!token) return false;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return false;
  try {
    if (!equalBytes(await hmac(payload, env.SESSION_SECRET), fromBase64Url(signature))) return false;
    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as { subject?: string; expiresAt?: number };
    return data.subject === 'admin' && typeof data.expiresAt === 'number' && data.expiresAt > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
}

export function expiredSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function loginClientKey(request: Request, secret: string): Promise<string> {
  const source = `${request.headers.get('CF-Connecting-IP') ?? 'unknown'}|${request.headers.get('User-Agent') ?? 'unknown'}|${secret}`;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(source)));
  return Array.from(digest.slice(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
