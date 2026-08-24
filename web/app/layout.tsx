import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'JX3 Loot Forge｜剑网3掉落配置锻造台',
  description: '离线整理剑网3副本掉落，一键生成跳过拾取、自动出售与保护不出售配置。',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: 'JX3 Loot Forge｜剑网3掉落配置锻造台',
    description: '离线整理剑网3副本掉落，一键生成跳过拾取、自动出售与保护不出售配置。',
    type: 'website',
    locale: 'zh_CN',
    images: [{ url: '/og.png', width: 1600, height: 900, alt: 'JX3 Loot Forge 剑网3掉落配置锻造台' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'JX3 Loot Forge｜剑网3掉落配置锻造台',
    description: '离线整理剑网3副本掉落，一键生成跳过拾取、自动出售与保护不出售配置。',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
