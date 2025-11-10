import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../user/user.entity';
import { Patient } from '../../patient/patient.entity';

@Injectable()
export class OauthService {
  constructor(
    @InjectRepository(User) private userRepository: Repository<User>,
    @InjectRepository(Patient) private patientRepository: Repository<Patient>,
  ) {}

  async findOrCreateUser(profile: {
    email: string;
    firstName: string;
    lastName: string;
  }): Promise<User> {
    let user = await this.userRepository.findOne({
      where: { email: profile.email },
    });

    if (!user) {
      
      user = this.userRepository.create({
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        role: 'patient',
      });
      await this.userRepository.save(user);

      // create patient entry
      const patient = this.patientRepository.create({
        user: user,
      });
      await this.patientRepository.save(patient);
    }

    return user;
  }
}
