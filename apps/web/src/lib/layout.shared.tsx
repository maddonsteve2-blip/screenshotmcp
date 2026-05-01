import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: '�️ DeepSyte',
    },
    links: [
      { text: 'Home', url: '/' },
      { text: 'Dashboard', url: '/dashboard' },
      { text: 'Pricing', url: '/pricing' },
      { text: 'llms.txt', url: '/llms.txt' },
    ],
  };
}
