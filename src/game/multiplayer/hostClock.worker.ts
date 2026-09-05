const PULSE_MS = 10;
let timer: ReturnType<typeof setInterval> | undefined;

self.onmessage = (event: MessageEvent<'start' | 'stop'>) => {
  if (event.data === 'stop' && timer !== undefined) { clearInterval(timer); timer = undefined; }
  if (event.data === 'start' && timer === undefined) timer = setInterval(() => self.postMessage('pulse'), PULSE_MS);
};

export {};
