import { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';

export default function Mappings() {
  const [mappings, setMappings] = useState([]);
  const [newImage, setNewImage] = useState('');
  const [newRepo, setNewRepo] = useState('');
  const [addError, setAddError] = useState(null);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editImage, setEditImage] = useState('');
  const [editRepo, setEditRepo] = useState('');

  function load() {
    apiFetch('/settings/mappings')
      .then((d) => setMappings(d.mappings))
      .catch((err) => setError(err.message));
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e) {
    e.preventDefault();
    setAddError(null);
    if (!newImage.trim() || !newRepo.trim()) {
      setAddError('Both fields are required');
      return;
    }
    try {
      await apiFetch('/settings/mappings', {
        method: 'PUT',
        body: JSON.stringify({ image: newImage.trim(), repo: newRepo.trim() }),
      });
      setNewImage('');
      setNewRepo('');
      load();
    } catch (err) {
      setAddError(err.message);
    }
  }

  async function handleDelete(image) {
    try {
      await apiFetch(`/settings/mappings/${encodeURIComponent(image)}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(m) {
    setEditingId(m.id);
    setEditImage(m.image);
    setEditRepo(m.repo);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditImage('');
    setEditRepo('');
  }

  async function handleSave(oldImage) {
    try {
      await apiFetch(`/settings/mappings/${encodeURIComponent(oldImage)}`, {
        method: 'PATCH',
        body: JSON.stringify({ newImage: editImage.trim(), repo: editRepo.trim() }),
      });
      cancelEdit();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">Image → Repo Mappings</h1>

      {/* Add form */}
      <form onSubmit={handleAdd} className="bg-white rounded-lg shadow p-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <label className="text-xs font-medium text-gray-600">Docker image</label>
          <input
            type="text"
            placeholder="e.g. docker.io/library/nginx"
            value={newImage}
            onChange={(e) => setNewImage(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
          <label className="text-xs font-medium text-gray-600">GitHub repo (owner/repo)</label>
          <input
            type="text"
            placeholder="e.g. nginx/nginx"
            value={newRepo}
            onChange={(e) => setNewRepo(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button
          type="submit"
          className="bg-indigo-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-indigo-700"
        >
          Add
        </button>
        {addError && <p className="w-full text-red-600 text-xs">{addError}</p>}
      </form>

      {error && <p className="text-red-600 text-sm">Error: {error}</p>}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['Image', 'GitHub Repo', ''].map((h, i) => (
                <th key={i} className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider text-xs">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {mappings.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                  No mappings yet
                </td>
              </tr>
            ) : (
              mappings.map((m) =>
                editingId === m.id ? (
                  <tr key={m.id} className="bg-indigo-50">
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={editImage}
                        onChange={(e) => setEditImage(e.target.value)}
                        className="border border-indigo-300 rounded px-2 py-1 text-xs font-mono w-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={editRepo}
                        onChange={(e) => setEditRepo(e.target.value)}
                        className="border border-indigo-300 rounded px-2 py-1 text-xs w-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => handleSave(m.image)}
                        className="text-indigo-600 hover:text-indigo-800 text-xs font-medium mr-3"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="text-gray-500 hover:text-gray-700 text-xs font-medium"
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{m.image}</td>
                    <td className="px-4 py-3 text-gray-700">{m.repo}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => startEdit(m)}
                        disabled={editingId !== null}
                        className="text-indigo-500 hover:text-indigo-700 text-xs font-medium mr-3 disabled:opacity-40"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(m.image)}
                        disabled={editingId !== null}
                        className="text-red-500 hover:text-red-700 text-xs font-medium disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
