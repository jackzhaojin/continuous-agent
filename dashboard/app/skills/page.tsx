'use client';

import { useState, useMemo } from 'react';
import { useDashboard } from '@/lib/use-dashboard';
import AgentStatusBar from '@/components/AgentStatusBar';
import SkillHealthCard from '@/components/SkillHealthCard';

type SortKey = 'name' | 'confidence' | 'maturity' | 'executions';

export default function SkillsPage() {
  const { data, loading } = useDashboard();
  const [sortBy, setSortBy] = useState<SortKey>('confidence');
  const [filterCategory, setFilterCategory] = useState<'all' | 'skill' | 'playbook'>('all');

  const sorted = useMemo(() => {
    let items = data.skill_health;
    if (filterCategory !== 'all') {
      items = items.filter((s) => s.category === filterCategory);
    }
    return [...items].sort((a, b) => {
      switch (sortBy) {
        case 'name': return a.name.localeCompare(b.name);
        case 'confidence': return b.confidence - a.confidence;
        case 'maturity': return a.maturity.localeCompare(b.maturity);
        case 'executions': return b.executions - a.executions;
        default: return 0;
      }
    });
  }, [data.skill_health, sortBy, filterCategory]);

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
        <h1 className="text-lg font-bold text-gray-200 mb-4">Skills & Playbooks</h1>

        {/* Controls */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex gap-1">
            {(['all', 'skill', 'playbook'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                  filterCategory === cat
                    ? 'bg-gray-700 text-gray-200'
                    : 'bg-gray-800/50 text-gray-500 hover:text-gray-400'
                }`}
              >
                {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1) + 's'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <span>Sort:</span>
            {(['confidence', 'name', 'maturity', 'executions'] as SortKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={`px-2 py-0.5 rounded transition-colors ${
                  sortBy === key ? 'text-gray-300 bg-gray-800' : 'text-gray-600 hover:text-gray-400'
                }`}
              >
                {key}
              </button>
            ))}
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center">
            <p className="text-gray-500 text-sm">No skills or playbooks registered yet.</p>
            <p className="text-gray-600 text-xs mt-1">
              Skills and playbooks appear here as the agent learns and improves.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {sorted.map((skill) => (
              <SkillHealthCard key={`${skill.category}-${skill.name}`} skill={skill} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
