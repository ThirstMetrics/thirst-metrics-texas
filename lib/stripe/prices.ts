/**
 * Stripe Price Constants & Tier Helpers
 * Maps environment price IDs to tier metadata
 */

export interface PriceTier {
  id: string;
  name: string;
  pricePerSeat: number;
  minSeats: number;
  maxSeats: number | null;
}

export function getPriceTiers(): PriceTier[] {
  return [
    {
      id: process.env.STRIPE_PRICE_STARTER || '',
      name: 'Starter',
      pricePerSeat: 49,
      minSeats: 1,
      maxSeats: 3,
    },
    {
      id: process.env.STRIPE_PRICE_GROWTH || '',
      name: 'Growth',
      pricePerSeat: 39,
      minSeats: 4,
      maxSeats: 10,
    },
    {
      id: process.env.STRIPE_PRICE_ENTERPRISE || '',
      name: 'Enterprise',
      pricePerSeat: 29,
      minSeats: 11,
      maxSeats: null,
    },
  ];
}

/** Get the right price tier for a given seat count */
export function getTierForSeats(seatCount: number): PriceTier {
  const tiers = getPriceTiers();
  if (seatCount >= 11) return tiers[2];
  if (seatCount >= 4) return tiers[1];
  return tiers[0];
}

/** Get tier metadata by Stripe price ID */
export function getTierByPriceId(priceId: string): PriceTier | undefined {
  return getPriceTiers().find((t) => t.id === priceId);
}
