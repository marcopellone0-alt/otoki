import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  const client_id = process.env.SPOTIFY_CLIENT_ID || '';
  const client_secret = process.env.SPOTIFY_CLIENT_SECRET || '';

  const host = request.headers.get('host') || '';
  const isLocal = host.includes('localhost') || host.includes('127.0.0.1');

  const baseUrl = isLocal ? 'http://127.0.0.1:3000' : `https://${host}`;
  const redirect_uri = `${baseUrl}/api/callback`;

  const accountsDomain = ["accounts", "spotify", "com"].join(".");
  const spotTokenUrl = `https://${accountsDomain}/api/token`;

  const tokenResponse = await fetch(spotTokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${client_id}:${client_secret}`).toString('base64')
    },
    body: new URLSearchParams({
      code: code || '',
      redirect_uri: redirect_uri,
      grant_type: 'authorization_code'
    })
  });

  const data = await tokenResponse.json();
  
  // We attach the cookie directly to the redirect rocket
  const finalResponse = NextResponse.redirect(`${baseUrl}/`);

  if (data.access_token) {
    // THE FIX: Explicitly tell Firefox this is a safe, local cookie
    finalResponse.cookies.set({
      name: 'spotify_access_token',
      value: data.access_token,
      path: '/',
      maxAge: 3600,
      sameSite: 'lax', // Crucial for OAuth redirects
      secure: false,   // Crucial because we are on HTTP, not HTTPS
      httpOnly: true
    });
    console.log("\n✅ MASTER KEY SUCCESSFULLY SAVED TO VAULT\n");
  }

  return finalResponse;
}