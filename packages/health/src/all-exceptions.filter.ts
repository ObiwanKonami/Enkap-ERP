import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';

/**
 * Global exception filter — tüm NestJS servislerinde kullanılır.
 *
 * `instanceof HttpException` yerine duck typing kullanılır:
 * monorepo ortamında farklı paket instance'larından gelen class'lar
 * instanceof kontrolünü geçemeyebilir.
 *
 * Davranış:
 *  - HttpException      → kendi status/message bilgisini aynen döndürür
 *  - QueryFailedError   → PostgreSQL hata kodu ile 409/400
 *  - EntityNotFoundError→ 404
 *  - Diğer hatalar      → development: gerçek mesaj; production: genel 500
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx   = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();

    let status  = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'İç sunucu hatası.';
    let error   = 'Internal Server Error';
    let details: unknown;

    // ── HttpException (duck typing — instanceof class identity sorununu önler) ─
    if (isHttpException(exception)) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
        error   = exception.constructor?.name ?? 'HttpException';
      } else if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, unknown>;
        message = (r.message as string | string[]) ?? message;
        error   = (r.error as string) ?? exception.constructor?.name ?? 'HttpException';
        if (r.details !== undefined) details = r.details;
      }

    // ── TypeORM: QueryFailedError ─────────────────────────────────────────────
    } else if (isQueryFailedError(exception)) {
      const qfe    = exception as unknown as Record<string, unknown>;
      const code   = qfe.code   as string | undefined;
      const detail = qfe.detail as string | undefined;
      this.logger.error(`QueryFailedError [${code ?? '?'}]: ${detail ?? exception.message}`);

      if (code === '23505') {          // unique violation
        status  = HttpStatus.CONFLICT;
        error   = 'Conflict';
        message = detail ?? 'Bu kayıt zaten mevcut.';
      } else if (code === '23503') {  // foreign key violation
        status  = HttpStatus.BAD_REQUEST;
        error   = 'Bad Request';
        message = detail
          ? `İlgili kayıt bulunamadı: ${detail}`
          : 'İlgili kayıt bulunamadı (yabancı anahtar ihlali).';
      } else {
        status  = HttpStatus.BAD_REQUEST;
        error   = 'Database Error';
        message = process.env.NODE_ENV !== 'production'
          ? (detail ?? exception.message)
          : 'Veritabanı hatası oluştu.';
      }

    // ── TypeORM: EntityNotFoundError ─────────────────────────────────────────
    } else if (
      exception instanceof Error &&
      exception.constructor.name === 'EntityNotFoundError'
    ) {
      status  = HttpStatus.NOT_FOUND;
      error   = 'Not Found';
      message = 'Kayıt bulunamadı.';

    // ── Bilinmeyen / beklenmedik hatalar ──────────────────────────────────────
    } else if (exception instanceof Error) {
      this.logger.error(
        `${exception.constructor.name}: ${exception.message}`,
        exception.stack,
      );
      if (process.env.NODE_ENV !== 'production') {
        error   = exception.constructor.name;
        message = exception.message;
      }
    } else {
      this.logger.error('Bilinmeyen hata türü:', String(exception));
    }

    const body: Record<string, unknown> = { statusCode: status, error, message };
    if (details !== undefined) body.details = details;

    void reply.status(status).send(body);
  }
}

// ─── Duck typing yardımcıları ────────────────────────────────────────────────

interface HttpExceptionLike {
  getStatus(): number;
  getResponse(): string | Record<string, unknown>;
  constructor?: { name?: string };
}

function isHttpException(e: unknown): e is HttpExceptionLike {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as Record<string, unknown>).getStatus   === 'function' &&
    typeof (e as Record<string, unknown>).getResponse === 'function'
  );
}

function isQueryFailedError(e: unknown): e is Error {
  return e instanceof Error && e.constructor.name === 'QueryFailedError';
}
