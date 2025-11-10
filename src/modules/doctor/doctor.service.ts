import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Doctor } from './doctor.entity';

@Injectable()
export class DoctorService {
  constructor(
    @InjectRepository(Doctor)
    private doctorRepo: Repository<Doctor>,
  ) {}

  async getAllDoctors() {
    const doctors = await this.doctorRepo.find({ relations: ['user'] });

    return doctors.map((doctor) => ({
      ...doctor,
      user: {
        id: doctor.user.id,
        email: doctor.user.email,
        role: doctor.user.role,
        firstName: doctor.user.firstName,
        lastName: doctor.user.lastName,
      },
    }));
  }

  // Search doctors by name
  async searchByName(firstName?: string, lastName?: string) {
    const query = this.doctorRepo
      .createQueryBuilder('doctor')
      .leftJoinAndSelect('doctor.user', 'user');

    if (firstName) {
      query.andWhere('user.firstName ILIKE :firstName', {
        firstName: `%${firstName}%`,
      });
    }
    if (lastName) {
      query.andWhere('user.lastName ILIKE :lastName', {
        lastName: `%${lastName}%`,
      });
    }

    const doctors = await query.getMany();

    return doctors.map((doctor) => ({
      ...doctor,
      user: {
        id: doctor.user.id,
        email: doctor.user.email,
        role: doctor.user.role,
        firstName: doctor.user.firstName,
        lastName: doctor.user.lastName,
      },
    }));
  }

  // Search doctors by specialization
  async searchBySpecialization(specialization: string) {
    const doctors = await this.doctorRepo
      .createQueryBuilder('doctor')
      .leftJoinAndSelect('doctor.user', 'user')
      .where('doctor.specialization ILIKE :specialization', {
        specialization: `%${specialization}%`,
      })
      .getMany();

    return doctors.map((doctor) => ({
      ...doctor,
      user: {
        id: doctor.user.id,
        email: doctor.user.email,
        role: doctor.user.role,
        firstName: doctor.user.firstName,
        lastName: doctor.user.lastName,
      },
    }));
  }
}
