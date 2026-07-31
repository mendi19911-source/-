import { LOW_MARGIN_THRESHOLD_PERCENT } from "./enums";

export interface PricingInput {
  costPricePreVat: number | null;
  retailPrice: number | null; // VAT-inclusive, as shown to the customer
  vatRate: number; // e.g. 0.18
}

export interface PricingComputed {
  costPricePreVat: number | null;
  costPriceWithVat: number | null;
  retailPrice: number | null;
  retailPricePreVat: number | null;
  marginPercent: number | null;
  marginAmount: number | null;
  isLowMargin: boolean;
}

// Margin is computed on pre-VAT figures on both sides (VAT collected isn't profit),
// so cost and retail are compared on the same, tax-exclusive basis.
export function computePricing({ costPricePreVat, retailPrice, vatRate }: PricingInput): PricingComputed {
  const costPriceWithVat = costPricePreVat != null ? round2(costPricePreVat * (1 + vatRate)) : null;
  const retailPricePreVat = retailPrice != null ? round2(retailPrice / (1 + vatRate)) : null;

  let marginPercent: number | null = null;
  let marginAmount: number | null = null;
  if (costPricePreVat != null && retailPricePreVat != null && retailPricePreVat > 0) {
    marginAmount = round2(retailPricePreVat - costPricePreVat);
    marginPercent = round2((marginAmount / retailPricePreVat) * 100);
  }

  return {
    costPricePreVat: costPricePreVat ?? null,
    costPriceWithVat,
    retailPrice: retailPrice ?? null,
    retailPricePreVat,
    marginPercent,
    marginAmount,
    isLowMargin: marginPercent != null && marginPercent < LOW_MARGIN_THRESHOLD_PERCENT,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
