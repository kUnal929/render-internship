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

    // Validate that the appointment date matches the slot date
    const slotDate = new Date(slot.slot_date).toISOString().split('T')[0];
    const requestDate = new Date(data.appointment_date).toISOString().split('T')[0];
    
    if (slotDate !== requestDate) {
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

  // Reschedule all future appointments for a doctor on a specific date
  async rescheduleAllFutureAppointments(doctorId: number, appointmentDate: string, shiftMinutes: number) {
    // Validate shift_minutes
    if (typeof shiftMinutes !== 'number') {
      return {
        success: false,
        message: 'Shift minutes must be a number',
        error_code: 'INVALID_SHIFT_TYPE',
      };
    }

    const absoluteShift = Math.abs(shiftMinutes);
    if (absoluteShift < 10 || absoluteShift > 180) {
      return {
        success: false,
        message: 'Shift must be between 10 and 180 minutes',
        error_code: 'INVALID_SHIFT_RANGE',
      };
    }

    // Validate appointment_date
    if (!appointmentDate) {
      return {
        success: false,
        message: 'Appointment date is required',
        error_code: 'MISSING_DATE',
      };
    }

    // Validate doctor_id
    if (!doctorId) {
      return {
        success: false,
        message: 'Doctor ID is required',
        error_code: 'MISSING_DOCTOR_ID',
      };
    }

    try {
      // Get doctor
      const doctor = await this.doctorRepo.findOne({
        where: { doctor_id: doctorId },
      });

      if (!doctor) {
        return {
          success: false,
          message: 'Doctor not found',
          error_code: 'DOCTOR_NOT_FOUND',
        };
      }

      const targetDate = new Date(appointmentDate);
      targetDate.setHours(0, 0, 0, 0);

      // Get all appointments for this doctor on the specific date
      const appointments = await this.appointmentRepo.find({
        where: {
          doctor: { doctor_id: doctorId },
          appointment_date: targetDate,
          status: 'confirmed',
        },
        relations: ['patient', 'patient.user'],
      });

      if (appointments.length === 0) {
        return {
          success: true,
          message: 'No confirmed appointments found on this date to reschedule',
          data: {
            doctor_id: doctorId,
            appointment_date: appointmentDate,
            total_rescheduled: 0,
            appointments: [],
          },
        };
      }

      // Reschedule all appointments
      const rescheduledAppointments: any[] = [];

      for (const apt of appointments) {
        const oldStartTime = apt.appointment_start_time;
        const oldEndTime = apt.appointment_end_time;

        // Calculate new times
        const newStartTime = this.addMinutesToTime(oldStartTime, shiftMinutes);
        const newEndTime = this.addMinutesToTime(oldEndTime, shiftMinutes);

        // Update appointment
        apt.appointment_start_time = newStartTime;
        apt.appointment_end_time = newEndTime;
        await this.appointmentRepo.save(apt);

        const aptDateStr = typeof apt.appointment_date === 'string' 
          ? apt.appointment_date 
          : apt.appointment_date.toISOString().split('T')[0];

        rescheduledAppointments.push({
          appointment_id: apt.appointment_id,
          patient_name: `${apt.patient.user.firstName} ${apt.patient.user.lastName}`,
          old_time: `${oldStartTime}-${oldEndTime}`,
          new_time: `${newStartTime}-${newEndTime}`,
          appointment_date: aptDateStr,
        });
      }

      return {
        success: true,
        message: `${rescheduledAppointments.length} appointments rescheduled successfully`,
        data: {
          doctor_id: doctorId,
          appointment_date: appointmentDate,
          total_rescheduled: rescheduledAppointments.length,
          appointments: rescheduledAppointments,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: 'An error occurred during rescheduling',
        error: error.message,
      };
    }
  }

  // Reschedule selected appointments for a doctor
  async rescheduleSelectedAppointments(
    doctorId: number,
    appointmentIds: number[],
    shiftMinutes: number,
  ) {
    // Validate shift_minutes
    if (typeof shiftMinutes !== 'number') {
      return {
        success: false,
        message: 'Shift minutes must be a number',
        error_code: 'INVALID_SHIFT_TYPE',
      };
    }

    const absoluteShift = Math.abs(shiftMinutes);
    if (absoluteShift < 10 || absoluteShift > 180) {
      return {
        success: false,
        message: 'Shift must be between 10 and 180 minutes',
        error_code: 'INVALID_SHIFT_RANGE',
      };
    }

    // Validate appointment_ids
    if (!Array.isArray(appointmentIds)) {
      return {
        success: false,
        message: 'Appointment IDs must be an array',
        error_code: 'INVALID_APPOINTMENT_IDS_TYPE',
      };
    }

    if (appointmentIds.length === 0) {
      return {
        success: false,
        message: 'At least one appointment ID must be provided',
        error_code: 'EMPTY_APPOINTMENT_IDS',
      };
    }

    // Validate doctor_id
    if (!doctorId) {
      return {
        success: false,
        message: 'Doctor ID is required',
        error_code: 'MISSING_DOCTOR_ID',
      };
    }

    try {
      // Get doctor
      const doctor = await this.doctorRepo.findOne({
        where: { doctor_id: doctorId },
      });

      if (!doctor) {
        return {
          success: false,
          message: 'Doctor not found',
          error_code: 'DOCTOR_NOT_FOUND',
        };
      }

      const rescheduledAppointments: any[] = [];
      const failedAppointments: any[] = [];

      for (const aptId of appointmentIds) {
        const apt = await this.appointmentRepo.findOne({
          where: { appointment_id: aptId },
          relations: ['patient', 'patient.user', 'doctor'],
        });

        // Check if appointment exists
        if (!apt) {
          failedAppointments.push({
            appointment_id: aptId,
            reason: 'Appointment not found',
          });
          continue;
        }

        // Check if appointment belongs to this doctor
        if (apt.doctor.doctor_id !== doctorId) {
          failedAppointments.push({
            appointment_id: aptId,
            reason: 'Appointment does not belong to this doctor',
          });
          continue;
        }

        // Check if appointment is confirmed
        if (apt.status !== 'confirmed') {
          failedAppointments.push({
            appointment_id: aptId,
            reason: `Cannot reschedule ${apt.status} appointment`,
          });
          continue;
        }

        // Reschedule the appointment (no date restriction for selected appointments)
        const oldStartTime = apt.appointment_start_time;
        const oldEndTime = apt.appointment_end_time;

        const newStartTime = this.addMinutesToTime(oldStartTime, shiftMinutes);
        const newEndTime = this.addMinutesToTime(oldEndTime, shiftMinutes);

        apt.appointment_start_time = newStartTime;
        apt.appointment_end_time = newEndTime;
        await this.appointmentRepo.save(apt);

        const aptDateStr = typeof apt.appointment_date === 'string' 
          ? apt.appointment_date 
          : apt.appointment_date.toISOString().split('T')[0];

        rescheduledAppointments.push({
          appointment_id: apt.appointment_id,
          patient_name: `${apt.patient.user.firstName} ${apt.patient.user.lastName}`,
          old_time: `${oldStartTime}-${oldEndTime}`,
          new_time: `${newStartTime}-${newEndTime}`,
          appointment_date: aptDateStr,
        });
      }

      return {
        success: rescheduledAppointments.length > 0,
        message:
          rescheduledAppointments.length > 0
            ? `${rescheduledAppointments.length} appointment(s) rescheduled successfully`
            : 'No appointments were rescheduled',
        data: {
          doctor_id: doctorId,
          total_requested: appointmentIds.length,
          total_rescheduled: rescheduledAppointments.length,
          total_failed: failedAppointments.length,
          appointments: rescheduledAppointments,
          failed_appointments: failedAppointments,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: 'An error occurred during rescheduling',
        error: error.message,
      };
    }
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

  // Cancel appointment (by doctor or patient)
  async cancelAppointment(
    appointmentId: number,
    userId: number,
    userRole: string,
  ) {
    try {
      // Validate input
      if (!appointmentId || !userId || !userRole) {
        return {
          success: false,
          message: 'Missing required fields',
        };
      }

      if (!['doctor', 'patient'].includes(userRole)) {
        return {
          success: false,
          message: 'Invalid user role',
        };
      }

      // Fetch appointment with relations
      const appointment = await this.appointmentRepo.findOne({
        where: { appointment_id: appointmentId },
        relations: ['doctor', 'patient', 'doctor.user', 'patient.user'],
      });

      if (!appointment) {
        return {
          success: false,
          message: 'Appointment not found',
        };
      }

      // Check if appointment is already cancelled
      if (appointment.status === 'cancelled') {
        return {
          success: false,
          message: 'Appointment is already cancelled',
        };
      }

      // Check if appointment is in the past
      const appointmentDateTime = new Date(appointment.appointment_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (appointmentDateTime < today) {
        return {
          success: false,
          message: 'Cannot cancel past appointments',
        };
      }

      // Authorize: check if user owns this appointment
      if (userRole === 'doctor') {
        if (appointment.doctor.user.id !== userId) {
          return {
            success: false,
            message: 'Not authorized to cancel this appointment',
          };
        }
      } else if (userRole === 'patient') {
        if (appointment.patient.user.id !== userId) {
          return {
            success: false,
            message: 'Not authorized to cancel this appointment',
          };
        }
      }

      // Update appointment status to cancelled
      appointment.status = 'cancelled';
      appointment.cancelled_by = userRole;
      appointment.cancellation_date = new Date();

      await this.appointmentRepo.save(appointment);

      // Release slot capacity (decrement booked_count)
      // Find slots associated with this appointment
      const slots = await this.slotRepo.find({
        where: {
          doctor: { doctor_id: appointment.doctor.doctor_id },
          slot_date: appointment.appointment_date,
        },
        relations: ['availability'],
      });

      if (slots.length > 0) {
        const slot = slots[0]; // Assuming one slot per appointment
        if (slot.booked_count > 0) {
          slot.booked_count -= 1;
          await this.slotRepo.save(slot);
        }

        // Update availability booked_count
        const availability = await this.availabilityRepo.findOne({
          where: { availability_id: slot.availability.availability_id },
        });
        if (availability && availability.booked_count > 0) {
          availability.booked_count -= 1;
          await this.availabilityRepo.save(availability);
        }
      }

      return {
        success: true,
        message: 'Appointment cancelled successfully',
        appointment: {
          appointment_id: appointment.appointment_id,
          status: appointment.status,
          cancelled_by: appointment.cancelled_by,
          cancellation_date: appointment.cancellation_date,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: 'An error occurred while cancelling the appointment',
        error: error.message,
      };
    }
  }
}
