import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Doctor } from '../doctor/doctor.entity';
import { Patient } from '../patient/patient.entity';
import { Availability } from '../availability/availability.entity';

@Entity()
export class Appointment {
  @PrimaryGeneratedColumn()
  appointment_id: number;

  @ManyToOne(() => Patient)
  patient: Patient;

  @ManyToOne(() => Doctor)
  doctor: Doctor;

  @ManyToOne(() => Availability)
  availability: Availability;

  @Column({ type: 'date' })
  appointment_date: Date;

  // For wave scheduling - patient selects specific slot
  @Column({ type: 'time', nullable: true })
  start_time: string;

  @Column({ type: 'time', nullable: true })
  end_time: string;

  // NEW FIELD: Auto-assigned time for stream scheduling
  @Column({ type: 'time', nullable: true })
  assigned_time: string;

  @Column({ nullable: true })
  token_number: number;

  @Column({ default: 'pending' })
  status: string; // pending, confirmed, cancelled, completed
}
