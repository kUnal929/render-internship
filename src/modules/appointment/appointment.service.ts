import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Appointment } from './appointment.entity';
import { Slot } from '../slot/slot.entity';
import { Availability } from '../availability/availability.entity';
import { Patient } from '../patient/patient.entity';
import { Doctor } from '../doctor/doctor.entity';
import { User } from '../user/user.entity';

@Injectable()
export class AppointmentService {
  constructor(
    @InjectRepository(Appointment)
    private appointmentRepo: Repository<Appointment>,
    @InjectRepository(Slot)
    private slotRepo: Repository<Slot>,
    @InjectRepository(Availability)
    private availabilityRepo: Repository<Availability>,
    @InjectRepository(Patient)
    private patientRepo: Repository<Patient>,
    @InjectRepository(Doctor)
    private doctorRepo: Repository<Doctor>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  // Book wave slot appointment
  async bookWaveSlot(data: any) {
    // Find patient
    const patient = await this.patientRepo.findOne({
      where: { patient_id: data.patient_id },
    });

    if (!patient) {
      return {
        success: false,
        message: 'Patient not found',
      };
    }

    // Find the specific slot by slot_id
    const slot = await this.slotRepo.findOne({
      where: {
        slot_id: Number(data.slot_id),
      },
      relations: ['availability', 'doctor'],
    });

    if (!slot) {
      return {
        success: false,
        message: 'Slot not found',
      };
    } 

    // Get availability to check capacity
    const availability = await this.availabilityRepo.findOne({
      where: { availability_id: slot.availability.availability_id },
      relations: ['doctor'],
    });

    if (!availability) {
      return {
        success: false,
        message: 'Availability not found',
      };
    }

    // Check if slot has capacity
    if (slot.booked_count >= availability.capacity_per_slot) {
      return {
        success: false,
        message: 'Slot is full',
      };
    }

    // Create appointment with slot times
    const appointment = this.appointmentRepo.create({
      patient: patient,
      doctor: slot.doctor,
      appointment_date: slot.slot_date,
      appointment_start_time: slot.start_time,
      appointment_end_time: slot.end_time,
      status: 'confirmed',
    });

    await this.appointmentRepo.save(appointment);

    // Update slot booked_count
    slot.booked_count += 1;
    await this.slotRepo.save(slot);

    // Fetch patient and doctor names
    const patientWithUser = await this.patientRepo.findOne({
      where: { patient_id: patient.patient_id },
      relations: ['user'],
    });
    const doctorWithUser = await this.doctorRepo.findOne({
      where: { doctor_id: slot.doctor.doctor_id },
      relations: ['user'],
    });

    return {
      success: true,
      message: 'Appointment booked successfully',
      appointment: {
        ...appointment,
        patient_name: `${patientWithUser?.user?.firstName} ${patientWithUser?.user?.lastName}`,
        doctor_name: `${doctorWithUser?.user?.firstName} ${doctorWithUser?.user?.lastName}`,
      },
    };
  }

  // Book stream slot appointment
  async bookStreamSlot(data: any) {
    // Find patient
    const patient = await this.patientRepo.findOne({
      where: { patient_id: data.patient_id },
    });

    if (!patient) {
      return {
        success: false,
        message: 'Patient not found',
      };
    }

    // Find availability for the doctor (stream type)
    const availability = await this.availabilityRepo.findOne({
      where: {
        doctor: { doctor_id: data.doctor_id },
        schedule_type: 'stream',
      },
      relations: ['doctor'],
    });

    if (!availability) {
      return {
        success: false,
        message: 'Availability not found',
      };
    }

    // Validate appointment date against recurrence pattern
    const appointmentDate = new Date(data.appointment_date);
    const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const dayOfWeek = dayNames[appointmentDate.getDay()];
    const recurringDays = availability.recurrence_days.split(',');

    // Check if date is within recurrence range
    const startDate = new Date(availability.recurrence_start_date);
    const endDate = new Date(availability.recurrence_end_date);
    
    if (appointmentDate < startDate || appointmentDate > endDate) {
      return {
        success: false,
        message: 'Appointment date is outside availability recurrence range',
      };
    }

    // Check if day matches recurrence pattern
    if (!recurringDays.includes(dayOfWeek)) {
      return {
        success: false,
        message: `Doctor is not available on ${dayOfWeek}. Available days: ${availability.recurrence_days}`,
      };
    }

    // Check if stream has capacity
    if (availability.booked_count >= availability.total_capacity) {
      return {
        success: false,
        message: 'Stream is full',
      };
    }

    // Query last appointment for this availability on this date
    const lastAppointment = await this.appointmentRepo.findOne({
      where: {
        doctor: { doctor_id: availability.doctor.doctor_id },
        appointment_date: appointmentDate,
      },
      order: { appointment_end_time: 'DESC' },
    });

    let startTime: string;
    let endTime: string;

    if (!lastAppointment) {
      // No appointments yet, start from availability start time
      startTime = availability.start_time;
      endTime = this.addMinutesToTime(startTime, 30);
    } else {
      // Start from last appointment end time
      startTime = lastAppointment.appointment_end_time;
      endTime = this.addMinutesToTime(startTime, 30);

      // Check if end time exceeds availability end time
      if (
        this.timeToMinutes(endTime) > this.timeToMinutes(availability.end_time)
      ) {
        return {
          success: false,
          message: 'No available time slot in this stream',
        };
      }
    }

    // Create appointment with auto-assigned times
    const appointment = this.appointmentRepo.create({
      patient: patient,
      doctor: availability.doctor,
      appointment_date: appointmentDate,
      appointment_start_time: startTime,
      appointment_end_time: endTime,
      status: 'confirmed',
    });

    await this.appointmentRepo.save(appointment);

    // Update availability booked_count
    availability.booked_count += 1;
    await this.availabilityRepo.save(availability);

    // Fetch patient and doctor names
    const patientWithUser = await this.patientRepo.findOne({
      where: { patient_id: patient.patient_id },
      relations: ['user'],
    });
    const doctorWithUser = await this.doctorRepo.findOne({
      where: { doctor_id: availability.doctor.doctor_id },
      relations: ['user'],
    });

    return {
      success: true,
      message: `Appointment booked successfully. Auto-assigned time: ${startTime} - ${endTime}`,
      appointment: {
        ...appointment,
        patient_name: `${patientWithUser?.user?.firstName} ${patientWithUser?.user?.lastName}`,
        doctor_name: `${doctorWithUser?.user?.firstName} ${doctorWithUser?.user?.lastName}`,
      },
    };
  }

  // Get appointment by ID
  async getAppointmentById(appointmentId: number) {
    const appointment = await this.appointmentRepo.findOne({
      where: { appointment_id: appointmentId },
      relations: ['patient', 'doctor'],
    });

    if (!appointment) {
      return {
        success: false,
        message: 'Appointment not found',
      };
    }

    // Fetch patient and doctor names
    const patientWithUser = await this.patientRepo.findOne({
      where: { patient_id: appointment.patient.patient_id },
      relations: ['user'],
    });
    const doctorWithUser = await this.doctorRepo.findOne({
      where: { doctor_id: appointment.doctor.doctor_id },
      relations: ['user'],
    });

    return {
      success: true,
      appointment: {
        ...appointment,
        patient_name: `${patientWithUser?.user?.firstName} ${patientWithUser?.user?.lastName}`,
        doctor_name: `${doctorWithUser?.user?.firstName} ${doctorWithUser?.user?.lastName}`,
      },
    };
  }

  // Helper function to convert time to minutes
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  // Helper function to add minutes to time
  private addMinutesToTime(time: string, minutes: number): string {
    const totalMinutes = this.timeToMinutes(time) + minutes;
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }
}
