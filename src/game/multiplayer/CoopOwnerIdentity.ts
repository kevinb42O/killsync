import type { CoopAdminRequest } from './protocol';

const OWNER_DB_NAME = 'killsync.coop-owner.v1';
const OWNER_STORE_NAME = 'credentials';
const OWNER_KEY_ID = 'owner-private-key';

/**
 * Public half of the one owner identity accepted by co-op hosts. It is not a
 * secret and may safely ship in the browser bundle. The matching private key
 * is provisioned only on the owner's browser.
 */
export const COOP_OWNER_PUBLIC_KEY: JsonWebKey = {
  kty: 'EC',
  crv: 'P-256',
  x: '8f_y0puJqdlFrHgwgAEmouomUdIu1i_6f_JfMqqgkIY',
  y: 'G9naQn6hduS0MiEn9x_J4tOtTZyxClqb0DdWSqsllgE',
  ext: true,
};

let privateKeyPromise: Promise<CryptoKey | null> | undefined;
let publicKeyPromise: Promise<CryptoKey> | undefined;
let requestSequence = 0;

const bytesToBase64Url = (bytes: Uint8Array) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const base64UrlToBytes = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
};

const canonicalRequest = (request: Omit<CoopAdminRequest, 'signature'>) => JSON.stringify([
  request.id,
  request.sessionId,
  request.actorPlayerId,
  request.issuedAt,
  request.sequence,
  request.command,
]);

const openOwnerDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(OWNER_DB_NAME, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(OWNER_STORE_NAME)) request.result.createObjectStore(OWNER_STORE_NAME);
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('Could not open owner credential storage.'));
});

const readPrivateKey = async (): Promise<CryptoKey | null> => {
  if (typeof indexedDB === 'undefined') return null;
  const database = await openOwnerDatabase();
  try {
    return await new Promise<CryptoKey | null>((resolve, reject) => {
      const request = database.transaction(OWNER_STORE_NAME, 'readonly').objectStore(OWNER_STORE_NAME).get(OWNER_KEY_ID);
      request.onsuccess = () => resolve(request.result instanceof CryptoKey ? request.result : null);
      request.onerror = () => reject(request.error || new Error('Could not read owner credential.'));
    });
  } finally {
    database.close();
  }
};

const writePrivateKey = async (key: CryptoKey) => {
  const database = await openOwnerDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(OWNER_STORE_NAME, 'readwrite').objectStore(OWNER_STORE_NAME).put(key, OWNER_KEY_ID);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Could not store owner credential.'));
    });
  } finally {
    database.close();
  }
};

const ownerPrivateKey = () => privateKeyPromise ||= readPrivateKey().catch(() => null);

const ownerPublicKey = () => publicKeyPromise ||= crypto.subtle.importKey(
  'jwk',
  COOP_OWNER_PUBLIC_KEY,
  { name: 'ECDSA', namedCurve: 'P-256' },
  false,
  ['verify'],
);

export async function hasCoopOwnerCredential() {
  return Boolean(await ownerPrivateKey());
}

/** Import the private JWK recovery payload, then persist it as non-exportable. */
export async function importCoopOwnerRecoveryCode(value: string) {
  let candidate: JsonWebKey;
  try {
    const trimmed = value.trim();
    const decoded = trimmed.startsWith('{') ? trimmed : new TextDecoder().decode(base64UrlToBytes(trimmed));
    candidate = JSON.parse(decoded) as JsonWebKey;
  } catch {
    throw new Error('That owner recovery code is not valid.');
  }
  if (candidate.kty !== 'EC' || candidate.crv !== 'P-256' || !candidate.d
    || candidate.x !== COOP_OWNER_PUBLIC_KEY.x || candidate.y !== COOP_OWNER_PUBLIC_KEY.y) {
    throw new Error('That recovery code does not belong to this game owner.');
  }
  const key = await crypto.subtle.importKey(
    'jwk',
    { ...candidate, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  await writePrivateKey(key);
  privateKeyPromise = Promise.resolve(key);
  window.dispatchEvent(new Event('killsync-owner-changed'));
}

export async function signCoopAdminCommand(sessionId: string, actorPlayerId: string, command: string): Promise<CoopAdminRequest> {
  const key = await ownerPrivateKey();
  if (!key) throw new Error('This browser does not have the owner credential.');
  const issuedAt = Date.now();
  const sequence = issuedAt * 1000 + (++requestSequence % 1000);
  const unsigned: Omit<CoopAdminRequest, 'signature'> = {
    id: `owner-${issuedAt.toString(36)}-${requestSequence.toString(36)}`,
    sessionId,
    actorPlayerId: actorPlayerId.slice(0, 128),
    issuedAt,
    sequence,
    command: command.trim().slice(0, 512),
  };
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(canonicalRequest(unsigned)),
  );
  return { ...unsigned, signature: bytesToBase64Url(new Uint8Array(signature)) };
}

export async function verifyCoopAdminRequest(value: unknown, expectedSessionId: string): Promise<CoopAdminRequest | null> {
  if (!value || typeof value !== 'object') return null;
  const request = value as Partial<CoopAdminRequest>;
  if (typeof request.id !== 'string' || request.id.length < 1 || request.id.length > 96
    || request.sessionId !== expectedSessionId
    || typeof request.actorPlayerId !== 'string' || request.actorPlayerId.length > 128
    || !Number.isSafeInteger(request.issuedAt) || Math.abs(Date.now() - (request.issuedAt || 0)) > 120_000
    || !Number.isSafeInteger(request.sequence) || (request.sequence || 0) < 1
    || typeof request.command !== 'string' || request.command.length < 1 || request.command.length > 512
    || typeof request.signature !== 'string' || request.signature.length > 256) return null;
  const unsigned: Omit<CoopAdminRequest, 'signature'> = {
    id: request.id,
    sessionId: request.sessionId,
    actorPlayerId: request.actorPlayerId,
    issuedAt: request.issuedAt,
    sequence: request.sequence,
    command: request.command,
  };
  try {
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      await ownerPublicKey(),
      base64UrlToBytes(request.signature),
      new TextEncoder().encode(canonicalRequest(unsigned)),
    );
    return valid ? { ...unsigned, signature: request.signature } : null;
  } catch {
    return null;
  }
}
