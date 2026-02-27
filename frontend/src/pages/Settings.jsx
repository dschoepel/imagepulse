import { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? 'bg-indigo-600' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function Field({ label, type = 'text', value, onChange, placeholder, secret = false }) {
  const [visible, setVisible] = useState(false);
  const inputType = secret ? (visible ? 'text' : 'password') : type;
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      <div className="flex items-center gap-2 w-full max-w-sm">
        <input
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full"
        />
        {secret && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="text-xs text-indigo-600 hover:underline whitespace-nowrap"
          >
            {visible ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-white rounded-lg shadow">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex justify-between items-center px-5 py-4 text-left"
      >
        <span className="font-semibold text-gray-800">{title}</span>
        <span className="text-gray-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-5 pb-5 space-y-4">{children}</div>}
    </div>
  );
}

function SnippetCard({ title, description, snippet }) {
  const [open, setOpen]     = useState(false);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <div className="border border-gray-200 rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex justify-between items-center px-4 py-2.5 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <span>{title}</span>
        <span className="text-gray-400 text-xs ml-2 shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-t border-gray-200 px-4 pb-4 pt-3 space-y-2">
          <p className="text-xs text-gray-500">{description}</p>
          <div className="relative">
            <pre className="text-xs bg-gray-900 text-green-300 rounded p-3 overflow-x-auto leading-relaxed">
              {snippet}
            </pre>
            <button
              type="button"
              onClick={handleCopy}
              className="absolute top-2 right-2 text-xs bg-gray-700 hover:bg-gray-500 text-gray-300 hover:text-white px-2 py-0.5 rounded transition-colors"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const [s, setS] = useState({});
  const [ntfyStatus, setNtfyStatus] = useState(null);
  const [emailStatus, setEmailStatus] = useState(null);
  const [retentionStatus, setRetentionStatus] = useState(null);

  useEffect(() => {
    apiFetch('/settings')
      .then((d) => setS(d.settings))
      .catch(() => {});
  }, []);

  function set(key, value) {
    setS((prev) => ({ ...prev, [key]: value }));
  }

  async function saveSection(keys, setStatus) {
    setStatus(null);
    const payload = Object.fromEntries(keys.map((k) => [k, s[k] ?? '']));
    try {
      await apiFetch('/settings', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setStatus({ ok: true, msg: 'Saved.' });
    } catch (err) {
      setStatus({ ok: false, msg: err.message });
    }
  }

  async function testNtfy() {
    setNtfyStatus(null);
    try {
      await apiFetch('/settings/test-ntfy', { method: 'POST' });
      setNtfyStatus({ ok: true, msg: 'Test notification sent.' });
    } catch (err) {
      setNtfyStatus({ ok: false, msg: err.message });
    }
  }

  async function testEmail() {
    setEmailStatus(null);
    try {
      await apiFetch('/settings/test-email', { method: 'POST' });
      setEmailStatus({ ok: true, msg: 'Test email sent.' });
    } catch (err) {
      setEmailStatus({ ok: false, msg: err.message });
    }
  }

  function StatusMsg({ status }) {
    if (!status) return null;
    return (
      <p className={`text-sm ${status.ok ? 'text-green-600' : 'text-red-600'}`}>{status.msg}</p>
    );
  }

  const [pruneModal, setPruneModal]       = useState(null); // { type: 'prune'|'archive', count, days }
  const [pruneStatus, setPruneStatus]     = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  async function openPruneModal(type) {
    setPreviewLoading(true);
    setPruneModal(null);
    setPruneStatus(null);
    try {
      const d = await apiFetch('/settings/prune-preview', { method: 'POST' });
      setPruneModal({ type, count: d.count, days: d.days });
    } catch (err) {
      setPruneStatus({ ok: false, msg: err.message });
    } finally {
      setPreviewLoading(false);
    }
  }

  async function confirmPrune() {
    if (!pruneModal) return;
    const { type } = pruneModal;
    const endpoint = type === 'archive' ? '/settings/archive-and-prune' : '/settings/prune-now';
    setPruneModal(null);
    setPruneStatus({ pending: true });
    try {
      const d = await apiFetch(endpoint, { method: 'POST' });
      if (type === 'archive') {
        setPruneStatus({ ok: true, msg: `Archived ${d.archived} and deleted ${d.deleted} event${d.deleted !== 1 ? 's' : ''}.` });
      } else {
        setPruneStatus({ ok: true, msg: `Deleted ${d.deleted} event${d.deleted !== 1 ? 's' : ''}.` });
      }
    } catch (err) {
      setPruneStatus({ ok: false, msg: err.message });
    }
  }

  const [webhookStatus, setWebhookStatus] = useState(null);
  const [showSecret, setShowSecret]       = useState(false);
  const [secretCopied, setSecretCopied]   = useState(false);

  function copySecret() {
    navigator.clipboard.writeText(s.webhook_secret ?? '').then(() => {
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2000);
    }).catch(() => {});
  }

  function generateSecret() {
    const array = new Uint8Array(24);
    crypto.getRandomValues(array);
    const secret = Array.from(array).map((b) => b.toString(16).padStart(2, '0')).join('');
    set('webhook_secret', secret);
    setWebhookStatus(null);
  }

  const ntfyKeys = ['ntfy_enabled', 'ntfy_url', 'ntfy_topic', 'ntfy_token'];
  const emailKeys = [
    'email_enabled', 'smtp_host', 'smtp_port', 'smtp_secure',
    'smtp_user', 'smtp_pass', 'email_from', 'email_to',
  ];
  const retentionKeys = ['retention_days'];
  const webhookKeys = ['webhook_secret'];

  return (
    <div className="space-y-4 max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {/* ntfy */}
      <Section title="ntfy Notifications">
        <div className="flex items-center gap-3">
          <Toggle
            checked={s.ntfy_enabled === 'true'}
            onChange={(v) => set('ntfy_enabled', v ? 'true' : 'false')}
          />
          <span className="text-sm text-gray-600">Enable ntfy</span>
        </div>
        <Field label="ntfy URL" value={s.ntfy_url ?? ''} onChange={(v) => set('ntfy_url', v)} placeholder="https://ntfy.sh" />
        <Field label="Topic" value={s.ntfy_topic ?? ''} onChange={(v) => set('ntfy_topic', v)} placeholder="my-topic" />
        <Field label="Token" secret value={s.ntfy_token ?? ''} onChange={(v) => set('ntfy_token', v)} placeholder="optional" />
        <div className="flex gap-3 items-center flex-wrap">
          <button
            onClick={() => saveSection(ntfyKeys, setNtfyStatus)}
            className="bg-indigo-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-indigo-700"
          >
            Save
          </button>
          <button
            onClick={testNtfy}
            className="border border-gray-300 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50"
          >
            Send test
          </button>
          <StatusMsg status={ntfyStatus} />
        </div>
      </Section>

      {/* Email */}
      <Section title="Email Notifications">
        <div className="flex items-center gap-3">
          <Toggle
            checked={s.email_enabled === 'true'}
            onChange={(v) => set('email_enabled', v ? 'true' : 'false')}
          />
          <span className="text-sm text-gray-600">Enable email</span>
        </div>
        <Field label="SMTP Host" value={s.smtp_host ?? ''} onChange={(v) => set('smtp_host', v)} placeholder="smtp.example.com" />
        <Field label="SMTP Port" value={s.smtp_port ?? ''} onChange={(v) => set('smtp_port', v)} placeholder="587" />
        <div className="flex items-center gap-3">
          <Toggle
            checked={s.smtp_secure === 'true'}
            onChange={(v) => set('smtp_secure', v ? 'true' : 'false')}
          />
          <span className="text-sm text-gray-600">TLS (port 465)</span>
        </div>
        <Field label="SMTP Username" value={s.smtp_user ?? ''} onChange={(v) => set('smtp_user', v)} />
        <Field label="SMTP Password" secret value={s.smtp_pass ?? ''} onChange={(v) => set('smtp_pass', v)} />
        <Field label="From" value={s.email_from ?? ''} onChange={(v) => set('email_from', v)} placeholder="noreply@example.com" />
        <Field label="To (comma-separated for multiple)" value={s.email_to ?? ''} onChange={(v) => set('email_to', v)} placeholder="you@example.com, other@example.com" />
        <div className="flex gap-3 items-center flex-wrap">
          <button
            onClick={() => saveSection(emailKeys, setEmailStatus)}
            className="bg-indigo-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-indigo-700"
          >
            Save
          </button>
          <button
            onClick={testEmail}
            className="border border-gray-300 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50"
          >
            Send test
          </button>
          <StatusMsg status={emailStatus} />
        </div>
      </Section>

      {/* Webhook Security */}
      <Section title="Webhook Security">
        <p className="text-xs text-gray-500">
          Set a shared secret to require an <code className="bg-gray-100 px-1 rounded">Authorization: Bearer &lt;secret&gt;</code> header
          on all incoming webhooks. Leave blank to allow unauthenticated requests.
        </p>

        {/* Shared Secret field with show/hide + copy + generate */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Shared Secret</label>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 w-full max-w-sm">
            <input
              type={showSecret ? 'text' : 'password'}
              value={s.webhook_secret ?? ''}
              onChange={(e) => { set('webhook_secret', e.target.value); setWebhookStatus(null); }}
              placeholder="leave blank to disable"
              className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-0 flex-1 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowSecret((v) => !v)}
              className="text-xs text-indigo-600 hover:underline whitespace-nowrap"
            >
              {showSecret ? 'Hide' : 'Show'}
            </button>
            <button
              type="button"
              onClick={copySecret}
              disabled={!s.webhook_secret}
              className="text-xs text-indigo-600 hover:underline whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {secretCopied ? 'Copied!' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={generateSecret}
              className="text-xs text-indigo-600 hover:underline whitespace-nowrap"
            >
              Generate
            </button>
          </div>
        </div>

        {/* DIUN config snippets */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-600">DIUN configuration snippets</p>
          <SnippetCard
            title="diun.yml — standalone config file"
            description="Add this block to your diun.yml file when running DIUN with a standalone config file (not in a Docker Compose stack)."
            snippet={
`notif:
  webhook:
    endpoint: https://your-imagepulse-host/api/webhook
    method: POST
    headers:
      Content-Type: application/json
      Authorization: "Bearer ${s.webhook_secret || '<your-secret>'}"`
            }
          />
          <SnippetCard
            title="Docker Compose — environment variable format"
            description={
              'Add these environment variables to your DIUN service in docker-compose.yml. ' +
              'Store the secret in a .env file alongside your compose file as:\n' +
              'DIUN_NOTIF_WEBHOOK_HEADERS_AUTHORIZATION=' + (s.webhook_secret || '<your-secret>')
            }
            snippet={
              '# ── ImagePulse webhook ─────────────────────────────────────\n' +
              '- DIUN_NOTIF_WEBHOOK_ENDPOINT=https://your-imagepulse-host/api/webhook\n' +
              '- DIUN_NOTIF_WEBHOOK_METHOD=POST\n' +
              '- DIUN_NOTIF_WEBHOOK_HEADERS_CONTENT-TYPE=application/json\n' +
              '- DIUN_NOTIF_WEBHOOK_HEADERS_AUTHORIZATION=Bearer ${DIUN_NOTIF_WEBHOOK_HEADERS_AUTHORIZATION}\n' +
              '- DIUN_NOTIF_WEBHOOK_TIMEOUT=10s'
            }
          />
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <button
            onClick={() => saveSection(webhookKeys, setWebhookStatus)}
            className="bg-indigo-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-indigo-700"
          >
            Save
          </button>
          <StatusMsg status={webhookStatus} />
        </div>
      </Section>

      {/* Retention */}
      <Section title="Event Retention">
        <Field
          label="Retention (days; 0 = keep forever)"
          value={s.retention_days ?? '0'}
          onChange={(v) => set('retention_days', v)}
          placeholder="0"
        />
        <div className="flex gap-3 items-center flex-wrap">
          <button
            onClick={() => saveSection(retentionKeys, setRetentionStatus)}
            className="bg-indigo-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-indigo-700"
          >
            Save
          </button>
          <button
            onClick={() => openPruneModal('prune')}
            disabled={previewLoading}
            className="border border-red-300 text-red-700 px-4 py-2 rounded text-sm font-medium hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Run Cleanup Now
          </button>
          <button
            onClick={() => openPruneModal('archive')}
            disabled={previewLoading}
            className="border border-amber-400 text-amber-700 px-4 py-2 rounded text-sm font-medium hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Archive &amp; Clean
          </button>
          <StatusMsg status={retentionStatus} />
          {pruneStatus?.pending && <p className="text-sm text-gray-500">Processing…</p>}
          {!pruneStatus?.pending && <StatusMsg status={pruneStatus} />}
        </div>
      </Section>

      {/* Prune confirmation modal */}
      {pruneModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm mx-4 space-y-4">
            <h3 className="font-semibold text-gray-900">
              {pruneModal.type === 'archive' ? 'Archive & Clean' : 'Run Cleanup Now'}
            </h3>
            {pruneModal.days === 0 ? (
              <p className="text-sm text-gray-600">
                Retention is disabled (0 days). Save a retention period first.
              </p>
            ) : pruneModal.count === 0 ? (
              <p className="text-sm text-gray-600">
                No events older than {pruneModal.days} day{pruneModal.days !== 1 ? 's' : ''} to clean up.
              </p>
            ) : (
              <p className="text-sm text-gray-600">
                {pruneModal.type === 'archive'
                  ? `This will move ${pruneModal.count} event${pruneModal.count !== 1 ? 's' : ''} older than ${pruneModal.days} day${pruneModal.days !== 1 ? 's' : ''} to the archive, then remove them from the main log.`
                  : `This will permanently delete ${pruneModal.count} event${pruneModal.count !== 1 ? 's' : ''} older than ${pruneModal.days} day${pruneModal.days !== 1 ? 's' : ''}. This cannot be undone.`}
              </p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setPruneModal(null)}
                className="border border-gray-300 px-4 py-2 rounded text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              {pruneModal.count > 0 && (
                <button
                  onClick={confirmPrune}
                  className={`px-4 py-2 rounded text-sm font-medium text-white ${
                    pruneModal.type === 'archive'
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {pruneModal.type === 'archive' ? 'Archive & Delete' : 'Delete Events'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
