import { HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { Prisma } from '@prisma/client';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockResponse: any;
  let mockRequest: any;
  let mockHost: any;
  let jsonSpy: jest.Mock;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    jsonSpy = jest.fn();
    mockResponse = {
      status: jest.fn().mockReturnValue({ json: jsonSpy }),
    };
    mockRequest = {
      url: '/api/v1/test',
      method: 'GET',
      headers: {},
      requestId: 'test-request-id-123',
    };
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    };
  });

  it('should handle P2002 (unique constraint) as 409 Conflict', () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`email`)',
      { code: 'P2002', clientVersion: '5.8.0', meta: { target: ['email'] } },
    );

    filter.catch(error, mockHost as any);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    const body = jsonSpy.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('DUPLICATE_ENTRY');
    expect(body.error.details.fields).toEqual(['email']);
    expect(body.error.request_id).toBe('test-request-id-123');
  });

  it('should handle P2025 (record not found) as 404', () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'An operation failed because it depends on one or more records that were required but not found.',
      { code: 'P2025', clientVersion: '5.8.0' },
    );

    filter.catch(error, mockHost as any);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    const body = jsonSpy.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('RECORD_NOT_FOUND');
    expect(body.error.request_id).toBe('test-request-id-123');
  });

  it('should handle generic Error as 500 with no stack trace in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const error = new Error('Something secret broke internally');

    filter.catch(error, mockHost as any);

    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    const body = jsonSpy.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    // In production, internal error details are hidden
    expect(body.error.message).toBe('An unexpected error occurred');
    // No stack trace in the response
    expect(JSON.stringify(body)).not.toContain('at ');
    expect(body.error.request_id).toBe('test-request-id-123');

    process.env.NODE_ENV = originalEnv;
  });

  it('should include request_id in every error response', () => {
    const error = new HttpException('Not found', HttpStatus.NOT_FOUND);

    filter.catch(error, mockHost as any);

    const body = jsonSpy.mock.calls[0][0];
    expect(body.error.request_id).toBe('test-request-id-123');
  });

  it('should handle PrismaClientValidationError as 400 Bad Request', () => {
    const error = new Prisma.PrismaClientValidationError(
      'Invalid value for argument `where`.\nExpected UserWhereUniqueInput.\nReceived invalid type.',
      { clientVersion: '5.8.0' },
    );

    filter.catch(error, mockHost as any);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    const body = jsonSpy.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('PRISMA_VALIDATION_ERROR');
    expect(body.error.request_id).toBe('test-request-id-123');
  });

  it('should handle HttpException and preserve status code', () => {
    const error = new HttpException('Forbidden resource', HttpStatus.FORBIDDEN);

    filter.catch(error, mockHost as any);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    const body = jsonSpy.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('should generate a request_id when none is on the request', () => {
    mockRequest.requestId = undefined;
    delete mockRequest.headers['x-request-id'];

    const error = new HttpException('Bad request', HttpStatus.BAD_REQUEST);

    filter.catch(error, mockHost as any);

    const body = jsonSpy.mock.calls[0][0];
    // Should be a valid UUID-like string (auto-generated)
    expect(body.error.request_id).toBeDefined();
    expect(typeof body.error.request_id).toBe('string');
    expect(body.error.request_id.length).toBeGreaterThan(0);
  });

  it('should hide Prisma internal details in production for unknown Prisma codes', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const error = new Prisma.PrismaClientKnownRequestError(
      'Some internal prisma message\nwith multiple lines',
      { code: 'P2003', clientVersion: '5.8.0', meta: { field_name: 'userId' } },
    );

    filter.catch(error, mockHost as any);

    const body = jsonSpy.mock.calls[0][0];
    expect(body.error.message).toBe('A database error occurred');
    // No meta details leaked in production
    expect(body.error.details).toEqual({});

    process.env.NODE_ENV = originalEnv;
  });
});
