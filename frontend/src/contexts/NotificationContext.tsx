import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Notifications } from '../components/Notifications';

export type NotifyType = 'success' | 'error' | 'info' | 'warning';

export interface NotificationItem {
  id: string;
  type: NotifyType;
  message: string;
}

interface NotifyContextValue {
  notify: (message: string, type?: NotifyType, durationMs?: number) => void;
  dismiss: (id: string) => void;
}

const NotifyContext = createContext<NotifyContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const dismiss = useCallback((id: string) => {
    setItems(prev => prev.filter(n => n.id !== id));
  }, []);

  const notify = useCallback((message: string, type: NotifyType = 'info', durationMs = 4000) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setItems(prev => [...prev, { id, type, message }]);
    if (durationMs > 0) {
      setTimeout(() => dismiss(id), durationMs);
    }
  }, [dismiss]);

  return (
    <NotifyContext.Provider value={{ notify, dismiss }}>
      {children}
      <Notifications items={items} onDismiss={dismiss} />
    </NotifyContext.Provider>
  );
}

export function useNotify(): NotifyContextValue {
  const ctx = useContext(NotifyContext);
  if (!ctx) {
    throw new Error('useNotify musí být použit uvnitř <NotificationProvider>.');
  }
  return ctx;
}
