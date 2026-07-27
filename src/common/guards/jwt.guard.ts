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
    // Add your custom authentication logic here
    // For example, call super.logIn(request) to establish a session
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    // You can throw an exception based on either "info" or "err" arguments
    if (err || !user) {
      this.logger.debug(
        `Authentication failed: ${info?.message || 'No user found'}`,
      );
      throw err || new UnauthorizedException('Invalid or expired token');
    }
    return user;
  }
}
