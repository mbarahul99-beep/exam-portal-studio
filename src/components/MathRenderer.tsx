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
  if (!text) return null;

  if (!window.katex || (!text.includes('$') && !text.includes('$$'))) {
    return <span style={style} dangerouslySetInnerHTML={{ __html: text }} />;
  }

  try {
    const parts: React.ReactNode[] = [];
    let currentIdx = 0;

    while (currentIdx < text.length) {
      const blockStart = text.indexOf('$$', currentIdx);
      const inlineStart = text.indexOf('$', currentIdx);

      if (blockStart !== -1 && (inlineStart === -1 || blockStart <= inlineStart)) {
        if (blockStart > currentIdx) {
          parts.push(<span key={`txt-${currentIdx}`} dangerouslySetInnerHTML={{ __html: text.substring(currentIdx, blockStart) }} />);
        }
        
        const blockEnd = text.indexOf('$$', blockStart + 2);
        if (blockEnd === -1) {
          parts.push(<span key={`txt-${blockStart}`} dangerouslySetInnerHTML={{ __html: text.substring(blockStart) }} />);
          break;
        }

        const math = text.substring(blockStart + 2, blockEnd);
        try {
          const html = window.katex.renderToString(math, { displayMode: true, throwOnError: false });
          parts.push(<div key={`math-block-${blockStart}`} dangerouslySetInnerHTML={{ __html: html }} style={{ margin: '8px 0' }} />);
        } catch (e) {
          parts.push(<code key={`err-block-${blockStart}`}>$${math}$$</code>);
        }
        currentIdx = blockEnd + 2;
      } else if (inlineStart !== -1) {
        if (inlineStart > currentIdx) {
          parts.push(<span key={`txt-${currentIdx}`} dangerouslySetInnerHTML={{ __html: text.substring(currentIdx, inlineStart) }} />);
        }

        const inlineEnd = text.indexOf('$', inlineStart + 1);
        if (inlineEnd === -1) {
          parts.push(<span key={`txt-${inlineStart}`} dangerouslySetInnerHTML={{ __html: text.substring(inlineStart) }} />);
          break;
        }

        const math = text.substring(inlineStart + 1, inlineEnd);
        try {
          const html = window.katex.renderToString(math, { displayMode: false, throwOnError: false });
          parts.push(<span key={`math-inline-${inlineStart}`} dangerouslySetInnerHTML={{ __html: html }} />);
        } catch (e) {
          parts.push(<code key={`err-inline-${inlineStart}`}>${math}$</code>);
        }
        currentIdx = inlineEnd + 1;
      } else {
        parts.push(<span key={`txt-${currentIdx}`} dangerouslySetInnerHTML={{ __html: text.substring(currentIdx) }} />);
        break;
      }
    }

    return <span style={{ ...style, display: 'inline' }}>{parts}</span>;
  } catch (err) {
    console.error("Failed to render math:", err);
    return <span style={style} dangerouslySetInnerHTML={{ __html: text }} />;
  }
};
