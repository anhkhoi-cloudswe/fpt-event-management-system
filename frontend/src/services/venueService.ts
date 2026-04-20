import axios from 'axios'
import { API_BASE_URL } from '../config/api'

const API_URL = API_BASE_URL

export interface Venue {
  venueId: number
  venueName: string
  location: string | null  // Backend trả về 'location', không phải 'address'
  status: string
  areas?: Area[]
}

export interface Area {
  areaId: number
  venueId: number
  areaName: string
  floor: number
  capacity: number
  status: string
}

const getAxiosConfig = () => {
  return {
    withCredentials: true
  }
}

// Venue API calls
export const venueService = {
  async getAll(): Promise<Venue[]> {
    // Cache busting: thêm timestamp vào query params để tránh browser cache
    const timestamp = new Date().getTime()
    const response = await axios.get(`${API_URL}/venues?t=${timestamp}`, getAxiosConfig())
    return response.data.filter((venue: Venue) => venue.status === 'AVAILABLE')
  },

  async create(data: { venueName: string; location: string }): Promise<void> {
    await axios.post(`${API_URL}/venues`, data, getAxiosConfig())
  },

  async update(data: { venueId: number; venueName: string; location: string }): Promise<void> {
    await axios.put(`${API_URL}/venues`, data, getAxiosConfig())
  },

  async delete(venueId: number): Promise<void> {
    await axios.delete(`${API_URL}/venues?venueId=${venueId}`, getAxiosConfig())
  }
}

// Area API calls
export const areaService = {
  async getByVenueId(venueId: number): Promise<Area[]> {
    // Cache busting: thêm timestamp vào query params
    const timestamp = new Date().getTime()
    const response = await axios.get(`${API_URL}/venues/areas?venueId=${venueId}&t=${timestamp}`, getAxiosConfig())
    return response.data
  },

  async create(data: {
    areaId?: number
    venueId: number
    areaName: string
    floor: number
    capacity: number
    status?: string
  }): Promise<void> {
    // Only send essential fields for create
    const createPayload = {
      venueId: data.venueId,
      areaName: data.areaName,
      floor: Number(data.floor),
      capacity: Number(data.capacity),
    }

    // Add validation logging for debugging
    console.log('Creating area with payload:', createPayload)

    await axios.post(`${API_URL}/venues/areas`, createPayload, getAxiosConfig())
  },

  async update(data: {
    areaId: number
    venueId: number
    areaName: string
    floor: number
    capacity: number
    status: string
  }): Promise<void> {
    // Update can keep status
    const updatePayload = {
      areaId: data.areaId,
      areaName: data.areaName,
      floor: Number(data.floor),
      capacity: Number(data.capacity),
      status: data.status,
    }

    console.log('Updating area with payload:', updatePayload)

    await axios.put(`${API_URL}/venues/areas`, updatePayload, getAxiosConfig())
  },

  async delete(areaId: number): Promise<void> {
    await axios.delete(`${API_URL}/venues/areas?areaId=${areaId}`, getAxiosConfig())
  }
}
