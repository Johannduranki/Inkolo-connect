import { createServer } from 'node:net';

// Check before opening stores so a duplicate API cannot acquire database locks.
export function assertPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(port, () => probe.close(error => error ? reject(error) : resolve()));
  });
}
