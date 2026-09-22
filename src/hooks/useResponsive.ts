import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;

/**
 * 视口尺寸与布局档位。
 *
 * 这里**只有 isMobile 一档**，这是刻意的。
 * 曾经还导出过 `isTablet: width < 1024` 和 `isDesktop: width >= 1024`：
 *   - 前者名不副实——它是「非桌面」，会把 500px 的手机也算成平板；
 *   - 后者只是前者的取反（`isDesktop === !isTablet`），两个名字互相矛盾；
 *   - 且全站零引用，谁用谁踩坑（按名字理解就会写出错的布局分支）。
 * 因此删除。将来真需要平板档，请显式写成 `width >= 768 && width < 1024`。
 *
 * width / height 保留：它们是原始事实，不含判断，不会误导。
 */
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
  };
}
