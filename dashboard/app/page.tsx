'use client';

import { useDashboard } from '@/lib/use-dashboard';
import AgentStatusBar from '@/components/AgentStatusBar';
import GoalCard from '@/components/GoalCard';
import ActivityFeedItem from '@/components/ActivityFeedItem';
import NeedsYouCard from '@/components/NeedsYouCard';

export default function OverviewPage() {
  const { data, loading } = useDashboard();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-500 text-sm">Loading dashboard...</p>
      </div>
    );
  }

  const recentActivity = data.activity_feed.slice(0, 10);
  const topNeedsYou = data.needs_you.slice(0, 3);

  return (
    <div className="flex flex-col h-screen">
      <AgentStatusBar agentStatus={data.agent_status} generatedAt={data.generated_at} />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Active Worker Card */}
        {data.agent_status.active_worker && (
          <section className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Active Worker</h2>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-200">{data.agent_status.active_worker.goal_slug}</p>
                {data.agent_status.active_worker.execution_pattern && (
                  <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded mt-1 inline-block">
                    {data.agent_status.active_worker.execution_pattern}
                  </span>
                )}
              </div>
              {data.agent_status.active_worker.turn_count != null && data.agent_status.active_worker.max_turns != null && (
                <div className="w-48">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Turns</span>
                    <span>{data.agent_status.active_worker.turn_count} / {data.agent_status.active_worker.max_turns}</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (data.agent_status.active_worker.turn_count / data.agent_status.active_worker.max_turns) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* 3-Stat Summary */}
        <section className="grid grid-cols-3 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Completed (7d)</p>
            <p className="text-2xl font-bold text-gray-100 mt-1">{data.stats.goals_completed_7d}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Blocked</p>
            <p className="text-2xl font-bold text-red-400 mt-1">{data.stats.goals_blocked}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Avg Completion</p>
            <p className="text-2xl font-bold text-gray-100 mt-1">
              {data.stats.avg_completion_minutes > 0 ? `${data.stats.avg_completion_minutes}m` : '--'}
            </p>
          </div>
        </section>

        {/* Needs You Preview */}
        {topNeedsYou.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Needs Your Attention</h2>
              <a href="/needs-you" className="text-xs text-blue-400 hover:text-blue-300">View all</a>
            </div>
            <div className="space-y-2">
              {topNeedsYou.map((item) => (
                <NeedsYouCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        )}

        {/* In-Progress Goals */}
        {data.goal_pipeline.in_progress.length > 0 && (
          <section>
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">In Progress</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {data.goal_pipeline.in_progress.slice(0, 4).map((goal) => (
                <GoalCard key={goal.slug} goal={goal} />
              ))}
            </div>
          </section>
        )}

        {/* Activity Feed */}
        <section>
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Recent Activity</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800/50">
            {recentActivity.length > 0 ? (
              recentActivity.map((entry, i) => (
                <ActivityFeedItem key={`${entry.timestamp}-${i}`} entry={entry} />
              ))
            ) : (
              <p className="p-4 text-sm text-gray-600">No recent activity</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
