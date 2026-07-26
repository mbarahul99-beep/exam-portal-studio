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

    // Check periodically with fast 100ms interval for preloaded OpenCV.js script in index.html
    const interval = setInterval(() => {
      if (window.cv && window.cv.Mat) {
        setLoaded(true);
        clearInterval(interval);
      }
    }, 100);

    // Check if script is already injected
    const existingScript = document.getElementById('opencv-script');
    if (!existingScript) {
      const script = document.createElement('script');
      script.id = 'opencv-script';
      script.src = 'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.9.0-1/opencv.js';
      script.async = true;
      script.onload = () => {
        if (window.cv && window.cv.Mat) {
          setLoaded(true);
        }
      };
      script.onerror = () => {
        // Fallback to Cloudflare CDN if jsDelivr fails
        const fallbackScript = document.createElement('script');
        fallbackScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/opencv/4.7.0/opencv.js';
        fallbackScript.async = true;
        fallbackScript.onload = () => {
          if (window.cv && window.cv.Mat) setLoaded(true);
        };
        fallbackScript.onerror = () => setError(true);
        document.body.appendChild(fallbackScript);
      };
      document.body.appendChild(script);
    }

    return () => clearInterval(interval);
  }, []);

  return { loaded, error };
}
