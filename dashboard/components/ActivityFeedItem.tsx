'use client';

import type { ActivityEntry } from '@/lib/types';

const eventColors: Record<string, string> = {
  goal_completed: 'bg-green-500/20 text-green-400',
  goal_started: 'bg-blue-500/20 text-blue-400',
  goal_blocked: 'bg-red-500/20 text-red-400',
  goal_failed: 'bg-red-500/20 text-red-400',
  step_completed: 'bg-emerald-500/20 text-emerald-400',
  step_started: 'bg-cyan-500/20 text-cyan-400',
  goal_promoted: 'bg-purple-500/20 text-purple-400',
  worker_started: 'bg-blue-500/20 text-blue-400',
};

function formatEventLabel(event: string): string {
  return event.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function timeAgo(timestamp: string): string {
  if (!timestamp) return '';
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface Props {
  entry: ActivityEntry;
}

export default function ActivityFeedItem({ entry }: Props) {
  const color = eventColors[entry.event] || 'bg-gray-500/20 text-gray-400';

  return (
    <div className="flex items-center gap-3 py-2 px-3 hover:bg-gray-800/30 rounded transition-colors">
      <span className={`shrink-0 inline-flex px-2 py-0.5 rounded text-[10px] font-medium ${color}`}>
        {formatEventLabel(entry.event)}
      </span>
      <span className="text-sm text-gray-300 truncate flex-1">
        {entry.goal || 'Unknown'}
      </span>
      {entry.duration_minutes != null && (
        <span className="text-xs text-gray-500 shrink-0">{entry.duration_minutes}m</span>
      )}
      {entry.pattern && (
        <span className="text-[10px] text-gray-600 shrink-0">{entry.pattern}</span>
      )}
      <span className="text-xs text-gray-600 shrink-0 w-16 text-right">
        {timeAgo(entry.timestamp)}
      </span>
    </div>
  );
}
