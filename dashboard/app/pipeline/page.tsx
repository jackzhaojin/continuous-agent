'use client';

import { useDashboard } from '@/lib/use-dashboard';
import AgentStatusBar from '@/components/AgentStatusBar';
import GoalCard from '@/components/GoalCard';

function PipelineColumn({
  title,
  count,
  children,
  accent = 'border-gray-700',
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className={`bg-gray-900 border rounded-lg ${accent}`}>
      <div className="flex items-center justify-between p-3 border-b border-gray-800">
        <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">{title}</h3>
        <span className="text-xs text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">{count}</span>
      </div>
      <div className="p-2 space-y-2 max-h-[calc(100vh-12rem)] overflow-auto">
        {children}
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const { data, loading } = useDashboard();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    );
  }

  const { drafts, ondeck, in_progress, blocked } = data.goal_pipeline;

  return (
    <div className="flex flex-col h-screen">
      <AgentStatusBar agentStatus={data.agent_status} generatedAt={data.generated_at} />

      <div className="flex-1 overflow-auto p-6">
        <h1 className="text-lg font-bold text-gray-200 mb-4">Goal Pipeline</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <PipelineColumn title="Drafts" count={drafts.length}>
            {drafts.length === 0 ? (
              <p className="p-2 text-xs text-gray-600">No drafts</p>
            ) : (
              drafts.map((g) => <GoalCard key={g.slug} goal={g} showPriority={false} />)
            )}
          </PipelineColumn>

          <PipelineColumn title="On Deck" count={ondeck.length}>
            {ondeck.length === 0 ? (
              <p className="p-2 text-xs text-gray-600">No queued goals</p>
            ) : (
              ondeck.map((g) => <GoalCard key={g.slug} goal={g} />)
            )}
          </PipelineColumn>

          <PipelineColumn title="In Progress" count={in_progress.length} accent="border-green-500/30">
            {in_progress.length === 0 ? (
              <p className="p-2 text-xs text-gray-600">No active goals</p>
            ) : (
              in_progress.map((g) => <GoalCard key={g.slug} goal={g} />)
            )}
          </PipelineColumn>

          <PipelineColumn title="Blocked" count={blocked.length} accent="border-red-500/30">
            {blocked.length === 0 ? (
              <p className="p-2 text-xs text-gray-600">None blocked</p>
            ) : (
              blocked.map((g) => <GoalCard key={g.slug} goal={g} />)
            )}
          </PipelineColumn>
        </div>
      </div>
    </div>
  );
}
