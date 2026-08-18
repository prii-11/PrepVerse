// Storage client — Supabase Storage REST via global fetch, M6 (docs/17 D1-b).
//
// Design decisions (approved audit, docs/17 §8):
//   - D1: plain fetch, no SDK — mirrors groq.js:17-20 ("no SDK dependency").
//   - D2: signed URLs at STORAGE_CONFIG.signedUrlTtlSeconds (15 min, JWT parity).
//   - Single attempt per call, no retry loop (same posture as ai/providers).
//
// ONE provider call per function; every failure surfaces as StorageClientError
// with a storage-specific `details.category`. It deliberately does NOT: touch
// MongoDB, know about Resume documents, apply domain rules, or hold file
// buffers beyond the request — callers (resumes service in P2) own those.
//
// Transport contract (Supabase Storage API):
//   uploadObject  → POST  {SUPABASE_URL}/storage/v1/object/{bucket}/{path}
//   signedUrl     → POST  {SUPABASE_URL}/storage/v1/object/sign/{bucket}/{path}
//                    body { expiresIn } → { signedURL } (path or absolute URL)
//   deleteObject  → DELETE {SUPABASE_URL}/storage/v1/object/{bucket}/{path}
// All requests carry `Authorization: Bearer <service key>` (docs/06 §3.3:
// private bucket — server-generated signed access only, never public links).
const { STORAGE_CONFIG } = require('../config/storage');
const { StorageClientError } = require('../utils/errors');

const { SUPABASE_URL, SUPABASE_KEY, SUPABASE_BUCKET } = STORAGE_CONFIG;

const STORAGE_UNAVAILABLE = { category: 'STORAGE_UNAVAILABLE' };

// Encode each path segment so storageKeys with spaces or non-ASCII survive
// (filename sanitization is a caller concern — docs/06: MIME/size/sanitize
// before it ever reaches storage).
function encodePath(path) {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

function objectEndpoint(operation, path) {
  // operation is 'object' or 'object/sign'
  return `${SUPABASE_URL}/storage/v1/${operation}/${SUPABASE_BUCKET}/${encodePath(path)}`;
}

// Classifies a non-2xx response the way the AI classifier does for providers
// (classify.js) — storage has its own smaller taxonomy.
function classifyStorageFailure(status, message) {
  if (status === 401 || status === 403) {
    return { category: 'AUTHENTICATION_FAILED', upstreamStatus: status };
  }
  if (status === 404) {
    return { category: 'NOT_FOUND', upstreamStatus: status };
  }
  if (status === 409) {
    return { category: 'CONFLICT', upstreamStatus: status };
  }
  // Supabase reports duplicate uploads as 400 "The resource already exists".
  if (status === 400 && /already exists/i.test(message)) {
    return { category: 'CONFLICT', upstreamStatus: status };
  }
  if (status === 413) {
    return { category: 'PAYLOAD_TOO_LARGE', upstreamStatus: status };
  }
  return { category: 'STORAGE_UNAVAILABLE', upstreamStatus: status };
}

async function request(method, url, { body, contentType, ttlSeconds } = {}) {
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${SUPABASE_KEY}`,
        ...(contentType ? { 'Content-Type': contentType } : {}),
      },
      ...(body !== undefined ? { body } : {}),
      signal: AbortSignal.timeout(STORAGE_CONFIG.storageTimeoutMs),
    });
  } catch (error) {
    // Timeouts (AbortSignal.timeout) and network errors — one attempt, no
    // retry here; callers decide (mirrors groq.js:64-74).
    const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    throw new StorageClientError(
      isTimeout
        ? 'Object storage request timed out'
        : 'Object storage request failed',
      isTimeout ? { category: 'STORAGE_UNAVAILABLE', upstreamStatus: null } : STORAGE_UNAVAILABLE
    );
  }

  const text = await response.text().catch(() => null);
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const details = classifyStorageFailure(response.status, text ?? '');
    throw new StorageClientError('Object storage request failed', details);
  }

  return parsed;
}

// 2xx helpers keep the surface honest about what each endpoint returns: the
// upload endpoint replies 200 with JSON `{ Key }` (or an empty body on some
// configurations); the sign endpoint replies `{ signedURL }`; delete replies
// 2xx with no meaningful payload.

async function uploadObject(path, data, contentType) {
  const parsed = await request('POST', objectEndpoint('object', path), {
    body: data,
    contentType: contentType ?? 'application/octet-stream',
  });
  return typeof parsed?.Key === 'string' ? parsed.Key : path;
}

async function signedUrl(path) {
  const parsed = await request('POST', objectEndpoint('object/sign', path), {
    body: JSON.stringify({ expiresIn: STORAGE_CONFIG.signedUrlTtlSeconds }),
    contentType: 'application/json',
  });
  const urlPath = parsed?.signedURL;
  if (typeof urlPath !== 'string' || urlPath.length === 0) {
    // 2xx but an undecipherable envelope — treat like groq.js:90-97.
    throw new StorageClientError('Storage returned a signed URL without a URL', STORAGE_UNAVAILABLE);
  }
  // The response's signedURL is relative to the STORAGE API root on this
  // project: it comes back as "/object/sign/{bucket}/{path}?token=..." (the
  // /storage/v1 prefix belongs to the API base, not the returned path).
  // Older integrations documented "<base>/storage/v1/object/sign/..." —
  // handle both shapes, and return the full URL so callers can hand it
  // straight to the client (docs/06: signed short-lived URL, never a public
  // link).
  if (urlPath.startsWith('http')) {
    return urlPath;
  }
  if (urlPath.startsWith('/storage/v1/')) {
    return `${SUPABASE_URL}${urlPath}`;
  }
  return `${SUPABASE_URL}/storage/v1${urlPath}`;
}

async function deleteObject(path) {
  return request('DELETE', objectEndpoint('object', path));
}

module.exports = { uploadObject, signedUrl, deleteObject, STORAGE_CONFIG };