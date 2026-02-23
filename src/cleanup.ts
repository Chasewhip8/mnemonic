

import cron from 'node-cron';
import type { DejaService } from './service';

export function startCleanupCron(service: DejaService): void {
  cron.schedule('0 0 * * *', async () => {
    const result = await service.cleanup();
    console.log('Cleanup:', result);
  });
}
