'use client';

import type { NeedsYouItem } from '@/lib/types';

function timeWaiting(added: string): string {
  if (!added) return '';
  const diff = Date.now() - new Date(added).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return '<1h';
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

interface Props {
  item: NeedsYouItem;
}

export default function NeedsYouCard({ item }: Props) {
  const isHigh = item.priority === 'high';

  return (
    <div className={`bg-gray-800/50 border rounded-lg p-4 transition-colors ${
      isHigh
        ? 'border-red-500/30 hover:border-red-500/50'
        : 'border-gray-700/50 hover:border-gray-600/50'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-gray-200">{item.title}</h3>
        <span className={`shrink-0 inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold border ${
          isHigh
            ? 'bg-red-500/20 text-red-400 border-red-500/30'
            : 'bg-gray-500/20 text-gray-400 border-gray-500/30'
        }`}>
          {item.priority}
        </span>
      </div>
      <div className="flex items-center gap-3 mt-2 text-xs">
        {item.goal_slug && (
          <span className="text-gray-500">Goal: {item.goal_slug}</span>
        )}
        <span className="text-gray-600">Waiting: {timeWaiting(item.added)}</span>
      </div>
    </div>
  );
}
