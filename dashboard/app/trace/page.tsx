'use client';

import AgentStatusBar from '@/components/AgentStatusBar';
import { useDashboard } from '@/lib/use-dashboard';

export default function TracePage() {
  const { data, loading } = useDashboard();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <AgentStatusBar agentStatus={data.agent_status} generatedAt={data.generated_at} />

      <div className="flex-1 overflow-auto p-6">
        <h1 className="text-lg font-bold text-gray-200 mb-4">Execution Trace</h1>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center max-w-lg mx-auto mt-12">
          <div className="text-3xl text-gray-700 mb-4">{ /* magnifying glass */ }</div>
          <h2 className="text-sm font-medium text-gray-400 mb-2">Turn-Level Trace Viewer</h2>
          <p className="text-xs text-gray-600 leading-relaxed">
            This view will display turn-by-turn tool call sequences for worker executions.
            The trace data source (per-worker JSONL trace files) is not yet implemented.
          </p>
          <div className="mt-4 inline-flex px-3 py-1.5 rounded-full bg-gray-800 border border-gray-700 text-xs text-gray-500">
            Coming in a future update
          </div>
        </div>
      </div>
    </div>
  );
}
