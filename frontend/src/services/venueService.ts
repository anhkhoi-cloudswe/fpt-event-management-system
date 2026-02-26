import axios from 'axios'

const API_URL = '/api'

export interface Venue {
  venueId: number
  venueName: string
  address: string
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

const getAuthHeaders = () => {
  const token = localStorage.getItem('token')
  return {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
}

// Venue API calls
export const venueService = {
  async getAll(): Promise<Venue[]> {
    const response = await axios.get(`${API_URL}/venues`, getAuthHeaders())
    return response.data.filter((venue: Venue) => venue.status === 'AVAILABLE')
  },

  async create(data: { venueName: string; address: string }): Promise<void> {
    await axios.post(`${API_URL}/venues`, data, getAuthHeaders())
  },

  async update(data: { venueId: number; venueName: string; address: string }): Promise<void> {
    await axios.put(`${API_URL}/venues`, data, getAuthHeaders())
  },

  async delete(venueId: number): Promise<void> {
    await axios.delete(`${API_URL}/venues?venueId=${venueId}`, getAuthHeaders())
  }
}

// Area API calls
export const areaService = {
  async getByVenueId(venueId: number): Promise<Area[]> {
    const response = await axios.get(`${API_URL}/venues/areas?venueId=${venueId}`, getAuthHeaders())
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

    await axios.post(`${API_URL}/venues/areas`, createPayload, getAuthHeaders())
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

    await axios.put(`${API_URL}/venues/areas`, updatePayload, getAuthHeaders())
  },

  async delete(areaId: number): Promise<void> {
    await axios.delete(`${API_URL}/venues/areas?areaId=${areaId}`, getAuthHeaders())
  }
}
