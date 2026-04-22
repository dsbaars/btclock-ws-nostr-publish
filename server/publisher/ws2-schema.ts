import { z } from 'zod'

/**
 * Inbound v2 message shape (§2.6).
 *
 * Client sends either a `subscribe` or `unsubscribe` for one of four event
 * types. Price events additionally carry either a single `currency` or an
 * array of `currencies`.
 */

const eventType = z.enum(['blockheight', 'blockfee', 'blockfee2', 'price'])

const baseShape = {
    eventType,
    currency: z.string().optional(),
    currencies: z.array(z.string()).optional(),
}

export const v2Message = z.discriminatedUnion('type', [
    z.object({ type: z.literal('subscribe'), ...baseShape }),
    z.object({ type: z.literal('unsubscribe'), ...baseShape }),
])

export type V2Message = z.infer<typeof v2Message>
