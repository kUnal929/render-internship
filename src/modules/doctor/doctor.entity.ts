import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { User } from '../user/user.entity';

@Entity()
export class Doctor {
  @PrimaryGeneratedColumn()
  doctor_id: number;

  @ManyToOne(() => User)
  user: User;

  @Column({ nullable: true })
  specialization: string;

  @Column({ nullable: true })
  phone: string;
}
