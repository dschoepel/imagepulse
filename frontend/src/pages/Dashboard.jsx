import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
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

function EventModal({ ev, onClose }) {
  if (!ev) return null;
  return (
    <div
      className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full z-50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <h3 className="font-semibold text-gray-900 font-mono text-sm">{ev.image}:{ev.tag}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4"
          >
            ×
          </button>
        </div>
        <div className="flex items-center gap-3 mb-3">
          <StatusBadge status={ev.status} />
          {ev.notified_at && (
            <span className="text-xs text-gray-500">
              Notified {new Date(ev.notified_at + 'Z').toLocaleString()}
            </span>
          )}
        </div>
        {ev.notification_title ? (
          <>
            <p className="font-medium text-gray-800 text-sm mb-2">{ev.notification_title}</p>
            <pre className="text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 rounded border border-gray-200 p-3 overflow-x-auto">
              {ev.notification_body}
            </pre>
          </>
        ) : (
          <p className="text-gray-400 italic text-sm">No notification recorded</p>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [events, setEvents] = useState([]);
  const [chartData, setChartData] = useState(null);
  const [error, setError] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);

  useEffect(() => {
    Promise.all([
      apiFetch('/events/stats'),
      apiFetch('/events?limit=10'),
      apiFetch('/events/chart-data'),
    ])
      .then(([s, e, c]) => {
        setStats(s);
        setEvents(e.events);
        setChartData(c);
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="text-red-600">Error: {error}</p>;

  const lastUpdated = stats?.lastUpdated
    ? new Date(stats.lastUpdated + 'Z').toLocaleString()
    : null;

  const topImagesData = (chartData?.topImages ?? []).map((d) => ({
    ...d,
    label: d.image.length > 30 ? '…' + d.image.slice(-30) : d.image,
  }));

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Events" value={stats?.total} />
        <StatCard label="Images Tracked" value={stats?.uniqueImages} />
        <StatCard label="Last Updated" value={lastUpdated} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Events (last 14 days)</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData?.eventsPerDay ?? []} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
              <Tooltip />
              <Bar dataKey="count" fill="#6366f1" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg shadow p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Top images</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              layout="vertical"
              data={topImagesData}
              margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
            >
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={160} />
              <Tooltip formatter={(v) => [v, 'events']} />
              <Bar dataKey="count" fill="#6366f1" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
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
                  <tr
                    key={ev.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedEvent(ev)}
                  >
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

      <EventModal ev={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  );
}
