'use client';

import React from 'react';
import Navbar from './Navbar';
import AdminView from './AdminView/AdminView';
import AmbulanceView from './AmbulanceView/AmbulanceView';
import NormalUserView from './NormalUserView/NormalUserView';
import { useAppStore } from '../lib/store';
import { UserRole } from '@smart-ambulance/shared';

export default function AppShell() {
  const { activeRole } = useAppStore();

  return (
    <main className="flex-1 flex flex-col min-h-screen bg-slate-950">
      <Navbar />
      <div className="flex-1 flex flex-col">
        {activeRole === UserRole.ADMIN && <AdminView />}
        {activeRole === UserRole.AMBULANCE_DRIVER && <AmbulanceView />}
        {activeRole === UserRole.NORMAL_USER && <NormalUserView />}
        {activeRole === UserRole.HOSPITAL_OPERATOR && <AdminView />}
      </div>
    </main>
  );
}
