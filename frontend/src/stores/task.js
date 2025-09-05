import { defineStore } from 'pinia'
import { taskApi } from '@/api/modules'

export const useTaskStore = defineStore('task', {
  state: () => ({
    tasks: [],
    currentTask: null,
    loading: false
  }),
  
  actions: {
    async fetchTasks() {
      this.loading = true
      try {
        const response = await taskApi.getAll()
        this.tasks = response.data || []
      } catch (error) {
        console.error('Failed to fetch tasks:', error)
        throw error
      } finally {
        this.loading = false
      }
    },
    
    async createTask(taskData) {
      try {
        const response = await taskApi.create(taskData)
        this.tasks.unshift(response.data)
        return response.data
      } catch (error) {
        console.error('Failed to create task:', error)
        throw error
      }
    },
    
    async updateTask(id, taskData) {
      try {
        const response = await taskApi.update(id, taskData)
        const updated = response?.data || null
        const index = this.tasks.findIndex(t => t.id === id)
        if (index !== -1 && updated) {
          this.tasks[index] = { ...this.tasks[index], ...updated }
        } else if (index !== -1) {
          this.tasks[index] = { ...this.tasks[index], ...taskData }
        }
      } catch (error) {
        console.error('Failed to update task:', error)
        throw error
      }
    },
    
    async deleteTask(id) {
      try {
        await taskApi.delete(id)
        this.tasks = this.tasks.filter(t => t.id !== id)
      } catch (error) {
        console.error('Failed to delete task:', error)
        throw error
      }
    },
    
    async startTask(id) {
      try {
        await taskApi.start(id)
        const index = this.tasks.findIndex(t => t.id === id)
        if (index !== -1) {
          this.tasks[index].status = 'active'
        }
      } catch (error) {
        console.error('Failed to start task:', error)
        throw error
      }
    },
    
    async stopTask(id) {
      try {
        await taskApi.stop(id)
        const index = this.tasks.findIndex(t => t.id === id)
        if (index !== -1) {
          this.tasks[index].status = 'inactive'
        }
      } catch (error) {
        console.error('Failed to stop task:', error)
        throw error
      }
    },

    async runOnce(id) {
      try {
        const response = await taskApi.runOnce(id)
        const refreshed = response?.data?.task
        if (refreshed) {
          const index = this.tasks.findIndex(t => t.id === id)
          if (index !== -1) this.tasks[index] = { ...this.tasks[index], ...refreshed }
        }
        return response?.data?.result
      } catch (error) {
        console.error('Failed to run task once:', error)
        throw error
      }
    }
  }
})
