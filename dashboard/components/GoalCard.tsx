'use client';

import type { GoalSummary } from '@/lib/types';

const priorityColors: Record<string, string> = {
  P0: 'bg-red-500/20 text-red-400 border-red-500/30',
  P1: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  P2: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  P3: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  P4: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const statusColors: Record<string, string> = {
  in_progress: 'text-green-400',
  pending: 'text-gray-400',
  blocked: 'text-red-400',
  complete: 'text-blue-400',
};

interface Props {
  goal: GoalSummary;
  showPriority?: boolean;
}

export default function GoalCard({ goal, showPriority = true }: Props) {
  const priority = goal.priority || 'P3';
  const pColor = priorityColors[priority] || priorityColors.P3;
  const sColor = statusColors[goal.status || 'pending'] || 'text-gray-400';

  return (
    <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3 hover:border-gray-600/50 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-gray-200 leading-tight">{goal.title}</h3>
        {showPriority && (
          <span className={`shrink-0 inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold border ${pColor}`}>
            {priority}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 mt-2 text-xs">
        <span className={sColor}>
          {goal.status || 'pending'}
        </span>
        {goal.step && (
          <span className="text-gray-500">Step {goal.step}</span>
        )}
        {goal.execution_pattern && (
          <span className="text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">
            {goal.execution_pattern}
          </span>
        )}
      </div>
      {goal.blocked_reason && (
        <p className="mt-2 text-xs text-red-400/80 leading-snug">{goal.blocked_reason}</p>
      )}
      {goal.created && (
        <p className="mt-1 text-[10px] text-gray-600">{goal.created}</p>
      )}
    </div>
  );
}
