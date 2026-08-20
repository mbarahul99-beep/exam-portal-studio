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

function formatTabularLaTeXToHtml(text: string): string {
  if (!text || !text.includes('\\begin{tabular}')) return text;

  try {
    const startIdx = text.indexOf('\\begin{tabular}');
    const endIdx = text.indexOf('\\end{tabular}');
    if (startIdx === -1 || endIdx === -1) return text;

    const beforeTabular = text.substring(0, startIdx).trim();
    const afterTabular = text.substring(endIdx + 13).trim();
    const tabularBody = text.substring(startIdx, endIdx);

    // Clean up tabular commands
    let body = tabularBody
      .replace(/\\begin\{tabular\}[^]*?\}/g, '') // remove \begin{tabular}{...}
      .replace(/\\hline/g, '')                    // remove \hline
      .trim();

    // Normalize row endings: Replace double backslashes with newline,
    // and single backslash row endings (followed by space, \hline or markers) with newline.
    let normalized = body
      .replace(/\\\\/g, '\n')
      .replace(/\\(?=\s*(?:\\hline|\n|\r|$))/g, '\n');

    // Split rows
    const rows = normalized.split('\n');
    const tableLines: string[] = [];

    for (let row of rows) {
      row = row.trim();
      if (!row) continue;

      // Split cells by ampersand &
      const cells = row.split('&').map(c => {
        let val = c.trim();
        // Remove LaTeX formatting
        val = val.replace(/\\textbf\{([^]*?)\}/g, '$1');
        val = val.replace(/\\text\{([^]*?)\}/g, '$1');
        val = val.replace(/\\multicolumn\{\d+\}\{[^]*?\}\{([^]*?)\}/g, '$1');
        return val.trim();
      }).filter(c => c.length > 0);

      if (cells.length === 0) continue;

      // Join cells with simple spaces and pipes
      if (cells.length === 4) {
        const left = `${cells[0]} ${cells[1]}`.trim();
        const right = `${cells[2]} ${cells[3]}`.trim();
        tableLines.push(`${left}   |   ${right}`);
      } else if (cells.length === 2) {
        tableLines.push(`${cells[0]}   |   ${cells[1]}`);
      } else {
        tableLines.push(cells.join('   |   '));
      }
    }

    const simpleTableText = tableLines.join('\n');

    // Render as a very clean, border-free and simple styled div
    const simpleHtml = `
<div style="font-family: monospace; font-size: 0.9rem; margin: 14px 0; padding: 10px 14px; background-color: #fafafa; border-left: 3px solid #cbd5e1; white-space: pre-wrap; line-height: 1.6; color: #1e293b; text-align: left;">
${simpleTableText}
</div>
    `.trim();

    return `${beforeTabular}\n${simpleHtml}\n${afterTabular}`.trim();
  } catch (err) {
    console.warn("Failed to format LaTeX tabular to simple text:", err);
    return text;
  }
}

export const MathRenderer: React.FC<MathRendererProps> = ({ text, style }) => {
  if (!text || typeof text !== 'string') return null;

  // Unescape literal \n character strings (backslash followed by n)
  let processedText = text
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r');

  if (processedText.includes('\\begin{tabular}')) {
    processedText = formatTabularLaTeXToHtml(processedText);
  }

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
