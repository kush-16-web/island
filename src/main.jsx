import '@fontsource-variable/geist';
import { MotionConfig } from 'framer-motion';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <MotionConfig reducedMotion="user">
    <App />
  </MotionConfig>,
);
