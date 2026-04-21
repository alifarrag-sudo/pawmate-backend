import { EventBridgeService } from './event-bridge.service';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

// Mock PrismaService
const mockPrisma = {
  eventBridgeDelivery: {
    create: jest.fn().mockResolvedValue({ id: 'delivery-1' }),
    update: jest.fn().mockResolvedValue({}),
  },
};

// Mock ConfigService
const makeConfig = (url?: string, secret?: string) => ({
  get: jest.fn((key: string) => {
    const vals: Record<string, string | undefined> = {
      COMMAND_CENTER_WEBHOOK_URL: url,
      COMMAND_CENTER_WEBHOOK_SECRET: secret,
    };
    return vals[key];
  }),
});

describe('EventBridgeService', () => {
  let service: EventBridgeService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EventBridgeService(
      makeConfig('https://test.example.com/api/ingest/events', 'test-secret-32bytes!!') as any,
      mockPrisma as any,
    );
  });

  describe('HMAC signing', () => {
    it('produces consistent HMAC-SHA256 signatures', () => {
      const body = JSON.stringify({ event_id: 'test', event_name: 'user.signed_up' });
      const sig1 = (service as any).sign(body);
      const sig2 = (service as any).sign(body);
      expect(sig1).toBe(sig2);
      expect(sig1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('produces different signatures for different bodies', () => {
      const sig1 = (service as any).sign('body1');
      const sig2 = (service as any).sign('body2');
      expect(sig1).not.toBe(sig2);
    });
  });

  describe('deliverWithRetry', () => {
    it('sends signed POST and tracks delivery on success', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const envelope = {
        event_id: 'evt-1',
        event_name: 'booking.created',
        project_id: 'pawmate',
        emitted_at: new Date().toISOString(),
        source: 'pawmate-backend',
        payload: { booking: { id: 'b-1' } },
        correlation_id: 'b-1',
      };

      await (service as any).deliverWithRetry(envelope);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://test.example.com/api/ingest/events');
      expect(options.method).toBe('POST');
      expect(options.headers['X-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);

      // Delivery tracked
      expect(mockPrisma.eventBridgeDelivery.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ eventId: 'evt-1', eventName: 'booking.created', delivered: false }),
      });
      expect(mockPrisma.eventBridgeDelivery.update).toHaveBeenCalledWith({
        where: { id: 'delivery-1' },
        data: expect.objectContaining({ delivered: true, attempts: 1 }),
      });
    });

    it('retries on failure up to 3 times then drops', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockRejectedValueOnce(new Error('503'))
        .mockRejectedValueOnce(new Error('Still down'));

      (service as any).sleep = jest.fn().mockResolvedValue(undefined);

      await (service as any).deliverWithRetry({
        event_id: 'evt-2', event_name: 'payment.failed',
        project_id: 'pawmate', emitted_at: new Date().toISOString(),
        source: 'pawmate-backend', payload: {}, correlation_id: 'c-2',
      });

      expect(mockFetch).toHaveBeenCalledTimes(4);
      expect((service as any).sleep).toHaveBeenCalledTimes(3);
    });

    it('succeeds on retry after initial failure', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValueOnce({ ok: true, status: 200 });

      (service as any).sleep = jest.fn().mockResolvedValue(undefined);

      await (service as any).deliverWithRetry({
        event_id: 'evt-3', event_name: 'user.signed_up',
        project_id: 'pawmate', emitted_at: new Date().toISOString(),
        source: 'pawmate-backend', payload: {}, correlation_id: 'c-3',
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockPrisma.eventBridgeDelivery.update).toHaveBeenLastCalledWith({
        where: { id: 'delivery-1' },
        data: expect.objectContaining({ delivered: true, attempts: 2 }),
      });
    });
  });

  describe('disabled state', () => {
    it('does not deliver when env vars are missing', async () => {
      const disabledService = new EventBridgeService(
        makeConfig(undefined, undefined) as any,
        mockPrisma as any,
      );

      await (disabledService as any).onAnyEvent({ booking: { id: '1' } });
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
