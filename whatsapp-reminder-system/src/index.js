import { run } from './engine.js';

run().catch((err) => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
