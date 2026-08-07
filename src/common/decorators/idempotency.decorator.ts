// src/common/decorators/idempotency.decorator.ts

import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const IdempotencyKey = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    // Check both lowercase and uppercase variants
    return (
      request.headers['idempotency-key'] || request.headers['Idempotency-Key']
    );
  },
);
