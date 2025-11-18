import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Doctor } from '../doctor/doctor.entity';

@Entity()
export class Availability {
  @PrimaryGeneratedColumn()
  availability_id: number;

  @ManyToOne(() => Doctor)
  doctor: Doctor;

  @Column({ nullable: true })
  session: string; // morning, afternoon, evening

  // Consulting hours (when doctor is available)
  @Column({ type: 'time' })
  start_time: string;

  @Column({ type: 'time' })
  end_time: string;

  // NEW FIELD: Slot duration in minutes for wave scheduling (30 or 60)
  @Column({ type: 'int', nullable: true })
  slot_duration: number;

  // NEW FIELD: Maximum patients per slot for wave scheduling
  @Column({ type: 'int', nullable: true })
  capacity_per_slot: number;

  // NEW FIELD: Total capacity for the day for stream scheduling
  @Column({ type: 'int', nullable: true })
  total_capacity: number;

  // NEW FIELD: Current count of bookings (used for both wave and stream)
  @Column({ type: 'int', default: 0 })
  booked_count: number;

  // NEW FIELD: Schedule type for wave or stream scheduling
  @Column({ type: 'enum', enum: ['wave', 'stream'], default: 'wave' })
  schedule_type: string;

  @Column({ default: true })
  is_available: boolean;

  // Recurrence fields
  @Column({ type: 'varchar', nullable: true, default: 'MON,TUE,WED,THU,FRI' })
  recurrence_days: string; // 'MON,WED,FRI'

  @Column({ type: 'date' })
  recurrence_start_date: Date;

  @Column({ type: 'date' })
  recurrence_end_date: Date;
}
