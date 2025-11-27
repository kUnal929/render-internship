import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Doctor } from '../doctor/doctor.entity';
import { Patient } from '../patient/patient.entity';

@Entity()
export class Appointment {
  @PrimaryGeneratedColumn()
  appointment_id: number;

  @ManyToOne(() => Patient)
  patient: Patient;

  @ManyToOne(() => Doctor)
  doctor: Doctor;

  @Column({ type: 'date' })
  appointment_date: Date;

  @Column({ type: 'time' })
  appointment_start_time: string;

  @Column({ type: 'time' })
  appointment_end_time: string;

  @Column({ type: 'varchar', default: 'confirmed' })
  status: string;

  @Column({ type: 'varchar', nullable: true })
  cancelled_by: string; // 'doctor' or 'patient'

  @Column({ type: 'timestamp', nullable: true })
  cancellation_date: Date;
}
