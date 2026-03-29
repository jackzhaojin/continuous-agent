'use client';

import { useDashboard } from '@/lib/use-dashboard';
import AgentStatusBar from '@/components/AgentStatusBar';

function StatusRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-800 last:border-0">
      <span className="text-sm text-gray-400">{label}</span>
      <div className="flex items-center gap-2">
        {ok !== undefined && (
          <span className={`w-2 h-2 rounded-full ${ok ? 'bg-green-500' : 'bg-gray-600'}`} />
        )}
        <span className="text-sm text-gray-200">{value || '--'}</span>
      </div>
    </div>
  );
}

export default function IdentityPage() {
  const { data, loading } = useDashboard();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    );
  }

  const { last_inbox_check, last_slack_sent } = data.agent_status;

  const formatTime = (ts?: string) => {
    if (!ts) return '--';
    return new Date(ts).toLocaleString();
  };

  return (
    <div className="flex flex-col h-screen">
      <AgentStatusBar agentStatus={data.agent_status} generatedAt={data.generated_at} />

      <div className="flex-1 overflow-auto p-6">
        <h1 className="text-lg font-bold text-gray-200 mb-4">Identity Status</h1>

        <div className="max-w-lg space-y-4">
          {/* Email / Inbox */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Email (Gmail)</h2>
            <StatusRow
              label="Last inbox check"
              value={formatTime(last_inbox_check)}
              ok={!!last_inbox_check}
            />
          </div>

          {/* Slack */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Slack</h2>
            <StatusRow
              label="Last message sent"
              value={formatTime(last_slack_sent)}
              ok={!!last_slack_sent}
            />
          </div>

          {/* Loop Status */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Agent Loop</h2>
            <StatusRow
              label="Loop running"
              value={data.agent_status.loop_running ? 'Yes' : 'No'}
              ok={data.agent_status.loop_running}
            />
            <StatusRow
              label="Current phase"
              value={`Phase ${data.agent_status.current_phase}`}
            />
            <StatusRow
              label="Dashboard updated"
              value={formatTime(data.generated_at)}
              ok={!!data.generated_at}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
