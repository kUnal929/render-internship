import { Controller, Post, Body, Get, UseGuards, Req } from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('auth')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('signup')
  async signup(@Body() body: any) {
    return this.userService.signup(body);
  }

  @Post('signin')
  async signin(@Body() body: any) {
    return this.userService.signin(body);
  }

  @Post('signout')
  async signout() {
    return { message: 'User signed out successfully' };
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req: any) {

    const fullUser = await this.userService.getUserById(req.user.userId);
    
    return {
      message: 'Profile fetched successfully',
      success: true,
      user: fullUser,
    };
  }
}
