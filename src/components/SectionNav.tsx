import { useState, useEffect } from 'react';
import { tokens } from '../styles/theme';

interface Section {
  key: string;
  label: string;
  count?: number;
}

interface SectionNavProps {
  sections: Section[];
  /** Sticks below the main header (Ant Header is ~64px, plus any page header) */
  stickyTop?: number;
}

export default function SectionNav({ sections, stickyTop = 0 }: SectionNavProps) {
  const [activeKey, setActiveKey] = useState(sections[0]?.key ?? '');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveKey(entry.target.id);
          }
        }
      },
      { rootMargin: `-${stickyTop}px 0px -60% 0px`, threshold: 0 }
    );

    sections.forEach((s) => {
      const el = document.getElementById(s.key);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [sections, stickyTop]);

  const scrollTo = (key: string) => {
    const el = document.getElementById(key);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div
      style={{
        position: 'sticky',
        top: stickyTop,
        zIndex: 40,
        background: tokens.colorBgContainer,
        borderBottom: `1px solid ${tokens.colorBorder}`,
        padding: `${tokens.spacingSM}px 0`,
        marginBottom: tokens.spacingLG,
        overflow: 'auto',
        whiteSpace: 'nowrap',
        scrollbarWidth: 'none',
      }}
    >
      {sections.map((s) => {
        const active = s.key === activeKey;
        return (
          <button
            key={s.key}
            onClick={() => scrollTo(s.key)}
            style={{
              display: 'inline-block',
              padding: `${tokens.spacingSM}px ${tokens.spacingMD}px`,
              marginRight: tokens.spacingSM,
              border: 'none',
              background: active ? tokens.colorPrimary : 'transparent',
              color: active ? '#fff' : tokens.colorTextSecondary,
              borderRadius: tokens.radiusMD,
              cursor: 'pointer',
              fontSize: tokens.fontSizeSM,
              fontWeight: active ? 600 : 400,
              transition: 'all 0.15s',
              outline: 'none',
            }}
          >
            {s.label}
            {s.count !== undefined && (
              <span style={{ marginLeft: 4, opacity: 0.8, fontSize: 11 }}>({s.count})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
