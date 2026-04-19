# PawMate Backend — NestJS CLAUDE.md
> Read the root `CLAUDE.md` first for business rules, roles, and architecture overview.

---

## Module Structure

Every domain is its own NestJS module under `src/modules/`. Each module contains:

```
modules/
└── [name]/
    ├── [name].module.ts      — registers providers, imports, exports
    ├── [name].controller.ts  — HTTP routes (thin layer, no business logic)
    ├── [name].service.ts     — all business logic lives here
    └── dto/
        ├── create-[name].dto.ts
        └── update-[name].dto.ts
```

Modules with extra complexity also contain:
- `[name].gateway.ts` — Socket.IO gateway (tracking module)
- `[name].strategy.ts` — Passport strategies (auth module)
- `[name].service.ts` split into `matching.service.ts`, `pricing.service.ts` (bookings)

### All Current Modules

| Module | Path | Description |
|--------|------|-------------|
| auth | `modules/auth/` | JWT access+refresh, bcrypt, OTP, email verify, social login |
| users | `modules/users/` | Profile CRUD, FCM device registration |
| pets | `modules/pets/` | Pet CRUD, medical, vaccinations, behavior, schedules |
| bookings | `modules/bookings/` | State machine, matching, pricing |
| providers | `modules/providers/` | Provider registration and profile management |
| sitters | `modules/sitters/` | PetFriend-specific operations |
| tracking | `modules/tracking/` | GPS Socket.IO gateway, fraud detection, walk sessions |
| payments | `modules/payments/` | Paymob integration, webhooks, refunds |
| notifications | `modules/notifications/` | FCM push, SendGrid email |
| food | `modules/food/` | Homemade food marketplace |
| offers | `modules/offers/` | Price negotiation (Parent ↔ PetFriend) |
| reviews | `modules/reviews/` | Post-booking reviews, moderation |
| care-log | `modules/care-log/` | Task tracking during active bookings |
| admin | `modules/admin/` | Admin actions, KYC review |
| adoption | `modules/adoption/` | DEFERRED — post-launch community |
| causes | `modules/causes/` | DEFERRED — fundraising community |
| social | `modules/social/` | Follow/unfollow users |
| search | `modules/search/` | Geo-filtered provider/sitter search |
| scheduler | `modules/scheduler/` | Cron jobs (payouts, overtime, review deadlines) |
| uploads | `modules/uploads/` | Cloudinary signed uploads |
| health | `modules/health/` | `/health` — Railway uptime monitor |

---

## Common Layer (`src/common/`)

### Guards
```typescript
// Protect a route — require valid JWT
@UseGuards(JwtAuthGuard)
@Get('profile')
getProfile(@CurrentUser() user: UserState) { ... }

// Mark a route as public (no JWT required)
@Public()
@Post('auth/login')
login(@Body() dto: LoginDto) { ... }
```

The `@Public()` decorator skips JwtAuthGuard globally. The guard is applied globally in `app.module.ts` — you do NOT need to add it to every route, only exclude it with `@Public()`.

### Decorators
```typescript
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
```

### Interceptors (Global)
- `TransformInterceptor` — wraps all responses in `{ success: true, data: ... }`
- `LoggingInterceptor` — logs request/response timing

### Filters (Global)
- `AllExceptionsFilter` — catches all unhandled errors, formats error response

### Utils
```typescript
// Crypto (src/common/utils/crypto.util.ts)
generateOTP()            // 6-digit OTP string
generateSecureToken()    // Cryptographically secure random token
hashValue(value)         // bcrypt hash helper

// Timezone (src/common/utils/timezone.util.ts)
// All times stored as UTC, converted to Cairo (Africa/Cairo, UTC+2) for display

// Pricing (src/common/utils/pricing.util.ts)
computeSitterTier(totalReviews, avgRating)    // Returns 'new' | 'bronze' | 'silver' | 'gold' | 'platinum'
getPriceRange(serviceType, tier)              // Returns { min, max }
buildPricingInfo(totalReviews, avgRating, isVerifiedTrainer, currentPrices)
```

---

## Prisma Usage

### Service Pattern
Always inject `PrismaService` and use the Prisma client directly. No extra repository layer.

```typescript
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ExampleService {
  constructor(private readonly prisma: PrismaService) {}

  async findBookingWithPets(bookingId: string) {
    return this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        pets: { include: { pet: true } },
        parent: { select: { id: true, firstName: true } },
        endCode: true,
      },
    });
  }
}
```

### Database Transactions
Use `prisma.$transaction` for any operation that touches multiple tables:

```typescript
async completeBooking(bookingId: string) {
  return this.prisma.$transaction(async (tx) => {
    const booking = await tx.booking.update({
      where: { id: bookingId },
      data: { status: 'completed', actualEnd: new Date() },
    });

    await tx.paymentTransaction.create({
      data: {
        userId: booking.petFriendId,
        bookingId: booking.id,
        type: 'payout',
        amount: booking.providerPayout,
        direction: 'credit',
        status: 'pending',
        currency: 'EGP',
      },
    });

    return booking;
  });
}
```

### Never Use Raw SQL for Business Logic
Use Prisma queries. Raw SQL only if Prisma literally cannot express the query (e.g., PostGIS geo queries).

---

## DTO Pattern (class-validator + class-transformer)

```typescript
import { IsEmail, IsString, MinLength, IsOptional, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBookingDto {
  @ApiProperty()
  @IsString()
  petFriendId: string;

  @ApiProperty({ enum: ServiceType })
  @IsEnum(ServiceType)
  serviceType: ServiceType;

  @ApiProperty()
  @Transform(({ value }) => new Date(value))
  requestedStart: Date;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  specialInstructions?: string;
}
```

Use `ValidationPipe` with `whitelist: true` and `transform: true` — this is already configured globally in `main.ts`. Do not re-configure it per-controller.

---

## Auth System

### JWT Flow
1. User logs in → `auth.service.ts` generates `accessToken` (15min TTL) + `refreshToken` (7 days)
2. `accessToken` is a JWT signed with `JWT_SECRET`
3. `refreshToken` is a hashed token stored in `RefreshToken` table (hash only, never raw)
4. Mobile sends `Authorization: Bearer <accessToken>` header on every request
5. On 401, mobile uses `POST /auth/refresh` with `refreshToken` to get new tokens

### OTP Flow (Email Verification)
1. Register → OTP stored in Redis with 10-minute TTL
2. `POST /auth/verify-email` with OTP → marks `emailVerified = true`
3. OTP attempts limited to 3; rate limited to 5 per hour per user

### Social Login
- Google and Facebook supported
- Social users have `passwordHash = null`
- `authProvider` field tracks which provider

### Rate Limiting
- Global rate limiting via `@nestjs/throttler` — configured in `app.module.ts`
- Auth endpoints use `rate-limiter-flexible` with Redis for stricter limits

---

## Paymob Integration

### How It Works
1. Backend calls Paymob API to create a payment order
2. Returns a payment token to the mobile app
3. Mobile opens Paymob's iframe/SDK with the token
4. Paymob processes payment and hits our webhook
5. Backend verifies HMAC signature → updates booking payment status

### Critical Rules
- **Always verify HMAC signature** on every webhook call
- Never process a webhook without verifying the signature
- Never store raw card data — only store `gatewayRef` (Paymob's transaction ID)
- Commission is deducted from the captured amount, not the authorized amount
- Use `ProcessedWebhookEvent` table to prevent duplicate webhook processing

```typescript
// Verify webhook signature (always do this first)
const isValid = paymobService.verifyWebhookSignature(payload, signature);
if (!isValid) throw new UnauthorizedException('Invalid webhook signature');

// Check for duplicate processing
const alreadyProcessed = await prisma.processedWebhookEvent.findUnique({
  where: { eventId: payload.id.toString() },
});
if (alreadyProcessed) return; // Idempotent response
```

### Supported Payment Methods (Egyptian)
- Cards (Visa, Mastercard)
- Mobile wallets (Vodafone Cash, Orange Cash)
- Fawry
- InstaPay

---

## Socket.IO Real-time

### Connection Auth
All socket connections require a JWT. Unauthenticated connections are rejected immediately.

```typescript
// gateway setup (see tracking/events.gateway.ts for reference)
@WebSocketGateway({ cors: true, namespace: '/tracking' })
export class EventsGateway {
  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;
    // validate token — disconnect if invalid
  }
}
```

### Two Namespaces
- `/chat` — per-booking messaging
- `/tracking` — real-time GPS coordinates during walks

### Events Pattern
```typescript
// Emit to a specific room (booking)
server.to(`booking:${bookingId}`).emit('location-update', { lat, lng });

// Emit to a specific user
server.to(`user:${userId}`).emit('booking-accepted', { bookingId });
```

---

## Error Handling

The global `AllExceptionsFilter` handles all unhandled errors. In services, throw NestJS exceptions:

```typescript
throw new NotFoundException('Booking not found');
throw new BadRequestException('Cannot cancel an active booking');
throw new UnauthorizedException('Access denied');
throw new ConflictException('Email already registered');
throw new ForbiddenException('You cannot access this booking');
```

For business logic errors, use `BadRequestException` with a clear message.

---

## Writing Tests

Test files go in the same module directory as `[name].service.spec.ts` or `[name].controller.spec.ts`.

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { BookingsService } from './bookings.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('BookingsService', () => {
  let service: BookingsService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        {
          provide: PrismaService,
          useValue: {
            booking: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should create a booking with correct commission', async () => {
    // Arrange: set up mock
    // Act: call service method
    // Assert: verify result
  });
});
```

Run tests: `npm run test` | Coverage: `npm run test:cov`

---

## Adding a New Module (Step by Step)

```bash
# 1. Generate via NestJS CLI (from backend/)
npx nest generate module modules/[name]
npx nest generate controller modules/[name]
npx nest generate service modules/[name]

# 2. Add to app.module.ts imports if needed
```

Then:
1. Add DTO files in `modules/[name]/dto/`
2. Inject `PrismaService` into the service
3. Add `@UseGuards(JwtAuthGuard)` on controller (or individual routes)
4. Add Swagger `@ApiTags('[name]')` on controller
5. Register module in `app.module.ts`

---

## Environment Variables Required

The backend will not start without these. Check `.env` exists before running:

```
DATABASE_URL            PostgreSQL connection (from Railway)
JWT_SECRET              Access token secret (min 32 chars)
JWT_REFRESH_SECRET      Refresh token secret (different from JWT_SECRET)
PAYMOB_API_KEY          Paymob API key
PAYMOB_IFRAME_ID        Paymob iframe ID
PAYMOB_INTEGRATION_ID   Paymob integration ID
PAYMOB_HMAC_SECRET      Paymob webhook signature key
CLOUDINARY_CLOUD_NAME   Cloudinary account
CLOUDINARY_API_KEY      Cloudinary API key
CLOUDINARY_API_SECRET   Cloudinary secret
FCM_SERVER_KEY          Firebase server key for push
SENDGRID_API_KEY        SendGrid for email OTPs
REDIS_URL               Redis for rate limiting and OTPs
PORT                    (optional, defaults to 3000)
```

---

## Prisma Schema Quick Reference

### Core Models
| Model | Table | Key Fields |
|-------|-------|-----------|
| User | users | id, roles[], activeRole, email, phone, walletBalance |
| PetFriendProfile | petfriend_profiles | userId, rates, availability, metrics |
| TrainerProfile | trainer_profiles | userId, offerings, specializations |
| KennelProfile | kennel_profiles | userId, businessName, capacity, rooms |
| PetHotelProfile | pethotel_profiles | userId, roomTypes (JSON) |
| Pet | pets | ownerId, species, vaccines, behavior |
| Booking | bookings | parentId, petFriendId, status, commissionRate(15%) |
| BookingEndCode | booking_end_codes | bookingId, code (4 digits), isUsed |
| OvertimeLog | overtime_logs | bookingId, startedAt, totalMinutes, totalCharge |
| PaymentTransaction | payment_transactions | userId, bookingId, type, amount, gateway |
| PetFriendPayout | petfriend_payouts | petFriendId, bookingId, amount, status |

### Booking Status Machine
```
pending → accepted → active → code_verified → completed
```
Status is a `BookingStatus` enum. Never skip states. Validate in `BookingsService`.

### Important JSON Fields
- `Booking.petSnapshot` — frozen pet data at booking time (don't use live pet data for display)
- `KennelProfile.operatingHours` — `{ mon: { open, close, closed }, ... }`
- `PetHotelProfile.roomTypes` — `[{ name, description, photos[], capacity, pricePerNight, amenities[] }]`
- `Pet.feedingSchedule` — `[{ time: "08:00", notes?: string }]`
- `Pet.temperament` — `{ goodWithDogs, goodWithCats, goodWithChildren, isAnxious, aggressiveTendencies, notes }`
