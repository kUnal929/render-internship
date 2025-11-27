import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ElasticSession } from './elastic-session.entity';
import { Availability } from '../availability/availability.entity';
import { Slot } from '../slot/slot.entity';
import { Appointment } from '../appointment/appointment.entity';

@Injectable()
export class WaveElasticSessionService {
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

  // Expand wave session
  async expandWaveSession(data: {
    availability_id: number;
    session_date: string;
    new_start_time?: string;
    new_end_time?: string;
  }) {
    const { availability_id, session_date, new_start_time, new_end_time } =
      data;

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

    if (availability.schedule_type !== 'wave') {
      throw new BadRequestException('This availability is not wave');
    }

    const originalStartTime = availability.start_time;
    const originalEndTime = availability.end_time;
    const finalStartTime = new_start_time || originalStartTime;
    const finalEndTime = new_end_time || originalEndTime;

    const elasticSession = this.elasticSessionRepo.create({
      availability,
      session_date: sessionDate,
      new_start_time: finalStartTime,
      new_end_time: finalEndTime,
      action_type: 'expand',
    });
    await this.elasticSessionRepo.save(elasticSession);

    const newSlots: Slot[] = [];

    if (
      new_start_time &&
      this.timeToMinutes(new_start_time) < this.timeToMinutes(originalStartTime)
    ) {
      const startMinutes = this.timeToMinutes(new_start_time);
      const originalStartMinutes = this.timeToMinutes(originalStartTime);
      const slotDuration = availability.slot_duration;

      let slotStart = startMinutes;
      while (slotStart < originalStartMinutes) {
        const slotEnd = slotStart + slotDuration;
        if (slotEnd <= originalStartMinutes) {
          const slot = this.slotRepo.create({
            availability,
            doctor: availability.doctor,
            slot_date: sessionDate,
            start_time: this.minutesToTime(slotStart),
            end_time: this.minutesToTime(slotEnd),
            booked_count: 0,
          });
          newSlots.push(slot);
        }
        slotStart += slotDuration;
      }
    }

    if (
      new_end_time &&
      this.timeToMinutes(new_end_time) > this.timeToMinutes(originalEndTime)
    ) {
      const originalEndMinutes = this.timeToMinutes(originalEndTime);
      const endMinutes = this.timeToMinutes(new_end_time);
      const slotDuration = availability.slot_duration;

      let slotStart = originalEndMinutes;
      while (slotStart < endMinutes) {
        const slotEnd = slotStart + slotDuration;
        if (slotEnd <= endMinutes) {
          const slot = this.slotRepo.create({
            availability,
            doctor: availability.doctor,
            slot_date: sessionDate,
            start_time: this.minutesToTime(slotStart),
            end_time: this.minutesToTime(slotEnd),
            booked_count: 0,
          });
          newSlots.push(slot);
        }
        slotStart += slotDuration;
      }
    }

    await this.slotRepo.save(newSlots);

    const formattedDate = sessionDate.toISOString().split('T')[0];

    return {
      success: true,
      message: `Wave session expanded successfully`,
      data: {
        doctor_id: availability.doctor.doctor_id,
        specialization: availability.doctor.specialization,
        availability_id: availability.availability_id,
        session_date: formattedDate,
        original_start_time: originalStartTime,
        original_end_time: originalEndTime,
        new_start_time: finalStartTime,
        new_end_time: finalEndTime,
      },
    };
  }

  // Shrink wave session
  async shrinkWaveSession(data: {
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
    if (!availability) throw new BadRequestException('Availability not found');
    if (availability.schedule_type !== 'wave') {
      throw new BadRequestException('Only wave availability can be shrunk');
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

    const affectedSlots = await this.getShrinkAffectedSlots(
      availability_id,
      sessionDate,
      origStart,
      origEnd,
      newStart,
      newEnd,
    );

    const affectedAppts = await this.getShrinkAffectedAppointments(
      availability.doctor.doctor_id,
      sessionDate,
      origStart,
      origEnd,
      newStart,
      newEnd,
    );

    await this.elasticSessionRepo.save(
      this.elasticSessionRepo.create({
        availability,
        session_date: sessionDate,
        new_start_time: new_start_time || availability.start_time,
        new_end_time: new_end_time || availability.end_time,
        action_type: 'shrink',
      }),
    );

    if (affectedSlots.length > 0) {
      await this.slotRepo.remove(affectedSlots);
    }

    const isStartShrink = newStart > origStart;

    let rescheduled: any[] = [];
    let unrescheduled: any[] = [];

    if (isStartShrink) {
      const result = await this.rescheduleToNewSessionWindow(
        affectedAppts,
        availability.doctor.doctor_id,
        sessionDate,
        newStart,
        newEnd,
      );
      rescheduled = result.rescheduled;
      unrescheduled = result.unrescheduled;
    } else {
      const result = await this.rescheduleSameDayAppointments(
        affectedAppts,
        availability.doctor.doctor_id,
        sessionDate,
        origStart,
        origEnd,
      );
      rescheduled = result.rescheduled;
      unrescheduled = result.unrescheduled;
    }

    const unrescheduledAppointments = unrescheduled
      .map((u) =>
        affectedAppts.find((a) => a.appointment_id === u.appointment_id),
      )
      .filter((a) => !!a) as Appointment[];
    const { rescheduled: sevenDayRescheduled, stillUnscheduled } =
      await this.reschedule7DayAlternatives(
        unrescheduledAppointments,
        availability.doctor.doctor_id,
        availability_id,
        sessionDate,
      );

    const totalRescheduled = [...rescheduled, ...sevenDayRescheduled];
    const totalUnrescheduled = stillUnscheduled;

    const cancelled = await this.cancelUnrescheduledAppointments(
      stillUnscheduled,
      affectedAppts,
      availability.doctor.doctor_id,
    );

    const formattedDate = sessionDate.toISOString().split('T')[0];
    return {
      success: true,
      message: 'Wave session shrunk successfully',
      data: {
        doctor_id: availability.doctor.doctor_id,
        specialization: availability.doctor.specialization,
        availability_id,
        session_date: formattedDate,
        original_start_time: availability.start_time,
        original_end_time: availability.end_time,
        new_start_time: new_start_time || availability.start_time,
        new_end_time: new_end_time || availability.end_time,
        slotsRemoved: affectedSlots.length,
        summary: {
          total_affected: affectedAppts.length,
          rescheduled_same_day: rescheduled.length,
          rescheduled_7day: sevenDayRescheduled.length,
          cancelled: cancelled.length,
          still_unrescheduled: stillUnscheduled.length - cancelled.length,
        },
      },
    };
  }

  private async getShrinkAffectedSlots(
    availabilityId: number,
    sessionDate: Date,
    origStart: number,
    origEnd: number,
    newStart: number,
    newEnd: number,
  ): Promise<Slot[]> {
    const slots = await this.slotRepo.find({
      where: {
        availability: { availability_id: availabilityId },
        slot_date: sessionDate,
      },
    });

    return slots.filter((slot) => {
      const start = this.timeToMinutes(slot.start_time);
      const end = this.timeToMinutes(slot.end_time);
      return (
        (start >= origStart && end <= newStart) ||
        (start >= newEnd && end <= origEnd)
      );
    });
  }

  private async getShrinkAffectedAppointments(
    doctorId: number,
    sessionDate: Date,
    origStart: number,
    origEnd: number,
    newStart: number,
    newEnd: number,
  ): Promise<Appointment[]> {
    const appts = await this.appointmentRepo.find({
      where: {
        doctor: { doctor_id: doctorId },
        appointment_date: sessionDate,
      },
      relations: ['patient', 'patient.user'],
    });

    return appts.filter((apt) => {
      const start = this.timeToMinutes(apt.appointment_start_time);
      const end = this.timeToMinutes(apt.appointment_end_time);
      return (
        (start >= origStart && end <= newStart) ||
        (start >= newEnd && end <= origEnd)
      );
    });
  }

  private async rescheduleSameDayAppointments(
    affectedAppts: Appointment[],
    doctorId: number,
    sessionDate: Date,
    removedWindowStart: number,
    removedWindowEnd: number,
  ) {
    const rescheduled: any[] = [];
    const unrescheduled: any[] = [];

    for (const apt of affectedAppts) {
      const sameDayAlternatives = await this.findSameDayAlternativeSlots(
        doctorId,
        sessionDate,
        apt.appointment_start_time,
        apt.appointment_end_time,
        removedWindowStart,
        removedWindowEnd,
      );

      if (sameDayAlternatives.length > 0) {
        const targetSlot = sameDayAlternatives[0];

        apt.appointment_start_time = targetSlot.start_time;
        apt.appointment_end_time = targetSlot.end_time;
        apt.appointment_date = sessionDate;
        await this.appointmentRepo.save(apt);

        targetSlot.booked_count += 1;
        await this.slotRepo.save(targetSlot);

        rescheduled.push({
          appointment_id: apt.appointment_id,
          patient_name: `${apt.patient.user.firstName} ${apt.patient.user.lastName}`,
          old_time: `${apt.appointment_start_time}-${apt.appointment_end_time}`,
          new_time: `${targetSlot.start_time}-${targetSlot.end_time}`,
        });
      } else {
        unrescheduled.push({
          appointment_id: apt.appointment_id,
          patient_name: `${apt.patient.user.firstName} ${apt.patient.user.lastName}`,
          appointment_start_time: apt.appointment_start_time,
          appointment_end_time: apt.appointment_end_time,
        });
      }
    }

    return { rescheduled, unrescheduled };
  }

  private async findSameDayAlternativeSlots(
    doctorId: number,
    sessionDate: Date,
    appointmentStart: string,
    appointmentEnd: string,
    removedWindowStart: number,
    removedWindowEnd: number,
  ): Promise<Slot[]> {
    const allSlots = await this.slotRepo.find({
      where: {
        doctor: { doctor_id: doctorId },
        slot_date: sessionDate,
      },
      relations: ['availability'],
    });

    const aptDuration =
      this.timeToMinutes(appointmentEnd) - this.timeToMinutes(appointmentStart);

    const available = allSlots.filter((slot) => {
      const slotStart = this.timeToMinutes(slot.start_time);
      const slotEnd = this.timeToMinutes(slot.end_time);
      const slotDuration = slotEnd - slotStart;

      const inRemovedWindow =
        slotStart >= removedWindowStart && slotEnd <= removedWindowEnd;
      if (inRemovedWindow) return false;

      if (slot.booked_count >= slot.availability.capacity_per_slot)
        return false;

      if (slotDuration < aptDuration) return false;

      return true;
    });

    return available.sort(
      (a, b) =>
        this.timeToMinutes(a.start_time) - this.timeToMinutes(b.start_time),
    );
  }

  private async reschedule7DayAlternatives(
    unrescheduledAppts: Appointment[],
    doctorId: number,
    availabilityId: number,
    sessionDate: Date,
  ) {
    const rescheduled: any[] = [];
    const stillUnscheduled: any[] = [];

    for (const apt of unrescheduledAppts) {
      if (!apt) continue;

      const alternatives = await this.find7DayAlternativeSlots(
        doctorId,
        availabilityId,
        sessionDate,
        apt.appointment_start_time,
        apt.appointment_end_time,
      );

      if (alternatives.length > 0) {
        const targetSlot = alternatives[0];

        apt.appointment_start_time = targetSlot.start_time;
        apt.appointment_end_time = targetSlot.end_time;
        apt.appointment_date = new Date(targetSlot.slot_date);
        await this.appointmentRepo.save(apt);

        targetSlot.booked_count += 1;
        await this.slotRepo.save(targetSlot);

        const newDateStr = new Date(targetSlot.slot_date)
          .toISOString()
          .split('T')[0];
        rescheduled.push({
          appointment_id: apt.appointment_id,
          patient_name: `${apt.patient.user.firstName} ${apt.patient.user.lastName}`,
          old_date: sessionDate.toISOString().split('T')[0],
          new_date: newDateStr,
          new_time: `${targetSlot.start_time}-${targetSlot.end_time}`,
        });
      } else {
        stillUnscheduled.push({
          appointment_id: apt.appointment_id,
          patient_name: `${apt.patient.user.firstName} ${apt.patient.user.lastName}`,
          appointment_start_time: apt.appointment_start_time,
          appointment_end_time: apt.appointment_end_time,
          original_date: sessionDate.toISOString().split('T')[0],
        });
      }
    }

    return { rescheduled, stillUnscheduled };
  }

  private async find7DayAlternativeSlots(
    doctorId: number,
    availabilityId: number,
    startDate: Date,
    appointmentStart: string,
    appointmentEnd: string,
  ): Promise<Slot[]> {
    const aptDuration =
      this.timeToMinutes(appointmentEnd) - this.timeToMinutes(appointmentStart);

    const candidates: Slot[] = [];
    for (let i = 1; i <= 7; i++) {
      const searchDate = new Date(startDate);
      searchDate.setDate(searchDate.getDate() + i);

      const slots = await this.slotRepo.find({
        where: {
          doctor: { doctor_id: doctorId },
          slot_date: searchDate,
        },
        relations: ['availability'],
      });

      const available = slots.filter((slot) => {
        const slotStart = this.timeToMinutes(slot.start_time);
        const slotEnd = this.timeToMinutes(slot.end_time);
        const slotDuration = slotEnd - slotStart;

        if (slot.booked_count >= slot.availability.capacity_per_slot)
          return false;

        if (slotDuration < aptDuration) return false;

        return true;
      });

      candidates.push(...available);
    }

    return candidates.sort((a, b) => {
      const dateA = new Date(a.slot_date).getTime();
      const dateB = new Date(b.slot_date).getTime();
      const dateCompare = dateA - dateB;
      if (dateCompare !== 0) return dateCompare;
      return (
        this.timeToMinutes(a.start_time) - this.timeToMinutes(b.start_time)
      );
    });
  }

  private async cancelUnrescheduledAppointments(
    stillUnscheduled: any[],
    affectedAppts: Appointment[],
    doctorId: number,
  ) {
    const cancelled: any[] = [];

    for (const unscheduled of stillUnscheduled) {
      const apt = affectedAppts.find(
        (a) => a.appointment_id === unscheduled.appointment_id,
      );
      if (!apt) continue;

      apt.status = 'cancelled';
      await this.appointmentRepo.save(apt);

      cancelled.push({
        appointment_id: apt.appointment_id,
        patient_name: unscheduled.patient_name,
        original_date: unscheduled.original_date,
        appointment_time: `${apt.appointment_start_time}-${apt.appointment_end_time}`,
        cancellation_reason:
          'Doctor session shrunk - no alternative slots available',
        cancellation_date: new Date().toISOString().split('T')[0],
      });
    }

    return cancelled;
  }

  private async rescheduleToNewSessionWindow(
    affectedAppts: Appointment[],
    doctorId: number,
    sessionDate: Date,
    newStart: number,
    newEnd: number,
  ) {
    const rescheduled: any[] = [];
    const unrescheduled: any[] = [];

    for (const apt of affectedAppts) {
      const aptStart = this.timeToMinutes(apt.appointment_start_time);
      const aptEnd = this.timeToMinutes(apt.appointment_end_time);
      const aptDuration = aptEnd - aptStart;

      const slots = await this.slotRepo.find({
        where: {
          doctor: { doctor_id: doctorId },
          slot_date: sessionDate,
        },
        relations: ['availability'],
      });

      const available = slots.filter((slot) => {
        const slotStart = this.timeToMinutes(slot.start_time);
        const slotEnd = this.timeToMinutes(slot.end_time);
        const slotDuration = slotEnd - slotStart;

        if (slotStart < newStart || slotEnd > newEnd) return false;
        if (slot.booked_count >= slot.availability.capacity_per_slot)
          return false;
        if (slotDuration < aptDuration) return false;
        return true;
      });

      if (available.length > 0) {
        available.sort(
          (a, b) =>
            this.timeToMinutes(a.start_time) - this.timeToMinutes(b.start_time),
        );
        const targetSlot = available[0];
        apt.appointment_start_time = targetSlot.start_time;
        apt.appointment_end_time = targetSlot.end_time;
        apt.appointment_date = sessionDate;
        await this.appointmentRepo.save(apt);
        targetSlot.booked_count += 1;
        await this.slotRepo.save(targetSlot);

        rescheduled.push({
          appointment_id: apt.appointment_id,
          patient_name: `${apt.patient.user.firstName} ${apt.patient.user.lastName}`,
          old_time: `${apt.appointment_start_time}-${apt.appointment_end_time}`,
          new_time: `${targetSlot.start_time}-${targetSlot.end_time}`,
        });
      } else {
        unrescheduled.push({
          appointment_id: apt.appointment_id,
          patient_name: `${apt.patient.user.firstName} ${apt.patient.user.lastName}`,
          appointment_start_time: apt.appointment_start_time,
          appointment_end_time: apt.appointment_end_time,
        });
      }
    }

    return { rescheduled, unrescheduled };
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
