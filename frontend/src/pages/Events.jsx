import { useEffect, useState } from 'react';
import { apiFetch, validateRepo } from '../api.js';

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

function RawPayload({ raw }) {
  const [open, setOpen] = useState(false);
  let formatted = raw;
  try { formatted = JSON.stringify(JSON.parse(raw), null, 2); } catch {}
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-indigo-600 hover:underline"
      >
        {open ? '▼ Hide raw payload' : '▶ Show raw payload'}
      </button>
      {open && (
        <pre className="mt-2 text-xs bg-gray-900 text-green-300 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">
          {formatted}
        </pre>
      )}
    </div>
  );
}

function AddMappingInline({ image, onAdded }) {
  const [repo, setRepo] = useState('');
  const [status, setStatus] = useState(null);
  const [repoError, setRepoError] = useState(null);
  const [repoChecking, setRepoChecking] = useState(false);

  async function checkRepoInline(value) {
    const v = value.trim();
    if (!v) { setRepoError({ message: 'Required', isWarning: false }); return false; }
    if (!/^[a-zA-Z0-9_.\-]+\/[a-zA-Z0-9_.\-]+$/.test(v)) {
      setRepoError({ message: 'Must be owner/repo format', isWarning: false });
      return false;
    }
    setRepoChecking(true);
    setRepoError(null);
    try {
      const d = await validateRepo(v);
      if (d.repoExists === true) { setRepoError(null); return true; }
      if (d.repoExists === false) {
        setRepoError({ message: d.repoError || 'Repository not found on GitHub', isWarning: false });
        return false;
      }
      setRepoError({ message: d.repoError || 'Could not verify repo', isWarning: true });
      return true;
    } catch {
      setRepoError({ message: 'Could not reach GitHub', isWarning: true });
      return true;
    } finally {
      setRepoChecking(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const ok = await checkRepoInline(repo);
    if (!ok) return;
    setStatus({ pending: true });
    try {
      await apiFetch('/settings/mappings', {
        method: 'PUT',
        body: JSON.stringify({ image, repo: repo.trim() }),
      });
      setStatus({ ok: true });
      onAdded(image, repo.trim());
    } catch (err) {
      setStatus({ ok: false, msg: err.message });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1 mt-0.5">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={repo}
          onChange={(e) => { setRepo(e.target.value); setRepoError(null); }}
          onBlur={() => { if (repo.trim()) checkRepoInline(repo); }}
          placeholder="owner/repo"
          className={`border rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 w-36 ${
            repoError
              ? repoError.isWarning ? 'border-amber-400' : 'border-red-400'
              : 'border-gray-300'
          }`}
        />
        <button
          type="submit"
          disabled={status?.pending || repoChecking || !repo.trim()}
          className="bg-indigo-600 text-white px-2 py-1 rounded text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {repoChecking ? 'Checking…' : status?.pending ? 'Saving…' : 'Add'}
        </button>
      </div>
      {repoChecking ? null : repoError && (
        <p className={`text-xs ${repoError.isWarning ? 'text-amber-600' : 'text-red-600'}`}>
          {repoError.message}
        </p>
      )}
      {status?.ok === false && (
        <p className="text-xs text-red-600">{status.msg}</p>
      )}
    </form>
  );
}

function EventDetail({ ev, mappedRepo, onMappingAdded }) {
  const [resendStatus, setResendStatus] = useState(null);

  let platform = '—';
  try {
    const p = JSON.parse(ev.raw_payload);
    if (p?.platform) platform = p.platform;
  } catch {}

  async function handleResend() {
    setResendStatus({ pending: true });
    try {
      await apiFetch(`/events/${ev.id}/resend`, { method: 'POST' });
      setResendStatus({ ok: true, msg: 'Notification resent' });
    } catch (e) {
      setResendStatus({ ok: false, msg: e.message });
    }
  }

  return (
    <div className="bg-indigo-50 px-4 py-4 sm:px-6 text-sm">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left — Notification sent */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notification sent</p>
          {ev.notification_title ? (
            <>
              <p className="font-medium text-gray-800 mb-1">{ev.notification_title}</p>
              <pre className="text-xs text-gray-600 whitespace-pre-wrap bg-white rounded border border-gray-200 p-3">
                {ev.notification_body}
              </pre>
            </>
          ) : (
            <p className="text-gray-400 italic">No notification recorded</p>
          )}
        </div>

        {/* Right — Metadata */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Metadata</p>
          <dl className="space-y-1.5 text-xs">
            <div className="flex gap-2">
              <dt className="text-gray-500 w-24 shrink-0">Full digest</dt>
              <dd className="font-mono text-gray-700 break-all">{ev.digest || '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-gray-500 w-24 shrink-0">Platform</dt>
              <dd className="text-gray-700">{platform}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-gray-500 w-24 shrink-0">Notified at</dt>
              <dd className="text-gray-700">
                {ev.notified_at ? new Date(ev.notified_at + 'Z').toLocaleString() : '—'}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-gray-500 w-24 shrink-0">Mapping</dt>
              <dd>
                {mappedRepo != null ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                    <span className="text-gray-700 font-mono">{mappedRepo}</span>
                  </span>
                ) : (
                  <AddMappingInline image={ev.image} onAdded={onMappingAdded} />
                )}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-gray-500 w-24 shrink-0">Release</dt>
              <dd>
                {ev.github_release_url
                  ? <a href={ev.github_release_url} target="_blank" rel="noreferrer"
                       className="text-indigo-600 hover:underline text-xs">View on GitHub ↗</a>
                  : <span className="text-gray-400">—</span>}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {ev.notification_title && (
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleResend}
            disabled={resendStatus?.pending}
            className="bg-indigo-600 text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {resendStatus?.pending ? 'Resending…' : 'Resend Notification'}
          </button>
          {resendStatus && !resendStatus.pending && (
            <span className={`text-xs font-medium ${resendStatus.ok ? 'text-green-600' : 'text-red-600'}`}>
              {resendStatus.msg}
            </span>
          )}
        </div>
      )}

      {ev.raw_payload && <RawPayload raw={ev.raw_payload} />}
    </div>
  );
}

function SortHeader({ label, col, sortBy, sortDir, onSort, className }) {
  const active = sortBy === col;
  return (
    <th className={`cursor-pointer select-none ${className}`} onClick={() => onSort(col)}>
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={active ? 'text-indigo-500' : 'text-gray-300'}>
          {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </span>
    </th>
  );
}

export default function Events() {
  const [events, setEvents] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [image, setImage] = useState('');
  const [status, setStatus] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [mappings, setMappings] = useState({}); // { image: repo }

  useEffect(() => {
    apiFetch('/settings/mappings')
      .then((d) => {
        const m = {};
        d.mappings.forEach(({ image, repo }) => { m[image] = repo; });
        setMappings(m);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: 25, sortBy, sortDir });
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
  }, [page, image, status, sortBy, sortDir]);

  function handleFilterChange() {
    setPage(1);
    setExpandedId(null);
  }

  function handleSort(col) {
    if (sortBy === col) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
    setPage(1);
    setExpandedId(null);
  }

  function toggleRow(id) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function handleMappingAdded(img, repo) {
    setMappings((prev) => ({ ...prev, [img]: repo }));
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
          className="border border-gray-300 rounded-md px-3 py-2 text-sm w-full sm:w-56 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
              <th className="w-8 px-2 py-3" />
              <SortHeader label="Image"  col="image"      sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="px-2 sm:px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider text-xs" />
              <SortHeader label="Tag"    col="tag"        sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="hidden sm:table-cell px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider text-xs" />
              <SortHeader label="Status" col="status"     sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="px-2 sm:px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider text-xs" />
              <SortHeader label="Source" col="source"     sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="hidden sm:table-cell px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider text-xs" />
              <th className="hidden sm:table-cell px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider text-xs">Digest</th>
              <SortHeader label="Time"   col="created_at" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="px-2 sm:px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider text-xs" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-400">Loading…</td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-400">No events found</td>
              </tr>
            ) : (
              events.map((ev) => (
                <>
                  <tr
                    key={ev.id}
                    onClick={() => toggleRow(ev.id)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="w-8 px-2 py-3 text-center text-gray-400 text-xs select-none">
                      {expandedId === ev.id ? '▼' : '▶'}
                    </td>
                    <td className="px-2 sm:px-4 py-3 max-w-[80px] sm:max-w-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono text-xs text-gray-700 truncate">{ev.image}</span>
                        {ev.image in mappings && (
                          <span className="shrink-0 w-2 h-2 rounded-full bg-green-500" title="GitHub repo mapped" />
                        )}
                      </div>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 font-mono text-xs text-gray-700">{ev.tag}</td>
                    <td className="px-2 sm:px-4 py-3"><StatusBadge status={ev.status} /></td>
                    <td className="hidden sm:table-cell px-4 py-3 text-gray-500">{ev.source}</td>
                    <td className="hidden sm:table-cell px-4 py-3 font-mono text-xs text-gray-400">{(ev.digest || '').slice(0, 12)}</td>
                    <td className="px-2 sm:px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(ev.created_at + 'Z').toLocaleString()}
                    </td>
                  </tr>
                  {expandedId === ev.id && (
                    <tr key={`${ev.id}-detail`}>
                      <td colSpan={7} className="p-0">
                        <EventDetail
                          ev={ev}
                          mappedRepo={mappings[ev.image] ?? null}
                          onMappingAdded={handleMappingAdded}
                        />
                      </td>
                    </tr>
                  )}
                </>
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
