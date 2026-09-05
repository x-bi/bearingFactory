import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common'
import { AuthService } from './auth.service'
import type { AuthenticatedRequest } from './auth.types'
import { LoginDto } from './dto/login.dto'
import { JwtAuthGuard } from './jwt-auth.guard'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.username, dto.password)
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@Req() request: AuthenticatedRequest) {
    return this.authService.getProfile(request.user.id)
  }
}
