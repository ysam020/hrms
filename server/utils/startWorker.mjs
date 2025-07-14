import { Worker as ThreadWorker } from "worker_threads";

export function startWorker(workerPath) {
  try {
    const worker = new ThreadWorker(workerPath);

    worker.on("error", (err) => {
      console.error(`[Worker ${workerPath}] Error:`, err);
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        console.error(`[Worker ${workerPath}] Exited with code ${code}`);
        throw new Error(`Worker exited with code ${code}`);
      }
    });

    return worker;
  } catch (error) {
    console.error(error);
  }
}
