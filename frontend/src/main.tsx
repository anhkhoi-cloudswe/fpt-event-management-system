import React from 'react'
import ReactDOM from 'react-dom/client'
import axios from 'axios'
import App from './App.tsx'
import './index.css'
import { API_BASE_URL } from './config/api'

axios.defaults.withCredentials = true
axios.defaults.baseURL = API_BASE_URL
console.log('Axios BaseURL:', axios.defaults.baseURL)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)


