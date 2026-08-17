import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtGuard.name);

  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    // Handle JWT errors
    if (err || !user) {
      let message = 'Unauthorized';

      if (info?.name === 'TokenExpiredError') {
        message = 'Access token expired';
      } else if (info?.name === 'JsonWebTokenError') {
        message = 'Invalid access token';
      } else if (info?.name === 'NotBeforeError') {
        message = 'Token not yet active';
      }

      this.logger.debug(`JWT Guard: ${message}`);
      throw new UnauthorizedException(message);
    }

    return user;
  }
}
