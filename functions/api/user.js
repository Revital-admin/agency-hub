export async function onRequest(context) {
  // Read the Cloudflare Access header for the authenticated user's email
  const email = context.request.headers.get('Cf-Access-Authenticated-User-Email') || 'Guest';
  
  return new Response(JSON.stringify({ email }), {
    headers: {
      'Content-Type': 'application/json',
      // Ensure no caching for this endpoint so it's always accurate per-user
      'Cache-Control': 'no-store, max-age=0'
    }
  });
}
