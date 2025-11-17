import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class DoctorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // From JWT token

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    if (user.role !== 'doctor') {
      throw new ForbiddenException('Only doctors can access this route');
    }

    return true;
  }
}
