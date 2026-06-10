import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Chatbot from './Chatbot';

function Dashboard({ token, role, onLogout }) {
  const [activeTab, setActiveTab] = useState('files');
  const [files, setFiles] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const fileInputRef = useRef(null);

  const apiConfig = { headers: { Authorization: `Bearer ${token}` } };

  const fetchFiles = async () => {
    try {
      const response = await axios.get('http://localhost:8000/files', apiConfig);
      setFiles(response.data);
    } catch {
      setErrorMessage('Failed to populate repository tracking rows.');
    }
  };

  useEffect(() => { fetchFiles(); }, []);

  const handleUpload = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const selectedFile = fileInputRef.current?.files[0];
    if (!selectedFile) {
      setErrorMessage('Please select a file before uploading.');
      return;
    }

    try {
      const preSignResponse = await axios.post(
        'http://localhost:8000/files/generate-upload-url',
        { filename: selectedFile.name, content_type: selectedFile.type || 'application/octet-stream' },
        apiConfig
      );
      const { upload_url, file_id } = preSignResponse.data;

      await axios.put(upload_url, selectedFile, {
        headers: { 'Content-Type': selectedFile.type || 'application/octet-stream' },
      });

      await axios.post(
        'http://localhost:8000/files/upload-complete',
        { file_id, filename: selectedFile.name, content_type: selectedFile.type || 'application/octet-stream', size_bytes: selectedFile.size },
        apiConfig
      );

      setSuccessMessage(`Uploaded "${selectedFile.name}" successfully.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchFiles();
    } catch (error) {
      setErrorMessage(error.response?.data?.detail || 'Upload pipeline aborted.');
    }
  };

  const handleDelete = async (filename) => {
    if (!window.confirm(`Delete "${filename}" permanently?`)) return;
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await axios.delete(`http://localhost:8000/files/${filename}`, apiConfig);
      setSuccessMessage(`Deleted "${filename}".`);
      fetchFiles();
    } catch (error) {
      setErrorMessage(error.response?.data?.detail || 'Delete failed.');
    }
  };

  const handleDownload = async (filename) => {
    try {
      const response = await axios.get(`http://localhost:8000/files/${filename}/download`, {
        ...apiConfig,
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.setAttribute('download', filename);
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      alert(`Download failed for: ${filename}`);
    }
  };

  return (
    <div className="dashboard-container">
      {/* Header */}
      <header className="dashboard-header">
        <div>
          <h1 style={s.brandTitle}>Console Workspace</h1>
          <p style={s.badge}>
            Clearance Tier: <span style={s.roleHighlight}>{role.toUpperCase()}</span>
          </p>
        </div>
        <button onClick={onLogout} style={s.logoutBtn}>Logout</button>
      </header>

      {/* Tab bar */}
      <nav style={s.tabBar}>
        <button
          onClick={() => setActiveTab('files')}
          style={{ ...s.tabBtn, ...(activeTab === 'files' ? s.tabActive : {}) }}
        >
          Files
        </button>
        <button
          onClick={() => setActiveTab('chat')}
          style={{ ...s.tabBtn, ...(activeTab === 'chat' ? s.tabActive : {}) }}
        >
          Chat
        </button>
      </nav>

      {/* Content */}
      <main style={s.main}>
        {activeTab === 'files' && (
          <>
            {errorMessage && <div style={s.errorBanner}>{errorMessage}</div>}
            {successMessage && <div style={s.successBanner}>{successMessage}</div>}

            {role === 'admin' && (
              <div style={s.card}>
                <h3 style={s.sectionTitle}>Upload File</h3>
                <form onSubmit={handleUpload} style={s.uploadForm}>
                  <input type="file" ref={fileInputRef} style={s.fileInput} />
                  <button type="submit" style={s.uploadBtn}>Upload</button>
                </form>
              </div>
            )}

            <div style={s.card}>
              <h3 style={s.sectionTitle}>Indexed File Register</h3>
              {files.length === 0 ? (
                <p style={s.emptyText}>No files indexed yet.</p>
              ) : (
                <div className="table-scroll">
                  <table style={s.table}>
                    <thead>
                      <tr style={s.thRow}>
                        <th style={s.th}>ID</th>
                        <th style={s.th}>Filename</th>
                        <th style={s.th}>Type</th>
                        <th style={s.th}>Size</th>
                        <th style={s.th}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {files.map((file) => (
                        <tr key={file.id || file._id} style={s.trRow}>
                          <td style={s.tdId}>{file.id || file._id}</td>
                          <td style={s.td}><strong>{file.filename}</strong></td>
                          <td style={s.td}><code style={s.code}>{file.content_type}</code></td>
                          <td style={s.td}>{file.size_bytes.toLocaleString()} B</td>
                          <td style={s.tdActions}>
                            <button onClick={() => handleDownload(file.filename)} style={s.downloadBtn}>Download</button>
                            {role === 'admin' && (
                              <button onClick={() => handleDelete(file.filename)} style={s.deleteBtn}>Delete</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'chat' && <Chatbot token={token} />}
      </main>
    </div>
  );
}

const s = {
  brandTitle: { margin: 0, color: '#0f172a', fontSize: '22px', fontWeight: '700', letterSpacing: '-0.3px' },
  badge: { margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' },
  roleHighlight: { color: '#2563eb', fontWeight: '700' },
  logoutBtn: { padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#475569', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' },
  tabBar: { display: 'flex', gap: '0', borderBottom: '1px solid #e2e8f0', margin: '16px 0 24px' },
  tabBtn: { padding: '10px 22px', background: 'none', border: 'none', borderBottom: '2px solid transparent', cursor: 'pointer', fontSize: '15px', fontWeight: '500', color: '#64748b' },
  tabActive: { color: '#2563eb', borderBottomColor: '#2563eb' },
  main: { display: 'flex', flexDirection: 'column', gap: '20px' },
  errorBanner: { padding: '12px 16px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '8px', fontSize: '14px', border: '1px solid #fca5a5' },
  successBanner: { padding: '12px 16px', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '8px', fontSize: '14px', border: '1px solid #86efac' },
  card: { padding: '24px', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' },
  sectionTitle: { margin: '0 0 16px 0', color: '#1e293b', fontSize: '17px', fontWeight: '600' },
  uploadForm: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' },
  fileInput: { padding: '9px', border: '1px dashed #cbd5e1', borderRadius: '6px', backgroundColor: '#f8fafc', cursor: 'pointer', flex: 1, minWidth: '200px' },
  uploadBtn: { padding: '10px 22px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' },
  emptyText: { color: '#64748b', fontSize: '15px', textAlign: 'center', padding: '32px 0', margin: 0 },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' },
  thRow: { borderBottom: '2px solid #e2e8f0', backgroundColor: '#f8fafc' },
  th: { padding: '12px 14px', color: '#475569', fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap' },
  trRow: { borderBottom: '1px solid #f1f5f9' },
  tdId: { padding: '14px', color: '#94a3b8', fontSize: '12px', fontFamily: 'monospace', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  td: { padding: '14px', color: '#334155', fontSize: '14px' },
  code: { backgroundColor: '#f1f5f9', padding: '2px 7px', borderRadius: '4px', fontSize: '12px', fontFamily: 'monospace', color: '#0f172a', border: '1px solid #e2e8f0' },
  tdActions: { padding: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' },
  downloadBtn: { padding: '6px 12px', backgroundColor: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' },
  deleteBtn: { padding: '6px 12px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' },
};

export default Dashboard;
