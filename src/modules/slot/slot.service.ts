import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Slot } from './slot.entity';
import { Availability } from '../availability/availability.entity';

@Injectable()
export class SlotService {
  constructor(
    @InjectRepository(Slot)
    private slotRepo: Repository<Slot>,
  ) {}

  // Generate slots based on wave scheduling and store in database
  async generateWaveSlots(availability: any) {
    const slots: any[] = [];
    const slotDuration = availability.slot_duration;
    const capacity = availability.capacity_per_slot;
    const startTime = this.timeToMinutes(availability.start_time);
    const endTime = this.timeToMinutes(availability.end_time);

    // Loop through each date in recurrence range
    const currentDate = new Date(availability.recurrence_start_date);
    const endDate = new Date(availability.recurrence_end_date);
    const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const recurringDays = availability.recurrence_days.split(',');

    while (currentDate <= endDate) {
      const dayOfWeek = dayNames[currentDate.getDay()];

      // Check if this day matches recurrence pattern
      if (recurringDays.includes(dayOfWeek)) {

        // Generate slots for this date
        let slotStart = startTime;
        while (slotStart < endTime) {
          const slotEnd = slotStart + slotDuration;
          if (slotEnd <= endTime) {
            const slot = this.slotRepo.create({
              availability: availability,
              doctor: availability.doctor,
              slot_date: new Date(currentDate),
              start_time: this.minutesToTime(slotStart),
              end_time: this.minutesToTime(slotEnd),
              booked_count: 0,
            });
            slots.push(slot);
          }
          slotStart += slotDuration;
        }
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Save all slots to database
    await this.slotRepo.save(slots);
    return {
      success: true,
      message: `Generated ${slots.length} slots`,
      slots,
    };
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }
}
