"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AllExceptionsFilter = void 0;
const common_1 = require("@nestjs/common");
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
let AllExceptionsFilter = class AllExceptionsFilter {
    constructor() {
        this.logger = new common_1.Logger('ExceptionFilter');
    }
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const reply = ctx.getResponse();
        let status = common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'İç sunucu hatası.';
        let error = 'Internal Server Error';
        let details;
        // ── HttpException (duck typing — instanceof class identity sorununu önler) ─
        if (isHttpException(exception)) {
            status = exception.getStatus();
            const res = exception.getResponse();
            if (typeof res === 'string') {
                message = res;
                error = exception.constructor?.name ?? 'HttpException';
            }
            else if (typeof res === 'object' && res !== null) {
                const r = res;
                message = r.message ?? message;
                error = r.error ?? exception.constructor?.name ?? 'HttpException';
                if (r.details !== undefined)
                    details = r.details;
            }
            // ── TypeORM: QueryFailedError ─────────────────────────────────────────────
        }
        else if (isQueryFailedError(exception)) {
            const qfe = exception;
            const code = qfe.code;
            const detail = qfe.detail;
            this.logger.error(`QueryFailedError [${code ?? '?'}]: ${detail ?? exception.message}`);
            if (code === '23505') { // unique violation
                status = common_1.HttpStatus.CONFLICT;
                error = 'Conflict';
                message = detail ?? 'Bu kayıt zaten mevcut.';
            }
            else if (code === '23503') { // foreign key violation
                status = common_1.HttpStatus.BAD_REQUEST;
                error = 'Bad Request';
                message = 'İlgili kayıt bulunamadı (yabancı anahtar ihlali).';
            }
            else {
                status = common_1.HttpStatus.BAD_REQUEST;
                error = 'Database Error';
                message = process.env.NODE_ENV !== 'production'
                    ? (detail ?? exception.message)
                    : 'Veritabanı hatası oluştu.';
            }
            // ── TypeORM: EntityNotFoundError ─────────────────────────────────────────
        }
        else if (exception instanceof Error &&
            exception.constructor.name === 'EntityNotFoundError') {
            status = common_1.HttpStatus.NOT_FOUND;
            error = 'Not Found';
            message = 'Kayıt bulunamadı.';
            // ── Bilinmeyen / beklenmedik hatalar ──────────────────────────────────────
        }
        else if (exception instanceof Error) {
            this.logger.error(`${exception.constructor.name}: ${exception.message}`, exception.stack);
            if (process.env.NODE_ENV !== 'production') {
                error = exception.constructor.name;
                message = exception.message;
            }
        }
        else {
            this.logger.error('Bilinmeyen hata türü:', String(exception));
        }
        const body = { statusCode: status, error, message };
        if (details !== undefined)
            body.details = details;
        void reply.status(status).send(body);
    }
};
exports.AllExceptionsFilter = AllExceptionsFilter;
exports.AllExceptionsFilter = AllExceptionsFilter = __decorate([
    (0, common_1.Catch)()
], AllExceptionsFilter);
function isHttpException(e) {
    return (typeof e === 'object' &&
        e !== null &&
        typeof e.getStatus === 'function' &&
        typeof e.getResponse === 'function');
}
function isQueryFailedError(e) {
    return e instanceof Error && e.constructor.name === 'QueryFailedError';
}
