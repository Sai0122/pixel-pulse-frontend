// Built-in rule engine: used when no backend API is configured (or it fails).
import { apiFetch } from './api';
const uid = () => Math.random().toString(36).slice(2, 8);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cap = (m, r) => (m[0] !== m[0].toLowerCase() ? r[0].toUpperCase() + r.slice(1) : r);

export const DEFAULT_GUIDELINES = {
  terms: [{ bad: 'LUMEO', good: 'Lumio' }, { bad: 'Premium plan', good: 'Lumio Plus' }],
  facts: [{ subject: 'Lumio Plus', value: '199', unit: 'month' }, { subject: 'free trial', value: '14', unit: 'day' }],
  claims: [
    { word: 'guaranteed', alt: 'designed to help' },
    { word: 'risk-free', alt: 'remove unsupported promise' },
    { word: 'instant approval', alt: 'remove unsupported promise' },
    { word: 'best in', alt: 'describe a supported product benefit' },
  ],
  rules: [{ title: 'Lumio friendly, plain voice', text: 'Avoid slang, capitalised emphasis and more than one exclamation mark. Use approved facts and disclaimers.' }],
};

export const SAMPLE = 'OMG!!! LUMEO Premium is the #1 budgeting app in India. Save 40% more every month, guaranteed! 🔥🔥 Link in bio.';

export function analyze(content, gl, opts = {}) {
  const out = [];
  const add = (f) => out.push({ id: uid(), status: 'pending', ...f });
  const find = (re, fn) => { for (const m of content.matchAll(re)) fn(m); };

  gl.claims.forEach((c) => find(new RegExp(`(?<![\\w])${esc(c.word)}(?![\\w])`, 'gi'), (m) =>
    add({ severity: 'high', category: 'Unsupported claim', text: m[0],
      why: `"${m[0]}" is a promotional claim with no approved evidence behind it.`,
      source: `Restricted claims: "${c.word}"`, fix: cap(m[0], c.alt) })));

  gl.facts.forEach((f) => {
    const s = esc(f.subject), u = esc(f.unit);
    const re = new RegExp(`${s}[^.]{0,40}?(\\d+)[\\s-]*${u}s?|(\\d+)[\\s-]*${u}s?[^.]{0,20}?${s}`, 'gi');
    find(re, (m) => {
      const n = m[1] || m[2];
      if (n !== f.value) add({ severity: 'high', category: 'Fact', text: m[0],
        why: `Content says ${n} ${f.unit}s but the approved fact is ${f.value} ${f.unit}s.`,
        source: `Approved fact: ${f.subject} = ${f.value} ${f.unit}s`, fix: m[0].replace(n, f.value) });
    });
  });

  gl.terms.forEach((t) => find(new RegExp(`(?<![\\w])${esc(t.bad)}\\w*`, 'gi'), (m) =>
    add({ severity: 'medium', category: 'Terminology', text: m[0],
      why: `Brand terminology prefers "${t.good}" over "${t.bad}".`,
      source: `Terminology: use "${t.good}", not "${t.bad}"`, fix: cap(m[0], t.good) })));

  const tone = gl.rules[0]?.title || 'Tone of voice';
  find(/!{2,}/g, (m) => add({ severity: 'low', category: 'Tone', text: m[0],
    why: 'Repeated exclamation marks read as shouting.', source: `Tone rule: ${tone}`, fix: '!' }));
  find(/\b[A-Z]{4,}\b/g, (m) => add({ severity: 'low', category: 'Tone', text: m[0],
    why: 'ALL CAPS reads as shouting.', source: `Tone rule: ${tone}`, fix: m[0][0] + m[0].slice(1).toLowerCase() }));

  find(/click here/gi, (m) => add({ severity: 'medium', category: 'Accessibility', text: m[0],
    why: 'Link text must describe the destination for screen-reader users.',
    source: 'Accessibility: descriptive link text (WCAG 2.4.4)', fix: 'Start your free trial' }));

  if (opts.hasImage && !opts.alt?.trim()) add({ severity: 'high', category: 'Accessibility', text: '(attached image)', nonText: true,
    why: 'The attached image has no alt text.', source: 'Accessibility: images need alt text (WCAG 1.1.1)', fix: 'Add a short description of what the image shows.' });

  // drop overlapping text findings, keep the earliest / most severe
  const rank = { high: 0, medium: 1, low: 2 };
  const used = [];
  return out
    .map((f) => ({ ...f, i: f.nonText ? -1 : content.indexOf(f.text) }))
    .sort((a, b) => a.i - b.i || rank[a.severity] - rank[b.severity])
    .filter((f) => {
      if (f.nonText) return true;
      if (used.some(([s, e]) => f.i < e && f.i + f.text.length > s)) return false;
      used.push([f.i, f.i + f.text.length]); return true;
    })
    .map(({ i, ...f }) => f);
}

// Calls the FastAPI backend when configured. Local rules remain an explicit fallback.

export async function review(content, gl, opts = {}) {
  const url = process.env.NEXT_PUBLIC_API_URL;

  if (url) {
    try {
      const r = await apiFetch(
           '/api/demo/review',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            text: content
          })
        }
      );

      if (!r.ok) {
        throw new Error(`Review API returned ${r.status}`);
      }

      const j = await r.json();

      const severityMap = {
        critical: 'high',
        warning: 'medium',
        suggestion: 'low'
      };

      return {
        engine: 'Brightly BrandGuard API',
        reviewId: j.review_id,

        findings: (j.findings || []).map((f) => ({
          id: f.id || uid(),
          status: f.status || 'pending',

          severity: severityMap[f.severity] || f.severity || 'medium',

          category: f.category || 'Brand compliance',
          text: f.evidence || f.text || '',
          why: f.explanation || f.why || '',
          source: f.explanation || f.source || '',
          fix: f.suggested_fix || f.fix || ''
        }))
      };

    } catch (e) {
      console.error('Brightly backend error:', e);
      throw e;
    }
  }

  return {
    engine: 'Built-in local rule engine (demo fallback)',
    findings: analyze(content, gl, opts)
  };
}

