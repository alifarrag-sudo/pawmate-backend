import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { isSandbox, SANDBOX_CONFIG } from '../../common/sandbox/sandbox.config';

@ApiTags('sandbox')
@Controller('sandbox')
export class SandboxController {
  /**
   * Public status endpoint. Used by mobile on cold start to decide whether
   * to render the orange sandbox banner and surface the bypass UIs (OTP
   * auto-fill, payment simulator, course skip).
   *
   * No auth — mobile calls this before login.
   */
  @Get('status')
  @ApiOperation({ summary: 'Returns whether the backend is running in SANDBOX_MODE.' })
  getStatus() {
    if (!isSandbox()) {
      return { sandbox: false };
    }
    return {
      sandbox: true,
      features: {
        otp: `fixed code: ${SANDBOX_CONFIG.otpCode}`,
        documents: 'auto-approved',
        courses: 'auto-passed',
        payment: 'always succeeds',
        providerApproval: 'instant',
      },
    };
  }
}
