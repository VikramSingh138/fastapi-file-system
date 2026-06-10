import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function Chatbot({ token }) {
  const [files, setFiles] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [topK, setTopK] = useState(4);
  const [loading, setLoading] = useState(false);
  const [filesError, setFilesError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const bottomRef = useRef(null);

  const apiConfig = { headers: { Authorization: `Bearer ${token}` } };

  useEffect(() => {
    axios
      .get('http://localhost:8000/files', apiConfig)
      .then((r) => setFiles(r.data))
      .catch(() => setFilesError('Could not load file list.'));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const toggleFile = (id) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const handleSend = async () => {
    const question = input.trim();
    if (!question) return;
    if (selectedIds.length === 0) {
      setMessages((prev) => [
        ...prev,
        { role: 'system', text: 'Select at least one file from the panel before querying.' },
      ]);
      return;
    }

    setMessages((prev) => [...prev, { role: 'user', text: question }]);
    setInput('');
    setLoading(true);

    try {
      const { data } = await axios.post(
        'http://localhost:8000/rag/queryr',
        { question, selected_file_ids: selectedIds, top_k: topK },
        apiConfig
      );
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: data.answer, sources: data.sources_used },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'error', text: err.response?.data?.detail || 'RAG pipeline returned an error.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-root">
      {/* ── Sidebar ── */}
      <aside className="chat-sidebar" style={s.sidebar}>
        <div style={s.sidebarHeader}>
          <span style={s.sidebarTitle}>Context Sources</span>
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            style={s.collapseBtn}
            title="Toggle sidebar"
          >
            {sidebarOpen ? '▲' : '▼'}
          </button>
        </div>

        {sidebarOpen && (
          <>
            <p style={s.sidebarHint}>Check files to search against</p>

            <div style={s.topKCard}>
              <label style={s.topKLabel}>Chunks to retrieve (top_k)</label>
              <div style={s.topKControls}>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={topK}
                  onChange={(e) => setTopK(Number(e.target.value))}
                  style={s.slider}
                />
                <span style={s.topKValue}>{topK}</span>
              </div>
            </div>

            {filesError && <p style={s.sidebarError}>{filesError}</p>}
            {files.length === 0 && !filesError && (
              <p style={s.sidebarEmpty}>No indexed files found.</p>
            )}

            <div style={s.fileList}>
              {files.map((f) => {
                const id = f.id || f._id;
                const checked = selectedIds.includes(id);
                return (
                  <label key={id} style={{ ...s.fileItem, ...(checked ? s.fileItemOn : {}) }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleFile(id)}
                      style={s.checkbox}
                    />
                    <span style={s.fileLabel}>{f.filename}</span>
                  </label>
                );
              })}
            </div>

            {selectedIds.length > 0 && (
              <p style={s.selectionCount}>
                {selectedIds.length} file{selectedIds.length > 1 ? 's' : ''} selected
              </p>
            )}
          </>
        )}
      </aside>

      {/* ── Chat panel ── */}
      <div className="chat-panel" style={s.chatPanel}>
        <div style={s.thread}>
          {messages.length === 0 && (
            <div style={s.emptyState}>
              <div style={s.emptyIcon}>&#128172;</div>
              <p style={s.emptyTitle}>Ask anything about your documents</p>
              <p style={s.emptyHint}>
                Select files on the left, then type a question below.
              </p>
            </div>
          )}

          {messages.map((msg, i) => {
            if (msg.role === 'user') return <UserBubble key={i} text={msg.text} />;
            if (msg.role === 'assistant')
              return <AssistantBubble key={i} text={msg.text} sources={msg.sources} />;
            if (msg.role === 'system') return <SystemNote key={i} text={msg.text} />;
            if (msg.role === 'error') return <ErrorNote key={i} text={msg.text} />;
            return null;
          })}

          {loading && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>

        <div style={s.inputBar}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question… (Enter to send, Shift+Enter for new line)"
            rows={2}
            style={s.textarea}
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            style={{ ...s.sendBtn, opacity: loading || !input.trim() ? 0.45 : 1 }}
          >
            {loading ? '…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Markdown component overrides ────────────────────────────────────────────
// These map every markdown node to an inline-styled element so there's no
// external CSS dependency and the output always matches the app's design system.

const md = {
  p:          ({ children }) => <p style={mdS.p}>{children}</p>,
  h1:         ({ children }) => <h1 style={mdS.h1}>{children}</h1>,
  h2:         ({ children }) => <h2 style={mdS.h2}>{children}</h2>,
  h3:         ({ children }) => <h3 style={mdS.h3}>{children}</h3>,
  h4:         ({ children }) => <h4 style={mdS.h4}>{children}</h4>,
  ul:         ({ children }) => <ul style={mdS.ul}>{children}</ul>,
  ol:         ({ children }) => <ol style={mdS.ol}>{children}</ol>,
  li:         ({ children }) => <li style={mdS.li}>{children}</li>,
  strong:     ({ children }) => <strong style={mdS.strong}>{children}</strong>,
  em:         ({ children }) => <em style={mdS.em}>{children}</em>,
  blockquote: ({ children }) => <blockquote style={mdS.blockquote}>{children}</blockquote>,
  hr:         () => <hr style={mdS.hr} />,
  a:          ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" style={mdS.a}>{children}</a>
  ),
  // Inline code vs fenced code block
  code: ({ inline, className, children }) => {
    if (inline) {
      return <code style={mdS.inlineCode}>{children}</code>;
    }
    const lang = (className || '').replace('language-', '') || 'code';
    return (
      <div style={mdS.codeBlockWrap}>
        <div style={mdS.codeBlockHeader}>
          <span style={mdS.codeLang}>{lang}</span>
          <CopyButton text={String(children)} />
        </div>
        <pre style={mdS.pre}><code style={mdS.codeBlockCode}>{children}</code></pre>
      </div>
    );
  },
  // GFM table
  table:   ({ children }) => <div style={mdS.tableWrap}><table style={mdS.table}>{children}</table></div>,
  thead:   ({ children }) => <thead style={mdS.thead}>{children}</thead>,
  tbody:   ({ children }) => <tbody>{children}</tbody>,
  tr:      ({ children }) => <tr style={mdS.tr}>{children}</tr>,
  th:      ({ children }) => <th style={mdS.th}>{children}</th>,
  td:      ({ children }) => <td style={mdS.td}>{children}</td>,
};

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <button onClick={copy} style={mdS.copyBtn}>
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
}

// ─── Chat bubble components ───────────────────────────────────────────────────

function UserBubble({ text }) {
  return (
    <div style={b.rowRight}>
      <div style={b.userBubble}>{text}</div>
    </div>
  );
}

function AssistantBubble({ text, sources }) {
  const [showSources, setShowSources] = useState(false);

  return (
    <div style={b.rowLeft}>
      <div style={b.assistantBubble}>
        {/* Rendered markdown answer */}
        <div style={b.mdBody}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>
            {text}
          </ReactMarkdown>
        </div>

        {/* Sources panel */}
        {sources && sources.length > 0 && (
          <div style={b.sourcesSection}>
            <button
              onClick={() => setShowSources((v) => !v)}
              style={b.sourcesToggle}
            >
              {showSources ? '▲ Hide' : '▼ Show'} {sources.length} retrieved chunk
              {sources.length > 1 ? 's' : ''}
            </button>

            {showSources && (
              <div style={b.sourcesList}>
                {sources.map((src, i) => (
                  <SourceChunk key={i} index={i} src={src} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SourceChunk({ index, src }) {
  const [expanded, setExpanded] = useState(false);
  const PREVIEW_LEN = 200;
  const isLong = src.text.length > PREVIEW_LEN;
  const displayText = expanded || !isLong ? src.text : src.text.slice(0, PREVIEW_LEN) + '…';

  // Score colour: green ≥ 0.8, amber 0.5–0.8, grey < 0.5
  const scoreColor =
    src.score >= 0.8 ? '#15803d' : src.score >= 0.5 ? '#b45309' : '#64748b';
  const scoreBg =
    src.score >= 0.8 ? '#dcfce7' : src.score >= 0.5 ? '#fef9c3' : '#f1f5f9';

  return (
    <div style={b.chunk}>
      <div style={b.chunkHeader}>
        <span style={b.chunkIndex}>#{index + 1}</span>
        <span style={b.chunkFile}>{src.file_id}</span>
        <span style={{ ...b.chunkScore, color: scoreColor, backgroundColor: scoreBg }}>
          {(src.score * 100).toFixed(1)}% match
        </span>
      </div>
      <p style={b.chunkText}>{displayText}</p>
      {isLong && (
        <button onClick={() => setExpanded((e) => !e)} style={b.chunkToggle}>
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

function SystemNote({ text }) {
  return <div style={b.systemNote}>{text}</div>;
}

function ErrorNote({ text }) {
  return <div style={b.errorNote}>&#9888; {text}</div>;
}

function TypingIndicator() {
  return (
    <div style={b.rowLeft}>
      <div style={b.typingBubble}>
        <span className="typing-dot" />
        <span className="typing-dot" style={{ animationDelay: '0.18s' }} />
        <span className="typing-dot" style={{ animationDelay: '0.36s' }} />
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = {
  sidebar: { backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto' },
  sidebarHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' },
  sidebarTitle: { fontWeight: '700', fontSize: '14px', color: '#1e293b' },
  collapseBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '11px', padding: '2px 4px' },
  sidebarHint: { margin: '0 0 12px 0', fontSize: '12px', color: '#94a3b8' },
  topKCard: { marginBottom: '14px', padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' },
  topKLabel: { display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '8px' },
  topKControls: { display: 'flex', alignItems: 'center', gap: '10px' },
  slider: { flex: 1, accentColor: '#2563eb', cursor: 'pointer' },
  topKValue: { fontSize: '14px', fontWeight: '700', color: '#2563eb', minWidth: '18px', textAlign: 'center' },
  sidebarError: { fontSize: '13px', color: '#ef4444', margin: 0 },
  sidebarEmpty: { fontSize: '13px', color: '#94a3b8', margin: 0 },
  fileList: { display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 },
  fileItem: { display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', cursor: 'pointer' },
  fileItemOn: { backgroundColor: '#eff6ff', borderColor: '#93c5fd' },
  checkbox: { marginTop: '2px', accentColor: '#2563eb', flexShrink: 0 },
  fileLabel: { fontSize: '13px', color: '#334155', wordBreak: 'break-all', lineHeight: '1.4' },
  selectionCount: { margin: '10px 0 0 0', fontSize: '12px', color: '#2563eb', fontWeight: '600' },
  chatPanel: { backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  thread: { flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' },
  emptyState: { margin: 'auto', textAlign: 'center', padding: '40px 20px' },
  emptyIcon: { fontSize: '36px', marginBottom: '12px' },
  emptyTitle: { fontSize: '17px', fontWeight: '600', color: '#1e293b', margin: '0 0 8px 0' },
  emptyHint: { fontSize: '14px', color: '#94a3b8', margin: 0 },
  inputBar: { padding: '14px 16px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '10px', alignItems: 'flex-end', backgroundColor: '#fff' },
  textarea: { flex: 1, resize: 'none', padding: '10px 13px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', fontFamily: 'inherit', lineHeight: '1.5', outline: 'none', color: '#1e293b', backgroundColor: '#f8fafc' },
  sendBtn: { padding: '10px 20px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', fontSize: '14px', cursor: 'pointer', flexShrink: 0, height: 'fit-content' },
};

// Bubble styles
const b = {
  rowRight: { display: 'flex', justifyContent: 'flex-end' },
  rowLeft: { display: 'flex', justifyContent: 'flex-start' },
  userBubble: { maxWidth: '72%', padding: '11px 15px', backgroundColor: '#2563eb', color: '#fff', borderRadius: '16px 16px 4px 16px', fontSize: '14px', lineHeight: '1.6' },
  assistantBubble: { maxWidth: '88%', padding: '16px 20px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px 16px 16px 4px' },
  mdBody: { color: '#1e293b' },
  // Sources
  sourcesSection: { marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' },
  sourcesToggle: { fontSize: '12px', fontWeight: '600', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0 },
  sourcesList: { marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' },
  chunk: { backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 14px' },
  chunkHeader: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' },
  chunkIndex: { fontSize: '11px', fontWeight: '700', color: '#94a3b8' },
  chunkFile: { fontSize: '11px', fontFamily: 'monospace', color: '#475569', backgroundColor: '#f1f5f9', padding: '2px 7px', borderRadius: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%' },
  chunkScore: { fontSize: '11px', fontWeight: '600', padding: '2px 7px', borderRadius: '20px', marginLeft: 'auto' },
  chunkText: { margin: 0, fontSize: '13px', color: '#475569', lineHeight: '1.6' },
  chunkToggle: { marginTop: '6px', fontSize: '12px', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: '600' },
  // Notes
  systemNote: { alignSelf: 'center', fontSize: '13px', color: '#64748b', backgroundColor: '#f1f5f9', padding: '6px 16px', borderRadius: '20px' },
  errorNote: { alignSelf: 'center', fontSize: '13px', color: '#b91c1c', backgroundColor: '#fee2e2', padding: '10px 16px', borderRadius: '8px', border: '1px solid #fca5a5' },
  typingBubble: { display: 'flex', alignItems: 'center', gap: '4px', padding: '13px 16px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px 16px 16px 4px' },
};

// Markdown element styles
const mdS = {
  p:            { margin: '0 0 10px 0', fontSize: '14px', lineHeight: '1.7', color: '#1e293b' },
  h1:           { margin: '16px 0 8px', fontSize: '18px', fontWeight: '700', color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' },
  h2:           { margin: '14px 0 6px', fontSize: '16px', fontWeight: '700', color: '#0f172a' },
  h3:           { margin: '12px 0 6px', fontSize: '14px', fontWeight: '700', color: '#0f172a' },
  h4:           { margin: '10px 0 4px', fontSize: '14px', fontWeight: '600', color: '#334155' },
  ul:           { margin: '0 0 10px 0', paddingLeft: '20px' },
  ol:           { margin: '0 0 10px 0', paddingLeft: '20px' },
  li:           { margin: '4px 0', fontSize: '14px', lineHeight: '1.65', color: '#1e293b' },
  strong:       { fontWeight: '700', color: '#0f172a' },
  em:           { fontStyle: 'italic', color: '#334155' },
  blockquote:   { margin: '10px 0', padding: '8px 14px', borderLeft: '3px solid #2563eb', backgroundColor: '#eff6ff', borderRadius: '0 6px 6px 0', color: '#1e40af', fontSize: '14px', lineHeight: '1.6' },
  hr:           { border: 'none', borderTop: '1px solid #e2e8f0', margin: '14px 0' },
  a:            { color: '#2563eb', textDecoration: 'underline', textDecorationStyle: 'dotted' },
  inlineCode:   { fontFamily: 'monospace', fontSize: '13px', backgroundColor: '#f1f5f9', color: '#0f172a', padding: '1px 6px', borderRadius: '4px', border: '1px solid #e2e8f0' },
  codeBlockWrap:{ margin: '10px 0', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0' },
  codeBlockHeader:{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', backgroundColor: '#1e293b' },
  codeLang:     { fontSize: '11px', fontFamily: 'monospace', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' },
  copyBtn:      { fontSize: '11px', color: '#94a3b8', background: 'none', border: '1px solid #334155', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontFamily: 'inherit' },
  pre:          { margin: 0, padding: '14px', backgroundColor: '#0f172a', overflowX: 'auto' },
  codeBlockCode:{ fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace", fontSize: '13px', color: '#e2e8f0', lineHeight: '1.65' },
  tableWrap:    { overflowX: 'auto', margin: '10px 0' },
  table:        { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  thead:        { backgroundColor: '#f1f5f9' },
  tr:           { borderBottom: '1px solid #e2e8f0' },
  th:           { padding: '8px 12px', fontWeight: '600', color: '#475569', textAlign: 'left' },
  td:           { padding: '8px 12px', color: '#334155' },
};

export default Chatbot;
