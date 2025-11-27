import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ElasticSession } from './elastic-session.entity';
import { Availability } from '../availability/availability.entity';
import { Slot } from '../slot/slot.entity';
import { Appointment } from '../appointment/appointment.entity';

@Injectable()
export class StreamElasticSessionService {
  constructor(
    @InjectRepository(ElasticSession)
    private elasticSessionRepo: Repository<ElasticSession>,
    @InjectRepository(Availability)
    private availabilityRepo: Repository<Availability>,
    @InjectRepository(Slot)
    private slotRepo: Repository<Slot>,
    @InjectRepository(Appointment)
    private appointmentRepo: Repository<Appointment>,
  ) {}

  // Expand stream session
  async expandStreamSession(data: {
    availability_id: number;
    session_date: string;
    new_start_time?: string;
    new_end_time?: string;
    new_total_capacity?: number;
  }) {
    const {
      availability_id,
      session_date,
      new_start_time,
      new_end_time,
      new_total_capacity,
    } = data;

    if (!new_start_time && !new_end_time) {
      throw new BadRequestException(
        'At least one of new_start_time or new_end_time must be provided',
      );
    }

    const sessionDate = new Date(session_date);

    const existingElasticSession = await this.elasticSessionRepo.findOne({
      where: {
        availability: { availability_id },
        session_date: sessionDate,
      },
    });

    if (existingElasticSession) {
      throw new BadRequestException(
        'Elastic session already exists for this availability on this date',
      );
    }

    const availability = await this.availabilityRepo.findOne({
      where: { availability_id },
      relations: ['doctor'],
    });

    if (!availability) {
      throw new BadRequestException('Availability not found');
    }

    if (availability.schedule_type !== 'stream') {
      throw new BadRequestException('This availability is not stream-based');
    }

    const originalStartTime = availability.start_time;
    const originalEndTime = availability.end_time;
    const finalStartTime = new_start_time || originalStartTime;
    const finalEndTime = new_end_time || originalEndTime;

    const originalStartMinutes = this.timeToMinutes(originalStartTime);
    const originalEndMinutes = this.timeToMinutes(originalEndTime);
    const finalStartMinutes = this.timeToMinutes(finalStartTime);
    const finalEndMinutes = this.timeToMinutes(finalEndTime);

    const isStartExpanding = finalStartMinutes < originalStartMinutes;
    const isEndExpanding = finalEndMinutes > originalEndMinutes;

    if (!isStartExpanding && !isEndExpanding) {
      throw new BadRequestException(
        'Times must expand (start earlier or end later) for stream expand',
      );
    }

    const originalDurationMinutes = originalEndMinutes - originalStartMinutes;
    const newDurationMinutes = finalEndMinutes - finalStartMinutes;

    const finalTotalCapacity =
      new_total_capacity || availability.total_capacity;

    if (finalTotalCapacity < 1) {
      throw new BadRequestException('Total capacity must be at least 1');
    }

    const elasticSession = this.elasticSessionRepo.create({
      availability,
      session_date: sessionDate,
      new_start_time: finalStartTime,
      new_end_time: finalEndTime,
      new_total_capacity: finalTotalCapacity,
      action_type: 'expand',
    });
    await this.elasticSessionRepo.save(elasticSession);

    const formattedDate = sessionDate.toISOString().split('T')[0];

    const originalTotalCapacity = availability.total_capacity;

    return {
      success: true,
      message: `Stream session expanded successfully`,
      data: {
        doctor_id: availability.doctor.doctor_id,
        specialization: availability.doctor.specialization,
        availability_id: availability.availability_id,
        session_date: formattedDate,
        original_start_time: originalStartTime,
        original_end_time: originalEndTime,
        original_duration_minutes: originalDurationMinutes,
        original_total_capacity: originalTotalCapacity,
        new_start_time: finalStartTime,
        new_end_time: finalEndTime,
        new_duration_minutes: newDurationMinutes,
        new_total_capacity: finalTotalCapacity,
        booked_count: availability.booked_count,
        available_seats: finalTotalCapacity - availability.booked_count,
      },
    };
  }

  // Shrink stream session
  async shrinkStreamSession(data: {
    availability_id: number;
    session_date: string;
    new_start_time?: string;
    new_end_time?: string;
  }) {
    const { availability_id, session_date, new_start_time, new_end_time } =
      data;

    if (!new_start_time && !new_end_time) {
      throw new BadRequestException('At least one time parameter required');
    }

    const sessionDate = new Date(session_date);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (sessionDate < today) {
      throw new BadRequestException('Cannot shrink past sessions');
    }

    const existing = await this.elasticSessionRepo.findOne({
      where: { availability: { availability_id }, session_date: sessionDate },
    });
    if (existing) {
      throw new BadRequestException(
        'Elastic session already exists for this date',
      );
    }

    const availability = await this.availabilityRepo.findOne({
      where: { availability_id },
      relations: ['doctor'],
    });
    if (!availability) {
      throw new BadRequestException('Availability not found');
    }

    if (availability.schedule_type !== 'stream') {
      throw new BadRequestException('Only stream availability can be shrunk');
    }

    const origStart = this.timeToMinutes(availability.start_time);
    const origEnd = this.timeToMinutes(availability.end_time);
    const newStart = new_start_time
      ? this.timeToMinutes(new_start_time)
      : origStart;
    const newEnd = new_end_time ? this.timeToMinutes(new_end_time) : origEnd;

    if (newStart <= origStart && newEnd >= origEnd) {
      throw new BadRequestException(
        'Times must shrink (start later or end earlier)',
      );
    }

    const isStartShrink = newStart > origStart;

    // Phase 2: Reduce Capacity
    const totalDuration = origEnd - origStart;
    const removedDuration = isStartShrink ? newStart - origStart : origEnd - newEnd;
    const capacityReduction = Math.ceil(
      availability.total_capacity * (removedDuration / totalDuration),
    );
    const newCapacity = availability.total_capacity - capacityReduction;

    if (newCapacity <= 0) {
      throw new BadRequestException(
        'Shrink would reduce capacity to 0 or below',
      );
    }

    availability.total_capacity = newCapacity;
    await this.availabilityRepo.save(availability);

    // Get affected appointments
    const affectedAppts = await this.appointmentRepo.find({
      where: {
        doctor: { doctor_id: availability.doctor.doctor_id },
        appointment_date: sessionDate,
      },
      relations: ['patient', 'patient.user'],
    });

    const affected = affectedAppts.filter((apt) => {
      const start = this.timeToMinutes(apt.appointment_start_time);
      const end = this.timeToMinutes(apt.appointment_end_time);
      return (
        (start >= origStart && end <= newStart) ||
        (start >= newEnd && end <= origEnd)
      );
    });

    // Create ElasticSession record
    await this.elasticSessionRepo.save(
      this.elasticSessionRepo.create({
        availability,
        session_date: sessionDate,
        new_start_time: new_start_time || availability.start_time,
        new_end_time: new_end_time || availability.end_time,
        new_total_capacity: newCapacity,
        action_type: 'shrink',
      }),
    );

    // Phase 3: Reschedule to new session window (if start shrink)
    let rescheduled: any[] = [];
    let unrescheduled: any[] = [];

    if (isStartShrink && affected.length > 0) {
      const result = await this.rescheduleToNewSessionWindowStream(
        affected,
        availability,
        sessionDate,
        newStart,
        newEnd,
      );
      rescheduled = result.rescheduled;
      unrescheduled = result.unrescheduled;
    } else {
      unrescheduled = affected;
    }

    // Phase 4: Reschedule to other sessions same day
    let sevenDayRescheduled: any[] = [];
    if (unrescheduled.length > 0) {
      const result = await this.rescheduleToOtherSessionsSameDay(
        unrescheduled,
        availability.doctor.doctor_id,
        sessionDate,
        availability.availability_id,
      );
      rescheduled = [...rescheduled, ...result.rescheduled];
      unrescheduled = result.unrescheduled;
    }

    // Phase 5: Reschedule to next 7 days
    if (unrescheduled.length > 0) {
      const result = await this.rescheduleToNext7DaysStream(
        unrescheduled,
        availability.doctor.doctor_id,
        sessionDate,
      );
      sevenDayRescheduled = result.rescheduled;
      unrescheduled = result.unrescheduled;
    }

    // Phase 6: Cancel unrescheduled appointments
    const cancelled: any[] = [];
    for (const apt of unrescheduled) {
      apt.status = 'cancelled';
      await this.appointmentRepo.save(apt);
      cancelled.push({
        appointment_id: apt.appointment_id,
        patient_name: `${apt.patient.user.firstName} ${apt.patient.user.lastName}`,
        original_time: `${apt.appointment_start_time}-${apt.appointment_end_time}`,
        cancellation_reason: 'Stream session shrunk - no alternative slots available',
      });
    }

    // Return final response
    return {
      success: true,
      message: 'Stream session shrunk successfully',
      data: {
        doctor_id: availability.doctor.doctor_id,
        availability_id: availability.availability_id,
        session_date: sessionDate.toISOString().split('T')[0],
        original_capacity: availability.total_capacity + capacityReduction,
        new_capacity: newCapacity,
        summary: {
          total_affected: affected.length,
          rescheduled_new_window: rescheduled.filter(
            r => r.new_time && !r.new_date,
          ).length,
          rescheduled_same_day: rescheduled.filter(
            r => r.new_time && !r.new_date,
          ).length,
          rescheduled_7day: sevenDayRescheduled.length,
          cancelled: cancelled.length,
        },
        rescheduled_appointments: [...rescheduled, ...sevenDayRescheduled],
        cancelled_appointments: cancelled,
      },
    };
  }

  private async rescheduleToNewSessionWindowStream(
    affected: Appointment[],
    availability: Availability,
    sessionDate: Date,
    newStart: number,
    newEnd: number,
  ) {
    const rescheduled: any[] = [];
    const unrescheduled: any[] = [];

    for (const apt of affected) {
      const aptDuration =
        this.timeToMinutes(apt.appointment_end_time) -
        this.timeToMinutes(apt.appointment_start_time);

      // Get all appointments in new window to find available time slot
      const windowAppts = await this.appointmentRepo.find({
        where: {
          doctor: { doctor_id: availability.doctor.doctor_id },
          appointment_date: sessionDate,
        },
        order: { appointment_end_time: 'ASC' },
        relations: ['patient', 'patient.user'],
      });

      // Filter appointments in new window
      const windowTimes = windowAppts
        .filter((a) => {
          const start = this.timeToMinutes(a.appointment_start_time);
          const end = this.timeToMinutes(a.appointment_end_time);
          return start >= newStart && end <= newEnd;
        })
        .map((a) => ({
          start: this.timeToMinutes(a.appointment_start_time),
          end: this.timeToMinutes(a.appointment_end_time),
        }));

      // Find first available slot in new window
      let candidateStart = newStart;
      let candidateEnd = candidateStart + aptDuration;
      let found = false;

      while (candidateEnd <= newEnd && !found) {
        const overlaps = windowTimes.some(
          (time) =>
            (candidateStart >= time.start && candidateStart < time.end) ||
            (candidateEnd > time.start && candidateEnd <= time.end) ||
            (candidateStart <= time.start && candidateEnd >= time.end),
        );

        if (!overlaps && candidateEnd - candidateStart >= aptDuration) {
          // Found available slot
          apt.appointment_start_time = this.minutesToTime(candidateStart);
          apt.appointment_end_time = this.minutesToTime(candidateEnd);
          apt.appointment_date = sessionDate;
          await this.appointmentRepo.save(apt);

          rescheduled.push({
            appointment_id: apt.appointment_id,
            patient_name: `${apt.patient.user.firstName} ${apt.patient.user.lastName}`,
            new_time: `${apt.appointment_start_time}-${apt.appointment_end_time}`,
          });
          found = true;
        } else {
          candidateStart += 30; // Move to next 30-min slot
          candidateEnd = candidateStart + aptDuration;
        }
      }

      if (!found) {
        unrescheduled.push(apt);
      }
    }

    return { rescheduled, unrescheduled };
  }

  private async rescheduleToOtherSessionsSameDay(
    unrescheduled: Appointment[],
    doctorId: number,
    sessionDate: Date,
    shrunkAvailabilityId: number,
  ) {
    const rescheduled: any[] = [];
    const stillUnscheduled: any[] = [];

    for (const apt of unrescheduled) {
      const aptDuration =
        this.timeToMinutes(apt.appointment_end_time) -
        this.timeToMinutes(apt.appointment_start_time);

      // Get other stream availabilities for this doctor on same day
      const otherAvailabilities = await this.availabilityRepo.find({
        where: {
          doctor: { doctor_id: doctorId },
          schedule_type: 'stream',
        },
      });

      let rescheduledFlag = false;

      for (const otherAvail of otherAvailabilities) {
        if (otherAvail.availability_id === shrunkAvailabilityId) continue;

        const otherStart = this.timeToMinutes(otherAvail.start_time);
        const otherEnd = this.timeToMinutes(otherAvail.end_time);

        // Check capacity
        if (otherAvail.booked_count >= otherAvail.total_capacity) continue;

        // Find available time in this session
        const otherAppts = await this.appointmentRepo.find({
          where: {
            doctor: { doctor_id: doctorId },
            appointment_date: sessionDate,
          },
          order: { appointment_end_time: 'ASC' },
          relations: ['patient', 'patient.user'],
        });

        const availTimes = otherAppts
          .filter((a) => {
            const start = this.timeToMinutes(a.appointment_start_time);
            const end = this.timeToMinutes(a.appointment_end_time);
            return start >= otherStart && end <= otherEnd;
          })
          .map((a) => ({
            start: this.timeToMinutes(a.appointment_start_time),
            end: this.timeToMinutes(a.appointment_end_time),
          }));

        let candidateStart = otherStart;
        let candidateEnd = candidateStart + aptDuration;

        while (candidateEnd <= otherEnd) {
          const overlaps = availTimes.some(
            (time) =>
              (candidateStart >= time.start && candidateStart < time.end) ||
              (candidateEnd > time.start && candidateEnd <= time.end) ||
              (candidateStart <= time.start && candidateEnd >= time.end),
          );

          if (!overlaps && candidateEnd - candidateStart >= aptDuration) {
            // Reschedule to this session
            apt.appointment_start_time = this.minutesToTime(candidateStart);
            apt.appointment_end_time = this.minutesToTime(candidateEnd);
            apt.appointment_date = sessionDate;
            await this.appointmentRepo.save(apt);

            // Update availability booked count
            otherAvail.booked_count += 1;
            await this.availabilityRepo.save(otherAvail);

            rescheduled.push({
              appointment_id: apt.appointment_id,
              patient_name: `${apt.patient.user.firstName} ${apt.patient.user.lastName}`,
              new_time: `${apt.appointment_start_time}-${apt.appointment_end_time}`,
            });
            rescheduledFlag = true;
            break;
          }
          candidateStart += 30;
          candidateEnd = candidateStart + aptDuration;
        }

        if (rescheduledFlag) break;
      }

      if (!rescheduledFlag) {
        stillUnscheduled.push(apt);
      }
    }

    return { rescheduled, unrescheduled: stillUnscheduled };
  }

  private async rescheduleToNext7DaysStream(
    unrescheduled: Appointment[],
    doctorId: number,
    startDate: Date,
  ) {
    const rescheduled: any[] = [];
    const stillUnscheduled: any[] = [];

    for (const apt of unrescheduled) {
      const aptDuration =
        this.timeToMinutes(apt.appointment_end_time) -
        this.timeToMinutes(apt.appointment_start_time);
      let found = false;

      for (let i = 1; i <= 7 && !found; i++) {
        const searchDate = new Date(startDate);
        searchDate.setDate(searchDate.getDate() + i);

        // Get stream availabilities for this date
        const availabilities = await this.availabilityRepo.find({
          where: {
            doctor: { doctor_id: doctorId },
            schedule_type: 'stream',
          },
        });

        for (const avail of availabilities) {
          // Check capacity
          if (avail.booked_count >= avail.total_capacity) continue;

          const availStart = this.timeToMinutes(avail.start_time);
          const availEnd = this.timeToMinutes(avail.end_time);

          // Get appointments for this date and check available times
          const appts = await this.appointmentRepo.find({
            where: {
              doctor: { doctor_id: doctorId },
              appointment_date: searchDate,
            },
            order: { appointment_end_time: 'ASC' },
            relations: ['patient', 'patient.user'],
          });

          const bookedTimes = appts
            .filter((a) => {
              const start = this.timeToMinutes(a.appointment_start_time);
              const end = this.timeToMinutes(a.appointment_end_time);
              return start >= availStart && end <= availEnd;
            })
            .map((a) => ({
              start: this.timeToMinutes(a.appointment_start_time),
              end: this.timeToMinutes(a.appointment_end_time),
            }));

          let candidateStart = availStart;
          let candidateEnd = candidateStart + aptDuration;

          while (candidateEnd <= availEnd) {
            const overlaps = bookedTimes.some(
              (time) =>
                (candidateStart >= time.start && candidateStart < time.end) ||
                (candidateEnd > time.start && candidateEnd <= time.end) ||
                (candidateStart <= time.start && candidateEnd >= time.end),
            );

            if (!overlaps && candidateEnd - candidateStart >= aptDuration) {
              // Reschedule
              apt.appointment_start_time = this.minutesToTime(candidateStart);
              apt.appointment_end_time = this.minutesToTime(candidateEnd);
              apt.appointment_date = searchDate;
              await this.appointmentRepo.save(apt);

              avail.booked_count += 1;
              await this.availabilityRepo.save(avail);

              rescheduled.push({
                appointment_id: apt.appointment_id,
                patient_name: `${apt.patient.user.firstName} ${apt.patient.user.lastName}`,
                new_date: searchDate.toISOString().split('T')[0],
                new_time: `${apt.appointment_start_time}-${apt.appointment_end_time}`,
              });
              found = true;
              break;
            }
            candidateStart += 30;
            candidateEnd = candidateStart + aptDuration;
          }

          if (found) break;
        }
      }

      if (!found) {
        stillUnscheduled.push(apt);
      }
    }

    return { rescheduled, unrescheduled: stillUnscheduled };
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
