import { Controller, Patch, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DoctorGuard } from '../../guards/doctor.guard';
import { ElasticSessionService } from './elastic-session.service';

@Controller('elastic-session')
export class ElasticSessionController {
  constructor(private elasticSessionService: ElasticSessionService) {}

  @Patch('expand-wave')
  @UseGuards(AuthGuard('jwt'), DoctorGuard)
  async expandWaveSession(@Body() body: any) {
    const result = await this.elasticSessionService.expandWaveSession({
      availability_id: body.availability_id,
      session_date: body.session_date,
      new_start_time: body.new_start_time,
      new_end_time: body.new_end_time,
    });
    return result;
  }

  @Patch('expand-stream')
  @UseGuards(AuthGuard('jwt'), DoctorGuard)
  async expandStreamSession(@Body() body: any) {
    const result = await this.elasticSessionService.expandStreamSession({
      availability_id: body.availability_id,
      session_date: body.session_date,
      new_start_time: body.new_start_time,
      new_end_time: body.new_end_time,
      new_total_capacity: body.new_total_capacity,
    });
    return result;
  }

  @Patch('shrink-wave')
  @UseGuards(AuthGuard('jwt'), DoctorGuard)
  async shrinkWaveSession(@Body() body: any) {
    const result = await this.elasticSessionService.shrinkWaveSession({
      availability_id: body.availability_id,
      session_date: body.session_date,
      new_start_time: body.new_start_time, 
      new_end_time: body.new_end_time, 
    });
    return result;
  }

  @Patch('shrink-stream')
  @UseGuards(AuthGuard('jwt'), DoctorGuard)
  async shrinkStreamSession(@Body() body: any) {
    const result = await this.elasticSessionService.shrinkStreamSession({
      availability_id: body.availability_id,
      session_date: body.session_date,
      new_start_time: body.new_start_time, 
      new_end_time: body.new_end_time, 
    });
    return result;
  }
}
