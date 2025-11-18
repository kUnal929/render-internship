import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Availability } from '../availability/availability.entity';
import { Doctor } from '../doctor/doctor.entity';

@Entity()
export class Slot {
  @PrimaryGeneratedColumn()
  slot_id: number;

  @ManyToOne(() => Availability)
  availability: Availability;

  @ManyToOne(() => Doctor)
  doctor: Doctor;

  @Column({ type: 'date' })
  slot_date: Date;

  @Column({ type: 'time' })
  start_time: string;

  @Column({ type: 'time' })
  end_time: string;

  @Column({ type: 'int', default: 0 })
  booked_count: number;
}
