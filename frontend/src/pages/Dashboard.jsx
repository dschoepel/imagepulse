import { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';

function StatusBadge({ status }) {
  const colours = {
    new: 'bg-green-100 text-green-800',
    update: 'bg-blue-100 text-blue-800',
    unknown: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colours[status] ?? colours.unknown}`}>
      {status}
    </span>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900">{value ?? '—'}</p>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      apiFetch('/events/stats'),
      apiFetch('/events?limit=10'),
    ])
      .then(([s, e]) => {
        setStats(s);
        setEvents(e.events);
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="text-red-600">Error: {error}</p>;

  const lastUpdated = stats?.lastUpdated
    ? new Date(stats.lastUpdated + 'Z').toLocaleString()
    : null;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Events" value={stats?.total} />
        <StatCard label="Images Tracked" value={stats?.uniqueImages} />
        <StatCard label="Last Updated" value={lastUpdated} />
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Recent Events</h2>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Image', 'Tag', 'Status', 'Source', 'Time'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider text-xs">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                    No events yet
                  </td>
                </tr>
              ) : (
                events.map((ev) => (
                  <tr key={ev.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700 max-w-xs truncate">{ev.image}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{ev.tag}</td>
                    <td className="px-4 py-3"><StatusBadge status={ev.status} /></td>
                    <td className="px-4 py-3 text-gray-500">{ev.source}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(ev.created_at + 'Z').toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
