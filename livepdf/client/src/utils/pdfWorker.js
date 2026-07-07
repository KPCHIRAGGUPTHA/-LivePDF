import { pdfjs } from 'react-pdf';

// Use the CDN-hosted worker matching the installed pdfjs-dist version
pdfjs.GlobalWorkerOptions.workerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
