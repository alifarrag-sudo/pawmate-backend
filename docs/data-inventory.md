# PawMateHub Data Inventory
> PDPL (Personal Data Protection Law 151/2020) compliance reference

## Personal Data Collected

### Pet Parents
| Field | Type | Encrypted | Retention | Legal Basis |
|-------|------|-----------|-----------|-------------|
| firstName, lastName | String | No | Account lifetime + 30d grace | Contract performance |
| email | String | No | Account lifetime + 30d grace | Contract performance |
| phone | String | No | Account lifetime | Contract performance |
| city | String | No | Account lifetime | Service delivery |
| pet medical records | JSON | Yes (AES-256) | Permanent (veterinary regulations) | Legal obligation |
| booking history | Records | No | 7 years (tax) | Legal obligation |
| payment card tokens | Paymob reference only | N/A (not stored) | Paymob retention | Contract performance |

### Service Providers
| Field | Type | Encrypted | Retention | Legal Basis |
|-------|------|-----------|-----------|-------------|
| firstName, lastName | String | No | Account lifetime | Contract performance |
| National ID images | Cloudinary URL | No (hosted externally) | Until verification complete, then deleted | Legitimate interest (safety) |
| Police Clearance Certificate | Cloudinary URL | No | 1 year (re-verification cycle) | Legitimate interest (safety) |
| Bank/payout details | Paymob reference | N/A | Paymob retention | Contract performance |
| Location data | Lat/Lng | No | Session only (walk tracking) | Consent |
| Syndicate card (Vets) | Cloudinary URL | No | Account lifetime | Legal obligation |

### Investors
| Field | Type | Encrypted | Retention | Legal Basis |
|-------|------|-----------|-----------|-------------|
| firstName, lastName, email | String | No | Investment lifetime | Contract performance |
| SAFE note details | JSON | No | Investment lifetime + 7 years | Legal obligation |
| Portal access logs | Audit log | No | 2 years | Legitimate interest |

## Data Subject Rights (PDPL Article 2-8)
- **Right to Access**: GET /users/me returns all personal data
- **Right to Rectification**: PATCH /users/me allows editing
- **Right to Erasure**: DELETE /users/me/delete-request (30-day grace period)
  - Medical records RETAINED per veterinary regulations
  - Booking records ANONYMIZED but retained for tax (7 years)
  - Reviews ANONYMIZED (author becomes "Former User")
- **Right to Data Portability**: POST /users/me/data-export (async, emailed)
- **Right to Object**: Notification preferences allow opting out of marketing

## Data Controller
- AJ Technologies LLC, Cairo, Egypt
- DPO Contact: privacy@pawmatehub.com
- PDPL Registration: Pending (pre-launch)

## Encryption
- Medical data: AES-256-GCM via MEDICAL_DATA_ENCRYPTION_KEY
- Passwords: bcrypt with salt rounds = 12
- JWT tokens: HS256 with min 32-char secret
- TLS: enforced via Railway (HTTPS only) and Netlify (automatic SSL)

## Third-Party Data Processors
| Processor | Data Shared | Purpose | DPA Status |
|-----------|-------------|---------|------------|
| Supabase (PostgreSQL) | All DB data | Primary database | Standard ToS |
| Railway | Backend runtime | Hosting | Standard ToS |
| Netlify | Web platform | Hosting | Standard ToS |
| Cloudinary | User photos, documents | Media storage | Standard ToS |
| Paymob | Payment tokens | Payment processing | Egyptian regulated |
| Firebase (FCM) | Device tokens only | Push notifications | Google DPA |
| Anthropic | Task descriptions (no PII) | AI agent processing | Standard ToS |

## PDPL Compliance Audit Findings (2026-04-28)

### Vet Consultation Consent
- **Status: PRESENT**
- Vet application form includes `consentAccepted` checkbox (web/app/apply/vet/_steps.tsx, step 4)
- Vet consultation creation includes PDPL consent banner with explicit checkbox at web/app/(app)/operator/vet/consultations/new/page.tsx
- Consent text references Egyptian PDPL by name, mentions encryption at rest and access logging
- Validation enforces consent before form submission (`step === 4 && !formData.consentAccepted`)

### Marketing Opt-in Defaults
- **Status: NOT FOUND**
- No marketing notification preference toggle found in backend or frontend
- No `notificationPreferences` or marketing opt-in/opt-out field in user schema
- **ACTION REQUIRED**: Add explicit opt-in (not opt-out) for marketing communications per PDPL Article 7 (consent must be freely given, specific, informed)

### Cookie Consent Banner
- **Status: NOT FOUND in codebase**
- Cookie policy page exists at web/app/(marketing)/legal/cookie/page.tsx (placeholder text)
- Auth cookies are set (pawmate_auth, pawmate_has_token) but no consent banner component found
- Per task description: "being created by another agent" -- confirm delivery before launch

### Investor Data Access Isolation
- **Status: PRESENT and VERIFIED**
- InvestorGuard at backend/src/modules/investor/investor.guard.ts enforces INVESTOR role or admin role
- Guard queries user from database, checks `roles` array for 'INVESTOR'
- Applied to all investor endpoints: metrics, metrics/detailed, documents, documents/:id/url, safe-note, updates, messages (7 endpoints total)
- All investor endpoints require both JwtAuthGuard + InvestorGuard (double guard)
- Admin roles (admin, owner, owner_restricted) bypass investor check -- appropriate for platform operators
