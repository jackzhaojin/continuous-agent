/**
 * Worker Spawner - Core Agent SDK integration
 *
 * Spawns worker agents using the Claude Agent SDK to execute
 * task contracts. This is the bridge between the executive loop
 * and actual AI-powered task execution.
 */
import type { TaskContract, WorkerResult } from './types.js';
/**
 * Spawn a worker agent to execute a task contract
 *
 * @param contract - The task contract defining what the worker should do
 * @returns WorkerResult with success status, output, and any artifacts/errors
 */
export declare function spawnWorker(contract: TaskContract): Promise<WorkerResult>;
/**
 * Validate that authentication is configured for the Agent SDK
 */
export declare function validateAuth(): {
    valid: boolean;
    method: string | null;
    error: string | null;
};
//# sourceMappingURL=worker-spawner.d.ts.map