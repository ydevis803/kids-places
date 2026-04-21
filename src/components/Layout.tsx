import { NavLink, Outlet } from 'react-router-dom';
import { Compass, Home, Map as MapIcon, Heart, User, FolderHeart } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export default function Layout() {
  const navItems = [
    { name: 'Home', path: '/', icon: Home },
    { name: 'Map Editor', path: '/map-editor', icon: MapIcon },
    { name: 'Collections', path: '/collections', icon: FolderHeart },
    { name: 'Saved Places', path: '/saved', icon: Heart },
    { name: 'Account', path: '/account', icon: User },
  ];

  return (
    <div className="bg-background text-on-surface font-body h-screen flex overflow-hidden selection:bg-primary-container selection:text-on-primary-container">
      {/* SideNavBar */}
      <nav className="hidden lg:flex flex-col py-6 gap-4 bg-surface-container-low text-primary font-medium antialiased h-full w-64 flex-shrink-0 border-r-0 relative z-20">
        <div className="px-6 mb-8 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-on-primary shadow-ambient shrink-0">
            <Compass className="w-5 h-5 fill-current" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-on-surface leading-tight font-headline">Family Explorer</h1>
            <p className="text-xs text-on-surface-variant font-medium">The Guided Sanctuary</p>
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-1 px-4">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.name}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl mx-2 cursor-pointer transition-transform duration-200 group relative",
                    isActive
                      ? "bg-surface-container-lowest text-primary shadow-sm"
                      : "text-on-surface-variant hover:text-on-surface hover:translate-x-1",
                    index === navItems.length - 1 && "mt-auto"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className={cn("w-5 h-5 transition-transform group-hover:scale-110", isActive && "fill-current")} />
                    <span className={cn("text-sm", isActive ? "font-bold tracking-wide" : "font-medium")}>{item.name}</span>
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-r-full"></div>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* Main Content Area Wrapper */}
      <div className="flex-1 flex flex-col h-full relative overflow-hidden bg-background">
        {/* Mobile header — only shown on small screens where side nav is hidden */}
        <header className="flex items-center w-full px-6 h-16 bg-surface-container-low/80 backdrop-blur-xl shadow-ambient lg:hidden">
          <div className="text-2xl font-extrabold tracking-tighter text-on-surface flex items-center gap-2">
            <Compass className="w-6 h-6 fill-current text-primary" />
            Family Explorer
          </div>
        </header>

        {/* Scrollable Main Canvas */}
        <main className="flex-1 overflow-y-auto w-full pb-24 lg:pb-0 h-full relative">
            <Outlet />
        </main>
      </div>
    </div>
  );
}
