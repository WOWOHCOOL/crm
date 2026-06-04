import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;

export function useResponsive() {
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    let ticking = false;
    const handleResize = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setDimensions({
          width: window.innerWidth,
          height: window.innerHeight,
        });
        ticking = false;
      });
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return {
    width: dimensions.width,
    height: dimensions.height,
    isMobile: dimensions.width < MOBILE_BREAKPOINT,
    isTablet: dimensions.width < TABLET_BREAKPOINT,
    isDesktop: dimensions.width >= TABLET_BREAKPOINT,
  };
}
