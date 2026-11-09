'use client';

import { useEffect, useState } from 'react';

import AuthScreen from './AuthScreen';
import { apiFetch } from '../lib/api';
import { review, DEFAULT_GUIDELINES, SAMPLE } from '../lib/analyze';

const TABS = ['Guidelines', 'Submit', 'Review', 'Insights'];
const ROLES = ['Creator', 'Manager', 'Reviewer'];
const TYPES = ['Social post', 'Blog article', 'Ad copy', 'Email', 'Document'];
const SECTIONS = [
  { k: 'terms', name: 'Terminology', cols: ['bad', 'good'], hint: 'avoid  →  use instead' },
  { k: 'facts', name: 'Approved facts', cols: ['subject', 'value', 'unit'], hint: 'subject, number, unit (e.g. free trial, 14, day)' },
  { k: 'claims', name: 'Restricted claims', cols: ['word', 'alt'], hint: 'claim  →  safer wording' },
  { k: 'rules', name: 'Tone rules', cols: ['title', 'text'], hint: 'rule name, description' },
];
const uid = () => Math.random().toString(36).slice(2, 8);
const now = () => new Date().toLocaleString();
const count = (arr, fn) => arr.reduce((m, x) => { const k = fn(x); m[k] = (m[k] || 0) + 1; return m; }, {});

function Marked({ d }) {
  const rs = d.findings.filter((f) => f.status === 'pending' && !f.nonText)
    .map((f) => ({ f, i: d.content.indexOf(f.text) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i);
  const out = []; let p = 0;
  rs.forEach(({ f, i }) => {
    if (i < p) return;
    out.push(d.content.slice(p, i));
    out.push(<mark key={f.id} className={'sev-' + f.severity} title={f.why}>{f.text}</mark>);
    p = i + f.text.length;
  });
  out.push(d.content.slice(p));
  return <p className="doc">{out}</p>;
}

function Adder({ sec, onAdd, disabled }) {
  const [v, setV] = useState({});
  return (
    <form className="adder" onSubmit={(e) => { e.preventDefault(); if (sec.cols.every((c) => v[c]?.trim())) { onAdd(v); setV({}); } }}>
      {sec.cols.map((c) => (
        <input key={c} aria-label={c} placeholder={c} disabled={disabled} value={v[c] || ''} onChange={(e) => setV({ ...v, [c]: e.target.value })} />
      ))}
      <button disabled={disabled}>Add</button>
    </form>
  );
}

export default function Home() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('Submit');
  const role = user?.role || 'Creator';
  const [gl, setGl] = useState(DEFAULT_GUIDELINES);
  const [docs, setDocs] = useState([]);
  const [cur, setCur] = useState(null);
  const [draft, setDraft] = useState({ title: '', type: TYPES[0], content: '', alt: '', img: '' });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [cmt, setCmt] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState('');

useEffect(() => {
  async function restoreSession() {
    try {
      const token = sessionStorage.getItem('pixelpulse_token');

      if (!token) {
              setUser({ name: 'Public Demo', role: 'Creator' });
              return;
      }

      const response = await apiFetch('/api/auth/me');

      if (!response.ok) {
        sessionStorage.removeItem('pixelpulse_token');
        sessionStorage.removeItem('pixelpulse_user');
        setUser({ name: 'Public Demo', role: 'Creator' });
        return;
      }

      const currentUser = await response.json();
      setUser(currentUser);
    } catch (error) {
      console.error('Session restoration failed:', error);
    } finally {
      setReady(true);
    }
  }

  restoreSession();
}, []);
  useEffect(() => { if (ready) localStorage.setItem('pixelpulse', JSON.stringify({ gl, docs, cur })); }, [gl, docs, cur, ready]);
const handleLogin = (loggedInUser) => {
  setUser(loggedInUser);
};

const handleLogout = () => {
  sessionStorage.removeItem('pixelpulse_token');
  sessionStorage.removeItem('pixelpulse_user');
  localStorage.removeItem('pixelpulse');
  setUser(null);
  setDocs([]);
  setCur(null);
  setGl(DEFAULT_GUIDELINES);
  setTab('Submit');
};
  const doc = docs.find((d) => d.id === cur);
  const loadAnalytics = async () => {
  setAnalyticsLoading(true);
  setAnalyticsError('');

  try {
    const api = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
    const response = await apiFetch('/api/demo/analytics');

    if (!response.ok) {
      throw new Error('Could not load analytics');
    }

    const data = await response.json();
    setAnalytics(data);
  } catch (error) {
    setAnalyticsError(error.message);
  } finally {
    setAnalyticsLoading(false);
  }
};
useEffect(() => {
  if (tab === 'Insights') {
    loadAnalytics();
  }
}, [tab]);
  useEffect(() => {
  const active = docs.find((d) => d.id === cur);

  if (!active?.backendReviewId) return;

  let cancelled = false;

  const api = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
  const reviewId = active.backendReviewId;

  const loadHistory = async () => {
    try {
      const isDemo = reviewId.startsWith('demo_');

      if (isDemo) {
         return;
      }

      const [commentsRes, revisionsRes] = await Promise.all([
         apiFetch(`/api/reviews/${reviewId}/comments`),
         apiFetch(`/api/reviews/${reviewId}/revisions`)
      ]);

      if (!commentsRes.ok || !revisionsRes.ok) {
        throw new Error('Could not load saved history');
      }

      const comments = await commentsRes.json();
      const revisions = await revisionsRes.json();

      if (cancelled) return;

      setDocs((currentDocs) =>
        currentDocs.map((d) =>
          d.id === cur
            ? {
                ...d,
                comments: comments.map((c) => ({
                  who: c.actor,
                  text: c.message,
                  at: new Date(c.created_at * 1000).toLocaleString()
                })),
                versions: revisions.map((v, i) => ({
                  v: i + 1,
                  note: `${v.actor}: ${v.action}${v.details ? ' — ' + v.details : ''}`,
                  at: new Date(v.created_at * 1000).toLocaleString()
                }))
              }
            : d
        )
      );
    } catch (error) {
      console.error('Could not load comments or revisions:', error);
    }
  };

  loadHistory();

  return () => {
    cancelled = true;
  };
}, [cur, docs.find((d) => d.id === cur)?.backendReviewId]);
  const isManager =
  role === 'Manager' ||
  role === 'Admin' ||
  docs.find((d) => d.id === cur)?.backendReviewId?.startsWith('demo_');
  const upd = (fn) => setDocs((ds) => ds.map((d) => (d.id === cur ? fn({ ...d }) : d)));
  const log = (d, text) => { d.versions = [...d.versions, { v: d.versions.length + 1, note: `${role}: ${text}`, at: now() }]; };

  const runReview = async (content, hasImage, alt, contentType = draft.type, title = draft.title || 'Untitled draft') =>
    review(content, gl, { hasImage, alt, contentType, title });

  const submit = async () => {
  if (!draft.content.trim()) {
    return setNote('Paste the content you want reviewed.');
  }

  setBusy(true);
  setNote('');

  try {
    const { findings, engine, reviewId } = await runReview(
      draft.content,
      !!draft.img,
      draft.alt,
      draft.type,
      draft.title || 'Untitled draft'
    );

    const d = {
      id: uid(),
      title: draft.title || 'Untitled draft',
      type: draft.type,
      content: draft.content,
      alt: draft.alt,
      hasImage: !!draft.img,
      status: 'Draft',
      engine,
      backendReviewId: reviewId || null,
      findings,
      comments: [],
      versions: [
        {
          v: 1,
          note: `${role}: created draft, ${findings.length} findings`,
          at: now()
        }
      ]
    };

    setDocs((currentDocs) => [d, ...currentDocs]);
    setCur(d.id);
    setDraft({
      title: '',
      type: TYPES[0],
      content: '',
      alt: '',
      img: ''
    });
    setTab('Review');

  } catch (error) {
    console.error('Review submission failed:', error);
    setNote(error.message || 'Could not review your content. Please try again.');

  } finally {
    setBusy(false);
  }
};

  
const resolve = async (f, status, text, reason) => {
  const active = docs.find((d) => d.id === cur);

  if (active?.backendReviewId) {
    const api = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

    try {
      const response = await apiFetch(
        `${active.backendReviewId.startsWith('demo_') ? '/api/demo' : '/api'}/reviews/${active.backendReviewId}/findings/${f.id}/decision`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            status:
              status === 'rejected'
                ? 'rejected'
                : status === 'accepted'
                  ? 'approved'
                  : 'edited',
            edited_fix: status === 'rejected' ? null : (text || f.fix),
            actor: role
          })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || 'Could not save finding decision');
      }
    } catch (error) {
      window.alert(error.message);
      return;
    }
  }

  upd((d) => {
    if (!f.nonText && text != null) {
      d.content = d.content.replace(f.text, text);
    }

    d.findings = d.findings.map((x) =>
      x.id === f.id
        ? { ...x, status, reason, final: text }
        : x
    );

    log(
      d,
      `${status} "${f.category}" finding${reason ? ` (${reason})` : ''}`
    );

    return d;
  });
};

  const reject = (f) => { const r = window.prompt('Why are you rejecting this suggestion? (this feeds the insights page)'); if (r !== null) resolve(f, 'rejected', null, r || 'no reason given'); };
  const edit = (f) => { const t = window.prompt('Write your own wording:', f.fix); if (t !== null) resolve(f, 'edited', t); };

  
  const rerun = async () => {
  if (!doc) return;

  setBusy(true);
  setNote('');

  try {
    const { findings, engine } = await runReview(
      doc.content,
      doc.hasImage,
      doc.alt,
      doc.type,
      doc.title
    );

    upd((d) => {
      d.findings = findings;
      d.engine = engine;
      d.status = 'Draft';
      log(d, `re-ran review, ${findings.length} findings`);
      return d;
    });

  } catch (error) {
    console.error('Re-review failed:', error);
    setNote(error.message || 'Could not re-run the review. Please try again.');
    window.alert(error.message || 'Could not re-run the review.');

  } finally {
    setBusy(false);
  }
};
  const addComment = async () => {
  const active = docs.find((d) => d.id === cur);
  const message = cmt.trim();

  if (!message) return;

  if (!active?.backendReviewId) {
    window.alert('Backend review ID not found.');
    return;
  }

  const api = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

  try {
    const response = await apiFetch(
      `/api/reviews/${active.backendReviewId}/comments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          actor: role,
          message
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.detail || 'Could not save comment');
    }

    const commentsResponse = await apiFetch(
      `/api/reviews/${active.backendReviewId}/comments`
    );

    if (!commentsResponse.ok) {
      throw new Error('Comment saved, but could not reload comments');
    }

    const comments = await commentsResponse.json();
    const revisionsResponse = await apiFetch(
  `/api/reviews/${active.backendReviewId}/revisions`
);

if (!revisionsResponse.ok) {
  throw new Error('Could not reload revision history');
}

const revisions = await revisionsResponse.json();

    setDocs((currentDocs) =>
  currentDocs.map((d) =>
    d.id === cur
      ? {
          ...d,

          comments: comments.map((c) => ({
            who: c.actor,
            text: c.message,
            at: new Date(c.created_at * 1000).toLocaleString()
          })),

          versions: revisions.map((v, i) => ({
            v: i + 1,
            note: `${v.actor}: ${v.action}${v.details ? ' — ' + v.details : ''}`,
            at: new Date(v.created_at * 1000).toLocaleString()
          }))
        }
      : d
  )
);

    setCmt('');
  } catch (error) {
    window.alert(error.message);
  }
};

const setStatus = async (status, text) => {
  const active = docs.find((d) => d.id === cur);

  if (!active?.backendReviewId) {
    window.alert('Backend review ID not found. Please submit a new review.');
    return;
  }

  const isDemo = active.backendReviewId.startsWith('demo_');
  let endpoint = '';
  let body = {};

  if (status === 'In Review') {
    endpoint = 'submit';
    body = {
      submitted_by: role,
      manager: 'Demo Manager'
    };
  } else if (status === 'Approved') {
    endpoint = 'approve';
    body = {
      actor: 'Demo Manager',
      comment: 'Content reviewed and approved.'
    };
  } else if (status === 'Changes Requested') {
    const comment = window.prompt('Why are changes required?');

    if (comment === null) return;

    if (!comment.trim()) {
      window.alert('Please enter a reason.');
      return;
    }

    endpoint = 'request-changes';
    body = {
      actor: 'Demo Manager',
      comment: comment.trim()
    };
  }

  const apiPath = isDemo
    ? `/api/demo/reviews/${active.backendReviewId}/${endpoint}`
    : `/api/reviews/${active.backendReviewId}/${endpoint}`;

  try {
    const response = await apiFetch(apiPath, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.detail || 'Workflow update failed');
    }

    upd((d) => {
      d.status = status;
      log(d, text);
      return d;
    });

    window.alert(`Workflow updated: ${result.status}`);
  } catch (error) {
    window.alert(error.message);
  }
};

const exportCSV = () => {
  if (!analytics) return;

  const rows = [
    ['PixelPulse Governance Analytics'],
    ['Metric', 'Value'],
    ['Total Reviews', analytics.reviews.total_reviews],
    ['Approved Reviews', analytics.reviews.approved],
    ['Pending Approval', analytics.reviews.pending],
    ['Changes Requested', analytics.reviews.changes_requested],
    ['Draft Reviews', analytics.reviews.drafts],
    [],
    ['Finding Severity', 'Count'],
    ...Object.entries(analytics.severity),
    [],
    ['Category', 'Total Findings'],
    ...analytics.categories.map(x => [x.category, x.total]),
    [],
    ['Finding Decisions', 'Count'],
    ...Object.entries(analytics.decisions),
    [],
    ['Actor', 'Activities'],
    ...analytics.actor_activity.map(x => [x.actor, x.total])
  ];

  const csv = rows.map(row =>
    row.map(value =>
      `"${String(value ?? '').replace(/"/g, '""')}"`
    ).join(',')
  ).join('\n');

  const blob = new Blob([csv], {
    type: 'text/csv;charset=utf-8;'
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = 'PixelPulse_Governance_Report.csv';
  link.click();

  URL.revokeObjectURL(url);
};


const exportPDF = () => {
  if (!analytics) return;

  const reportWindow = window.open('', '_blank');

  if (!reportWindow) {
    window.alert('Please allow pop-ups to export the PDF.');
    return;
  }

  const escapeHTML = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);

  const reviews = analytics.reviews || {};
  const severity = Object.entries(analytics.severity || {});
  const categories = analytics.categories || [];
  const decisions = Object.entries(analytics.decisions || {});
  const actors = analytics.actor_activity || [];
  const activities = analytics.recent_activity || [];

  const totalFindings = severity.reduce((sum, item) => sum + Number(item[1] || 0), 0);

  const metricCard = (label, value, color) => `
    <div class="metric">
      <div class="metric-label">${escapeHTML(label)}</div>
      <div class="metric-value" style="color:${color}">${escapeHTML(value)}</div>
    </div>
  `;

  const barRows = (items, labelKey, valueKey, color) => {
    const max = Math.max(1, ...items.map(x => Number(x[valueKey] || 0)));

    return items.map(item => {
      const value = Number(item[valueKey] || 0);
      const width = (value / max) * 100;

      return `
        <div class="bar-row">
          <div class="bar-label">${escapeHTML(item[labelKey])}</div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${width}%;background:${color}"></div>
          </div>
          <div class="bar-value">${value}</div>
        </div>
      `;
    }).join('');
  };

  const severityColors = {
    critical: '#DC4545',
    warning: '#E7A23B',
    suggestion: '#278DAB'
  };

  const severityRows = severity.map(([name, value]) => `
    <tr>
      <td>
        <span class="severity-dot" style="background:${severityColors[name.toLowerCase()] || '#64748b'}"></span>
        ${escapeHTML(name)}
      </td>
      <td><strong>${escapeHTML(value)}</strong></td>
    </tr>
  `).join('');

  const decisionRows = decisions.map(([name, value]) => `
    <tr>
      <td>${escapeHTML(name.replace(/_/g, ' '))}</td>
      <td><strong>${escapeHTML(value)}</strong></td>
    </tr>
  `).join('');

  const activityRows = activities.map(item => `
    <tr>
      <td>${escapeHTML(item.actor)}</td>
      <td>${escapeHTML(item.action)}</td>
      <td>${escapeHTML(item.details)}</td>
      <td>${escapeHTML(item.created_at)}</td>
    </tr>
  `).join('');

  const generatedAt = new Date().toLocaleString();

  reportWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>PixelPulse Governance Report</title>

      <style>
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          background: #eef2f7;
          color: #263449;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 12px;
          line-height: 1.5;
        }

        .page {
          max-width: 1000px;
          margin: 30px auto;
          background: white;
          padding: 42px;
          box-shadow: 0 5px 25px rgba(20,35,60,.08);
        }

        .hero {
          background: linear-gradient(125deg, #14243b, #183e54);
          color: white;
          padding: 35px;
          border-radius: 14px;
          margin-bottom: 28px;
        }

        .brand {
          font-size: 23px;
          font-weight: 800;
          letter-spacing: 2px;
          color: #68d6c5;
        }

        .tag {
          display: inline-block;
          margin-top: 18px;
          padding: 5px 11px;
          border: 1px solid #68d6c5;
          border-radius: 20px;
          color: #a4eee2;
          font-size: 9px;
          letter-spacing: 1.3px;
        }

        .hero h1 {
          font-size: 29px;
          margin: 18px 0 7px;
          color: white;
        }

        .hero p {
          color: #c4d5e4;
          margin: 0;
        }

        .generated {
          margin-top: 22px;
          color: #a9bdce;
          font-size: 10px;
        }

        .section {
          margin-top: 30px;
          page-break-inside: avoid;
        }

        .section h2 {
          font-size: 17px;
          color: #172c45;
          padding-bottom: 10px;
          border-bottom: 2px solid #e8eef3;
          margin-bottom: 16px;
        }

        .section-subtitle {
          color: #718096;
          margin-top: -8px;
          margin-bottom: 17px;
          font-size: 10px;
        }

        .metrics {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        .metric {
          padding: 17px;
          background: #f5f8fb;
          border: 1px solid #e4ebf2;
          border-radius: 10px;
        }

        .metric-label {
          color: #68788c;
          font-size: 10px;
          font-weight: 600;
        }

        .metric-value {
          font-size: 26px;
          font-weight: 800;
          margin-top: 7px;
        }

        .columns {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 25px;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
          font-size: 11px;
        }

        th {
          text-align: left;
          background: #edf3f7;
          color: #34465c;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: .5px;
        }

        th, td {
          padding: 11px 10px;
          border-bottom: 1px solid #e8edf2;
          vertical-align: top;
        }

        tr:nth-child(even) td {
          background: #fafbfd;
        }

        .severity-dot {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          margin-right: 6px;
        }

        .bar-row {
          display: grid;
          grid-template-columns: 105px 1fr 25px;
          align-items: center;
          gap: 9px;
          margin: 15px 0;
        }

        .bar-label {
          font-size: 10px;
          color: #526176;
          overflow-wrap: anywhere;
        }

        .bar-track {
          height: 9px;
          background: #e9eff4;
          border-radius: 10px;
          overflow: hidden;
        }

        .bar-fill {
          height: 100%;
          border-radius: 10px;
        }

        .bar-value {
          font-weight: bold;
          text-align: right;
        }

        .footer {
          margin-top: 40px;
          padding-top: 15px;
          border-top: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          color: #8492a4;
          font-size: 9px;
        }

        .empty {
          color: #8492a4;
          padding: 12px 0;
        }

        .print-button {
          position: fixed;
          bottom: 22px;
          right: 22px;
          padding: 13px 22px;
          background: #167f79;
          color: white;
          border: 0;
          border-radius: 8px;
          font-weight: bold;
          cursor: pointer;
          box-shadow: 0 4px 15px #0002;
        }

        @page {
          size: A4;
          margin: 14mm;
        }

        @media print {
          body {
            background: white;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .page {
            max-width: none;
            margin: 0;
            padding: 0;
            box-shadow: none;
          }

          .print-button {
            display: none;
          }

          .hero, .metric, th, .bar-track {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .section {
            page-break-inside: avoid;
          }

          thead {
            display: table-header-group;
          }
        }
      </style>
    </head>

    <body>
      <div class="page">

        <header class="hero">
          <div class="brand">PIXELPULSE</div>
          <div class="tag">BRAND GOVERNANCE PLATFORM</div>
          <h1>Governance Analytics Report</h1>
          <p>A consolidated overview of content reviews, findings and team decisions.</p>
          <div class="generated">GENERATED: ${escapeHTML(generatedAt)}</div>
        </header>

        <section class="section">
          <h2>01. Review Performance</h2>
          <p class="section-subtitle">Overall status of content reviews in the database.</p>

          <div class="metrics">
            ${metricCard('Total Reviews', reviews.total_reviews ?? 0, '#183e68')}
            ${metricCard('Approved', reviews.approved ?? 0, '#16856e')}
            ${metricCard('Pending Approval', reviews.pending ?? 0, '#d18a27')}
            ${metricCard('Changes Requested', reviews.changes_requested ?? 0, '#d45b52')}
            ${metricCard('Drafts', reviews.drafts ?? 0, '#62748b')}
            ${metricCard('Total Findings', totalFindings, '#278dAB')}
          </div>
        </section>

        <div class="columns">
          <section class="section">
            <h2>02. Finding Severity</h2>
            <p class="section-subtitle">Distribution of detected issues.</p>

            <table>
              <tr><th>Severity</th><th>Count</th></tr>
              ${severityRows || '<tr><td colspan="2">No findings available</td></tr>'}
            </table>
          </section>

          <section class="section">
            <h2>03. Finding Decisions</h2>
            <p class="section-subtitle">Recorded reviewer decisions.</p>

            <table>
              <tr><th>Decision</th><th>Count</th></tr>
              ${decisionRows || '<tr><td colspan="2">No decisions available</td></tr>'}
            </table>
          </section>
        </div>

        <section class="section">
          <h2>04. Common Violation Categories</h2>
          <p class="section-subtitle">Categories ranked by number of findings.</p>

          ${categories.length
            ? barRows(categories, 'category', 'total', '#278dAB')
            : '<p class="empty">No category data available.</p>'}
        </section>

        <section class="section">
          <h2>05. Team Activity</h2>
          <p class="section-subtitle">Number of recorded activities by role.</p>

          ${actors.length
            ? barRows(actors, 'actor', 'total', '#16856e')
            : '<p class="empty">No team activity available.</p>'}
        </section>

        <section class="section">
          <h2>06. Recent Audit Activity</h2>
          <p class="section-subtitle">Latest recorded actions from the revision history.</p>

          <table>
            <tr>
              <th>Actor</th>
              <th>Action</th>
              <th>Details</th>
              <th>Date</th>
            </tr>
            ${activityRows || '<tr><td colspan="4">No recent activity available</td></tr>'}
          </table>
        </section>

        <div class="footer">
          <span>PIXELPULSE · CONFIDENTIAL GOVERNANCE REPORT</span>
          <span>Generated from live database analytics</span>
        </div>

      </div>

      <button class="print-button" onclick="window.print()">
        Print / Save as PDF
      </button>
    </body>
    </html>
  `);

  reportWindow.document.close();
  reportWindow.focus();
};


  const pending = doc ? doc.findings.filter((f) => f.status === 'pending') : [];
  const pendingHigh = pending.filter((f) => f.severity === 'high').length;
  const locked = doc?.status === 'Approved';

  const all = docs.flatMap((d) => d.findings);
  const byCat = Object.entries(count(all, (f) => f.category)).sort((a, b) => b[1] - a[1]);
  const byStatus = count(all, (f) => f.status);
  const rejected = Object.entries(count(all.filter((f) => f.status === 'rejected'), (f) => f.source)).sort((a, b) => b[1] - a[1]);
  const max = byCat[0]?.[1] || 1;
  if (!ready) {
    return <div className="auth-shell">Loading PixelPulse...</div>;
  }

  if (!user) {
    return <AuthScreen onLogin={handleLogin} />;
  }
  return (
    <div className="shell">
      <header>
        <div className="brand"><b>PixelPulse</b><span>Check content against your brand before it goes live</span></div>
        <div className="role">
  <span>{user.name} · {user.role}</span>
  <button className="ghost" onClick={handleLogout}>
    Logout
  </button>
</div>
      </header>
      <nav role="tablist">{TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}{t === 'Review' && pending.length ? ` (${pending.length})` : ''}</button>)}</nav>

      <main>
        {tab === 'Guidelines' && (
          <section>
            <h2>Brand guidelines</h2>
            <p className="muted">Every finding cites one of these entries. {isManager ? 'You can edit them as a Manager.' : 'Switch to Manager to edit.'}</p>
            <div className="grid2">
              {SECTIONS.map((s) => (
                <div className="card" key={s.k}>
                  <h3>{s.name}</h3><p className="muted small">{s.hint}</p>
                  <ul>{gl[s.k].map((it, i) => (
                    <li key={i}><span>{s.cols.map((c) => it[c]).join('  →  ')}</span>
                      <button className="ghost" disabled={!isManager} onClick={() => setGl({ ...gl, [s.k]: gl[s.k].filter((_, j) => j !== i) })}>Remove</button></li>
                  ))}</ul>
                  <Adder sec={s} disabled={!isManager} onAdd={(v) => setGl({ ...gl, [s.k]: [...gl[s.k], v] })} />
                </div>
              ))}
            </div>
            <p className="lock">🔒 Guidelines stay inside your workspace and are only used to review your drafts.</p>
          </section>
        )}

        {tab === 'Submit' && (
          <section className="narrow">
            <h2>Submit content for review</h2>
            <div className="row">
              <input placeholder="Title (e.g. Diwali launch post)" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
            </div>
            <textarea rows={9} placeholder="Paste your draft here…" value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} />
            <div className="row">
              <label className="file">Attach image (optional)
                <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files[0]; if (!f) return setDraft({ ...draft, img: '' }); const r = new FileReader(); r.onload = () => setDraft((d) => ({ ...d, img: r.result })); r.readAsDataURL(f); }} />
              </label>
              {draft.img && <><img className="thumb" src={draft.img} alt={draft.alt || 'Attached preview'} /><input placeholder="Alt text for the image" value={draft.alt} onChange={(e) => setDraft({ ...draft, alt: e.target.value })} /></>}
            </div>
            {note && <p className="err" role="alert">{note}</p>}
            <div className="row">
              <button className="primary" disabled={busy} onClick={submit}>{busy ? 'Reviewing…' : 'Review before publishing'}</button>
              <button className="ghost" onClick={() => setDraft({ ...draft, title: draft.title || 'Sample launch post', content: SAMPLE })}>Use sample draft</button>
            </div>
          </section>
        )}

        {tab === 'Review' && (!doc ? (
          <section className="empty"><h2>Nothing to review yet</h2><p>Submit a draft and its findings will appear here.</p><button className="primary" onClick={() => setTab('Submit')}>Submit a draft</button></section>
        ) : (
          <section>
            <div className="banner">AI-assisted review ({doc.engine}). Suggestions are never applied without a person choosing Accept or Edit. Your content stays in this workspace.</div>
            <div className="bar">
              <select value={cur} onChange={(e) => setCur(e.target.value)}>{docs.map((d) => <option key={d.id} value={d.id}>{d.title} · {d.status}</option>)}</select>
              <span className={'pill st-' + doc.status.replace(' ', '')}>{doc.status}</span>
              <span className="muted">{doc.type} · {pending.length} open, {pendingHigh} high severity</span>
            </div>
            <div className="split">
              <div>
                <h3>{doc.title}</h3>
                <Marked d={doc} />
                <div className="flow card">
                  <h3>Review workflow</h3>
                  <div className="row">
                    {role === 'Creator' && <>
                      <button className="primary" disabled={locked || doc.status === 'In Review' || pendingHigh > 0} onClick={() => setStatus('In Review', 'submitted for review')}>Submit for approval</button>
                      <button onClick={rerun} disabled={busy || locked}>Re-run review</button>
                    </>}
                    {isManager && <>
                      <button className="primary" disabled={doc.status !== 'In Review' || pending.length > 0} onClick={() => setStatus('Approved', 'approved for publishing')}>Approve</button>
                      <button disabled={doc.status !== 'In Review'} onClick={() => setStatus('Changes Requested', 'requested changes')}>Request changes</button>
                    </>}
                  </div>
                  <p className="muted small">{role === 'Creator' ? (pendingHigh > 0 ? 'Resolve all high-severity findings to submit.' : 'Resolve findings, then submit for approval.') : (pending.length > 0 ? 'Approval unlocks when every finding has a decision.' : 'Switch roles in the header to try each step.')}</p>
                  <h4>Comments</h4>
                  <ul className="plain">{doc.comments.length === 0 && <li className="muted">No comments yet.</li>}{doc.comments.map((c, i) => <li key={i}><b>{c.who}</b> <span className="muted small">{c.at}</span><br />{c.text}</li>)}</ul>
                  <div className="row"><input placeholder="Add a comment" value={cmt} onChange={(e) => setCmt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addComment()} /><button onClick={addComment}>Post</button></div>
                  <h4>Revision history</h4>
                  <ol className="plain">{[...doc.versions].reverse().map((v) => <li key={v.v}><b>v{v.v}</b> {v.note} <span className="muted small">{v.at}</span></li>)}</ol>
                </div>
              </div>
              <div>
                <h3>Findings</h3>
                {doc.findings.length === 0 && <p className="ok">No issues found. This content matches your guidelines.</p>}
                {doc.findings.map((f) => (
                  <article key={f.id} className={'finding ' + (f.status !== 'pending' ? 'done' : '')}>
                    <div className="top"><span className={'badge sev-' + f.severity}>{f.severity}</span><span className="cat">{f.category}</span>{f.status !== 'pending' && <span className="pill">{f.status}</span>}</div>
                    <p className="why">{f.why}</p>
                    <p className="evidence"><b>Evidence:</b> {f.source}</p>
                    <p className="diff">{!f.nonText && <del>{f.text}</del>} <ins>{f.final ?? f.fix}</ins></p>
                    {f.reason && <p className="muted small">Rejected because: {f.reason}</p>}
                    {f.status === 'pending' && !locked && (
                      <div className="row">
                        <button className="primary" onClick={() => resolve(f, 'accepted', f.fix)}>Accept fix</button>
                        <button onClick={() => edit(f)}>Edit</button>
                        <button className="ghost" onClick={() => reject(f)}>Reject</button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </div>
          </section>
        ))}

        
{tab === 'Insights' && (
  <section>
   <div className="row" style={{
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap'
}}>
  <div>
    <h2>Governance Analytics</h2>
    <p className="muted">
      Live statistics from your PixelPulse database.
    </p>
  </div>

  <div className="row">
    <button
      className="ghost"
      onClick={loadAnalytics}
      disabled={analyticsLoading}
    >
      {analyticsLoading ? 'Refreshing...' : 'Refresh analytics'}
    </button>

    <button
      className="ghost"
      onClick={exportCSV}
      disabled={!analytics}
    >
      Download CSV
    </button>

    <button
      onClick={exportPDF}
      disabled={!analytics}
    >
      Export PDF
    </button>
  </div>
</div>

    {analyticsLoading && !analytics && <p>Loading analytics...</p>}

    {analyticsError && (
      <p className="muted">Error: {analyticsError}</p>
    )}

    {analytics && (
      <>
        <div className="grid2">
          <div className="card">
            <h3>Total Reviews</h3>
            <h2>{analytics.reviews.total_reviews ?? 0}</h2>
          </div>

          <div className="card">
            <h3>Approved Reviews</h3>
            <h2>{analytics.reviews.approved ?? 0}</h2>
          </div>

          <div className="card">
            <h3>Pending Approval</h3>
            <h2>{analytics.reviews.pending ?? 0}</h2>
          </div>

          <div className="card">
            <h3>Changes Requested</h3>
            <h2>{analytics.reviews.changes_requested ?? 0}</h2>
          </div>

          <div className="card">
            <h3>Draft Reviews</h3>
            <h2>{analytics.reviews.drafts ?? 0}</h2>
          </div>
        </div>

        <div className="grid2" style={{ marginTop: 20 }}>
          <div className="card">
            <h3>Finding Severity</h3>
            {['critical', 'warning', 'suggestion'].map((s) => (
              <div className="bar2" key={s}>
                <span>{s}</span>
                <i style={{
                  width: `${
                    ((analytics.severity[s] || 0) /
                    Math.max(1, ...Object.values(analytics.severity))) * 100
                  }%`
                }} />
                <b>{analytics.severity[s] || 0}</b>
              </div>
            ))}
          </div>

          <div className="card">
            <h3>Most Common Violations</h3>
            {analytics.categories.length === 0 ? (
              <p className="muted">No findings recorded.</p>
            ) : analytics.categories.map((item) => (
              <div className="bar2" key={item.category}>
                <span>{item.category}</span>
                <i style={{
                  width: `${
                    (item.total /
                    Math.max(1, ...analytics.categories.map(x => x.total))) * 100
                  }%`
                }} />
                <b>{item.total}</b>
              </div>
            ))}
          </div>

          <div className="card">
            <h3>Finding Decisions</h3>
            {['approved', 'edited', 'rejected', 'pending'].map((s) => (
              <div className="bar2" key={s}>
                <span>{s}</span>
                <i style={{
                  width: `${
                    ((analytics.decisions[s] || 0) /
                    Math.max(1, ...Object.values(analytics.decisions))) * 100
                  }%`
                }} />
                <b>{analytics.decisions[s] || 0}</b>
              </div>
            ))}
          </div>

          <div className="card">
            <h3>Activity by Role</h3>
            {analytics.actor_activity.length === 0 ? (
              <p className="muted">No activity recorded.</p>
            ) : analytics.actor_activity.map((item) => (
              <div className="bar2" key={item.actor}>
                <span>{item.actor}</span>
                <i style={{
                  width: `${
                    (item.total /
                    Math.max(1, ...analytics.actor_activity.map(x => x.total))) * 100
                  }%`
                }} />
                <b>{item.total}</b>
              </div>
            ))}
          </div>

          <div className="card wide">
            <h3>Recent Activity</h3>
            {analytics.recent_activity.length === 0 ? (
              <p className="muted">No recent activity.</p>
            ) : (
              <ul className="plain">
                {analytics.recent_activity.map((item, index) => (
                  <li key={`${item.review_id}-${item.created_at}-${index}`}>
                    <b>{item.actor}</b> — {item.action}
                    {item.details && `: ${item.details}`}
                    <br />
                    <small className="muted">
                      Review: {item.review_id} · {new Date(
                        item.created_at * 1000
                      ).toLocaleString()}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </>
    )}
  </section>
)}

      </main>
      <footer>AI disclosure: findings come from the configured Pixel Pulse API when available, otherwise the local deterministic demo rules. Humans make every final decision. Confidential guideline text is not shared outside this workspace.</footer>
    </div>
  );
}
