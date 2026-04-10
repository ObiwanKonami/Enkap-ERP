/**
 * BFF (Backend For Frontend) Proxy
 *
 * Tüm microservice çağrılarını Next.js sunucu tarafından yönetir.
 * Client: /api/{service}/{...path} → Bu proxy → {SERVICE_URL}/api/v1/{...path}
 *
 * Örnek:
 *   GET /api/financial/invoices?limit=20
 *   → GET http://localhost:3003/api/v1/invoices?limit=20
 */
import { type NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const SERVICE_MAP: Record<string, string | undefined> = {
  financial:     process.env.FINANCIAL_SERVICE_URL   ?? 'http://localhost:3003',
  stock:         process.env.STOCK_SERVICE_URL        ?? 'http://localhost:3004',
  hr:            process.env.HR_SERVICE_URL           ?? 'http://localhost:3007',
  crm:           process.env.CRM_SERVICE_URL          ?? 'http://localhost:3009',
  billing:       process.env.BILLING_SERVICE_URL      ?? 'http://localhost:3008',
  analytics:     process.env.ANALYTICS_SERVICE_URL   ?? 'http://localhost:3010',
  tenant:        process.env.TENANT_SERVICE_URL       ?? 'http://localhost:3002',
  'auth-svc':    process.env.AUTH_SERVICE_URL         ?? 'http://localhost:3001',
  'webhook-hub': process.env.WEBHOOK_HUB_URL          ?? 'http://localhost:3006',
  treasury:      process.env.TREASURY_SERVICE_URL     ?? 'http://localhost:3013',
  purchase:      process.env.PURCHASE_SERVICE_URL     ?? 'http://localhost:3011',
  order:         process.env.ORDER_SERVICE_URL          ?? 'http://localhost:3012',
  manufacturing:  process.env.MANUFACTURING_SERVICE_URL  ?? 'http://localhost:3014',
  'ai-assistant': process.env.AI_ASSISTANT_SERVICE_URL   ?? 'http://localhost:3016',
  fleet:          process.env.FLEET_SERVICE_URL           ?? 'http://localhost:3017',
  waybill:        process.env.WAYBILL_SERVICE_URL         ?? 'http://localhost:3018',
  notification:   process.env.NOTIFICATION_SERVICE_URL   ?? 'http://localhost:3019',
};

// Bu servisler /api/v1/ prefix'i yerine kendi path yapısını kullanır
const NO_V1_PREFIX = new Set(['webhook-hub']);

type Params = Promise<{ service: string; path: string[] }>;

async function proxy(req: NextRequest, { params }: { params: Params }): Promise<NextResponse> {
  const resolvedParams = await params;
  const serviceBase = SERVICE_MAP[resolvedParams.service];
  if (!serviceBase) {
    return NextResponse.json({ error: `Bilinmeyen servis: ${resolvedParams.service}` }, { status: 404 });
  }

  // Oturumdan token al
  const session = await getServerSession(authOptions);
  const targetPath = resolvedParams.path.join('/');
  const prefix     = NO_V1_PREFIX.has(resolvedParams.service) ? '' : '/api/v1';
  const targetUrl  = `${serviceBase}${prefix}/${targetPath}${req.nextUrl.search}`;

  const reqHeaders: Record<string, string> = {
    'Content-Type': req.headers.get('content-type') ?? 'application/json',
  };
  if (session?.user.accessToken) {
    reqHeaders['Authorization'] = `Bearer ${session.user.accessToken}`;
  }

  // Body aktar (GET/HEAD hariç)
  let body: string | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await req.text();
  }

  const upstream = await fetch(targetUrl, {
    method:  req.method,
    headers: reqHeaders,
    body,
  }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Servis erişilemez';
    return new Response(JSON.stringify({ error: msg }), { status: 503 });
  });

  // Binary yanıtları (PDF, Excel) doğrudan aktar
  const ct = upstream.headers.get('content-type') ?? '';
  const cd = upstream.headers.get('content-disposition') ?? '';
  if (
    ct.includes('application/pdf') ||
    ct.includes('spreadsheetml') ||
    ct.includes('octet-stream') ||
    ct.includes('xml')
  ) {
    const buffer = await upstream.arrayBuffer();
    return new NextResponse(buffer, {
      status: upstream.status,
      headers: {
        'Content-Type':        ct,
        'Content-Disposition': cd,
      },
    });
  }

  // JSON yanıtlar
  const text = await upstream.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = { message: text };
  }

  return NextResponse.json(data, { status: upstream.status });
}

export const GET     = (req: NextRequest, ctx: { params: Params }) => proxy(req, ctx);
export const POST    = (req: NextRequest, ctx: { params: Params }) => proxy(req, ctx);
export const PATCH   = (req: NextRequest, ctx: { params: Params }) => proxy(req, ctx);
export const PUT     = (req: NextRequest, ctx: { params: Params }) => proxy(req, ctx);
export const DELETE  = (req: NextRequest, ctx: { params: Params }) => proxy(req, ctx);
