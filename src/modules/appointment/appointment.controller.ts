import { Controller, Post, Get, Body, Param, Request } from '@nestjs/common';
import { AppointmentService } from './appointment.service';

@Controller('appointments')
export class AppointmentController {
  constructor(private appointmentService: AppointmentService) {}

  @Post('book-wave')
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
  async bookStreamSlot(@Body() body: any, @Request() req: any) {
    const result = await this.appointmentService.bookStreamSlot({
      patient_id: body.patient_id,
      doctor_id: body.doctor_id,
      appointment_date: body.appointment_date,
    });
    return result;
  }

  @Get(':id')
  async getAppointmentById(@Param('id') appointmentId: number) {
    const result = await this.appointmentService.getAppointmentById(appointmentId);
    return result;
  }
}
