import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Availability } from './availability.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Availability])],
  controllers: [],
  providers: [],
  exports: [],
})
export class AvailabilityModule {}
