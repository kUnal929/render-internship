import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { Doctor } from '../doctor/doctor.entity';
import { Patient } from '../patient/patient.entity';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Doctor)
    private doctorRepo: Repository<Doctor>,
    @InjectRepository(Patient)
    private patientRepo: Repository<Patient>,
    private authService: AuthService,
  ) {}

  async signup(data: any) {
    try {
      
      const existingUser = await this.userRepo.findOne({
        where: { email: data.email },
      });

      if (existingUser) {
        return { message: 'User already exists', success: false };
      }

      
      const hashedPassword = await bcrypt.hash(data.password, 10);

      
      const user = this.userRepo.create({
        email: data.email,
        password: hashedPassword,
        role: data.role,
        firstName: data.firstName,
        lastName: data.lastName,
      });

      const savedUser = await this.userRepo.save(user);

      
      if (data.role === 'doctor') {
        const doctor = this.doctorRepo.create({
          user: savedUser,
          specialization: data.specialization,
          phone: data.phone,
        });
        await this.doctorRepo.save(doctor);
      } else if (data.role === 'patient') {
        const patient = this.patientRepo.create({
          user: savedUser,
          dateOfBirth: data.dateOfBirth,
          gender: data.gender,
          phone: data.phone,
        });
        await this.patientRepo.save(patient);
      }

      
      const { password, ...result } = savedUser;

      return {
        message: 'User registered successfully',
        success: true,
        user: result,
      };
    } catch (error) {
      return {
        message: 'An error occurred during signup',
        success: false,
        error: error.message,
      };
    }
  }

  async signin(data: any) {
    try {
      
      const user = await this.userRepo.findOne({
        where: { email: data.email },
      });

      if (!user) {
        return { message: 'Invalid credentials', success: false };
      }

      const isPasswordValid = await bcrypt.compare(
        data.password,
        user.password,
      );

      if (!isPasswordValid) {
        return { message: 'Invalid credentials', success: false };
      }

      // Generate JWT token
      const { access_token } = this.authService.generateJwt(user);

      // Remove password from response
      const { password, ...result } = user;

      return {
        message: 'Login successful',
        success: true,
        access_token,
        user: result,
      };
    } catch (error) {
      return {
        message: 'An error occurred during signin',
        success: false,
        error: error.message,
      };
    }
  }

  async getUserById(userId: number) {
    try {
      const user = await this.userRepo.findOne({
        where: { id: userId },
      });

      if (!user) {
        return { message: 'User not found', success: false };
      }

      const { password, ...result } = user;
      return result;
    } catch (error) {
      return {
        message: 'An error occurred while fetching user',
        success: false,
        error: error.message,
      };
    }
  }
}
