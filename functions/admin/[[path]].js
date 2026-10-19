import { adminPage } from '../../lib/admin-page.js';

export async function onRequest({ request, env }) {
    if (request.method !== 'GET' || !['/admin', '/admin/'].includes(new URL(request.url).pathname)) return new Response('Not found', { status: 404 });
    return adminPage(request, env);
}
