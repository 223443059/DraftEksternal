import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import "./styles/App.css";
import '@fortawesome/fontawesome-free/css/all.min.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)