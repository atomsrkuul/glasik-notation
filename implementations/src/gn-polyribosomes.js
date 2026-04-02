/**
 * GN Polyribosomes v0.1
 * Parallel shard processing using worker threads
 */

const { Worker } = require('worker_threads');
const path = require('path');

class GNPolyribosomes {
  constructor(numWorkers = 4) {
    this.numWorkers = numWorkers;
    this.workers = [];
    this.queue = [];
    this.processing = new Set();
    this.completed = 0;
    this.failed = 0;

    this.initWorkers();
  }

  initWorkers() {
    for (let i = 0; i < this.numWorkers; i++) {
      const worker = new Worker(path.join(__dirname, 'gn-ribosome-worker.js'));
      
      worker.on('message', (result) => {
        this.handleWorkerResult(result);
      });

      worker.on('error', (err) => {
        this.failed++;
        console.error(`[POLYRIBOSOMES] Worker error:`, err.message);
      });

      this.workers.push(worker);
    }
  }

  /**
   * Process multiple shards in parallel
   */
  async processBatch(shards, aceEngine) {
    return new Promise((resolve, reject) => {
      let completed = 0;
      const results = [];

      shards.forEach((shard, idx) => {
        this.queue.push({ shard, index: idx, aceEngine });
      });

      const processNext = () => {
        if (this.queue.length === 0 && this.processing.size === 0) {
          resolve(results);
          return;
        }

        if (this.queue.length > 0 && this.processing.size < this.numWorkers) {
          const task = this.queue.shift();
          this.processing.add(task.index);

          const worker = this.workers[task.index % this.numWorkers];
          worker.postMessage({
            shard: task.shard,
            taskId: task.index
          });
        }

        setImmediate(processNext);
      };

      this.handleWorkerResult = (result) => {
        results[result.taskId] = result;
        this.processing.delete(result.taskId);
        this.completed++;
        processNext();
      };

      processNext();
    });
  }

  /**
   * Get polyribosome stats
   */
  getStats() {
    return {
      workers: this.numWorkers,
      queued: this.queue.length,
      processing: this.processing.size,
      completed: this.completed,
      failed: this.failed
    };
  }

  /**
   * Cleanup workers
   */
  terminate() {
    this.workers.forEach(w => w.terminate());
  }
}

module.exports = GNPolyribosomes;
