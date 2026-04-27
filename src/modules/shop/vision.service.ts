import { Injectable, Logger, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface VisionResult {
  productName: string;
  brand: string | null;
  category: string;
  description: string;
  weightGrams: number | null;
  targetPetType: string[];
  targetAgeGroup: string[];
  ingredientsList: string | null;
  safetyFlags: string[];
  suggestedPriceRangeEgp: { min: number; max: number } | null;
  confidence: 'high' | 'medium' | 'low';
}

@Injectable()
export class VisionService {
  private readonly logger = new Logger(VisionService.name);
  private readonly apiKey: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async scanProductImage(imageUrl: string): Promise<{
    extracted: VisionResult;
    imageUrl: string;
    model: string;
    processedAt: string;
    warning?: string;
    message?: string;
  }> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException({
        error: 'vision_not_configured',
        message: 'Claude Vision is not configured. ANTHROPIC_API_KEY is missing.',
      });
    }

    const model = 'claude-sonnet-4-20250514';

    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: this.apiKey });

      const response = await client.messages.create({
        model,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'url', url: imageUrl },
              },
              {
                type: 'text',
                text: `Analyze this pet product image and extract:
{
  "productName": "exact product name from packaging",
  "brand": "brand name",
  "category": "one of: PET_FOOD, TREATS_SNACKS, ACCESSORIES, GROOMING_PRODUCTS, HEALTH_MEDICINE, TOYS, BEDDING, TRAINING_AIDS, CLOTHING, OTHER",
  "description": "2-3 sentence product description based on what you can see",
  "weightGrams": number or null,
  "targetPetType": ["DOG", "CAT", "BIRD", "FISH", "OTHER"],
  "targetAgeGroup": ["PUPPY", "ADULT", "SENIOR"],
  "ingredientsList": "full ingredients text if visible on packaging, else null",
  "safetyFlags": ["contains_xylitol", "contains_grapes", "contains_onion", "contains_chocolate", "contains_macadamia", "contains_avocado", "high_sodium", "contains_artificial_sweeteners"],
  "suggestedPriceRangeEgp": { "min": number, "max": number },
  "confidence": "high" or "medium" or "low"
}
Respond ONLY with valid JSON, no markdown, no explanation.`,
              },
            ],
          },
        ],
        system: 'You are a pet product catalog assistant for PawMateHub, an Egyptian pet care marketplace. When given a photo of a pet product, extract structured information. Respond ONLY with valid JSON, no markdown, no explanation.',
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';

      let extracted: VisionResult;
      try {
        extracted = JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
      } catch {
        throw new UnprocessableEntityException({
          error: 'not_a_pet_product',
          message: 'Could not identify a pet product in this image',
        });
      }

      if (!extracted.productName) {
        throw new UnprocessableEntityException({
          error: 'not_a_pet_product',
          message: 'Could not identify a pet product in this image',
        });
      }

      const result: {
        extracted: VisionResult;
        imageUrl: string;
        model: string;
        processedAt: string;
        warning?: string;
        message?: string;
      } = {
        extracted,
        imageUrl,
        model,
        processedAt: new Date().toISOString(),
      };

      if (extracted.confidence === 'low') {
        result.warning = 'low_confidence';
        result.message = 'Results may be inaccurate — please review carefully';
      }

      return result;
    } catch (error: any) {
      if (error instanceof UnprocessableEntityException || error instanceof ServiceUnavailableException) {
        throw error;
      }
      this.logger.error(`Vision API error: ${error.message}`, error.stack);
      throw new ServiceUnavailableException({
        error: 'vision_error',
        message: 'Product scanning is temporarily unavailable. Please try again.',
      });
    }
  }
}
