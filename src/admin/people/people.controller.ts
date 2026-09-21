/**
 * Routes de gestion des accès : /api/admin/students, /api/admin/teachers,
 * /api/admin/leaders.
 *
 * Aucune route DELETE sur un compte : la suspension est la seule sortie,
 * pour ne jamais perdre l'historique de présence attaché.
 */
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminJwtAuthGuard } from '../auth/admin-jwt-auth.guard';
import { AdminRolesGuard, Roles } from '../auth/admin-roles.guard';
import { AdminContext, CurrentAdmin } from '../auth/current-admin.decorator';
import {
  AssignLeaderDto,
  CreateStudentDto,
  CreateTeacherDto,
  ResetPasswordDto,
  SuspendAccountDto,
  UpdateStudentDto,
  UpdateTeacherDto,
} from '../dto/admin.dto';
import { PeopleService } from './people.service';

@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@Controller('admin')
export class PeopleController {
  constructor(private readonly service: PeopleService) {}

  /* ------------------------------- Étudiants ------------------------------ */

  @Get('students')
  listStudents(
    @CurrentAdmin() admin: AdminContext,
    @Query('classId') classId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.service.listStudents(admin.establishmentId, {
      classId,
      status,
      search,
    });
  }

  @Get('students/:id')
  getStudent(@CurrentAdmin() admin: AdminContext, @Param('id') id: string) {
    return this.service.getStudent(admin.establishmentId, id);
  }

  @Get('students/:id/attendances')
  studentAttendance(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
  ) {
    return this.service.getStudentAttendance(admin.establishmentId, id);
  }

  @Post('students')
  createStudent(
    @CurrentAdmin() admin: AdminContext,
    @Body() dto: CreateStudentDto,
  ) {
    return this.service.createStudent(admin, dto);
  }

  @Patch('students/:id')
  updateStudent(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
    @Body() dto: UpdateStudentDto,
  ) {
    return this.service.updateStudent(admin, id, dto);
  }

  @Post('students/:id/suspend')
  suspendStudent(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
    @Body() dto: SuspendAccountDto,
  ) {
    return this.service.setStudentStatus(admin, id, true, dto);
  }

  @Post('students/:id/reactivate')
  reactivateStudent(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
  ) {
    return this.service.setStudentStatus(admin, id, false);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post('students/:id/reset-password')
  resetStudentPassword(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.service.resetStudentPassword(admin, id, dto);
  }

  /* ------------------------------ Enseignants ----------------------------- */

  @Get('teachers')
  listTeachers(
    @CurrentAdmin() admin: AdminContext,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.service.listTeachers(admin.establishmentId, { status, search });
  }

  @Get('teachers/:id')
  getTeacher(@CurrentAdmin() admin: AdminContext, @Param('id') id: string) {
    return this.service.getTeacher(admin.establishmentId, id);
  }

  @Post('teachers')
  createTeacher(
    @CurrentAdmin() admin: AdminContext,
    @Body() dto: CreateTeacherDto,
  ) {
    return this.service.createTeacher(admin, dto);
  }

  @Patch('teachers/:id')
  updateTeacher(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
    @Body() dto: UpdateTeacherDto,
  ) {
    return this.service.updateTeacher(admin, id, dto);
  }

  @Post('teachers/:id/suspend')
  suspendTeacher(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
    @Body() dto: SuspendAccountDto,
  ) {
    return this.service.setTeacherStatus(admin, id, true, dto);
  }

  @Post('teachers/:id/reactivate')
  reactivateTeacher(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
  ) {
    return this.service.setTeacherStatus(admin, id, false);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post('teachers/:id/reset-password')
  resetTeacherPassword(
    @CurrentAdmin() admin: AdminContext,
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.service.resetTeacherPassword(admin, id, dto);
  }

  /* ---------------------------- Chefs de classe --------------------------- */

  @Get('leaders')
  listLeaders(@CurrentAdmin() admin: AdminContext) {
    return this.service.listLeaders(admin.establishmentId);
  }

  @Post('classes/:classId/leader')
  assignLeader(
    @CurrentAdmin() admin: AdminContext,
    @Param('classId') classId: string,
    @Body() dto: AssignLeaderDto,
  ) {
    return this.service.assignLeader(admin, classId, dto);
  }

  @Post('classes/:classId/leader/remove')
  removeLeader(
    @CurrentAdmin() admin: AdminContext,
    @Param('classId') classId: string,
    @Query('deputy') deputy?: string,
  ) {
    return this.service.removeLeader(admin, classId, deputy === 'true');
  }
}
