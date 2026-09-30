import { useState } from 'react'
import Header from './components/Header.jsx'
import ChatBot from './components/ChatBot.jsx'

export default function App() {
  const [tab, setTab] = useState('Home')
  return (
    <div className="app">
      <Header tab={tab} onTab={setTab} />
      <ChatBot />
    </div>
  )
}
