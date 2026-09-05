import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { AuthenticatedRequest, AuthUser } from './auth.types'

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const [type, token] = request.headers.authorization?.split(' ') ?? []
    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('请先登录')
    }

    try {
      request.user = await this.jwt.verifyAsync<AuthUser>(token)
      return true
    } catch {
      throw new UnauthorizedException('登录已过期')
    }
  }
}
