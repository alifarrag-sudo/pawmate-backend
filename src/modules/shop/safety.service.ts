import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface SafetyFlag {
  flag: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  affects: string[];
  reason: string;
}

const DANGEROUS_INGREDIENTS: Record<string, SafetyFlag> = {
  xylitol: { flag: 'contains_xylitol', severity: 'CRITICAL', affects: ['DOG'], reason: 'Causes severe hypoglycemia and liver failure in dogs' },
  'grapes': { flag: 'contains_grapes', severity: 'CRITICAL', affects: ['DOG', 'CAT'], reason: 'Causes acute kidney failure' },
  'raisins': { flag: 'contains_grapes', severity: 'CRITICAL', affects: ['DOG', 'CAT'], reason: 'Causes acute kidney failure' },
  'chocolate': { flag: 'contains_chocolate', severity: 'CRITICAL', affects: ['DOG', 'CAT'], reason: 'Theobromine toxicity' },
  'cocoa': { flag: 'contains_chocolate', severity: 'CRITICAL', affects: ['DOG', 'CAT'], reason: 'Theobromine toxicity' },
  'theobromine': { flag: 'contains_chocolate', severity: 'CRITICAL', affects: ['DOG', 'CAT'], reason: 'Theobromine toxicity' },
  'onion': { flag: 'contains_onion', severity: 'HIGH', affects: ['DOG', 'CAT'], reason: 'Causes hemolytic anemia' },
  'garlic': { flag: 'contains_onion', severity: 'HIGH', affects: ['DOG', 'CAT'], reason: 'Causes hemolytic anemia' },
  'leek': { flag: 'contains_onion', severity: 'HIGH', affects: ['DOG', 'CAT'], reason: 'Causes hemolytic anemia' },
  'macadamia': { flag: 'contains_macadamia', severity: 'HIGH', affects: ['DOG'], reason: 'Causes weakness, tremors, hyperthermia' },
  'avocado': { flag: 'contains_avocado', severity: 'HIGH', affects: ['DOG', 'CAT', 'BIRD'], reason: 'Persin toxicity' },
  'persin': { flag: 'contains_avocado', severity: 'HIGH', affects: ['DOG', 'CAT', 'BIRD'], reason: 'Persin toxicity' },
  'aspartame': { flag: 'contains_artificial_sweeteners', severity: 'MEDIUM', affects: ['DOG'], reason: 'Various sweeteners may cause GI issues or worse' },
  'sucralose': { flag: 'contains_artificial_sweeteners', severity: 'MEDIUM', affects: ['DOG'], reason: 'Various sweeteners may cause GI issues or worse' },
  'saccharin': { flag: 'contains_artificial_sweeteners', severity: 'MEDIUM', affects: ['DOG'], reason: 'Various sweeteners may cause GI issues or worse' },
};

@Injectable()
export class SafetyService {
  private readonly logger = new Logger(SafetyService.name);

  constructor(private readonly prisma: PrismaService) {}

  scanIngredients(ingredientsList: string | null, visionFlags: string[]): {
    flags: string[];
    details: Array<{ flag: string; severity: string; affects: string[]; reason: string }>;
  } {
    const flagSet = new Set<string>(visionFlags);
    const details: Array<{ flag: string; severity: string; affects: string[]; reason: string }> = [];

    if (ingredientsList) {
      const lower = ingredientsList.toLowerCase();
      for (const [keyword, info] of Object.entries(DANGEROUS_INGREDIENTS)) {
        if (lower.includes(keyword)) {
          flagSet.add(info.flag);
          if (!details.find(d => d.flag === info.flag)) {
            details.push({
              flag: info.flag,
              severity: info.severity,
              affects: info.affects,
              reason: info.reason,
            });
          }
        }
      }
    }

    // Also map any vision flags that aren't in our keyword scan
    for (const vf of visionFlags) {
      if (!details.find(d => d.flag === vf)) {
        details.push({ flag: vf, severity: 'MEDIUM', affects: ['DOG', 'CAT'], reason: 'Flagged by AI analysis' });
      }
    }

    return { flags: Array.from(flagSet), details };
  }

  async logSafetyFlags(productId: string, flags: string[], ingredientsList: string | null): Promise<void> {
    if (flags.length === 0) return;

    const severity = this.getHighestSeverity(flags);

    await this.prisma.auditLog.create({
      data: {
        entityType: 'ShopProduct',
        entityId: productId,
        action: 'product_safety_flag',
        actorId: 'system',
        metadata: {
          flags,
          severity,
          ingredientsList: ingredientsList?.substring(0, 500),
          action_category: 'execute_silent',
        },
      },
    });
  }

  private getHighestSeverity(flags: string[]): string {
    const severityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    for (const sev of severityOrder) {
      for (const flag of flags) {
        const entry = Object.values(DANGEROUS_INGREDIENTS).find(d => d.flag === flag);
        if (entry && entry.severity === sev) return sev;
      }
    }
    return 'LOW';
  }
}
