import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { User } from './modules/user/user.entity';
import { Doctor } from './modules/doctor/doctor.entity';
import { Patient } from './modules/patient/patient.entity';
import { Appointment } from './modules/appointment/appointment.entity';
import { Availability } from './modules/availability/availability.entity';
import { Slot } from './modules/slot/slot.entity';
import { ElasticSession } from './modules/elastic-session/elastic-session.entity';
import { UserModule } from './modules/user/user.module';
import { AuthModule } from './modules/auth/auth.module';
import { DoctorModule } from './modules/doctor/doctor.module';
import { AppointmentModule } from './modules/appointment/appointment.module';
import { AvailabilityModule } from './modules/availability/availability.module';
import { SlotModule } from './modules/slot/slot.module';
import { ElasticSessionModule } from './modules/elastic-session/elastic-session.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // ✅ Smart dynamic database config for local + Render
    TypeOrmModule.forRoot(
      process.env.DATABASE_URL
        ? {
            type: 'postgres',
            url: process.env.DATABASE_URL,
            entities: [User, Doctor, Patient, Appointment, Availability, Slot],
            synchronize: true,
            ssl: { rejectUnauthorized: false },
          }
        : {
            type: 'postgres',
            host: process.env.DB_HOST,
            port: Number(process.env.DB_PORT),
            username: process.env.DB_USERNAME,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
           entities: [User, Doctor, Patient, Appointment, Availability, Slot, ElasticSession],
            synchronize: true,
          },
    ),
    UserModule,
    AuthModule,
    DoctorModule,
    AppointmentModule,
    AvailabilityModule,
    SlotModule,
    ElasticSessionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
