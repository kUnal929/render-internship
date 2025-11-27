import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ElasticSession } from './elastic-session.entity';
import { Availability } from '../availability/availability.entity';
import { Slot } from '../slot/slot.entity';
import { Appointment } from '../appointment/appointment.entity';
import { WaveElasticSessionService } from './wave-elastic-session.service';
import { StreamElasticSessionService } from './stream-elastic-session.service';

@Injectable()
export class ElasticSessionService {
  constructor(
    @InjectRepository(ElasticSession)
    private elasticSessionRepo: Repository<ElasticSession>,
    @InjectRepository(Availability)
    private availabilityRepo: Repository<Availability>,
    @InjectRepository(Slot)
    private slotRepo: Repository<Slot>,
    @InjectRepository(Appointment)
    private appointmentRepo: Repository<Appointment>,
    private waveService: WaveElasticSessionService,
    private streamService: StreamElasticSessionService,
  ) {}

  // Expand wave session - delegate to wave service
  async expandWaveSession(data: {
    availability_id: number;
    session_date: string;
    new_start_time?: string;
    new_end_time?: string;
  }) {
    return this.waveService.expandWaveSession(data);
  }

  // Expand stream session - delegate to stream service
  async expandStreamSession(data: {
    availability_id: number;
    session_date: string;
    new_start_time?: string;
    new_end_time?: string;
    new_total_capacity?: number;
  }) {
    return this.streamService.expandStreamSession(data);
  }

  // Shrink wave session - delegate to wave service
  async shrinkWaveSession(data: {
    availability_id: number;
    session_date: string;
    new_start_time?: string;
    new_end_time?: string;
  }) {
    return this.waveService.shrinkWaveSession(data);
  }

  // Shrink stream session - delegate to stream service
  async shrinkStreamSession(data: {
    availability_id: number;
    session_date: string;
    new_start_time?: string;
    new_end_time?: string;
  }) {
    return this.streamService.shrinkStreamSession(data);
  }
}
