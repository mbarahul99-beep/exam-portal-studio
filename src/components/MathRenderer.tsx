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
    return <span style={style}>{text}</span>;
  }

  try {
    const parts: React.ReactNode[] = [];
    let currentIdx = 0;

    while (currentIdx < text.length) {
      const blockStart = text.indexOf('$$', currentIdx);
      const inlineStart = text.indexOf('$', currentIdx);

      if (blockStart !== -1 && (inlineStart === -1 || blockStart <= inlineStart)) {
        if (blockStart > currentIdx) {
          parts.push(<span key={`txt-${currentIdx}`}>{text.substring(currentIdx, blockStart)}</span>);
        }
        
        const blockEnd = text.indexOf('$$', blockStart + 2);
        if (blockEnd === -1) {
          parts.push(<span key={`txt-${blockStart}`}>{text.substring(blockStart)}</span>);
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
          parts.push(<span key={`txt-${currentIdx}`}>{text.substring(currentIdx, inlineStart)}</span>);
        }

        const inlineEnd = text.indexOf('$', inlineStart + 1);
        if (inlineEnd === -1) {
          parts.push(<span key={`txt-${inlineStart}`}>{text.substring(inlineStart)}</span>);
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
        parts.push(<span key={`txt-${currentIdx}`}>{text.substring(currentIdx)}</span>);
        break;
      }
    }

    return <span style={{ ...style, display: 'inline' }}>{parts}</span>;
  } catch (err) {
    console.error("Failed to render math:", err);
    return <span style={style}>{text}</span>;
  }
};
