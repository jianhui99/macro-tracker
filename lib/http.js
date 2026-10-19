export const now = () => Math.floor(Date.now() / 1000);
export const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export function fail(status, error) { throw json({ error }, status); }
export const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
export async function digest(value) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
}
export function cookieValue(request, name) {
    return (request.headers.get('Cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${name}=`))?.slice(name.length + 1) || '';
}
export function cookie(name, value, seconds) {
    return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
}
export function sameOrigin(request) {
    if (request.headers.get('Origin') !== new URL(request.url).origin) fail(403, 'origin_rejected');
}
export async function readBody(request, limit = 65536) {
    if (!request.headers.get('Content-Type')?.includes('application/json')) fail(415, 'json_required');
    const reader = request.body?.getReader();
    if (!reader) fail(400, 'invalid_json');
    const chunks = []; let size = 0;
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) { await reader.cancel(); fail(413, 'request_too_large'); }
        chunks.push(value);
    }
    const data = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
    try {
        const body = JSON.parse(new TextDecoder().decode(data));
        if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'invalid_json');
        return body;
    } catch (error) { if (error instanceof Response) throw error; fail(400, 'invalid_json'); }
}
export async function rateLimit(db, scope, identifier, max, seconds = 900) {
    const key = `${scope}:${await digest(identifier)}:${Math.floor(now() / seconds)}`;
    const row = await db.prepare(`INSERT INTO request_limits (key, count, expires_at) VALUES (?, 1, ?)
        ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count`).bind(key, now() + seconds).first();
    if (row.count > max) fail(429, 'rate_limited');
}
