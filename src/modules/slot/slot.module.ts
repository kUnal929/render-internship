import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Slot } from './slot.entity';
import { SlotService } from './slot.service';

@Module({
  imports: [TypeOrmModule.forFeature([Slot])],
  providers: [SlotService],
  exports: [SlotService],
})
export class SlotModule {}
