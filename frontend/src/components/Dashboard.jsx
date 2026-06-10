import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

function Dashboard({ token, role, onLogout }) {
  const [files, setFiles] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const fileInputRef = useRef(null);

  // Set up axial global authorization headers automatically for this instance
  const apiConfig = {
    headers: { Authorization: `Bearer ${token}` }
  };

  const fetchFiles = async () => {
    try {
      const response = await axios.get('http://localhost:8000/files', apiConfig);
      setFiles(response.data);
    } catch (error) {
      setErrorMessage('Failed to populate repository tracking rows.');
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleUpload = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const selectedFile = fileInputRef.current?.files[0];
    if (!selectedFile) {
      setErrorMessage('Please select a valid local asset file before trying to upload.');
      return;
    }

    try {
      // Phase 1: Request pre-signed URL from FastAPI backend
      const preSignResponse = await axios.post(
        'http://localhost:8000/files/generate-upload-url',
        {
          filename: selectedFile.name,
          content_type: selectedFile.type || 'application/octet-stream'
        },
        apiConfig
      );

      const { upload_url, file_id } = preSignResponse.data;

      // Phase 2: Upload raw file binary directly to MinIO using the pre-signed URL
      // We omit our apiConfig headers here because MinIO uses its own URL query authentication signatures
      await axios.put(upload_url, selectedFile, {
        headers: {
          'Content-Type': selectedFile.type || 'application/octet-stream'
        }
      });

      // Phase 3: Notify FastAPI backend that the direct stream is complete
      await axios.post(
        'http://localhost:8000/files/upload-complete',
        {
          file_id: file_id,
          filename: selectedFile.name,
          content_type: selectedFile.type || 'application/octet-stream',
          size_bytes: selectedFile.size
        },
        apiConfig
      );

      setSuccessMessage(`Successfully uploaded "${selectedFile.name}" directly to storage via pre-signed path.`);
      if (fileInputRef.current) fileInputRef.current.value = ''; // Flush input channel cache
      fetchFiles(); // Reload the document tracking grid list
      
    } catch (error) {
      console.error(error);
      setErrorMessage(error.response?.data?.detail || 'Direct-to-storage ingestion pipeline aborted.');
    }
  };

  const handleDelete = async (filename) => {
    if (!window.confirm(`Are you absolutely sure you want to drop "${filename}" from asset indices?`)) return;
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await axios.delete(`http://localhost:8000/files/${filename}`, apiConfig);
      setSuccessMessage(`Successfully purged "${filename}".`);
      fetchFiles();
    } catch (error) {
      setErrorMessage(error.response?.data?.detail || 'Purge task was rejected by server.');
    }
  };

  const handleDownload = async (filename) => {
    try {
      const response = await axios.get(`http://localhost:8000/file/${filename}/download`, {
        ...apiConfig,
        responseType: 'blob' // Essential flag to preserve raw binary object buffers
      });

      // Construct temporary local DOM link reference injection to spark native browser downloader saving routines
      const downloadUrl = window.URL.createObjectURL(new Blob([response.data]));
      const temporaryLink = document.createElement('a');
      temporaryLink.href = downloadUrl;
      temporaryLink.setAttribute('download', filename);
      document.body.appendChild(temporaryLink);
      temporaryLink.click();
      temporaryLink.remove();
    } catch (error) {
      alert(`Could not initiate local saving stream sequence for asset: ${filename}`);
    }
  };

  return (
    <div style={styles.container}>
      {/* Header Panel */}
      <header style={styles.header}>
        <div>
          <h1 style={styles.brandTitle}>Console Workspace</h1>
          <p style={styles.badge}>Clearance Tier: <span style={styles.roleHighlight}>{role.toUpperCase()}</span></p>
        </div>
        <button onClick={onLogout} style={styles.logoutBtn}>Logout Session</button>
      </header>

      {/* Main Container Workspace */}
      <main style={styles.main}>
        {errorMessage && <div style={styles.errorBanner}>{errorMessage}</div>}
        {successMessage && <div style={styles.successBanner}>{successMessage}</div>}

        {/* ADMIN EXCLUSIVE WRITE ACCESS CARD CONTROLS */}
        {role === 'admin' && (
          <div style={styles.adminCard}>
            <h3 style={styles.sectionTitle}>Administrative Asset Ingestion</h3>
            <form onSubmit={handleUpload} style={styles.uploadForm}>
              <input type="file" ref={fileInputRef} style={styles.fileInput} />
              <button type="submit" style={styles.uploadBtn}>Dispatch Ingestion Pipeline</button>
            </form>
          </div>
        )}

        {/* COMPREHENSIVE TRACKING MATRIX LOGS TABLE */}
        <div style={styles.tableCard}>
          <h3 style={styles.sectionTitle}>Indexed System File Register</h3>
          {files.length === 0 ? (
            <p style={styles.emptyText}>No registered file records mapped inside DB indices currently.</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr style={styles.thRow}>
                  <th style={styles.th}>File Identification (ID)</th>
                  <th style={styles.th}>Filename</th>
                  <th style={styles.th}>Content Mime Type</th>
                  <th style={styles.th}>Size (Bytes)</th>
                  <th style={styles.th}>Available Operations</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr key={file.id || file._id} style={styles.trRow}>
                    <td style={styles.tdId}>{file.id || file._id}</td>
                    <td style={styles.td}><strong>{file.filename}</strong></td>
                    <td style={styles.td}><code style={styles.code}>{file.content_type}</code></td>
                    <td style={styles.td}>{file.size_bytes.toLocaleString()} B</td>
                    <td style={styles.tdActions}>
                      <button onClick={() => handleDownload(file.filename)} style={styles.downloadActionBtn}>Download</button>
                      {role === 'admin' && (
                        <button onClick={() => handleDelete(file.filename)} style={styles.deleteActionBtn}>Purge</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}

const styles = {
  container: { padding: '32px', minHeight: '100vh', backgroundColor: '#f8fafc' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '20px', borderBottom: '1px solid #e2e8f0', marginBottom: '30px' },
  brandTitle: { margin: 0, color: '#0f172a', fontSize: '26px', fontWeight: 'bold', letterSpacing: '-0.5px' },
  badge: { margin: '6px 0 0 0', fontSize: '14px', color: '#64748b' },
  roleHighlight: { color: '#2563eb', fontWeight: '700' },
  logoutBtn: { padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#475569', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s' },
  main: { display: 'flex', flexDirection: 'column', gap: '24px' },
  errorBanner: { padding: '14px 18px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '8px', fontSize: '15px', fontWeight: '500', border: '1px solid #fca5a5' },
  successBanner: { padding: '14px 18px', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '8px', fontSize: '15px', fontWeight: '500', border: '1px solid #86efac' },
  adminCard: { padding: '24px', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' },
  sectionTitle: { margin: '0 0 18px 0', color: '#1e293b', fontSize: '18px', fontWeight: '600' },
  uploadForm: { display: 'flex', gap: '16px', alignItems: 'center' },
  fileInput: { padding: '10px', border: '1px dashed #cbd5e1', borderRadius: '6px', backgroundColor: '#f8fafc', cursor: 'pointer' },
  uploadBtn: { padding: '12px 24px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' },
  tableCard: { padding: '24px', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' },
  emptyText: { color: '#64748b', fontSize: '15px', textAlign: 'center', padding: '30px 0' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' },
  thRow: { borderBottom: '2px solid #e2e8f0', backgroundColor: '#f8fafc' },
  th: { padding: '14px 16px', color: '#475569', fontSize: '14px', fontWeight: '600' },
  trRow: { borderBottom: '1px solid #f1f5f9' },
  tdId: { padding: '16px 16px', color: '#94a3b8', fontSize: '13px', fontFamily: 'monospace' },
  td: { padding: '16px 16px', color: '#334155', fontSize: '15px' },
  code: { backgroundColor: '#f1f5f9', padding: '3px 8px', borderRadius: '4px', fontSize: '13px', fontFamily: 'monospace', color: '#0f172a', border: '1px solid #e2e8f0' },
  tdActions: { padding: '16px 16px', display: 'flex', gap: '10px' },
  downloadActionBtn: { padding: '8px 14px', backgroundColor: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  deleteActionBtn: { padding: '8px 14px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }
};

export default Dashboard;