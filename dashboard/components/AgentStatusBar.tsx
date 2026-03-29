'use client';

import type { AgentStatus } from '@/lib/types';

function StatusPill({ status }: { status: 'running' | 'idle' | 'error' }) {
  const colors = {
    running: 'bg-green-500/20 text-green-400 border-green-500/30',
    idle: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    error: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${colors[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${
        status === 'running' ? 'bg-green-400 animate-pulse' :
        status === 'idle' ? 'bg-yellow-400' : 'bg-red-400'
      }`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

interface Props {
  agentStatus: AgentStatus;
  generatedAt: string;
}

export default function AgentStatusBar({ agentStatus, generatedAt }: Props) {
  const status = agentStatus.loop_running
    ? agentStatus.active_worker ? 'running' : 'idle'
    : 'error';

  const lastUpdate = generatedAt
    ? new Date(generatedAt).toLocaleTimeString()
    : 'Never';

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
      <div className="flex items-center gap-4">
        <StatusPill status={status} />
        {agentStatus.active_worker && (
          <span className="text-xs text-gray-400">
            Working on: <span className="text-gray-200 font-medium">{agentStatus.active_worker.goal_slug}</span>
            {agentStatus.active_worker.turn_count != null && agentStatus.active_worker.max_turns != null && (
              <span className="ml-2 text-gray-500">
                ({agentStatus.active_worker.turn_count}/{agentStatus.active_worker.max_turns} turns)
              </span>
            )}
          </span>
        )}
        <span className="text-xs text-gray-500">Phase {agentStatus.current_phase}</span>
      </div>
      <span className="text-xs text-gray-600">Updated: {lastUpdate}</span>
    </div>
  );
}
