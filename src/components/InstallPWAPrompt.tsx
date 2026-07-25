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

    // Listen for browser install prompt event (Android / Desktop Chrome / Edge)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Auto show prompt if user hasn't dismissed it in this session
      const dismissed = sessionStorage.getItem('apex_pwa_prompt_dismissed');
      if (!dismissed || forceShow) {
        setShowPrompt(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Auto-show prompt on mobile browsers after 1.5s delay if not dismissed
    const timer = setTimeout(() => {
      const dismissed = sessionStorage.getItem('apex_pwa_prompt_dismissed');
      if ((!dismissed && !inStandaloneMode) || forceShow) {
        setShowPrompt(true);
      }
    }, 1500);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      clearTimeout(timer);
    };
  }, [forceShow]);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    } else {
      // Fallback for browsers that don't support beforeinstallprompt directly
      alert("To install this app on your device:\n\n1. Open browser menu (3 dots or Share button)\n2. Tap 'Add to Home screen' or 'Install App'");
    }
  };

  const handleDismiss = () => {
    sessionStorage.setItem('apex_pwa_prompt_dismissed', 'true');
    setShowPrompt(false);
    if (onClose) onClose();
  };

  if (isStandalone && !forceShow) return null;
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
        boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(220, 0, 69, 0.15)',
        zIndex: 9999,
        padding: '20px',
        boxSizing: 'border-box',
        animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div 
            style={{ 
              width: '44px', 
              height: '44px', 
              borderRadius: '12px', 
              backgroundColor: '#dc0045', 
              color: '#ffffff', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: '1.4rem',
              boxShadow: '0 4px 12px rgba(220, 0, 69, 0.3)'
            }}
          >
            ⚡
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
              Install APEX App
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
              Fast 1-tap access on your home screen
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
        Install the official <strong>Apex Exam & OMR Portal</strong> app on your device for instant offline access and full-screen experience.
      </div>

      {/* iOS Safari Instruction Helper */}
      {isIOS && !deferredPrompt && (
        <div style={{ 
          background: '#fff5f7', 
          border: '1px solid #fecdd3', 
          borderRadius: '10px', 
          padding: '10px 12px', 
          marginBottom: '14px',
          fontSize: '0.78rem',
          color: '#9f1239',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
            <Share size={14} /> To install on iPhone / iPad:
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
            padding: '10px 16px',
            backgroundColor: '#dc0045',
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
            boxShadow: '0 4px 12px rgba(220, 0, 69, 0.3)',
            transition: 'all 0.15s ease'
          }}
        >
          <Download size={16} /> Download & Install
        </button>

        <button
          onClick={handleDismiss}
          style={{
            padding: '10px 16px',
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
