import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Doctor } from '../doctor/doctor.entity';

@Entity()
export class Availability {
  @PrimaryGeneratedColumn()
  availability_id: number;

  @ManyToOne(() => Doctor)
  doctor: Doctor;

  @Column({ type: 'date' })
  available_date: Date;

  @Column({ nullable: true })
  session: string; // morning, afternoon, evening

  @Column({ type: 'time' })
  start_time: string;

  @Column({ type: 'time' })
  end_time: string;

  @Column({ default: true })
  is_available: boolean;
}
