import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';

const AppLayout = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="relative mx-auto w-full max-w-[1200px] min-h-screen bg-background flex flex-col md:shadow-[0_0_0_1px_hsl(214_20%_87%),0_4px_32px_-4px_hsl(215_25%_12%/0.08)]">
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-14 items-center px-4">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-primary"> Cashes Flow</span>
            </div>
          </div>
        </header>

        <div className="flex-1 pb-6">
          <Outlet />
        </div>

        <BottomNav />
      </div>
    </div>
  );
};

export default AppLayout;
