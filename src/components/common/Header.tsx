import React from 'react';
import { Book as BookIcon, Library, Settings as SettingsIcon, LogOut, User as UserIcon } from 'lucide-react';
import { User } from 'firebase/auth';

interface HeaderProps {
  onNavChange: (view: 'library' | 'reader' | 'settings') => void;
  activeView: string;
  user: User | null;
  onSignIn: () => void;
  onSignOut: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onNavChange, activeView, user, onSignIn, onSignOut }) => {
  return (
    <header id="main-header" className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div id="brand-logo" className="flex items-center gap-2 cursor-pointer" onClick={() => onNavChange('library')}>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-400 text-white shadow-lg shadow-violet-100">
            <BookIcon size={22} />
          </div>
          <span className="text-xl font-bold tracking-tight text-gray-900">Texta</span>
        </div>

        <nav id="top-nav" className="flex items-center gap-1 md:gap-4">
          <button
            id="nav-library"
            onClick={() => onNavChange('library')}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              activeView === 'library' ? 'bg-violet-50 text-violet-600' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Library size={18} />
            <span className="hidden md:inline">Library</span>
          </button>
          
          <button
            id="nav-settings"
            onClick={() => onNavChange('settings')}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              activeView === 'settings' ? 'bg-violet-50 text-violet-600' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <SettingsIcon size={18} />
            <span className="hidden md:inline">Settings</span>
          </button>

          <div className="ml-2 h-6 w-[1px] bg-gray-200" />
          
          {user ? (
            <div className="flex items-center gap-3">
              <div className="hidden md:flex flex-col items-end">
                <span className="text-xs font-bold text-gray-900 leading-none">{user.displayName}</span>
                <button onClick={onSignOut} className="text-[10px] text-gray-400 hover:text-violet-600 uppercase tracking-widest font-bold">Sign Out</button>
              </div>
              {user.photoURL ? (
                <img src={user.photoURL} alt="User" className="h-8 w-8 rounded-full border border-gray-200" />
              ) : (
                <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                  <UserIcon size={16} />
                </div>
              )}
            </div>
          ) : (
            <button
              id="auth-button"
              onClick={onSignIn}
              className="flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-gray-800 active:scale-95"
            >
              <LogOut size={16} />
              <span>Sign In</span>
            </button>
          )}
        </nav>
      </div>
    </header>
  );
};
