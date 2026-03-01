import React, {useState} from 'react'
import axios from 'axios'

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000'

export default function MoodInput(){
  const [text, setText] = useState('')
  const [result, setResult] = useState(null)

  async function submit(){
    try{
      const res = await axios.post(`${API_BASE}/api/v1/detect_emotion`, {text})
      setResult(res.data)
    }catch(e){
      console.error(e)
    }
  }

  return (
    <div className="p-4 sm:p-6 glass rounded-xl shadow-lg w-full">
      <h2 className="text-lg sm:text-xl font-semibold text-sky-600">Your Mood</h2>
      <textarea value={text} onChange={e=>setText(e.target.value)} className="w-full p-3 sm:p-4 mt-2 sm:mt-3 border border-white/20 dark:border-white/10 rounded-lg bg-white/40 dark:bg-slate-700/40 backdrop-blur-md text-slate-900 dark:text-slate-100 text-sm sm:text-base" rows={4} />
      <div className="mt-3 sm:mt-4 flex gap-2">
        <button onClick={submit} className="px-4 sm:px-6 py-2 sm:py-2.5 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition font-medium text-sm sm:text-base">Detect Emotion</button>
      </div>
      {result && <pre className="mt-3 sm:mt-4 text-xs bg-white/30 dark:bg-slate-900/40 backdrop-blur-md p-3 rounded-lg overflow-auto border border-white/15 dark:border-white/5">{JSON.stringify(result, null, 2)}</pre>}
    </div>
  )
}
