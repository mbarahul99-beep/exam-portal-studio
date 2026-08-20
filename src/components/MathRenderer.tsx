import React from 'react';

declare global {
  interface Window {
    katex?: {
      renderToString: (tex: string, options?: any) => string;
    };
  }
}

interface MathRendererProps {
  text: string;
  style?: React.CSSProperties;
}

export const MathRenderer: React.FC<MathRendererProps> = ({ text, style }) => {
  if (!text || typeof text !== 'string') return null;

  // Unescape literal \n character strings (backslash followed by n)
  let processedText = text
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r');

  if (processedText.startsWith('data:image/') || processedText.startsWith('http://') || processedText.startsWith('https://') || processedText.includes('base64,')) {
    const isBase64 = processedText.startsWith('data:image/') || processedText.includes('base64,');
    if (isBase64 || processedText.endsWith('.png') || processedText.endsWith('.jpg') || processedText.endsWith('.jpeg') || processedText.endsWith('.gif') || processedText.endsWith('.webp')) {
      return (
        <img 
          src={processedText} 
          alt="Option Diagram" 
          style={{ 
            maxHeight: '120px', 
            maxWidth: '100%', 
            objectFit: 'contain', 
            display: 'inline-block', 
            verticalAlign: 'middle',
            margin: '4px 0', 
            borderRadius: '4px', 
            border: '1px solid #edf2f7', 
            background: '#fff', 
            padding: '2px' 
          }} 
        />
      );
    }
  }

  if (!window.katex || (!processedText.includes('$') && !processedText.includes('$$'))) {
    return <span style={{ ...style, whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: processedText }} />;
  }

  try {
    const parts: React.ReactNode[] = [];
    let currentIdx = 0;

    while (currentIdx < processedText.length) {
      const blockStart = processedText.indexOf('$$', currentIdx);
      const inlineStart = processedText.indexOf('$', currentIdx);

      if (blockStart !== -1 && (inlineStart === -1 || blockStart <= inlineStart)) {
        if (blockStart > currentIdx) {
          parts.push(<span key={`txt-${currentIdx}`} dangerouslySetInnerHTML={{ __html: processedText.substring(currentIdx, blockStart) }} />);
        }
        
        const blockEnd = processedText.indexOf('$$', blockStart + 2);
        if (blockEnd === -1) {
          parts.push(<span key={`txt-${blockStart}`} dangerouslySetInnerHTML={{ __html: processedText.substring(blockStart) }} />);
          break;
        }

        const math = processedText.substring(blockStart + 2, blockEnd);
        try {
          const html = window.katex.renderToString(math, { displayMode: true, throwOnError: false });
          parts.push(<div key={`math-block-${blockStart}`} dangerouslySetInnerHTML={{ __html: html }} style={{ margin: '8px 0' }} />);
        } catch (e) {
          parts.push(<code key={`err-block-${blockStart}`}>$${math}$$</code>);
        }
        currentIdx = blockEnd + 2;
      } else if (inlineStart !== -1) {
        if (inlineStart > currentIdx) {
          parts.push(<span key={`txt-${currentIdx}`} dangerouslySetInnerHTML={{ __html: processedText.substring(currentIdx, inlineStart) }} />);
        }

        const inlineEnd = processedText.indexOf('$', inlineStart + 1);
        if (inlineEnd === -1) {
          parts.push(<span key={`txt-${inlineStart}`} dangerouslySetInnerHTML={{ __html: processedText.substring(inlineStart) }} />);
          break;
        }

        const math = processedText.substring(inlineStart + 1, inlineEnd);
        try {
          const html = window.katex.renderToString(math, { displayMode: false, throwOnError: false });
          parts.push(<span key={`math-inline-${inlineStart}`} dangerouslySetInnerHTML={{ __html: html }} />);
        } catch (e) {
          parts.push(<code key={`err-inline-${inlineStart}`}>${math}$</code>);
        }
        currentIdx = inlineEnd + 1;
      } else {
        parts.push(<span key={`txt-${currentIdx}`} dangerouslySetInnerHTML={{ __html: processedText.substring(currentIdx) }} />);
        break;
      }
    }

    return <span style={{ ...style, display: 'inline', whiteSpace: 'pre-wrap' }}>{parts}</span>;
  } catch (err) {
    console.error("Failed to render math:", err);
    return <span style={{ ...style, whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: processedText }} />;
  }
};
