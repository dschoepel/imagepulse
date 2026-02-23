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

export default function Events() {
  const [events, setEvents] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [image, setImage] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: 25 });
    if (image) params.set('image', image);
    if (status) params.set('status', status);

    apiFetch(`/events?${params}`)
      .then((data) => {
        setEvents(data.events);
        setPagination(data.pagination);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page, image, status]);

  function handleFilterChange() {
    setPage(1);
  }

  const pages = pagination.pages;

  function pageNumbers() {
    const nums = [];
    for (let i = 1; i <= pages; i++) {
      if (i === 1 || i === pages || Math.abs(i - page) <= 1) {
        nums.push(i);
      } else if (nums[nums.length - 1] !== '…') {
        nums.push('…');
      }
    }
    return nums;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Events</h1>

      {/* Filter bar */}
      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Filter by image…"
          value={image}
          onChange={(e) => { setImage(e.target.value); handleFilterChange(); }}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); handleFilterChange(); }}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All statuses</option>
          <option value="new">new</option>
          <option value="update">update</option>
        </select>
        <span className="text-sm text-gray-400 self-center">{pagination.total} total</span>
      </div>

      {error && <p className="text-red-600 text-sm">Error: {error}</p>}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['Image', 'Tag', 'Status', 'Source', 'Digest', 'Time'].map((h) => (
                <th key={h} className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider text-xs">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">Loading…</td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">No events found</td>
              </tr>
            ) : (
              events.map((ev) => (
                <tr key={ev.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700 max-w-xs truncate">{ev.image}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{ev.tag}</td>
                  <td className="px-4 py-3"><StatusBadge status={ev.status} /></td>
                  <td className="px-4 py-3 text-gray-500">{ev.source}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{(ev.digest || '').slice(0, 12)}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {new Date(ev.created_at + 'Z').toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center gap-1 justify-center">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
          >
            Prev
          </button>
          {pageNumbers().map((n, i) =>
            n === '…' ? (
              <span key={`ellipsis-${i}`} className="px-2 text-gray-400">…</span>
            ) : (
              <button
                key={n}
                onClick={() => setPage(n)}
                className={`px-3 py-1.5 text-sm rounded border ${
                  n === page
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'border-gray-300 hover:bg-gray-50'
                }`}
              >
                {n}
              </button>
            )
          )}
          <button
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page === pages}
            className="px-3 py-1.5 text-sm rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
