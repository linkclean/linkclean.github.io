import { z } from 'zod';

export const ShortlinkListSchema = z.object({
  version: z.string(),
  updated_at: z.string().datetime({ offset: true }).optional(),
  /** Attribution for the domain list source. */
  source: z.string().optional(),
  /** Plain-hostname short-link domains (e.g. "t.co", "bit.ly").
   *  Matching uses exact hostname or any subdomain (*.domain). */
  domains: z.array(z.string().min(3)),
});

export type ShortlinkList = z.infer<typeof ShortlinkListSchema>;
