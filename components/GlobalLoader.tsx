import React, { useEffect, useState } from 'react';

export default function GlobalLoader() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Hide loader after window load OR after 900ms as a fallback
    const onLoad = () => setTimeout(() => setVisible(false), 350);

    if (document.readyState === 'complete') {
      onLoad();
    } else {
      window.addEventListener('load', onLoad);
    }

    const fallback = setTimeout(() => setVisible(false), 1400);

    return () => {
      window.removeEventListener('load', onLoad);
      clearTimeout(fallback);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="global-loader fixed inset-0 z-[9999] flex items-center justify-center transition-opacity"
      style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      <div className="loader-content flex flex-col items-center gap-6">
        <div className="modern-loader" aria-hidden />
        <div className="text-center">
          <div style={{ color: 'var(--text-primary)' }} className="text-xl font-black">MODERNIST</div>
          <div style={{ color: 'var(--text-primary)', opacity: 0.7 }} className="text-[11px] uppercase tracking-[0.3em]">Loading Archive</div>
        </div>
      </div>
    </div>
  );
}
