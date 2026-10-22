import { AsyncLocalStorage } from "node:async_hooks";

// Carry lock-loss cancellation through nested non-streaming AI helpers.
export const aiSlotSignal = new AsyncLocalStorage<AbortSignal>();
