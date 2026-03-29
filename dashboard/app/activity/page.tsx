'use client';

import { useState, useMemo } from 'react';
import { useDashboard } from '@/lib/use-dashboard';
import AgentStatusBar from '@/components/AgentStatusBar';
import ActivityFeedItem from '@/components/ActivityFeedItem';

const EVENT_TYPES = [
  'all',
  'goal_started',
  'goal_completed',
  'goal_blocked',
  'goal_failed',
  'step_started',
  'step_completed',
  'goal_promoted',
  'worker_started',
] as const;

export default function ActivityPage() {
  const { data, loading } = useDashboard();
  const [filter, setFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return data.activity_feed;
    return data.activity_feed.filter((e) => e.event === filter);
  }, [data.activity_feed, filter]);

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
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold text-gray-200">Activity Feed</h1>
          <span className="text-xs text-gray-500">{filtered.length} events</span>
        </div>

        {/* Filter bar */}
        <div className="flex gap-1 mb-4 flex-wrap">
          {EVENT_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${
                filter === type
                  ? 'bg-gray-700 text-gray-200'
                  : 'bg-gray-800/50 text-gray-500 hover:text-gray-400 hover:bg-gray-800'
              }`}
            >
              {type === 'all' ? 'All' : type.replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800/50">
          {filtered.length > 0 ? (
            filtered.map((entry, i) => (
              <ActivityFeedItem key={`${entry.timestamp}-${i}`} entry={entry} />
            ))
          ) : (
            <p className="p-4 text-sm text-gray-600">No events match the selected filter.</p>
          )}
        </div>
      </div>
    </div>
  );
}
