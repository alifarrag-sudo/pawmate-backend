# Archived Migration: 20260406_security_fixes

## Why archived

This migration was written against the **old column names** (`sitterId`, `ownerId`) that existed before the PetFriend/Parent rename. The renames were applied directly via `prisma db push`, not through a migration, so this file was never executed and would fail if run today.

Specific broken references:
- `bookings.sitterId` -> now `bookings.petFriendId`
- `bookings.ownerId` -> now `bookings.parentId`
- `offers.sitterId` -> now `offers.petFriendId`
- `offers.ownerId` -> now `offers.parentId`

## What replaced it

A full baseline migration (`20260421000000_baseline`) was created on 2026-04-21 using `prisma migrate diff --from-empty`. This captures the entire current schema as a single migration and was marked as applied via `prisma migrate resolve --applied`.

## Original security fixes

The security improvements in this file (unique constraint on `gatewayRef`, webhook dedup table, indexes, soft delete columns) **were already applied** to the production DB via `prisma db push`. They are included in the baseline migration.
