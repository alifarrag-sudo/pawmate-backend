import { Injectable, Logger } from '@nestjs/common';
import { WalkSession } from '@prisma/client';

interface GpsPoint {
  lat: number;
  lng: number;
  speedMs?: number;
  recordedAt: string;
}

const MAX_WALKING_SPEED_MS = 3.5;  // ~12.6 km/h (fast jogging, pets included)
const VEHICLE_SPEED_THRESHOLD_MS = 22;  // ~80 km/h — clearly in a vehicle
const STATIONARY_THRESHOLD_M = 10;  // Less than 10m movement = stationary
const STATIONARY_DURATION_MS = 10 * 60 * 1000;  // 10 minutes
const MIN_WALK_DURATION_MS = 5 * 60 * 1000;  // 5 minutes minimum

@Injectable()
export class FraudDetectionService {
  private readonly logger = new Logger(FraudDetectionService.name);

  async analyzePoints(session: WalkSession, points: GpsPoint[]): Promise<string[]> {
    const flags: string[] = [];

    if (points.length === 0) return flags;

    // 1. Speed check: detect if sitter is in a vehicle
    const vehicleFlag = this.checkVehicleMovement(points);
    if (vehicleFlag) flags.push('possible_vehicle_movement');

    // 2. GPS spoofing: check for impossible jumps
    const jumpFlag = this.checkImpossibleJumps(points);
    if (jumpFlag) flags.push('impossible_gps_jump');

    // 3. Stationary check: no movement for 10+ minutes during walk
    const stationaryFlag = this.checkLongStationary(points);
    if (stationaryFlag) flags.push('long_stationary_period');

    // 4. GPS accuracy: very low accuracy (> 100m) throughout
    const accuracyFlag = this.checkPoorAccuracy(points);
    if (accuracyFlag) flags.push('poor_gps_accuracy');

    return flags;
  }

  private checkVehicleMovement(points: GpsPoint[]): boolean {
    // More than 20% of points show vehicle-level speed
    const vehicleSpeedPoints = points.filter(
      (p) => p.speedMs && p.speedMs > VEHICLE_SPEED_THRESHOLD_MS,
    );
    return vehicleSpeedPoints.length / points.length > 0.2;
  }

  private checkImpossibleJumps(points: GpsPoint[]): boolean {
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];

      const timeDiffMs =
        new Date(curr.recordedAt).getTime() - new Date(prev.recordedAt).getTime();
      if (timeDiffMs <= 0) continue;

      const distM = this.haversine(prev.lat, prev.lng, curr.lat, curr.lng);
      const speedMs = distM / (timeDiffMs / 1000);

      // If reported speed > 80 km/h, that's impossible for a dog walk
      if (speedMs > VEHICLE_SPEED_THRESHOLD_MS * 3) {
        this.logger.warn(`Impossible GPS jump detected: ${speedMs.toFixed(1)} m/s`);
        return true;
      }
    }
    return false;
  }

  private checkLongStationary(points: GpsPoint[]): boolean {
    if (points.length < 2) return false;

    let stationaryStart: Date | null = null;

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const distM = this.haversine(prev.lat, prev.lng, curr.lat, curr.lng);

      if (distM < STATIONARY_THRESHOLD_M) {
        if (!stationaryStart) {
          stationaryStart = new Date(prev.recordedAt);
        }
        const stationaryDuration =
          new Date(curr.recordedAt).getTime() - stationaryStart.getTime();
        if (stationaryDuration > STATIONARY_DURATION_MS) {
          return true;
        }
      } else {
        stationaryStart = null;
      }
    }
    return false;
  }

  private checkPoorAccuracy(points: GpsPoint[]): boolean {
    // If more than 80% of points have accuracy > 100m, flag as suspicious
    const pointsWithAccuracy = points.filter((p) => p.speedMs !== undefined);
    if (pointsWithAccuracy.length === 0) return false;

    // Check via accuracy field (would need type update - simplified here)
    return false; // TODO: implement when GpsPoint includes accuracyM
  }

  private haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(Δφ / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
