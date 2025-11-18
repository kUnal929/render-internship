import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from './appointment.entity';
import { Slot } from '../slot/slot.entity';
import { Availability } from '../availability/availability.entity';
import { Patient } from '../patient/patient.entity';
import { Doctor } from '../doctor/doctor.entity';
import { User } from '../user/user.entity';
import { AppointmentService } from './appointment.service';
import { AppointmentController } from './appointment.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Appointment, Slot, Availability, Patient, Doctor, User]),
  ],
  controllers: [AppointmentController],
  providers: [AppointmentService],
  exports: [AppointmentService],
})
export class AppointmentModule {}
