import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { 
  Sliders, 
  Save, 
  RotateCcw, 
  CheckCircle, 
  Type, 
  Info,
  Building2,
  PenTool
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
}

export const DEFAULT_OMR_SETTINGS: OmrCustomSettings = {
  instituteName: 'APEX INSTITUTE, JIND',
  subtitleText: 'OMR ANSWER SHEET',
  rollNoBoxTitle: 'ROLL NO.',
  bookletNoBoxTitle: 'TEST BOOKLET NO.',
  bookletCodeBoxTitle: 'BOOKLET CODE',
  candidateNameLabel: "CANDIDATE'S NAME (IN CAPITAL LETTERS)",
  fatherNameLabel: "FATHER'S NAME (IN CAPITAL LETTERS)",
  showSignatureBoxes: true,
  studentSignatureLabel: "STUDENT'S SIGNATURE",
  invigilatorSignatureLabel: "INVIGILATOR'S SIGNATURE",
  disclaimerText: '★ DO NOT FOLD OR MUTILATE THIS DOCUMENT. ORIGINAL ANSWER SHEET ★'
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
                  Test Booklet No Box Title
                </label>
                <input
                  type="text"
                  value={settings.bookletNoBoxTitle}
                  onChange={(e) => handleChange('bookletNoBoxTitle', e.target.value)}
                  placeholder="e.g. TEST BOOKLET NO."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Booklet Code / Set Box Title
                </label>
                <input
                  type="text"
                  value={settings.bookletCodeBoxTitle}
                  onChange={(e) => handleChange('bookletCodeBoxTitle', e.target.value)}
                  placeholder="e.g. BOOKLET CODE"
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
            </div>
          </div>

          {/* SECTION 3: Bottom Signatures & Footer Notice */}
          <div style={{ background: '#ffffff', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', color: '#dc0045' }}>
              <PenTool size={18} />
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800 }}>3. Signatures & Bottom Disclaimer</h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              {/* Signature Toggle Switch */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a' }}>Enable Bottom Signature Boxes</span>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>Show Student and Invigilator signature boxes at bottom</p>
                </div>
                
                <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={settings.showSignatureBoxes}
                    onChange={(e) => handleChange('showSignatureBoxes', e.target.checked)}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span style={{
                    position: 'absolute',
                    cursor: 'pointer',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: settings.showSignatureBoxes ? '#dc0045' : '#cbd5e1',
                    borderRadius: '24px',
                    transition: '0.3s'
                  }}>
                    <span style={{
                      position: 'absolute',
                      content: '""',
                      height: '18px',
                      width: '18px',
                      left: settings.showSignatureBoxes ? '22px' : '3px',
                      bottom: '3px',
                      backgroundColor: 'white',
                      borderRadius: '50%',
                      transition: '0.3s'
                    }} />
                  </span>
                </label>
              </div>

              {settings.showSignatureBoxes && (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                      Student Signature Box Label
                    </label>
                    <input
                      type="text"
                      value={settings.studentSignatureLabel}
                      onChange={(e) => handleChange('studentSignatureLabel', e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                      Invigilator Signature Box Label
                    </label>
                    <input
                      type="text"
                      value={settings.invigilatorSignatureLabel}
                      onChange={(e) => handleChange('invigilatorSignatureLabel', e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                    />
                  </div>
                </>
              )}

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

        </form>

        {/* LIVE VISUAL PREVIEW CARD */}
        <div>
          <div style={{ position: 'sticky', top: '20px' }}>
            <div style={{ background: '#ffffff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 14px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>⚡ Live Sheet Layout Preview</span>
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

                {/* Institute Title */}
                <div style={{ textAlign: 'center', margin: '4px 0 6px 0' }}>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 900, color: '#dc0045' }}>
                    {settings.instituteName.toUpperCase() || 'INSTITUTE NAME'}
                  </h4>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0f172a' }}>NEET 11TH JULY 1</div>
                  <span style={{ background: '#dc0045', color: '#fff', fontSize: '0.65rem', fontWeight: 800, padding: '1px 8px', borderRadius: '10px' }}>
                    {settings.subtitleText.toUpperCase() || 'OMR ANSWER SHEET'}
                  </span>
                </div>

                {/* Box Headers */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.5fr', gap: '4px', margin: '10px 0' }}>
                  <div style={{ border: '1px solid #dc0045', borderRadius: '4px' }}>
                    <div style={{ background: '#dc0045', color: '#fff', fontSize: '0.55rem', fontWeight: 'bold', padding: '2px', textAlign: 'center' }}>
                      {settings.rollNoBoxTitle}
                    </div>
                    <div style={{ height: '35px', padding: '4px', textAlign: 'center', fontSize: '0.55rem', color: '#dc0045' }}>① ② ③</div>
                  </div>

                  <div style={{ border: '1px solid #dc0045', borderRadius: '4px' }}>
                    <div style={{ background: '#dc0045', color: '#fff', fontSize: '0.55rem', fontWeight: 'bold', padding: '2px', textAlign: 'center' }}>
                      {settings.bookletNoBoxTitle}
                    </div>
                    <div style={{ height: '35px', padding: '4px', textAlign: 'center', fontSize: '0.55rem', color: '#dc0045' }}>① ② ③</div>
                  </div>

                  <div style={{ border: '1px solid #dc0045', borderRadius: '4px' }}>
                    <div style={{ background: '#dc0045', color: '#fff', fontSize: '0.55rem', fontWeight: 'bold', padding: '2px', textAlign: 'center' }}>
                      {settings.bookletCodeBoxTitle}
                    </div>
                    <div style={{ height: '35px', padding: '4px', fontSize: '0.55rem' }}>
                      <div style={{ color: '#dc0045', fontWeight: 'bold' }}>Ⓐ Ⓑ Ⓒ Ⓓ</div>
                    </div>
                  </div>
                </div>

                {/* Candidate Info Lines */}
                <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '6px', margin: '6px 0', fontSize: '0.55rem', color: '#dc0045', fontWeight: 'bold' }}>
                  <div>{settings.candidateNameLabel}: _____________________</div>
                  <div style={{ marginTop: '3px' }}>{settings.fatherNameLabel}: _____________________</div>
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
                    <div>37 ◯ ◯ ◯ ◯</div>
                    <div>38 ◯ ◯ ◯ ◯</div>
                  </div>
                </div>

                {/* Signature Boxes Preview */}
                {settings.showSignatureBoxes ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' }}>
                    <div style={{ border: '1px solid #dc0045', height: '22px', borderRadius: '3px', position: 'relative' }}>
                      <span style={{ position: 'absolute', bottom: '2px', left: 0, right: 0, textAlign: 'center', fontSize: '0.5rem', fontWeight: 'bold', color: '#dc0045' }}>
                        {settings.studentSignatureLabel}
                      </span>
                    </div>
                    <div style={{ border: '1px solid #dc0045', height: '22px', borderRadius: '3px', position: 'relative' }}>
                      <span style={{ position: 'absolute', bottom: '2px', left: 0, right: 0, textAlign: 'center', fontSize: '0.5rem', fontWeight: 'bold', color: '#dc0045' }}>
                        {settings.invigilatorSignatureLabel}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '6px', textAlign: 'center', fontSize: '0.55rem', color: '#64748b', background: '#f8fafc', borderRadius: '4px', border: '1px dashed #cbd5e1' }}>
                    [Signature Boxes Hidden]
                  </div>
                )}

                {/* Disclaimer */}
                <div style={{ textAlign: 'center', fontSize: '0.48rem', fontWeight: 'bold', color: '#dc0045', marginTop: '8px' }}>
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
