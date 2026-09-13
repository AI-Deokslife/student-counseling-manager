import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

const isInstalledPwa = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as NavigatorWithStandalone).standalone === true;

const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function usePwa() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();

  useEffect(() => {
    const displayMode = window.matchMedia?.('(display-mode: standalone)');
    const syncInstalledState = () => setIsInstalled(isInstalledPwa());
    const handlePrompt = (event: Event) => {
      event.preventDefault();
      if (!isInstalledPwa()) setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    syncInstalledState();
    window.addEventListener('beforeinstallprompt', handlePrompt);
    window.addEventListener('appinstalled', handleInstalled);
    displayMode?.addEventListener('change', syncInstalledState);
    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      displayMode?.removeEventListener('change', syncInstalledState);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (outcome === 'accepted') setIsInstalled(true);
  };

  // iOS는 beforeinstallprompt를 지원하지 않으므로 별도 안내 필요
  const showIosInstallHint = isIos() && !isInstalledPwa();

  return {
    canInstall: Boolean(installPrompt) && !isInstalled,
    install,
    needRefresh,
    update: () => updateServiceWorker(true),
    showIosInstallHint,
  };
}
