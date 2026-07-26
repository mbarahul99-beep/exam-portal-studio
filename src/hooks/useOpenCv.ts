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
    // Check if already loaded
    if (window.cv && window.cv.Mat) {
      setLoaded(true);
      return;
    }

    // Set up Emscripten Module callback
    window.Module = window.Module || {};
    const previousCallback = window.Module.onRuntimeInitialized;
    window.Module.onRuntimeInitialized = () => {
      if (previousCallback) previousCallback();
      setLoaded(true);
    };

    // Fast polling loop to detect when OpenCV initialization completes
    const interval = setInterval(() => {
      if (window.cv && window.cv.Mat) {
        setLoaded(true);
        clearInterval(interval);
      } else if (window.cv && typeof window.cv === 'function') {
        window.cv().then((cvInst: any) => {
          window.cv = cvInst;
          setLoaded(true);
          clearInterval(interval);
        }).catch(() => {});
      }
    }, 100);

    // Fallback script injector if script tag is missing
    const existingScript = document.getElementById('opencv-script');
    if (!existingScript) {
      const script = document.createElement('script');
      script.id = 'opencv-script';
      script.src = 'https://docs.opencv.org/4.5.5/opencv.js';
      script.async = true;
      script.onload = () => {
        if (window.cv && window.cv.Mat) {
          setLoaded(true);
        }
      };
      script.onerror = () => {
        setError(true);
      };
      document.body.appendChild(script);
    }

    return () => clearInterval(interval);
  }, []);

  return { loaded, error };
}
