import { useDropzone } from 'react-dropzone';
import { useState } from 'react';

export default function UploadZone({ onFileAccepted, isUploading }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    maxSize: 50 * 1024 * 1024,   // 50 MB
    multiple: false,
    disabled: isUploading,
    onDropAccepted: (files) => onFileAccepted(files[0]),
    onDropRejected: (rejections) => {
      if (rejections[0]?.errors[0]?.code === 'file-too-large') {
        alert('File size exceeds 50MB limit');
      } else {
        alert('Only PDF files under 50MB allowed');
      }
    },
  });

  const [isHovered, setIsHovered] = useState(false);

  const containerStyle = {
    border: `2px dashed ${isDragActive ? '#1a1a1a' : isHovered ? '#888' : '#ccc'}`,
    borderRadius: '12px',
    padding: '3rem 2rem',
    textAlign: 'center',
    cursor: isUploading ? 'not-allowed' : 'pointer',
    background: isDragActive ? '#f4f4f2' : isHovered ? '#fafafa' : '#fff',
    transition: 'all 0.2s ease',
    opacity: isUploading ? 0.6 : 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
  };

  return (
    <div
      {...getRootProps()}
      style={containerStyle}
      onMouseEnter={() => !isUploading && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <input {...getInputProps()} />
      <div style={{ fontSize: '36px' }}>
        {isDragActive ? '📥' : '📤'}
      </div>
      {isDragActive ? (
        <p style={{ margin: 0, fontSize: '15px', color: '#1a1a1a', fontWeight: 500 }}>
          Drop your PDF here...
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <p style={{ margin: 0, fontSize: '15px', color: '#333', fontWeight: 500 }}>
            Drag & drop your PDF here, or click to browse
          </p>
          <span style={{ fontSize: '12px', color: '#888' }}>
            Supports PDF up to 50MB
          </span>
        </div>
      )}
    </div>
  );
}
