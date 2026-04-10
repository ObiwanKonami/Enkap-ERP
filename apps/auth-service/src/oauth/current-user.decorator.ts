import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from '@enkap/shared-types';

/**
 * JWT guard tarafından request.user'a atanan payload'ı enjekte eder.
 * Sadece JwtGuard korumalı endpoint'lerde kullanılır.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    return request.user;
  },
);
