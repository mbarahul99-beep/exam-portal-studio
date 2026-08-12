import React, { useState, useEffect } from 'react';
import { Download, X, Share, PlusSquare } from 'lucide-react';

export function isAppInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || 
         (navigator as any).standalone === true ||
         document.referrer.includes('android-app://');
}

interface InstallPWAPromptProps {
  forceShow?: boolean;
  onClose?: () => void;
}

export const InstallPWAPrompt: React.FC<InstallPWAPromptProps> = ({ forceShow = false, onClose }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already running as installed PWA app
    const inStandaloneMode = isAppInstalled();
    setIsStandalone(inStandaloneMode);

    if (inStandaloneMode) {
      setShowPrompt(false);
      return;
    }

    // Check iOS Safari
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // Check if the prompt was already globally captured by index.html before React mounted
    const globallyCapturedPrompt = (window as any).deferredAppInstallPrompt;
    if (globallyCapturedPrompt) {
      setDeferredPrompt(globallyCapturedPrompt);
      if (!inStandaloneMode) {
        setShowPrompt(true);
      }
    }

    // Listen to custom event dispatched by index.html when beforeinstallprompt fires
    const handleCustomPromptAvailable = (e: Event) => {
      const promptEvent = (e as CustomEvent).detail;
      setDeferredPrompt(promptEvent);
      if (!inStandaloneMode) {
        setShowPrompt(true);
      }
    };

    // Listen for standard browser event (fallback)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (!inStandaloneMode) {
        setShowPrompt(true);
      }
    };

    window.addEventListener('pwa-prompt-available', handleCustomPromptAvailable as EventListener);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Auto-show prompt on browser after 500ms delay if app is not added to home screen
    const timer = setTimeout(() => {
      if (!inStandaloneMode) {
        setShowPrompt(true);
      }
    }, 500);

    return () => {
      window.removeEventListener('pwa-prompt-available', handleCustomPromptAvailable as EventListener);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      clearTimeout(timer);
    };
  }, [forceShow]);

  const handleInstallClick = async () => {
    const activePrompt = deferredPrompt || (window as any).deferredAppInstallPrompt;
    if (activePrompt) {
      activePrompt.prompt();
      const { outcome } = await activePrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPrompt(false);
        (window as any).deferredAppInstallPrompt = null;
      }
      setDeferredPrompt(null);
    } else {
      alert("To install APEX on your home screen:\n\n1. Open browser menu (3 dots or Share button)\n2. Tap 'Add to Home screen' or 'Install App'");
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    if (onClose) onClose();
  };

  if (isStandalone) return null;
  if (!showPrompt && !forceShow) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 32px)',
        maxWidth: '460px',
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(6, 95, 70, 0.2)',
        zIndex: 9999,
        padding: '20px',
        boxSizing: 'border-box',
        animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* APEX Dark Green Logo with White Text */}
          <div 
            style={{ 
              width: '52px', 
              height: '52px', 
              borderRadius: '12px', 
              backgroundColor: '#065f46', 
              color: '#ffffff', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: '0.88rem',
              letterSpacing: '0.5px',
              boxShadow: '0 4px 12px rgba(6, 95, 70, 0.35)',
              flexShrink: 0
            }}
          >
            APEX
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
              Install APEX App
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
              Add to Home Screen for 1-tap access
            </p>
          </div>
        </div>

        <button 
          onClick={handleDismiss}
          style={{
            background: '#f1f5f9',
            border: 'none',
            borderRadius: '50%',
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#64748b'
          }}
          title="Close"
        >
          <X size={16} />
        </button>
      </div>

      <div style={{ margin: '12px 0', fontSize: '0.82rem', color: '#334155', lineHeight: '1.45' }}>
        Install the official <strong>APEX INSTITUTE</strong> app on your device for instant 1-tap launch and full-screen experience.
      </div>

      {/* iOS Safari Instruction Helper */}
      {isIOS && !deferredPrompt && (
        <div style={{ 
          background: '#ecfdf5', 
          border: '1px solid #a7f3d0', 
          borderRadius: '10px', 
          padding: '10px 12px', 
          marginBottom: '14px',
          fontSize: '0.78rem',
          color: '#065f46',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
            <Share size={14} /> To install APEX on iPhone / iPad:
          </div>
          <div>1. Tap the <strong>Share</strong> button at the bottom of Safari.</div>
          <div>2. Scroll down & select <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}><PlusSquare size={12} /> Add to Home Screen</strong>.</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
        <button
          onClick={handleInstallClick}
          style={{
            flex: 1,
            padding: '11px 16px',
            backgroundColor: '#065f46',
            color: '#ffffff',
            border: 'none',
            borderRadius: '10px',
            fontSize: '0.88rem',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 4px 12px rgba(6, 95, 70, 0.35)',
            transition: 'all 0.15s ease'
          }}
        >
          <Download size={16} /> Download & Install
        </button>

        <button
          onClick={handleDismiss}
          style={{
            padding: '11px 16px',
            backgroundColor: '#f1f5f9',
            color: '#475569',
            border: 'none',
            borderRadius: '10px',
            fontSize: '0.88rem',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          Maybe Later
        </button>
      </div>

      <style>{`
        @keyframes slideUp {
          from {
            transform: translate(-50%, 100%);
            opacity: 0;
          }
          to {
            transform: translate(-50%, 0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};
