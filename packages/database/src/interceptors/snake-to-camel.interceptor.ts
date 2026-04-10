import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import type { FastifyRequest } from 'fastify';

/**
 * Gelen POST/PATCH isteklerindeki snake_case body anahtarlarını camelCase'e dönüştürür.
 * Örnek: { "first_name": "Ahmet" } → { "firstName": "Ahmet" }
 *
 * Kullanım: useGlobalInterceptors(new SnakeToCamelInterceptor()) veya @UseInterceptors()
 */
@Injectable()
export class SnakeToCamelInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpCtx = ctx.switchToHttp();
    const req     = httpCtx.getRequest<FastifyRequest>();

    if ((req.method === 'POST' || req.method === 'PATCH') && req.body !== null && typeof req.body === 'object') {
      req.body = convertKeys(req.body as Record<string, unknown>);
    }

    return next.handle();
  }
}

function snakeToCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function convertKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(convertKeys);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
        snakeToCamel(k),
        convertKeys(v),
      ]),
    );
  }
  return obj;
}
