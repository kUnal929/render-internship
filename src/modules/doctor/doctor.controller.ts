import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { DoctorService } from './doctor.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('doctor')
export class DoctorController {
  constructor(private doctorService: DoctorService) {}

  @UseGuards(JwtAuthGuard)
  @Get('all')
  async getAllDoctors() {
    const doctors = await this.doctorService.getAllDoctors();
    return {
      message: 'All doctors fetched successfully',
      success: true,
      doctors,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('search/name')
  async searchByName(
    @Query('firstName') firstName?: string,
    @Query('lastName') lastName?: string,
  ) {
    const doctors = await this.doctorService.searchByName(firstName, lastName);
    return {
      message: 'Doctors found by name',
      success: true,
      doctors,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('search/specialization')
  async searchBySpecialization(@Query('specialization') specialization: string) {
    const doctors = await this.doctorService.searchBySpecialization(specialization);
    return {
      message: 'Doctors found by specialization',
      success: true,
      doctors,
    };
  }
}
