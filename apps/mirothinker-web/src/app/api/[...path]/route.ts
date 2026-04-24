import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_INTERNAL_URL || 'http://miroflow-api:8002';

async function proxyFetch(request: NextRequest, path: string[], method: string) {
  const url = new URL(request.url);
  const targetPath = path.join('/');
  const targetUrl = `${API_URL}/api/${targetPath}${url.search}`;

  const headers: Record<string, string> = {
    Accept: request.headers.get('accept') || 'application/json',
  };
  const contentType = request.headers.get('content-type');
  if (contentType) headers['Content-Type'] = contentType;

  // Forward Authorization header from client to backend
  const authHeader = request.headers.get('authorization');
  if (authHeader) headers['Authorization'] = authHeader;

  const init: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(120000),
  };

  if (method !== 'GET' && method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  const response = await fetch(targetUrl, init);

  // Stream SSE and chunked responses instead of buffering
  const respContentType = response.headers.get('content-type') || '';
  if (respContentType.includes('text/event-stream') || respContentType.includes('text/plain')) {
    // Forward as streaming response
    const respHeaders = new Headers();
    respHeaders.set('Content-Type', respContentType);
    respHeaders.set('Cache-Control', 'no-cache');
    respHeaders.set('Connection', 'keep-alive');
    respHeaders.set('X-Accel-Buffering', 'no'); // Disable nginx buffering

    return new NextResponse(response.body, {
      status: response.status,
      headers: respHeaders,
    });
  }

  // Regular JSON/binary responses: buffer as before
  const body = await response.arrayBuffer();
  const respHeaders = new Headers();
  if (respContentType) respHeaders.set('Content-Type', respContentType);

  return new NextResponse(body, { status: response.status, headers: respHeaders });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxyFetch(request, path, 'GET');
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxyFetch(request, path, 'POST');
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxyFetch(request, path, 'DELETE');
}


