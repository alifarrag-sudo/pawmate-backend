import { MailService } from './mail.service';

describe('MailService', () => {
  let service: MailService;

  beforeEach(() => {
    const mockConfig = {
      get: jest.fn((key: string, def?: any) => {
        if (key === 'EMAIL_API_KEY') return undefined; // No API key = stub mode
        if (key === 'EMAIL_FROM') return 'test@pawmate.eg';
        return def;
      }),
    };
    service = new MailService(mockConfig as any);
  });

  it('should not throw when sending welcome email in stub mode', async () => {
    await expect(service.sendWelcome({ email: 'test@test.com', firstName: 'Ali' }))
      .resolves.not.toThrow();
  });

  it('should not throw when sending password reset in stub mode', async () => {
    await expect(service.sendPasswordReset({ email: 'test@test.com', firstName: 'Ali' }, 'token123'))
      .resolves.not.toThrow();
  });

  it('should not throw when sending email verification in stub mode', async () => {
    await expect(service.sendEmailVerification({ email: 'test@test.com', firstName: 'Ali' }, 'token456'))
      .resolves.not.toThrow();
  });
});
