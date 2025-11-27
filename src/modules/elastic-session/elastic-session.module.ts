import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ElasticSession } from './elastic-session.entity';
import { Availability } from '../availability/availability.entity';
import { Slot } from '../slot/slot.entity';
import { Appointment } from '../appointment/appointment.entity';
import { ElasticSessionService } from './elastic-session.service';
import { WaveElasticSessionService } from './wave-elastic-session.service';
import { StreamElasticSessionService } from './stream-elastic-session.service';
import { ElasticSessionController } from './elastic-session.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ElasticSession, Availability, Slot, Appointment])],
  controllers: [ElasticSessionController],
  providers: [ElasticSessionService, WaveElasticSessionService, StreamElasticSessionService],
  exports: [ElasticSessionService],
})
export class ElasticSessionModule {}
