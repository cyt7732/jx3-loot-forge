/** 应用版本号，构建期由仓库根目录 VERSION.json 注入（vite/vitest define） */
declare const __APP_VERSION__: string;

/** 结构化更新日志，构建期由仓库根目录 CHANGELOG.md 解析注入（vite/vitest define） */
declare const __CHANGELOG__: unknown;

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.webp' {
  const src: string;
  export default src;
}
