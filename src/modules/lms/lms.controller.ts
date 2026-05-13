import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Request,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
} from '@nestjs/swagger';
import { CourseId } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LmsService } from './lms.service';
import { CompleteLessonDto } from './lms.dto';

const VALID_COURSE_IDS = [
  'WALKER_SAFETY_MODULE',
  'DAY_CARE_PROVIDER_COURSE',
  'BOARDING_PROVIDER_COURSE',
] as const;

function parseCourseId(raw: string): CourseId {
  if (!(VALID_COURSE_IDS as readonly string[]).includes(raw)) {
    throw new BadRequestException(`Invalid courseId: ${raw}`);
  }
  return raw as CourseId;
}

@ApiTags('lms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('lms')
export class LmsController {
  constructor(private readonly lms: LmsService) {}

  @Get('courses')
  @ApiOperation({ summary: 'Courses this provider needs (matches their eligibilities).' })
  myCourses(@Request() req: any) {
    return this.lms.getCoursesForProvider(req.user.id);
  }

  @Get('courses/:courseId')
  @ApiOperation({ summary: 'Full course content + the caller’s enrollment.' })
  course(@Request() req: any, @Param('courseId') courseId: string) {
    return this.lms.getCourseDetail(req.user.id, parseCourseId(courseId));
  }

  @Post('courses/:courseId/enroll')
  @ApiOperation({ summary: 'Create or refresh an enrollment for the caller.' })
  enroll(@Request() req: any, @Param('courseId') courseId: string) {
    return this.lms.enroll(req.user.id, parseCourseId(courseId));
  }

  @Post('courses/:courseId/lessons/:order/complete')
  @ApiOperation({
    summary: 'Mark a lesson complete. QUIZ lessons score against correctId.',
  })
  completeLesson(
    @Request() req: any,
    @Param('courseId') courseId: string,
    @Param('order', ParseIntPipe) order: number,
    @Body() dto: CompleteLessonDto,
  ) {
    return this.lms.completeLesson(
      req.user.id,
      parseCourseId(courseId),
      order,
      dto,
    );
  }

  @Get('courses/:courseId/certificate')
  @ApiOperation({ summary: '15-min signed URL for the PDF certificate.' })
  certificate(@Request() req: any, @Param('courseId') courseId: string) {
    return this.lms.getCertificateUrl(req.user.id, parseCourseId(courseId));
  }

  @Get('courses/:courseId/web-link')
  @ApiOperation({
    summary:
      'Returns the signed web URL + return-to-mobile deep link for the LMS player.',
  })
  webLink(@Request() req: any, @Param('courseId') courseId: string) {
    return this.lms.buildWebLink(req.user.id, parseCourseId(courseId));
  }

  // ─── Sandbox: instant pass ────────────────────────────────────────────────
  //
  // Force-completes any course for the caller. Returns 403 from the service
  // layer when SANDBOX_MODE is not enabled, so this route is a no-op in
  // production even if the path is publicly known.

  @Post('sandbox/complete-course')
  @ApiOperation({
    summary:
      'SANDBOX ONLY — instantly pass a course (returns 403 in production).',
  })
  sandboxCompleteCourse(
    @Request() req: any,
    @Body() body: { courseId: string },
  ) {
    if (!body?.courseId) {
      throw new BadRequestException('courseId is required.');
    }
    return this.lms.sandboxCompleteCourse(req.user.id, parseCourseId(body.courseId));
  }
}
