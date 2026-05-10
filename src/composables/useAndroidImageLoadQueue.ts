type QueueItem = {
  run: () => void;
  canceled: boolean;
};

const queue: QueueItem[] = [];
let activeCount = 0;
const maxActiveCount = 2;
const scheduleDelay = 24;

const scheduleNext = () => {
  if (typeof window === "undefined") return;

  while (activeCount < maxActiveCount && queue.length > 0) {
    const item = queue.shift();
    if (!item || item.canceled) continue;

    activeCount += 1;
    window.setTimeout(() => {
      try {
        if (!item.canceled) item.run();
      } finally {
        activeCount = Math.max(0, activeCount - 1);
        scheduleNext();
      }
    }, scheduleDelay);
  }
};

export const enqueueAndroidImageLoad = (run: () => void) => {
  const item: QueueItem = { run, canceled: false };
  queue.push(item);
  scheduleNext();

  return () => {
    item.canceled = true;
  };
};
