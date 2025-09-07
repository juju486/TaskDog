import { defineStore } from 'pinia'
import { scriptApi } from '@/api/modules'

export const useScriptStore = defineStore('script', {
  state: () => ({
    scripts: [],
    currentScript: null,
    loading: false
  }),
  
  actions: {
    async fetchScripts() {
      this.loading = true
      try {
        const response = await scriptApi.getAll()
        this.scripts = response.data || []
      } catch (error) {
        console.error('Failed to fetch scripts:', error)
        throw error
      } finally {
        this.loading = false
      }
    },
    
    async createScript(scriptData) {
      try {
        const response = await scriptApi.create(scriptData)
        this.scripts.unshift(response.data)
        return response.data
      } catch (error) {
        console.error('Failed to create script:', error)
        throw error
      }
    },
    
    async updateScript(id, scriptData) {
      try {
        await scriptApi.update(id, scriptData)
        const index = this.scripts.findIndex(s => s.id === id)
        if (index !== -1) {
          this.scripts[index] = { ...this.scripts[index], ...scriptData }
        }
      } catch (error) {
        console.error('Failed to update script:', error)
        throw error
      }
    },
    
    async deleteScript(id) {
      try {
        await scriptApi.delete(id)
        this.scripts = this.scripts.filter(s => s.id !== id)
      } catch (error) {
        console.error('Failed to delete script:', error)
        throw error
      }
    },
    
    async testScript(id, params) {
      try {
        const response = await scriptApi.test(id, params)
        // 兼容后端 data.data 结构
        return response.data ?? response
      } catch (error) {
        console.error('Failed to test script:', error)
        throw error
      }
    }
  }
})
