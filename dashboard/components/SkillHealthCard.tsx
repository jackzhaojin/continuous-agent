'use client';

import type { SkillHealth } from '@/lib/types';

function confidenceColor(confidence: number): string {
  if (confidence >= 80) return 'bg-green-500';
  if (confidence >= 50) return 'bg-yellow-500';
  return 'bg-red-500';
}

function confidenceTextColor(confidence: number): string {
  if (confidence >= 80) return 'text-green-400';
  if (confidence >= 50) return 'text-yellow-400';
  return 'text-red-400';
}

function maturityBadge(maturity: string): { bg: string; text: string } {
  switch (maturity.toLowerCase()) {
    case 'reliable':
      return { bg: 'bg-green-500/20 border-green-500/30', text: 'text-green-400' };
    case 'demonstrated':
      return { bg: 'bg-yellow-500/20 border-yellow-500/30', text: 'text-yellow-400' };
    case 'declared':
    default:
      return { bg: 'bg-red-500/20 border-red-500/30', text: 'text-red-400' };
  }
}

interface Props {
  skill: SkillHealth;
}

export default function SkillHealthCard({ skill }: Props) {
  const badge = maturityBadge(skill.maturity);

  return (
    <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4 hover:border-gray-600/50 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-gray-200">{skill.name}</h3>
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">{skill.category}</span>
        </div>
        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium border ${badge.bg} ${badge.text}`}>
          {skill.maturity}
        </span>
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500">Confidence</span>
          <span className={`text-xs font-mono ${confidenceTextColor(skill.confidence)}`}>{skill.confidence}%</span>
        </div>
        <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${confidenceColor(skill.confidence)}`}
            style={{ width: `${Math.min(100, skill.confidence)}%` }}
          />
        </div>
      </div>
      <div className="mt-2 text-xs text-gray-500">
        {skill.executions} execution{skill.executions !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
