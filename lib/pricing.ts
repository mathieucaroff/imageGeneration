// Never provision an offer priced above this ($/hr for the whole instance).
export const MAX_PRICE_PER_HOUR = Number(process.env.VASTAI_MAX_PRICE ?? 0.5)

// Instances priced above this are destroyed rather than stopped when
// stop-all.ts runs, since we don't want to keep paying idle storage on them
// or have provision-rtx4090.ts prefer reusing them next time.
export const REUSE_PRICE_THRESHOLD = Number(process.env.VASTAI_REUSE_THRESHOLD ?? 0.4)
