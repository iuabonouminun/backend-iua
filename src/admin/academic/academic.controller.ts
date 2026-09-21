/**
 * Référentiel académique : /api/admin/faculties, /filieres, /subjects,
 * /classes, /assignments, /schedules.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminJwtAuthGuard } from '../auth/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../auth/admin-roles.guard';
import { AdminContext, CurrentAdmin } from '../auth/current-admin.decorator';
import {
  CreateAssignmentDto,
  CreateClassDto,
  CreateFacultyDto,
  CreateProgramDto,
  CreateRoomDto,
  CreateScheduleDto,
  CreateSubjectDto,
  UpdateRoomDto,
  UpdateScheduleDto,
} from '../dto/admin.dto';
import { AcademicService } from './academic.service';

@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@Controller('admin')
export class AcademicController {
  constructor(private readonly service: AcademicService) {}

  @Get('faculties')
  faculties(@CurrentAdmin() admin: AdminContext) {
    return this.service.listFaculties(admin.establishmentId);
  }

  @Post('faculties')
  createFaculty(
    @CurrentAdmin() admin: AdminContext,
    @Body() dto: CreateFacultyDto,
  ) {
    return this.service.createFaculty(admin, dto);
  }

  /** Le front appelle /filieres — on garde son vocabulaire. */
  @Get('filieres')
  filieres(@CurrentAdmin() admin: AdminContext) {
    return this.service.listPrograms(admin.establishmentId);
  }

  @Post('filieres')
  createFiliere(
    @CurrentAdmin() admin: AdminContext,
    @Body() dto: CreateProgramDto,
  ) {
    return this.service.createProgram(admin, dto);
  }

  @Get('subjects')
  subjects(@CurrentAdmin() admin: AdminContext) {
    return this.service.listSubjects(admin.establishmentId);
  }

  @Post('subjects')
  createSubject(
    @CurrentAdmin() admin: AdminContext,
    @Body() dto: CreateSubjectDto,
  ) {
    return this.service.createSubject(admin, dto);
  }

  @Get('classes')
  classes(@CurrentAdmin() admin: AdminContext) {
    return this.service.listClasses(admin.establishmentId);
  }

  @Get('classes/:id')
  classDetail(@CurrentAdmin() admin: AdminContext, @Param('id') id: string) {
    return this.service.getClass(admin.establishmentId, id);
  }

  @Post('classes')
  createClass(@CurrentAdmin() admin: AdminContext, @Body() dto: CreateClassDto) {
    return this.service.createClass(admin, dto);
  }

  @Get('assignments')
  assignments(@CurrentAdmin() admin: AdminContext) {
    return this.service.listAssignments(admin.establishmentId);
  }

  @Post('assignments')
  createAssignment(
    @CurrentAdmin() admin: AdminContext,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.service.createAssignment(admin, dto);
  }

  @Delete('assignments/:id')
  deleteAssignment(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
  ) {
    return this.service.deleteAssignment(admin, id);
  }

  @Get('schedules')
  schedules(
    @CurrentAdmin() admin: AdminContext,
    @Query('classId') classId?: string,
  ) {
    return this.service.listSchedules(admin.establishmentId, classId);
  }

  @Post('schedules')
  createSchedule(
    @CurrentAdmin() admin: AdminContext,
    @Body() dto: CreateScheduleDto,
  ) {
    return this.service.createSchedule(admin, dto);
  }

  @Patch('schedules/:id')
  updateSchedule(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
    @Body() dto: UpdateScheduleDto,
  ) {
    return this.service.updateSchedule(admin, id, dto);
  }

  @Delete('schedules/:id')
  deleteSchedule(@CurrentAdmin() admin: AdminContext, @Param('id') id: string) {
    return this.service.deleteSchedule(admin, id);
  }

  @Get('rooms')
  rooms(@CurrentAdmin() admin: AdminContext) {
    return this.service.listRooms(admin.establishmentId);
  }

  @Post('rooms')
  createRoom(@CurrentAdmin() admin: AdminContext, @Body() dto: CreateRoomDto) {
    return this.service.createRoom(admin, dto);
  }

  @Patch('rooms/:id')
  updateRoom(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
    @Body() dto: UpdateRoomDto,
  ) {
    return this.service.updateRoom(admin, id, dto);
  }

  @Delete('rooms/:id')
  deleteRoom(@CurrentAdmin() admin: AdminContext, @Param('id') id: string) {
    return this.service.deleteRoom(admin, id);
  }
}
