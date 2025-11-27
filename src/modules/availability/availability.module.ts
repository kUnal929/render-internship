import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Availability } from './availability.entity';
import { AvailabilityService } from './availability.service';
import { AvailabilityController } from './availability.controller';
import { Doctor } from '../doctor/doctor.entity';
import { Slot } from '../slot/slot.entity';
import { ElasticSession } from '../elastic-session/elastic-session.entity';
import { SlotModule } from '../slot/slot.module';

@Module({
  imports: [TypeOrmModule.forFeature([Availability, Doctor, Slot, ElasticSession]), SlotModule],
  controllers: [AvailabilityController],
  providers: [AvailabilityService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
