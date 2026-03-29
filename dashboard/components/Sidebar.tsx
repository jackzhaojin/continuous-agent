'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Overview', icon: 'H' },
  { href: '/pipeline', label: 'Pipeline', icon: 'P' },
  { href: '/needs-you', label: 'Needs You', icon: 'N' },
  { href: '/activity', label: 'Activity', icon: 'A' },
  { href: '/skills', label: 'Skills', icon: 'S' },
  { href: '/identity', label: 'Identity', icon: 'I' },
  { href: '/trace', label: 'Trace', icon: 'T' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col min-h-screen">
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-lg font-bold text-white tracking-tight">Executive Agent</h1>
        <p className="text-xs text-gray-500 mt-0.5">Dashboard v2.0</p>
      </div>
      <nav className="flex-1 p-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors mb-0.5 ${
                isActive
                  ? 'bg-gray-800 text-white font-medium'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
              }`}
            >
              <span className={`w-6 h-6 flex items-center justify-center rounded text-xs font-mono ${
                isActive ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-500'
              }`}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-gray-800 text-xs text-gray-600">
        Auto-refresh: 30s
      </div>
    </aside>
  );
}
