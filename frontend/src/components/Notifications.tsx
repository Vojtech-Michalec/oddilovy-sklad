import type { NotificationItem, NotifyType } from '../contexts/NotificationContext';
import './Notifications.css';

interface Props {
  items: NotificationItem[];
  onDismiss: (id: string) => void;
}

const ICONS: Record<NotifyType, string> = {
  success: '✓',
  error:   '✕',
  info:    'ℹ',
  warning: '⚠'
};

const TITLES: Record<NotifyType, string> = {
  success: 'Hotovo',
  error:   'Chyba',
  info:    'Informace',
  warning: 'Upozornění'
};

export function Notifications({ items, onDismiss }: Props) {
  return (
    <div className="notify-stack" role="region" aria-label="Notifikace" aria-live="polite">
      {items.map(n => (
        <div key={n.id} className={`notify-toast notify-${n.type}`} role="alert">
          <div className="notify-icon" aria-hidden="true">{ICONS[n.type]}</div>
          <div className="notify-body">
            <div className="notify-title">{TITLES[n.type]}</div>
            <div className="notify-message">{n.message}</div>
          </div>
          <button
            className="notify-close"
            onClick={() => onDismiss(n.id)}
            aria-label="Zavřít notifikaci"
          >×</button>
          <div className="notify-progress" />
        </div>
      ))}
    </div>
  );
}
