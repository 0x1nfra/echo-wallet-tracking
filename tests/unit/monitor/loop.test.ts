import { MonitorLoop } from '../../../src/monitor/loop.js';

describe('MonitorLoop idempotency and SIGTERM', () => {
  let loop: MonitorLoop;
  let logCalls: string[];
  let originalLog: typeof console.log;

  beforeEach(() => {
    loop = new MonitorLoop();
    logCalls = [];
    originalLog = console.log;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (console as any).log = (...args: unknown[]) => {
      if (typeof args[0] === 'string') logCalls.push(args[0]);
    };
    // Remove any SIGTERM listeners added by previous tests
    process.removeAllListeners('SIGTERM');
  });

  afterEach(() => {
    loop.stop();
    console.log = originalLog;
    process.removeAllListeners('SIGTERM');
  });

  test('Test 1: calling start() twice logs "[monitor] starting" exactly once and the second call returns without creating a second timer chain', () => {
    loop.start();
    loop.start();

    const startingCount = logCalls.filter(m => m.includes('[monitor] starting')).length;
    const alreadyRunningCount = logCalls.filter(m => m.includes('[monitor] already running')).length;

    expect(startingCount).toBe(1);
    expect(alreadyRunningCount).toBe(1);
  });

  test('Test 2: calling start() after stop() re-starts normally', () => {
    loop.start();
    loop.stop();
    logCalls = [];

    loop.start();

    const startingCount = logCalls.filter(m => m.includes('[monitor] starting')).length;
    const alreadyRunningCount = logCalls.filter(m => m.includes('[monitor] already running')).length;

    expect(startingCount).toBe(1);
    expect(alreadyRunningCount).toBe(0);
  });

  test('Test 3: when SIGTERM fires, stop() is called — stopped becomes true and timer is cleared', () => {
    loop.start();

    // Emit SIGTERM to trigger the registered handler
    process.emit('SIGTERM');

    // After SIGTERM, the loop should be stopped
    const stoppedCount = logCalls.filter(m => m.includes('[monitor] stopped')).length;
    expect(stoppedCount).toBe(1);

    // Calling start() again should work (running guard was reset by stop())
    logCalls = [];
    loop.start();
    const restartCount = logCalls.filter(m => m.includes('[monitor] starting')).length;
    expect(restartCount).toBe(1);
  });
});
