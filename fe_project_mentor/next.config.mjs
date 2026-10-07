/** @type {import('next').NextConfig} */
const nextConfig = {
  // dev 脚本用 `next dev -H 0.0.0.0 -p 3003`（局域网演示用），见 package.json

  // 这几个包不能被 webpack 打包：它们内部有惰性 require（如 @vue/compiler-sfc
  // 会按需 require 模板引擎），静态分析会报 Module not found。交给运行时加载即可。
  serverExternalPackages: ["@vue/compiler-sfc", "@vue/compiler-dom", "typescript"],

  // file: 拷贝包会让 build traces（@vercel/nft）分析崩溃，本项目不用 standalone 部署，直接排除
  outputFileTracingExcludes: {
    "*": ["node_modules/xiaoyou-code-indexer/**"],
  },
  webpack: config => {
    // serverExternalPackages 只对顶层 node_modules 请求生效；xiaoyou-code-indexer
    // 是 file: 拷贝、自带嵌套 node_modules，其内部的 @vue/compiler-* / typescript
    // 请求必须在解析前就外置，否则嵌套拷贝会被连带动打包。
    config.externals.push({
      "@vue/compiler-sfc": "commonjs @vue/compiler-sfc",
      "@vue/compiler-dom": "commonjs @vue/compiler-dom",
      typescript: "commonjs typescript",
    });
    return config;
  },
};

export default nextConfig;
