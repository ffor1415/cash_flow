import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';

const AppLayout = () => {
  return (
    <div className="bg-background min-h-dvh overflow-x-hidden">

      {/* ── Fixed Header ── */}
      <header
        className="fixed top-0 left-0 right-0 z-50 bg-background/95 border-b border-border backdrop-blur supports-[backdrop-filter]:bg-background/60"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div
          className="mx-auto w-full max-w-[600px] flex h-14 items-center"
          style={{ paddingLeft: 'var(--page-px)', paddingRight: 'var(--page-px)' }}
        >
          <span className="text-xl font-bold tracking-tight text-primary">💰 Cashes Flow</span>
        </div>
      </header>

      {/* ── Scrollable page content ──
           top padding = header height (56px) + safe-area-top
           bottom padding = nav height (~60px) + safe-area-bottom            -->
      */}
      <main
        className="mx-auto w-full max-w-[600px] overflow-x-hidden"
        style={{
          paddingTop:    'calc(3.5rem + env(safe-area-inset-top, 0px))',
          paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <Outlet />
      </main>

      {/* ── Fixed Bottom Nav ── */}
      <BottomNav />
    </div>
  );
};

export default AppLayout;