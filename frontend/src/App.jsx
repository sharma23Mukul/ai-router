import Dashboard from './components/Dashboard'
import NeuralBackground from './components/NeuralBackground';

function App() {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <NeuralBackground />
      <div className="relative z-10">
        <Dashboard />
      </div>
    </div>
  )
}

export default App
