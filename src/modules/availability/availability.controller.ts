import { Controller, Post, Body, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('doctors')
export class AvailabilityController {
  constructor(private availabilityService: AvailabilityService) {}

  // Create new availability record
  @UseGuards(JwtAuthGuard)
  @Post('availability')
  async createAvailability(@Body() body: any) {
    const result: any = await this.availabilityService.createAvailability(body);
    
    // If error response, return as is
    if (!result.success) {
      return result;
    }
    
    return {
      message: 'Availability created successfully',
      success: true,
      availability: result,
    };
  }

  
// Get available slots for a doctor on a specific date
  @UseGuards(JwtAuthGuard)
  @Get(':id/available-slots')
  async getAvailableSlots(
    @Param('id') doctorId: string,
    @Query('date') date: string,
  ) {
    if (!date) {
      return {
        success: false,
        message: 'Date query parameter is required (format: YYYY-MM-DD)',
      };
    }

    const slots = await this.availabilityService.getAvailableSlots(
      Number(doctorId),
      date,
    );

    return {
      success: true,
      ...slots,
    };
  }
}

