import { IsArray, IsObject, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * POST /lms/courses/:courseId/lessons/:order/complete
 *
 * VIDEO + TEXT lessons complete with no body. QUIZ lessons require an
 * `answers` map keyed by question id → selected option id. The service
 * computes the score against QuizQuestion.correctId and stores it on
 * LessonProgress.quizScore.
 */
export class CompleteLessonDto {
  @ApiPropertyOptional({
    description: 'Map of questionId → selected optionId. Required for QUIZ lessons.',
    example: { 'q1-id': 'a', 'q2-id': 'c' },
  })
  @IsOptional()
  @IsObject()
  answers?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Reserved for future telemetry (time on lesson etc.)' })
  @IsOptional()
  @IsArray()
  events?: unknown[];
}
