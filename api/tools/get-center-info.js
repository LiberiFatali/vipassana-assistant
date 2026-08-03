/**
 * AI SDK tool: get_center_info
 *
 * Returns static contact and location information for UCENLIST meditation centers.
 * No scraping — data is hardcoded from the official website (June 2026).
 * Port of the original Python tool module of the same name.
 */
import { z } from "zod";
import { CENTERS } from "../../lib/centers.js";

export const getCenterInfoInputSchema = z.object({
  center: z
    .string()
    .describe(
      "Which center to get info for: 'virocana' = Dhamma Virocana in Ha Noi (Hà Nội), 'vutthi' = Dhamma Vutthi in Ho Chi Minh City (TP. Hồ Chí Minh)."
    ),
});

/**
 * Returns contact and location information for a UCENLIST meditation center.
 *
 * Data is static (sourced from official website) and always available
 * without network access. Includes:
 * - name: Center name
 * - city / city_vi: City in English and Vietnamese
 * - address: Full address in Vietnamese
 * - phone: Phone number
 * - email: Contact email
 * - website: Center website URL
 * - schedule_url_vi / schedule_url_en: Direct links to course schedule
 * - maps_url: Google Maps link (if available)
 */
export function getCenterInfo(input) {
  const { center } = getCenterInfoInputSchema.parse(input);

  if (!(center in CENTERS)) {
    return {
      error: `Unknown center '${center}'. Valid options: 'virocana' (Ha Noi) or 'vutthi' (Ho Chi Minh City).`,
    };
  }
  return { ...CENTERS[center] };
}
