'use client';

import React, { useEffect } from 'react';
import { useAppStore } from '../lib/store';
import { api } from '../lib/api';
import { UserRole } from '@smart-ambulance/shared';
import { Shield, Ambulance, Car, Building2 as HospitalIcon, UserCheck } from 'lucide-react';

const SEED_ACCOUNTS = {
  [UserRole.ADMIN]: { email: 'admin@ambulane.emergency', name: 'Dispatcher Admin' },
  [UserRole.AMBULANCE_DRIVER]: { email: 'driver@ambulane.emergency', name: 'Capt. Marcus Vance (Ambulance)' },
  [UserRole.NORMAL_USER]: { email: 'driver_a@user.test', name: 'Alex Rivera (Demo Driver A)' },
  [UserRole.HOSPITAL_OPERATOR]: { email: 'operator@hospital.test', name: 'Dr. Sarah Connor (Hospital)' }
};

export default function Navbar() {
  const { activeRole, setActiveRole, currentUser, setCurrentUser } = useAppStore();

  const switchRole = async (role: UserRole) => {
    setActiveRole(role);
    try {
      const seed = SEED_ACCOUNTS[role];
      const res = await api.login(seed.email, 'password123');
      setCurrentUser({
        ...res.user,
        token: res.token
      });
    } catch (err) {
      console.error('Auto-login for role failed', err);
    }
  };

  // Initial login as ADMIN
  useEffect(() => {
    if (!currentUser) {
      switchRole(UserRole.ADMIN);
    }
  }, []);

  return (
    <header className="h-[65px] bg-slate-900 border-b border-slate-800 px-4 sm:px-6 flex items-center justify-between text-white z-40 relative shadow-md">
      {/* Brand logo & tagline */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-600 to-rose-500 flex items-center justify-center font-black text-xl shadow-lg shadow-rose-950">
          🚑
        </div>
        <div>
          <h1 className="font-extrabold text-sm sm:text-base tracking-tight text-white flex items-center gap-2">
            AMBULANE
            <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30">
              Emergency Mobility Platform
            </span>
          </h1>
          <p className="text-[11px] text-slate-400 hidden sm:block">
            Connected Vehicle Emergency Passage Network
          </p>
        </div>
      </div>

      {/* Role Switcher Toolbar (Requirement 1, 2, 3) */}
      <div className="flex items-center gap-1 sm:gap-2 bg-slate-950/80 p-1.5 rounded-2xl border border-slate-800">
        <button
          onClick={() => switchRole(UserRole.ADMIN)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition ${
            activeRole === UserRole.ADMIN
              ? 'bg-rose-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Admin Center</span>
        </button>

        <button
          onClick={() => switchRole(UserRole.AMBULANCE_DRIVER)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition ${
            activeRole === UserRole.AMBULANCE_DRIVER
              ? 'bg-rose-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Ambulance className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Ambulance Driver</span>
        </button>

        <button
          onClick={() => switchRole(UserRole.NORMAL_USER)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold transition ${
            activeRole === UserRole.NORMAL_USER
              ? 'bg-rose-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Car className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Normal Driver</span>
        </button>
      </div>

      {/* User profile pill */}
      <div className="hidden lg:flex items-center gap-2 text-xs font-semibold text-slate-300 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700">
        <UserCheck className="w-4 h-4 text-emerald-400" />
        <span className="truncate max-w-[140px]">{currentUser?.name || 'Connecting...'}</span>
      </div>
    </header>
  );
}
