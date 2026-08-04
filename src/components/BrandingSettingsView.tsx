import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { 
  Sliders, 
  Save, 
  RotateCcw, 
  CheckCircle, 
  Image, 
  Eye, 
  ShieldCheck
} from 'lucide-react';

export interface GeneralCustomSettings {
  // App header sizing
  logoHeight: number;
  logoNameHeight: number;
  
  // PDF Report branding sizes
  pdfLogoHeight: number;
  pdfLogoNameHeight: number;
  pdfTitleFontSize: number;
  pdfAddressFontSize: number;
  pdfContactFontSize: number;

  // Biometrics
  enableLivenessCheck: boolean;
  faceMatchThreshold: number;
}

export const DEFAULT_GENERAL_SETTINGS: GeneralCustomSettings = {
  logoHeight: 42,
  logoNameHeight: 38,
  pdfLogoHeight: 126,
  pdfLogoNameHeight: 78,
  pdfTitleFontSize: 13,
  pdfAddressFontSize: 10,
  pdfContactFontSize: 10,
  enableLivenessCheck: true,
  faceMatchThreshold: 0.70
};

export const BrandingSettingsView: React.FC = () => {
  const [settings, setSettings] = useState<GeneralCustomSettings>(DEFAULT_GENERAL_SETTINGS);
  const [fullRawSettings, setFullRawSettings] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Load saved settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const storedJson = localStorage.getItem('omr_custom_settings');
        if (storedJson) {
          const parsed = JSON.parse(storedJson);
          setFullRawSettings(parsed);
          setSettings({ ...DEFAULT_GENERAL_SETTINGS, ...parsed });
          return;
        }

        // Fallback to db.settings
        const record = await db.settings.where('key').equals('omr_custom_settings').first();
        if (record && record.value) {
          const parsed = JSON.parse(record.value);
          setFullRawSettings(parsed);
          setSettings({ ...DEFAULT_GENERAL_SETTINGS, ...parsed });
        }
      } catch (err) {
        console.warn("Error loading custom branding settings:", err);
      }
    };
    loadSettings();
  }, []);

  const handleChange = (field: keyof GeneralCustomSettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      // Merge with existing full settings to avoid wiping out OMR field titles
      const merged = { ...fullRawSettings, ...settings };
      const jsonStr = JSON.stringify(merged);
      localStorage.setItem('omr_custom_settings', jsonStr);

      const record = await db.settings.where('key').equals('omr_custom_settings').first();
      if (record) {
        await db.settings.update(record.id!, { value: jsonStr });
      } else {
        await db.settings.add({ key: 'omr_custom_settings', value: jsonStr });
      }

      // Sync settings to cloud MySQL database
      try {
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ omr_custom_settings: jsonStr })
        });
      } catch (cloudErr) {
        console.warn("Failed to sync branding settings to cloud:", cloudErr);
      }

      setSavedSuccess(true);
      window.dispatchEvent(new Event('omr_settings_updated'));
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      alert(`Error saving branding settings: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm('Reset general branding and security configurations to defaults?')) {
      setSettings(DEFAULT_GENERAL_SETTINGS);
    }
  };
  return (
    <div className="branding-settings-portal animate-fade-in" style={{ padding: '16px', paddingBottom: '40px', maxWidth: '1000px', margin: '0 auto' }}>
      <style>{`
        .branding-settings-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 20px;
        }
        @media (min-width: 768px) {
          .branding-settings-grid {
            grid-template-columns: 1fr 1fr;
          }
        }
        .settings-header-banner {
          background: #ffffff;
          padding: 16px 20px;
          border-radius: 14px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 2px 10px rgba(0,0,0,0.03);
          margin-bottom: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
        }
        @media (max-width: 640px) {
          .settings-header-banner {
            flex-direction: column;
            align-items: stretch;
            text-align: center;
          }
          .settings-header-banner > div:first-child > div {
            justify-content: center;
          }
          .settings-header-buttons {
            width: 100%;
            justify-content: center;
            display: flex;
            gap: 10px;
          }
          .settings-header-buttons > button {
            flex: 1;
            justify-content: center;
          }
        }
      `}</style>
      
      {/* Header Banner */}
      <div className="settings-header-banner">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={22} color="#dc0045" />
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
              General Branding & Security Settings
            </h2>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
            Configure logo sizes, PDF report typography, and face recognition similarity constraints.
          </p>
        </div>

        <div className="settings-header-buttons" style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            onClick={handleReset}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              color: '#475569',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <RotateCcw size={15} /> Reset
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #dc0045, #b90038)',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(220,0,69,0.3)'
            }}
          >
            {savedSuccess ? <CheckCircle size={16} /> : <Save size={16} />}
            {savedSuccess ? 'Saved!' : 'Save Configurations'}
          </button>
        </div>
      </div>

      <form onSubmit={handleSave} className="branding-settings-grid">
        
        {/* Left Column: Branding Settings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Section A: App Header Branding */}
          <div style={{ background: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: '#dc0045' }}>
              <Image size={18} />
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800 }}>App Header Branding Sizes</h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                    App Graphic Logo Height
                  </label>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#dc0045', background: '#fff1f2', padding: '2px 8px', borderRadius: '10px' }}>
                    {settings.logoHeight}px
                  </span>
                </div>
                <input
                  type="range"
                  min="24"
                  max="90"
                  step="1"
                  value={settings.logoHeight}
                  onChange={(e) => handleChange('logoHeight', parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: '#dc0045', cursor: 'pointer' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                    App Institute Name Logo Height
                  </label>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#dc0045', background: '#fff1f2', padding: '2px 8px', borderRadius: '10px' }}>
                    {settings.logoNameHeight}px
                  </span>
                </div>
                <input
                  type="range"
                  min="16"
                  max="70"
                  step="1"
                  value={settings.logoNameHeight}
                  onChange={(e) => handleChange('logoNameHeight', parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: '#dc0045', cursor: 'pointer' }}
                />
              </div>
            </div>
          </div>

          {/* Section B: PDF Report Customizer */}
          <div style={{ background: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: '#2563eb' }}>
              <Eye size={18} />
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800 }}>PDF Report Header Sizes</h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                    PDF Graphic Logo Height
                  </label>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: '10px' }}>
                    {settings.pdfLogoHeight}px
                  </span>
                </div>
                <input
                  type="range"
                  min="40"
                  max="200"
                  step="2"
                  value={settings.pdfLogoHeight}
                  onChange={(e) => handleChange('pdfLogoHeight', parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: '#2563eb', cursor: 'pointer' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                    PDF Institute Name Logo Height
                  </label>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: '10px' }}>
                    {settings.pdfLogoNameHeight}px
                  </span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="150"
                  step="2"
                  value={settings.pdfLogoNameHeight}
                  onChange={(e) => handleChange('pdfLogoNameHeight', parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: '#2563eb', cursor: 'pointer' }}
                />
              </div>

              <div style={{ borderTop: '1px solid #f1f5f9', marginTop: '10px', paddingTop: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                    PDF Header Title Font Size
                  </label>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: '10px' }}>
                    {settings.pdfTitleFontSize}px
                  </span>
                </div>
                <input
                  type="range"
                  min="8"
                  max="24"
                  step="0.5"
                  value={settings.pdfTitleFontSize}
                  onChange={(e) => handleChange('pdfTitleFontSize', parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: '#2563eb', cursor: 'pointer' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                    PDF Address Font Size
                  </label>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: '10px' }}>
                    {settings.pdfAddressFontSize}px
                  </span>
                </div>
                <input
                  type="range"
                  min="6"
                  max="18"
                  step="0.5"
                  value={settings.pdfAddressFontSize}
                  onChange={(e) => handleChange('pdfAddressFontSize', parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: '#2563eb', cursor: 'pointer' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                    PDF Contact Info Font Size
                  </label>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: '10px' }}>
                    {settings.pdfContactFontSize}px
                  </span>
                </div>
                <input
                  type="range"
                  min="6"
                  max="18"
                  step="0.5"
                  value={settings.pdfContactFontSize}
                  onChange={(e) => handleChange('pdfContactFontSize', parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: '#2563eb', cursor: 'pointer' }}
                />
              </div>
            </div>
          </div>
          
        </div>

        {/* Right Column: Security and Preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Section C: Biometrics & Security */}
          <div style={{ background: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: '#8b5cf6' }}>
              <ShieldCheck size={18} />
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800 }}>Biometric Security Settings</h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div style={{ flex: 1, marginRight: '10px' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a', display: 'block' }}>Require Eye-Blink Verification</span>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>Ensures students are actively present during camera checks</p>
                </div>
                
                <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={settings.enableLivenessCheck}
                    onChange={(e) => handleChange('enableLivenessCheck', e.target.checked)}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span style={{
                    position: 'absolute',
                    cursor: 'pointer',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: settings.enableLivenessCheck ? '#8b5cf6' : '#cbd5e1',
                    borderRadius: '24px',
                    transition: '0.3s'
                  }}>
                    <span style={{
                      position: 'absolute',
                      content: '""',
                      height: '18px',
                      width: '18px',
                      left: settings.enableLivenessCheck ? '22px' : '3px',
                      bottom: '3px',
                      backgroundColor: 'white',
                      borderRadius: '50%',
                      transition: '0.3s'
                    }} />
                  </span>
                </label>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                    Face Match Threshold
                  </label>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#8b5cf6', background: '#f5f3ff', padding: '2px 8px', borderRadius: '10px' }}>
                    {settings.faceMatchThreshold} ({settings.faceMatchThreshold >= 0.80 ? 'Strict' : (settings.faceMatchThreshold >= 0.70 ? 'Standard' : 'Loose')})
                  </span>
                </div>
                <input
                  type="range"
                  min="0.60"
                  max="0.88"
                  step="0.01"
                  value={settings.faceMatchThreshold}
                  onChange={(e) => handleChange('faceMatchThreshold', parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: '#8b5cf6', cursor: 'pointer' }}
                />
              </div>
            </div>
          </div>

          {/* Section D: PDF Live Preview card */}
          <div style={{ background: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 14px rgba(0,0,0,0.04)' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a', display: 'block', marginBottom: '12px' }}>⚡ Live PDF Report Header Preview</span>
            
            <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '12px', background: '#ffffff', color: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', overflowX: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginBottom: `-${settings.pdfLogoHeight * 0.35 * 0.35}px` }}>
                <img src="/logo.png" alt="Logo" style={{ height: `${settings.pdfLogoHeight * 0.35}px`, width: 'auto', objectFit: 'contain', marginRight: `-${settings.pdfLogoHeight * 0.35 * 0.15}px` }} />
                <img src="/logo_name.png" alt="Logo Name" style={{ height: `${settings.pdfLogoNameHeight * 0.35}px`, width: 'auto', objectFit: 'contain' }} />
              </div>
              
              <div style={{ textAlign: 'center', color: '#1e293b', fontFamily: 'sans-serif' }}>
                <div style={{ fontSize: `${settings.pdfTitleFontSize * 0.75}px`, fontWeight: 800, color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
                  Institute of Medical Entrance Exams (NEET) & IIT-JEE Coaching
                </div>
                <div style={{ fontSize: `${settings.pdfAddressFontSize * 0.75}px`, fontWeight: 600, color: '#475569', marginBottom: '1px' }}>
                  #1257, Urban State, Near HUDA Ground, Jind- 126102 (Haryana)
                </div>
                <div style={{ fontSize: `${settings.pdfContactFontSize * 0.75}px`, fontWeight: 600, color: '#475569' }}>
                  Call : 9467752374, Email: instituteapexjind@gmail.com
                </div>
              </div>
            </div>
          </div>

        </div>

      </form>
    </div>
  );
};
