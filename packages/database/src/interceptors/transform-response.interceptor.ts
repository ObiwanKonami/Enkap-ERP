import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * `{ items, total }` → `{ data: items, total }` dönüşümünü otomatik yapar.
 * Tüm servislerde `useGlobalInterceptors()` ile kayıt edilmeli.
 */
@Injectable()
export class TransformResponseInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((value: unknown) => {
        if (
          value !== null &&
          typeof value === 'object' &&
          !Array.isArray(value) &&
          'items' in value &&
          'total' in value &&
          !('data' in value)
        ) {
          const v = value as { items: unknown; total: unknown };
          return { data: v.items, total: v.total };
        }
        return value;
      }),
    );
  }
}
