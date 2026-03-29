'use client';

import { useDashboard } from '@/lib/use-dashboard';
import AgentStatusBar from '@/components/AgentStatusBar';
import NeedsYouCard from '@/components/NeedsYouCard';

export default function NeedsYouPage() {
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
        <h1 className="text-lg font-bold text-gray-200 mb-4">Needs Your Attention</h1>

        {data.needs_you.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center">
            <p className="text-gray-500 text-sm">No items need your attention.</p>
            <p className="text-gray-600 text-xs mt-1">The agent is operating autonomously.</p>
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl">
            {data.needs_you.map((item) => (
              <NeedsYouCard key={item.id} item={item} />
            ))}
          </div>
        )}

        <div className="mt-8 bg-gray-900/50 border border-gray-800 rounded-lg p-4 max-w-2xl">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">How to respond</h2>
          <ul className="text-xs text-gray-500 space-y-1">
            <li><code className="text-gray-400">[APPROVED]</code> - Approve with optional details</li>
            <li><code className="text-gray-400">[DECISION]</code> - Provide a choice/direction</li>
            <li><code className="text-gray-400">[INFO]</code> - Supply requested information</li>
            <li><code className="text-gray-400">[SKIP]</code> - Cancel this goal entirely</li>
          </ul>
          <p className="text-xs text-gray-600 mt-2">
            Edit <code className="text-gray-500">workspace/needs-you.md</code> to respond. The agent detects changes within ~30s.
          </p>
        </div>
      </div>
    </div>
  );
}
