import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '剑网3掉落工坊｜剑网3副本掉落配置',
  description: '离线整理剑网3副本掉落，一键生成跳过拾取、自动出售与保护不出售配置。',
  icons: { icon: '/logo.jpg' },
  openGraph: {
    title: '剑网3掉落工坊｜剑网3副本掉落配置',
    description: '离线整理剑网3副本掉落，一键生成跳过拾取、自动出售与保护不出售配置。',
    type: 'website',
    locale: 'zh_CN',
    images: [{ url: '/og.png', width: 1600, height: 900, alt: '剑网3掉落工坊｜剑网3副本掉落配置' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '剑网3掉落工坊｜剑网3副本掉落配置',
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
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/misans@4.1.0/lib/Normal/MiSans-Regular.min.css" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/misans@4.1.0/lib/Normal/MiSans-Medium.min.css" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/misans@4.1.0/lib/Normal/MiSans-Bold.min.css" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/harmonyos-sans-sc-webfont-splitted@1.1.0/dist/index.min.css" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
