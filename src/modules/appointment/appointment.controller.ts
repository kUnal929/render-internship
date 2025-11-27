import { Controller, Post, Get, Body, Param, Request, UseGuards, Patch, Delete } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AppointmentService } from './appointment.service';
import { DoctorGuard } from '../../guards/doctor.guard';

@Controller('appointments')
export class AppointmentController {
  constructor(private appointmentService: AppointmentService) {}

  @Post('book-wave')
  @UseGuards(AuthGuard('jwt'))
  async bookWaveSlot(@Body() body: any, @Request() req: any) {
    const result = await this.appointmentService.bookWaveSlot({
      patient_id: body.patient_id,
      doctor_id: body.doctor_id,
      slot_id: body.slot_id,
      appointment_date: body.appointment_date,
    });
    return result;
  }

  @Post('book-stream')
  @UseGuards(AuthGuard('jwt'))
  async bookStreamSlot(@Body() body: any, @Request() req: any) {
    const result = await this.appointmentService.bookStreamSlot({
      patient_id: body.patient_id,
      doctor_id: body.doctor_id,
      appointment_date: body.appointment_date,
    });
    return result;
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  async getAppointmentById(@Param('id') appointmentId: number) {
    const result = await this.appointmentService.getAppointmentById(appointmentId);
    return result;
  }

  @Patch('reschedule-all')
  @UseGuards(AuthGuard('jwt'), DoctorGuard)
  async rescheduleAllFutureAppointments(@Body() body: any) {
    const result = await this.appointmentService.rescheduleAllFutureAppointments(
      body.doctor_id,
      body.appointment_date,
      body.shift_minutes,
    );
    return result;
  }

  @Patch('reschedule-selected')
  @UseGuards(AuthGuard('jwt'), DoctorGuard)
  async rescheduleSelectedAppointments(@Body() body: any) {
    const result = await this.appointmentService.rescheduleSelectedAppointments(
      body.doctor_id,
      body.appointment_ids,
      body.shift_minutes,
    );
    return result;
  }

  @Delete('delete')
  @UseGuards(AuthGuard('jwt'))
  async cancelAppointment(@Body() body: any, @Request() req: any) {
    const result = await this.appointmentService.cancelAppointment(
      body.appointment_id,
      req.user.userId, // changed from id to userId
      req.user.role,
    );
    return result;
  }
}
