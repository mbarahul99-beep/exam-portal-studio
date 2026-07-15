import { useState, useEffect } from 'react';

// Declare global types for OpenCV
declare global {
  interface Window {
    cv: any;
    Module: any;
  }
}

export function useOpenCv() {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    // If already loaded
    if (window.cv && window.cv.Mat) {
      setLoaded(true);
      return;
    }

    // Set up runtime initialized callback
    window.Module = {
      onRuntimeInitialized: () => {
        setLoaded(true);
      },
    };

    // Check if script is already injected
    const existingScript = document.getElementById('opencv-script');
    if (!existingScript) {
      const script = document.createElement('script');
      script.id = 'opencv-script';
      script.src = 'https://docs.opencv.org/4.5.5/opencv.js';
      script.async = true;
      script.onload = () => {
        // Fallback check if onRuntimeInitialized doesn't fire or script was loaded
        if (window.cv && window.cv.Mat) {
          setLoaded(true);
        }
      };
      script.onerror = () => {
        setError(true);
      };
      document.body.appendChild(script);
    } else {
      // Script exists but not loaded yet, check periodically
      const interval = setInterval(() => {
        if (window.cv && window.cv.Mat) {
          setLoaded(true);
          clearInterval(interval);
        }
      }, 500);
      return () => clearInterval(interval);
    }
  }, []);

  return { loaded, error };
}
