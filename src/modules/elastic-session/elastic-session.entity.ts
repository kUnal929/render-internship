import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Availability } from '../availability/availability.entity';

@Entity()
export class ElasticSession {
  @PrimaryGeneratedColumn()
  session_id: number;

  @ManyToOne(() => Availability)
  availability: Availability;

  @Column({ type: 'date' })
  session_date: Date;

  @Column({ type: 'time' })
  new_start_time: string;

  @Column({ type: 'time' })
  new_end_time: string;

  @Column({ type: 'int', nullable: true })
  new_total_capacity: number;

  @Column({ type: 'enum', enum: ['expand', 'shrink'], default: 'expand' })
  action_type: string;
}
