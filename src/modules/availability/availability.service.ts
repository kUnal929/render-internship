import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Availability } from './availability.entity';
import { Doctor } from '../doctor/doctor.entity';

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectRepository(Availability)
    private availabilityRepo: Repository<Availability>,
    @InjectRepository(Doctor)
    private doctorRepo: Repository<Doctor>,
  ) {}
  // insert new availability record
  async createAvailability(data: any) {
    // Fetch doctor
    const doctor = await this.doctorRepo.findOne({
      where: { doctor_id: data.doctor_id },
    });

    if (!doctor) {
      return {
        success: false,
        message: 'Doctor not found',
      };
    }

    const availability = this.availabilityRepo.create({
      doctor: doctor,
      available_date: data.available_date,
      session: data.session,
      start_time: data.start_time,
      end_time: data.end_time,
      booking_start_time: data.booking_start_time,
      booking_end_time: data.booking_end_time,
      schedule_type: data.schedule_type,
      slot_duration: data.slot_duration || null,
      capacity_per_slot: data.capacity_per_slot || null,
      total_capacity: data.total_capacity || null,
      booked_count: 0,
      is_available: true,
    });

    return await this.availabilityRepo.save(availability);
  }

  // Get available slots for a doctor on a specific date
  async getAvailableSlots(doctorId: number, date: string) {
    const doctor = await this.doctorRepo.findOne({
      where: { doctor_id: doctorId },
    });

    if (!doctor) {
      throw new Error('Doctor not found');
    }

    // Parse date string to Date object
    const queryDate = new Date(date);

    // Fetch availability for this doctor on this date
    const availability = await this.availabilityRepo.findOne({
      where: {
        doctor: { doctor_id: doctorId },
        available_date: queryDate,
        is_available: true,
      },
    });

    if (!availability) {
      return {
        doctorId,
        date,
        scheduleType: null,
        slots: [],
        message: 'No availability found for this date',
      };
    }

    // Check schedule type and generate slots accordingly
    if (availability.schedule_type === 'wave') {
      return this.generateWaveSlots(availability, doctorId, date);
    } else if (availability.schedule_type === 'stream') {
      return this.generateStreamSlot(availability, doctorId, date);
    }

    throw new Error('Invalid schedule type');
  }

  // Generate slots for WAVE scheduling
  private generateWaveSlots(availability: any, doctorId: number, date: string) {
    const slots: any[] = [];
    const slotDuration = availability.slot_duration; // in minutes (30 or 60)
    const capacityPerSlot = availability.capacity_per_slot;
    const startTime = this.timeToMinutes(availability.start_time);
    const endTime = this.timeToMinutes(availability.end_time);

    // Generate slots from start_time to end_time
    let currentTime = startTime;
    let slotIndex = 1;

    while (currentTime < endTime) {
      const slotEndTime = currentTime + slotDuration;

      // Only create slot if it fits within doctor's availability
      if (slotEndTime <= endTime) {
        const slotStartTimeStr = this.minutesToTime(currentTime);
        const slotEndTimeStr = this.minutesToTime(slotEndTime);

        slots.push({
          slotId: `slot_${slotIndex}`,
          startTime: slotStartTimeStr,
          endTime: slotEndTimeStr,
          capacity: capacityPerSlot,
          bookedCount: 0, // In real scenario, query from appointments
          availableSeats: capacityPerSlot,
          isFull: false,
        });

        slotIndex++;
      }

      currentTime += slotDuration;
    }

    return {
      doctorId,
      date,
      scheduleType: 'wave',
      slotDuration,
      slots,
      message: `Found ${slots.length} available slots`,
    };
  }

  // Generate slot for STREAM scheduling
  private generateStreamSlot(
    availability: any,
    doctorId: number,
    date: string,
  ) {
    const totalCapacity = availability.total_capacity;
    const bookedCount = availability.booked_count;
    const availableSeats = totalCapacity - bookedCount;

    const slot = {
      slotId: 'stream_slot_1',
      startTime: availability.start_time,
      endTime: availability.end_time,
      totalCapacity,
      bookedCount,
      availableSeats,
      isFull: availableSeats <= 0,
      note: 'System will auto-assign exact time within this window',
    };

    return {
      doctorId,
      date,
      scheduleType: 'stream',
      slots: [slot],
      message: 'Stream slot available',
    };
  }

  // Helper: Convert HH:MM format to minutes
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  // Helper: Convert minutes to HH:MM format
  private minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }
}
