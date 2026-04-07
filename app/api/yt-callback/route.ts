import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: 'No code provided' }, { status: 400 });
  }

  const redirectUri = process.env.NODE_ENV === 'production'
    ? 'https://otoki.vercel.app/api/yt-callback'
    : 'http://localhost:3000/api/yt-callback';

  // Exchange the authorization code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const tokenData = await tokenRes.json();

  if (!tokenRes.ok) {
    console.error('[Otoki] Google token exchange failed:', tokenData);
    return NextResponse.json({ error: 'Token exchange failed' }, { status: 500 });
  }

  // Store the access token in a cookie
  const cookieStore = await cookies();
  cookieStore.set('yt_access_token', tokenData.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: tokenData.expires_in || 3600,
    path: '/',
  });

  // Redirect back to the app — recover gigs from session storage
  const baseUrl = process.env.NODE_ENV === 'production'
    ? 'https://otoki.vercel.app'
    : 'http://localhost:3000';

  return NextResponse.redirect(baseUrl);
}
