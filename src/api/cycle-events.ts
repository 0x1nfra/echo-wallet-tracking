import { EventEmitter } from 'events';

// Shared singleton: MonitorLoop emits 'cycle' after each signal computation.
// Fastify SSE route subscribes to this to fan out live updates to browsers.
export const cycleEmitter = new EventEmitter();
cycleEmitter.setMaxListeners(50); // allow many concurrent browser connections
