import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const BACKEND_PORT = env.VITE_BACKEND_PORT || '3001'

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
      }
    },
    server: {
      port: Number(env.VITE_PORT || 3000),
      proxy: {
        '/api': {
          target: `http://localhost:${BACKEND_PORT}`,
          changeOrigin: true,
          // 增加超时，适配长耗时脚本测试
          timeout: 10 * 60 * 1000,
          proxyTimeout: 10 * 60 * 1000
        }
      }
    }
  }
})
