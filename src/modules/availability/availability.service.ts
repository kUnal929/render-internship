import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Availability } from './availability.entity';
import { Doctor } from '../doctor/doctor.entity';
import { SlotService } from '../slot/slot.service';
import { Slot } from '../slot/slot.entity';

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectRepository(Availability)
    private availabilityRepo: Repository<Availability>,
    @InjectRepository(Doctor)
    private doctorRepo: Repository<Doctor>,
    @InjectRepository(Slot)
    private slotRepo: Repository<Slot>,
    private slotService: SlotService,
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

    // Check if availability already exists for this doctor with same time slot
    const existingAvailability = await this.availabilityRepo.findOne({
      where: {
        doctor: { doctor_id: data.doctor_id },
        start_time: data.start_time,
        end_time: data.end_time,
        session: data.session,
        schedule_type: data.schedule_type,
        is_available: true,
      },
    });

    if (existingAvailability) {
      return {
        success: false,
        message: 'Availability already exists for this doctor at this time slot',
      };
    }

    const availability = this.availabilityRepo.create({
      doctor: doctor,
      session: data.session,
      start_time: data.start_time,
      end_time: data.end_time,
      schedule_type: data.schedule_type,
      slot_duration: data.slot_duration,
      capacity_per_slot: data.capacity_per_slot,
      total_capacity: data.total_capacity,
      booked_count: 0,
      is_available: true,
      recurrence_days: data.recurrence_days,
      recurrence_start_date: data.recurrence_start_date,
      recurrence_end_date: data.recurrence_end_date,
    });

    const savedAvailability = await this.availabilityRepo.save(availability);

    // If wave, generate slots
    if (data.schedule_type === 'wave') {
      await this.slotService.generateWaveSlots(savedAvailability);
    }

    return savedAvailability;
  }

  // Get available slots for a doctor on a specific date
  async getAvailableSlots(doctorId: number, date: string) {
    const doctor = await this.doctorRepo.findOne({
      where: { doctor_id: doctorId },
    });

    if (!doctor) {
      return {
        success: false,
        message: 'Doctor not found',
      };
    }

    // Find availability that matches this day
    const availability = await this.availabilityRepo.findOne({
      where: {
        doctor: { doctor_id: doctorId },
        is_available: true,
      },
    });

    if (!availability) {
      return {
        doctorId,
        date,
        scheduleType: null,
        slots: [],
        message: 'No availability found',
      };
    }

    // Calculate day of week
    const queryDate = new Date(date);
    const dayOfWeek = queryDate.getDay();
    const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const currentDay = dayNames[dayOfWeek];

    // Check if this date's day is in recurrence_days and within date range
    const recurringDays = availability.recurrence_days.split(',');
    const isDateValid =
      recurringDays.includes(currentDay) &&
      queryDate >= new Date(availability.recurrence_start_date) &&
      queryDate <= new Date(availability.recurrence_end_date);

    if (!isDateValid) {
      return {
        doctorId,
        date,
        scheduleType: null,
        slots: [],
        message: 'No availability for this date',
      };
    } 

    // Check schedule type and generate slots accordingly
    if (availability.schedule_type === 'wave') {
      // Fetch real slots from Slot table for this date
      const slots = await this.slotRepo.find({
        where: {
          availability: { availability_id: availability.availability_id },
          slot_date: new Date(date),
        },
        order: { start_time: 'ASC' },
      });

      // Map slots to response format
      return {
        doctorId,
        date,
        scheduleType: 'wave',
        slotDuration: availability.slot_duration,
        slots: slots.map((slot, index) => ({
          slotId: slot.slot_id,
          startTime: slot.start_time,
          endTime: slot.end_time,
          capacity: availability.capacity_per_slot,
          bookedCount: slot.booked_count,
          availableSeats: availability.capacity_per_slot - slot.booked_count,
          isFull: slot.booked_count >= availability.capacity_per_slot,
        })),
        message: `Found ${slots.length} available slots`,
      };
    } else if (availability.schedule_type === 'stream') {
      return this.generateStreamSlot(availability, doctorId, date);
    }

    throw new Error('Invalid schedule type');
  }

  // Generate slots for WAVE scheduling only to show available slots
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

      if (slotEndTime <= endTime) {
        const slotStartTimeStr = this.minutesToTime(currentTime);
        const slotEndTimeStr = this.minutesToTime(slotEndTime);

        slots.push({
          slotId: `slot_${slotIndex}`,
          startTime: slotStartTimeStr,
          endTime: slotEndTimeStr,
          capacity: capacityPerSlot,
          bookedCount: 0,
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

  //Convert HH:MM format to minutes
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  //Convert minutes to HH:MM format
  private minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }
}
