import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { 
  Sliders, 
  Save, 
  RotateCcw, 
  CheckCircle, 
  Type, 
  Info,
  Building2
} from 'lucide-react';

export interface OmrCustomSettings {
  instituteName: string;
  subtitleText: string;
  rollNoBoxTitle: string;
  bookletNoBoxTitle: string;
  bookletCodeBoxTitle: string;
  candidateNameLabel: string;
  fatherNameLabel: string;
  showSignatureBoxes: boolean;
  studentSignatureLabel: string;
  invigilatorSignatureLabel: string;
  disclaimerText: string;
  faceMatchThreshold: number;
  enableLivenessCheck: boolean;
  logoHeight: number;
  logoNameHeight: number;
  headerSubtitleFontSize: number;
  headerTitleFontSize: number;
  headerCandidateFontSize: number;
  omrLogoHeight: number;
  omrInstitutionFontSize: number;
  headerInstitutionFontFamily: string;
  headerGeneralFontFamily: string;
}

export const DEFAULT_OMR_SETTINGS: OmrCustomSettings = {
  instituteName: 'Institute APEX',
  subtitleText: 'OMR ANSWER SHEET',
  rollNoBoxTitle: 'ROLL NO.',
  bookletNoBoxTitle: 'TEST BOOKLET NO.',
  bookletCodeBoxTitle: 'BOOKLET CODE',
  candidateNameLabel: "CANDIDATE'S NAME (IN CAPITAL LETTERS)",
  fatherNameLabel: "FATHER'S NAME (IN CAPITAL LETTERS)",
  showSignatureBoxes: true,
  studentSignatureLabel: "STUDENT'S SIGNATURE",
  invigilatorSignatureLabel: "INVIGILATOR'S SIGNATURE",
  disclaimerText: '★ DO NOT FOLD OR MUTILATE THIS DOCUMENT. ORIGINAL ANSWER SHEET ★',
  faceMatchThreshold: 0.70,
  enableLivenessCheck: true,
  logoHeight: 42,
  logoNameHeight: 38,
  headerSubtitleFontSize: 8.5,
  headerTitleFontSize: 11,
  headerCandidateFontSize: 7.5,
  omrLogoHeight: 42,
  omrInstitutionFontSize: 18,
  headerInstitutionFontFamily: "'Titan One', sans-serif",
  headerGeneralFontFamily: "'Outfit', sans-serif"
};

export const OmrSettingsView: React.FC = () => {
  const [settings, setSettings] = useState<OmrCustomSettings>(DEFAULT_OMR_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Load saved OMR settings from IndexedDB / LocalStorage
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const storedJson = localStorage.getItem('omr_custom_settings');
        if (storedJson) {
          const parsed = JSON.parse(storedJson);
          setSettings({ ...DEFAULT_OMR_SETTINGS, ...parsed });
          return;
        }

        // Fallback to IndexedDB db.settings
        const record = await db.settings.where('key').equals('omr_custom_settings').first();
        if (record && record.value) {
          const parsed = JSON.parse(record.value);
          setSettings({ ...DEFAULT_OMR_SETTINGS, ...parsed });
        }
      } catch (err) {
        console.warn("Error loading custom OMR settings:", err);
      }
    };
    loadSettings();
  }, []);

  const handleChange = (field: keyof OmrCustomSettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const jsonStr = JSON.stringify(settings);
      localStorage.setItem('omr_custom_settings', jsonStr);

      const record = await db.settings.where('key').equals('omr_custom_settings').first();
      if (record) {
        await db.settings.update(record.id!, { value: jsonStr });
      } else {
        await db.settings.add({ key: 'omr_custom_settings', value: jsonStr });
      }

      setSavedSuccess(true);
      window.dispatchEvent(new Event('omr_settings_updated'));
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      alert(`Error saving OMR settings: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm('Reset all OMR sheet headers and field labels to default APEX format?')) {
      setSettings(DEFAULT_OMR_SETTINGS);
      localStorage.removeItem('omr_custom_settings');
      alert('Reset to default settings complete.');
    }
  };

  return (
    <div className="omr-settings-portal animate-fade-in" style={{ paddingBottom: '40px' }}>
      
      {/* Header Banner */}
      <div style={{ background: '#ffffff', padding: '16px 20px', borderRadius: '14px', border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={22} color="#dc0045" />
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
              OMR Sheet Printing & Header Settings
            </h2>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
            Customize all printable OMR sheet headings, titles, candidate field labels, and signature boxes.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
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
            <RotateCcw size={15} /> Reset Defaults
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
            {savedSuccess ? 'Saved!' : 'Save OMR Settings'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        
        {/* EDITABLE FORM CONTROLS */}
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* SECTION 1: Institute & Exam Headings */}
          <div style={{ background: '#ffffff', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', color: '#dc0045' }}>
              <Building2 size={18} />
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800 }}>1. Institute & Main Headings</h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Institute / Coaching Center Name
                </label>
                <input
                  type="text"
                  value={settings.instituteName}
                  onChange={(e) => handleChange('instituteName', e.target.value)}
                  placeholder="e.g. APEX INSTITUTE, JIND"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontWeight: 600 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Sheet Subtitle Text
                </label>
                <input
                  type="text"
                  value={settings.subtitleText}
                  onChange={(e) => handleChange('subtitleText', e.target.value)}
                  placeholder="e.g. OMR ANSWER SHEET"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: Identification & Field Box Titles */}
          <div style={{ background: '#ffffff', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', color: '#dc0045' }}>
              <Type size={18} />
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800 }}>2. Identification & Header Box Titles</h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Roll No Box Header Title
                </label>
                <input
                  type="text"
                  value={settings.rollNoBoxTitle}
                  onChange={(e) => handleChange('rollNoBoxTitle', e.target.value)}
                  placeholder="e.g. ROLL NO."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                />
              </div>



              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Candidate Name Field Label
                </label>
                <input
                  type="text"
                  value={settings.candidateNameLabel}
                  onChange={(e) => handleChange('candidateNameLabel', e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Father's Name Field Label
                </label>
                <input
                  type="text"
                  value={settings.fatherNameLabel}
                  onChange={(e) => handleChange('fatherNameLabel', e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Bottom Disclaimer Notice
                </label>
                <input
                  type="text"
                  value={settings.disclaimerText}
                  onChange={(e) => handleChange('disclaimerText', e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                />
              </div>
            </div>
          </div>

          {/* SECTION 3: OMR Header Font Sizes */}
          <div style={{ background: '#ffffff', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', color: '#dc0045' }}>
              <Sliders size={18} />
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800 }}>3. OMR Header Font Sizes</h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                    Subtitle Text Font Size (NEET & IIT-JEE Coaching banner)
                  </label>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#dc0045', background: '#fff1f2', padding: '2px 8px', borderRadius: '10px' }}>
                    {settings.headerSubtitleFontSize || 8.5}px
                  </span>
                </div>
                <input
                  type="range"
                  min="6"
                  max="16"
                  step="0.5"
                  value={settings.headerSubtitleFontSize || 8.5}
                  onChange={(e) => handleChange('headerSubtitleFontSize', parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: '#dc0045', cursor: 'pointer' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                    Class & Exam Title Font Size
                  </label>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#dc0045', background: '#fff1f2', padding: '2px 8px', borderRadius: '10px' }}>
                    {settings.headerTitleFontSize || 11}px
                  </span>
                </div>
                <input
                  type="range"
                  min="8"
                  max="20"
                  step="0.5"
                  value={settings.headerTitleFontSize || 11}
                  onChange={(e) => handleChange('headerTitleFontSize', parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: '#dc0045', cursor: 'pointer' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                    Candidate & Father Name Label Font Size
                  </label>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#dc0045', background: '#fff1f2', padding: '2px 8px', borderRadius: '10px' }}>
                    {settings.headerCandidateFontSize || 7.5}px
                  </span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="14"
                  step="0.5"
                  value={settings.headerCandidateFontSize || 7.5}
                  onChange={(e) => handleChange('headerCandidateFontSize', parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: '#dc0045', cursor: 'pointer' }}
                />
              </div>
            </div>
          </div>

          {/* SECTION 4: OMR Sheet Branding & Logo Sizes */}
          <div style={{ background: '#ffffff', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', color: '#dc0045' }}>
              <Sliders size={18} />
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800 }}>4. OMR Sheet Branding & Logo Sizes</h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                    OMR Sheet Graphic Logo Height
                  </label>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#dc0045', background: '#fff1f2', padding: '2px 8px', borderRadius: '10px' }}>
                    {settings.omrLogoHeight || 42}px
                  </span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="80"
                  step="1"
                  value={settings.omrLogoHeight || 42}
                  onChange={(e) => handleChange('omrLogoHeight', parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: '#dc0045', cursor: 'pointer' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                    OMR Sheet Institution Name Font Size (Texts)
                  </label>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#dc0045', background: '#fff1f2', padding: '2px 8px', borderRadius: '10px' }}>
                    {settings.omrInstitutionFontSize || 18}px
                  </span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="30"
                  step="0.5"
                  value={settings.omrInstitutionFontSize || 18}
                  onChange={(e) => handleChange('omrInstitutionFontSize', parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: '#dc0045', cursor: 'pointer' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  OMR Sheet Institution Name Font Family
                </label>
                <select
                  value={settings.headerInstitutionFontFamily || "'Titan One', sans-serif"}
                  onChange={(e) => handleChange('headerInstitutionFontFamily', e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem', cursor: 'pointer', background: '#fff' }}
                >
                  <option value="'Titan One', sans-serif">Titan One (Bold Blocky)</option>
                  <option value="'Outfit', sans-serif">Outfit (Modern Clean)</option>
                  <option value="'Poppins', sans-serif">Poppins (Sleek Geometric)</option>
                  <option value="'Montserrat', sans-serif">Montserrat (Geometric Sans)</option>
                  <option value="'Merriweather', serif">Merriweather (Premium Serif)</option>
                  <option value="'Playfair Display', serif">Playfair Display (Elegant Serif)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  OMR Sheet General Header Font Family (Subtitle & Info)
                </label>
                <select
                  value={settings.headerGeneralFontFamily || "'Outfit', sans-serif"}
                  onChange={(e) => handleChange('headerGeneralFontFamily', e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem', cursor: 'pointer', background: '#fff' }}
                >
                  <option value="'Outfit', sans-serif">Outfit (Modern Clean)</option>
                  <option value="'Inter', sans-serif">Inter (Tech Standard)</option>
                  <option value="'Poppins', sans-serif">Poppins (Geometric Round)</option>
                  <option value="'Roboto', sans-serif">Roboto (Clean Neutral)</option>
                  <option value="'Open Sans', sans-serif">Open Sans (Highly Readable)</option>
                </select>
              </div>
            </div>
          </div>

          {/* SECTION 5: Face Recognition & Biometric Liveness Settings */}
          <div style={{ background: '#ffffff', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', color: '#8b5cf6' }}>
              <Sliders size={18} />
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800 }}>5. Face Recognition & Liveness Settings</h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              {/* Liveness Check Toggle Switch */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div style={{ flex: 1, marginRight: '10px' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a', display: 'block' }}>Require Eye-Blink Liveness check</span>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>Unlocks scanner database entry only after an active blink is verified</p>
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

              {/* Threshold cosine similarity slider */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                    Face Match Similarity Threshold
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
                <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                  Higher values prevent false-positives but require more precise alignment. Standard recommended value: 0.70.
                </p>
              </div>
            </div>
          </div>

          {/* SECTION 6: App Header Branding Sizing */}
          <div style={{ background: '#ffffff', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', color: '#dc0045' }}>
              <Sliders size={18} />
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800 }}>6. App Header Branding Sizing</h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                    Graphic Logo Height (App Header Only)
                  </label>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#dc0045', background: '#fff1f2', padding: '2px 8px', borderRadius: '10px' }}>
                    {settings.logoHeight || 42}px
                  </span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="90"
                  step="1"
                  value={settings.logoHeight || 42}
                  onChange={(e) => handleChange('logoHeight', parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: '#dc0045', cursor: 'pointer' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                    Institute Name Logo Height (App Header Only)
                  </label>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#dc0045', background: '#fff1f2', padding: '2px 8px', borderRadius: '10px' }}>
                    {settings.logoNameHeight || 38}px
                  </span>
                </div>
                <input
                  type="range"
                  min="16"
                  max="70"
                  step="1"
                  value={settings.logoNameHeight || 38}
                  onChange={(e) => handleChange('logoNameHeight', parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: '#dc0045', cursor: 'pointer' }}
                />
                <p style={{ margin: '4px 0 0 0', fontSize: '0.72rem', color: '#64748b' }}>
                  Adjust these sliders to dynamically scale the logo and brand logo text in the app dashboard/report layouts.
                </p>
              </div>
            </div>
          </div>

        </form>

        {/* LIVE VISUAL PREVIEW CARD */}
        <div>
          <div style={{ position: 'sticky', top: '20px' }}>
            <div style={{ background: '#ffffff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 14px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>⚡ Live OMR Sheet Preview</span>
                <span style={{ fontSize: '0.75rem', color: '#dc0045', fontWeight: 700, background: '#fff1f2', padding: '2px 8px', borderRadius: '10px' }}>
                  OMR Anchors Locked
                </span>
              </div>

              {/* MINI OMR PREVIEW BOX */}
              <div style={{ border: '1px solid #dc0045', borderRadius: '6px', padding: '12px', background: '#ffffff', color: '#000', position: 'relative', fontSize: '0.75rem' }}>
                
                {/* 4 Black Corner Anchors Preview */}
                <div style={{ position: 'absolute', top: '4px', left: '4px', width: '8px', height: '8px', background: '#000' }} />
                <div style={{ position: 'absolute', top: '4px', right: '4px', width: '8px', height: '8px', background: '#000' }} />
                <div style={{ position: 'absolute', bottom: '4px', left: '4px', width: '8px', height: '8px', background: '#000' }} />
                <div style={{ position: 'absolute', bottom: '4px', right: '4px', width: '8px', height: '8px', background: '#000' }} />

                {/* Institute Logos & Text Preview */}
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', margin: '4px 0' }}>
                  <img 
                    src="/logo.png" 
                    alt="Logo" 
                    style={{ height: `${(settings.omrLogoHeight || 42) * 0.4}px`, width: 'auto', objectFit: 'contain' }} 
                  />
                  <span style={{
                    fontSize: `${(settings.omrInstitutionFontSize || 18) * 0.55}px`,
                    fontWeight: 900,
                    color: '#dc0045',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    fontFamily: settings.headerInstitutionFontFamily || "'Titan One', sans-serif"
                  }}>
                    {settings.instituteName || 'INSTITUTE APEX'}
                  </span>
                </div>

                <div style={{ textAlign: 'center', margin: '0 0 6px 0', fontFamily: settings.headerGeneralFontFamily || "'Outfit', sans-serif" }}>
                  <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#0f172a' }}>NEET 11TH JULY 1</div>
                  <span style={{ background: '#dc0045', color: '#fff', fontSize: '0.52rem', fontWeight: 800, padding: '1px 6px', borderRadius: '10px' }}>
                    {settings.subtitleText.toUpperCase() || 'OMR ANSWER SHEET'}
                  </span>
                </div>

                {/* Box Headers and Candidate Details side-by-side */}
                <div style={{ display: 'flex', gap: '8px', margin: '10px 0', alignItems: 'stretch' }}>
                  {/* Roll No Card Preview */}
                  <div style={{ width: '85px', fontFamily: settings.headerGeneralFontFamily || "'Outfit', sans-serif" }}>
                    <div style={{ border: '1px solid #dc0045', borderRadius: '4px', height: '100%' }}>
                      <div style={{ background: '#dc0045', color: '#fff', fontSize: '0.50rem', fontWeight: 'bold', padding: '2px', textAlign: 'center' }}>
                        {settings.rollNoBoxTitle}
                      </div>
                      <div style={{ padding: '4px', textAlign: 'center', fontSize: '0.48rem', color: '#dc0045', lineHeight: 1.2 }}>① ② ③</div>
                    </div>
                  </div>

                  {/* Candidate Details Card Preview */}
                  <div style={{ flex: 1, border: '1px solid #dc0045', borderRadius: '4px', padding: '6px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '4px', fontSize: '0.45rem', color: '#dc0045', fontWeight: 'bold', fontFamily: settings.headerGeneralFontFamily || "'Outfit', sans-serif" }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                      <span style={{ whiteSpace: 'nowrap' }}>NAME:</span>
                      <div style={{ flex: 1, borderBottom: '0.5px dashed #dc0045', height: '6px' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                      <span style={{ whiteSpace: 'nowrap' }}>FATHER'S NAME:</span>
                      <div style={{ flex: 1, borderBottom: '0.5px dashed #dc0045', height: '6px' }} />
                    </div>
                  </div>
                </div>

                {/* Sample Question Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', margin: '10px 0', fontSize: '0.55rem' }}>
                  <div>
                    <div style={{ color: '#dc0045', fontWeight: 'bold' }}>Q.No A B C D</div>
                    <div>01 ◯ ◯ ◯ ◯</div>
                    <div>02 ◯ ◯ ◯ ◯</div>
                  </div>
                  <div>
                    <div style={{ color: '#dc0045', fontWeight: 'bold' }}>Q.No A B C D</div>
                    <div>31 ◯ ◯ ◯ ◯</div>
                    <div>32 ◯ ◯ ◯ ◯</div>
                  </div>
                </div>

                {/* Disclaimer */}
                <div style={{ textAlign: 'center', fontSize: '0.48rem', fontWeight: 'bold', color: '#dc0045', marginTop: '12px' }}>
                  {settings.disclaimerText}
                </div>

              </div>

              <div style={{ marginTop: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px', fontSize: '0.78rem', color: '#15803d', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Info size={16} />
                <span>Modifying OMR text labels will <strong>NOT</strong> affect OpenCV computer vision scanning or bubble detection!</span>
              </div>

            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
